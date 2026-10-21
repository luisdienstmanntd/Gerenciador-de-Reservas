// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
vi.mock('./js/features/reservas/service.js',()=>({buscarReservasPorPeriodo:vi.fn(),buscarReservasPorData:vi.fn()}));
import {buscarReservasPorPeriodo} from './js/features/reservas/service.js';
import {setConfigSistema} from './js/core/state.js';
import './js/features/dashboard.js';
it('QA09: dashboard usa capacidade 60 e mesa 20 configuradas',async()=>{
 setConfigSistema({capacidade:60,mesas:20});
 document.body.innerHTML='<input id="dashInicio" value="2027-07-15"><input id="dashFim" value="2027-07-15"><span id="kpiOcupacao"></span><span id="kpiMesaTop"></span>';
 buscarReservasPorPeriodo.mockResolvedValue([{data:'2027-07-15',horario:'20:00',nomes:'ANA',paxs:20,chd:10,tipo:'hospede',mesa:'20'}]);
 await window.carregarDadosDashboard();
 expect(document.querySelector('#kpiOcupacao').innerText).toBe('50.0%');
 expect(document.querySelector('#kpiMesaTop').innerText).toBe('Mesa 20');
});
