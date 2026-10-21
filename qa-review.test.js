// @vitest-environment jsdom
// Regression coverage for review findings.
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('./js/core/database.js',()=>({db:{aguardarInicializacao:vi.fn(),getClient:vi.fn(),getReservaPorId:vi.fn(),getReservasPorData:vi.fn(),getLinhasExtrasPorData:vi.fn().mockResolvedValue({}),buscarReservasPorBloco:vi.fn(),atualizarReserva:vi.fn(),criarReserva:vi.fn(),garantirMesaExiste:vi.fn(),escutarConfigDia:vi.fn(),escutarReservasPorDataComMudancas:vi.fn()}}));
vi.mock('./js/features/reservas/log.js',()=>({registrarLog:vi.fn()}));
vi.mock('./js/core/notificacao.js',()=>({notificarErro:vi.fn(),notificarSucesso:vi.fn(),notificarAviso:vi.fn()}));
import {db} from './js/core/database.js';
import {setConfigSistema,setTodasReservas,getTodasReservas,setDataAtual,getLinhasExtras,setLinhasExtras} from './js/core/state.js';
import {salvarReserva,salvarApenasHorario} from './js/features/reservas/service.js';
import {ReservaModal} from './js/features/reservas/modal.js';
import {escutarReservas,pararEscuta} from './js/features/reservas/listener.js';
import './js/core/navigation.js';
import {carregarRoomServices} from './js/features/roomservice.js';
beforeEach(()=>{vi.clearAllMocks();document.body.innerHTML='';setConfigSistema({bloqueioAutomatico:false,bloqueiosSemanais:{}});setTodasReservas([]);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();pararEscuta();});
it('RV01 Room Service keeps local date after 21h Sao Paulo',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T01:30:00Z'));
 document.body.innerHTML='<input id="dataRoomService"><div id="tela-roomservice"></div>';
 window.carregarRoomServices=vi.fn();window.navegar('roomservice');
 expect(new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})).toBe('2026-10-20');
 expect(document.getElementById('dataRoomService').value).toBe('2026-10-20');
});
it('RV02 Room Service from another date opens and preserves its date on edit',async()=>{
 document.body.innerHTML='<div id="modalReserva" style="display:none"><h3></h3></div><input id="reservaId"><input id="horario"><input id="originalBase"><input type="checkbox" id="checkAlterarHorario"><span id="displayHoras"></span><span id="displayMinutos"></span><input id="dataRoomService" value="2026-10-21"><div id="listaRoomServices"></div>';
 setTodasReservas([{id:'today',data:'2026-10-20',nomes:'ANA'}]);
 db.getReservasPorData.mockResolvedValue([{id:'tomorrow-room',data:'2026-10-21',tipo:'roomservice',nomes:'BRUNO',apto:'102'}]);
 await carregarRoomServices();expect(document.getElementById('listaRoomServices').textContent).toContain('BRUNO');
 const reserva={id:'tomorrow-room',data:'2026-10-21',horario:'20:00',tipo:'roomservice',nomes:'BRUNO',apto:'102'};
 db.getReservaPorId.mockResolvedValue(reserva);
 const modal=new ReservaModal();await modal.abrirEditar('tomorrow-room');
 expect(document.getElementById('modalReserva').style.display).toBe('flex');
 document.getElementById('btnResumoHorario').click();
 expect(modal.obterDados()).toEqual(expect.objectContaining({id:'tomorrow-room',data:'2026-10-21',horario:'20:00',originalBase:'20:00'}));
 expect(getTodasReservas()).toEqual([{id:'today',data:'2026-10-20',nomes:'ANA'}]);
});
it('RV03 converting room service to restaurant clears ROOM table',async()=>{
 let persisted={mesa_identificador:'ROOM',tipo:'roomservice'};
 const updates=[];
 db.getClient.mockReturnValue({from:()=>({update:cols=>({eq:()=>({select:async()=>{updates.push(cols);Object.assign(persisted,cols);return {data:[{id:'r'}],error:null};}})})})});
 db.getReservaPorId.mockResolvedValue({id:'r',nomes:'ANA',tipo:'roomservice',mesa:'ROOM',data:'2026-10-20',horario:'20:00',originalBase:'20:00',posicao:0,paxs:2});
 db.atualizarReserva.mockImplementation(async(_id,data)=>{persisted.tipo=data.tipo;});
 await salvarReserva({id:'r',nomes:'ANA',tipo:'hospede',apto:'101',data:'2026-10-20',horario:'20:00',posicao:0,paxs:2,chd:0});
 expect(persisted).toEqual(expect.objectContaining({mesa_identificador:null,tipo:'hospede'}));
});
it('RV04 callback from old day cannot overwrite new day after unsubscribe',async()=>{
 const callbacks={},configs={};db.escutarConfigDia.mockImplementation((d,cb)=>{configs[d]=cb;cb({});return vi.fn();});
 db.escutarReservasPorDataComMudancas.mockImplementation((d,cb)=>{callbacks[d]=cb;return vi.fn();});
 setDataAtual('2026-10-20');await escutarReservas('2026-10-20');
 setDataAtual('2026-10-21');await escutarReservas('2026-10-21');
 callbacks['2026-10-21']([{id:'new',data:'2026-10-21'}]);
 // An old HTTP query already in flight is not cancelled by removeChannel.
 callbacks['2026-10-20']([{id:'old',data:'2026-10-20'}]);
 configs['2026-10-20']({'20:00':8});
 expect(getTodasReservas()).toEqual([{id:'new',data:'2026-10-21'}]);
 expect(getLinhasExtras()['20:00']).toBe(0);
});
it('RV02 late reservation lookup cannot reopen a closed modal',async()=>{
 document.body.innerHTML='<div id="modalReserva" style="display:none"><h3></h3></div>';
 let resolve;db.getReservaPorId.mockReturnValue(new Promise(r=>{resolve=r;}));
 const modal=new ReservaModal();const opened=modal.abrirEditar('late');modal.fechar();
 resolve({id:'late',nomes:'ANA',data:'2026-10-21',horario:'20:00'});await opened;
 expect(document.getElementById('modalReserva').style.display).toBe('none');
});
it('RV02 time change outside grid uses reservation date and that day capacity',async()=>{
 setDataAtual('2026-10-20');setLinhasExtras({'20:30':5});
 db.getReservaPorId.mockResolvedValue({id:'tomorrow-room',nomes:'BRUNO',data:'2026-10-21',horario:'20:00',originalBase:'20:00',posicao:0,paxs:2});
 db.buscarReservasPorBloco.mockResolvedValue([0,1,2].map(posicao=>({id:String(posicao),nomes:'OCUPADA',posicao})));
 db.getLinhasExtrasPorData.mockResolvedValue({});
 await expect(salvarApenasHorario({id:'tomorrow-room',data:'2026-10-21',horario:'20:30'})).rejects.toMatchObject({semDisponibilidade:true});
 expect(db.buscarReservasPorBloco).toHaveBeenCalledWith('2026-10-21','20:30');
 expect(db.getLinhasExtrasPorData).toHaveBeenCalledWith('2026-10-21');
 expect(getLinhasExtras()).toEqual({'20:30':5});
});
it.each(['resolve','reject'])('Room Service ignores old %s after a newer search',async(outcome)=>{
 document.body.innerHTML='<input id="dataRoomService" value="2026-10-20"><div id="listaRoomServices"></div>';
 let resolveOld,rejectOld;
 db.getReservasPorData.mockReturnValueOnce(new Promise((resolve,reject)=>{resolveOld=resolve;rejectOld=reject;}));
 const first=carregarRoomServices();
 document.getElementById('dataRoomService').value='2026-10-21';
 db.getReservasPorData.mockResolvedValueOnce([{id:'new',data:'2026-10-21',horario:'20:00',tipo:'roomservice',nomes:'BRUNO',apto:'102'}]);
 await carregarRoomServices();
 if(outcome==='resolve')resolveOld([{id:'old',data:'2026-10-20',horario:'20:00',tipo:'roomservice',nomes:'ANA',apto:'101'}]);
 else rejectOld(new Error('old request failed'));
 await first;
 expect(document.getElementById('listaRoomServices').textContent).toContain('BRUNO');
 expect(document.getElementById('listaRoomServices').textContent).not.toContain('ANA');
 expect(document.getElementById('listaRoomServices').textContent).not.toContain('Erro ao carregar');
});
