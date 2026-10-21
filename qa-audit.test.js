// @vitest-environment jsdom
// Regressões QA: os testes exigem o comportamento corrigido.
import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('./js/core/database.js', () => ({ db: {
 aguardarInicializacao: vi.fn(), getClient: vi.fn(), getReservaPorId: vi.fn(), getLinhasExtrasPorData: vi.fn(), aplicarBloqueiosSemanaisAtomico: vi.fn(),
 buscarReservasPorBloco: vi.fn(), buscarBloqueiosAutomaticos: vi.fn(),
 atualizarReserva: vi.fn(), criarReserva: vi.fn(), excluirReserva: vi.fn(),
 cancelarReserva: vi.fn(), restaurarReserva: vi.fn(), garantirMesaExiste: vi.fn(),
 getReservasPorData: vi.fn(), getReservasPorPeriodo: vi.fn(),
 getBloqueiosSemanaisAplicados: vi.fn(), marcarBloqueiosSemanaisAplicados: vi.fn(),
} }));
vi.mock('./js/features/reservas/log.js', () => ({ registrarLog: vi.fn() }));
vi.mock('./js/core/notificacao.js', () => ({ notificarErro: vi.fn(), notificarAviso: vi.fn(), notificarSucesso: vi.fn() }));
import { db } from './js/core/database.js';
import { registrarLog } from './js/features/reservas/log.js';
import * as s from './js/features/reservas/service.js';
import { setConfigSistema, setLinhasExtras } from './js/core/state.js';
import { carregarRoomServices } from './js/features/roomservice.js';
const base = {id:'r1', nomes:'ANA', data:'2027-07-15', horario:'20:00',originalBase:'20:00',posicao:0,paxs:6,chd:0,tipo:'hospede',apto:'101'};
let updates;
beforeEach(() => {
 vi.resetAllMocks(); document.body.innerHTML=''; updates=[];
 setConfigSistema({capacidade:60,mesas:20,bloqueioAutomatico:true,bloqueiosSemanais:{4:{'20:00':1}}});setLinhasExtras({});
 db.getReservaPorId.mockResolvedValue({...base});db.getLinhasExtrasPorData.mockResolvedValue({});db.buscarReservasPorBloco.mockResolvedValue([]);
 db.buscarBloqueiosAutomaticos.mockResolvedValue([]);db.criarReserva.mockResolvedValue('new');
 db.getClient.mockReturnValue({from:()=>({update:cols=>({eq:(_key,id)=>({select:async()=>{updates.push({cols,id});return {error:{code:'42501',message:'permission denied'}};}})}),delete:()=>({eq:()=>({select:async()=>({data:[{id:'x'}]})})})})});
});
it('QA01: atribuir/iniciar/finalizar/cancelar mesa rejeitam erro SQL',async()=>{
 for(const fn of [()=>s.atribuirMesa('r1',7),()=>s.iniciarAtendimento('r1'),()=>s.finalizarAtendimento('r1'),()=>s.cancelarMesa('r1')]) await expect(fn()).rejects.toMatchObject({code:'42501'});
 expect(updates).toHaveLength(4);
});
it('QA02: mover horario não registra sucesso quando UPDATE é negado',async()=>{
 await expect(s.salvarApenasHorario({id:'r1',horario:'20:30'})).rejects.toMatchObject({code:'42501'});
 expect(registrarLog).not.toHaveBeenCalled();
});
it('QA03: cancelamento remove bloqueios automaticos vinculados',async()=>{
 db.buscarBloqueiosAutomaticos.mockResolvedValue([{id:'b1'}]);await s.cancelarReserva('r1',null);
 expect(db.cancelarReserva).toHaveBeenCalledWith('r1',null);
 expect(db.buscarBloqueiosAutomaticos).toHaveBeenCalledWith('r1');expect(db.excluirReserva).toHaveBeenCalledWith('b1');
});
it('QA04: reduzir de 6 para 4 adultos remove o segundo bloqueio',async()=>{
 const blocks=[{id:'b1',posicao:1,bloqueado:true,bloqueioOrigemId:'r1'},{id:'b2',posicao:2,bloqueado:true,bloqueioOrigemId:'r1'}];
 db.buscarReservasPorBloco.mockResolvedValue([base,...blocks]);db.buscarBloqueiosAutomaticos.mockResolvedValue(blocks);
 await s.salvarReserva({...base,paxs:4});await new Promise(r=>setTimeout(r,0));
 expect(db.excluirReserva).toHaveBeenCalledWith('b2');expect(db.excluirReserva).not.toHaveBeenCalledWith('b1');
});
it('QA05: room service cancelado não aparece como ativo',async()=>{
 document.body.innerHTML='<input id="dataRoomService" value="2027-07-15"><div id="listaRoomServices"></div>';
 db.getReservasPorData.mockResolvedValue([{...base,tipo:'roomservice',canceladoEm:'2027-07-14T12:00:00Z'}]);
 await carregarRoomServices();expect(document.querySelector('#listaRoomServices').textContent).not.toContain('ANA');expect(document.querySelector('#listaRoomServices').textContent).toContain('Nenhum Room Service');
});
it('QA06: criação recarrega bloco após conflito de índice SQL',async()=>{
 setConfigSistema({bloqueioAutomatico:false});
 db.criarReserva.mockRejectedValueOnce({code:'23505'}).mockResolvedValueOnce('new');
 db.buscarReservasPorBloco.mockResolvedValueOnce([]).mockResolvedValueOnce([{nomes:'OUTRO',posicao:0}]);
 await s.salvarReserva({...base,id:null});
 expect(db.criarReserva).toHaveBeenLastCalledWith(expect.objectContaining({posicao:1}));
});
it('QA07: semeadura usa transação atômica de servidor',async()=>{
 db.aplicarBloqueiosSemanaisAtomico.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
 expect(await s.aplicarBloqueiosSemanais(base.data)).toBe(1);expect(await s.aplicarBloqueiosSemanais(base.data)).toBe(0);
 expect(db.criarReserva).not.toHaveBeenCalled();
});
it('QA08: restaurar reserva grande restabelece bloqueios automaticos',async()=>{
 db.getReservaPorId.mockResolvedValue({...base,canceladoEm:'2027-07-14T12:00:00Z'});
 await s.restaurarReserva('r1');expect(db.restaurarReserva).toHaveBeenCalled();expect(db.buscarBloqueiosAutomaticos).toHaveBeenCalled();expect(db.criarReserva).toHaveBeenCalledTimes(2);
});

it('QA14: UPDATE de mesa com zero linhas não informa sucesso',async()=>{
 db.getClient.mockReturnValue({from:()=>({update:()=>({eq:()=>({select:async()=>({data:[]})})})})});
 await expect(s.atribuirMesa('missing',7)).rejects.toThrow('não encontrada');
});
it('Room Service e canceladas não ocupam posição de salão',()=>{
 expect(s._calcularPosicaoLivre([{nomes:'ROOM',tipo:'roomservice',posicao:0},{nomes:'CANCEL',canceladoEm:'ontem',posicao:0}])).toBe(0);
});
