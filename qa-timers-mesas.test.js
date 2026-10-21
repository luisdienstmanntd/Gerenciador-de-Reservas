// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('./js/features/reservas/service.js',()=>({atribuirMesa:vi.fn(),iniciarAtendimento:vi.fn(),finalizarAtendimento:vi.fn(),cancelarMesa:vi.fn()}));
import {setTodasReservas,setDataAtual} from './js/core/state.js';
import {atualizarTimers} from './js/ui/timers.js';
import {MesaModal} from './js/features/mesas/modal.js';
beforeEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
it.each([[89,'timer-verde'],[90,'timer-amarelo'],[114,'timer-amarelo'],[115,'timer-vermelho']])('timer restaurante %i min usa %s',(min,classe)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2027-07-15T23:00:00Z'));
 document.body.innerHTML='<span data-timer-id="r1"></span>';
 setTodasReservas([{id:'r1',inicioMesa:new Date(Date.now()-min*60000).toISOString()}]);
 atualizarTimers();expect(document.querySelector('span').classList.contains(classe)).toBe(true);vi.useRealTimers();
});
it.each([[44,'timer-verde'],[45,'timer-vermelho']])('timer roomservice %i min usa %s',(min,classe)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2027-07-15T23:00:00Z'));
 document.body.innerHTML='<span data-timer-id="r1" data-tipo="roomservice"></span>';
 setTodasReservas([{id:'r1',inicioMesa:new Date(Date.now()-min*60000).toISOString()}]);atualizarTimers();expect(document.querySelector('span').classList.contains(classe)).toBe(true);vi.useRealTimers();
});
it('QA13: reserva cancelada libera mesa no seletor',()=>{
 document.body.innerHTML='<div id="containerListaMesas"><button class="btn-mesa">7</button></div>';
 const btn=document.querySelector('button');btn.innerText='7';
 setDataAtual('2027-07-15');setTodasReservas([{id:'r1',data:'2027-07-15',mesa:'7',canceladoEm:'2027-07-14T12:00:00Z'}]);
 new MesaModal()._aplicarBloqueioMesas();expect(btn.disabled).toBe(false);
});
