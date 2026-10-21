// @vitest-environment jsdom
// Regressões dos cenários encontrados na auditoria de dados.
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('./js/core/database.js', () => ({ db: {
    aguardarInicializacao: vi.fn(), getReservasPorPeriodo: vi.fn(), escutarReservasPorPeriodo: vi.fn(), escutarAlteracoesReservas: vi.fn(() => vi.fn()),
    escutarConfigDia: vi.fn(), escutarReservasPorDataComMudancas: vi.fn(),
} }));
vi.mock('./js/features/reservas/service.js', () => ({
    buscarReservasPorPeriodo: vi.fn(), buscarReservasPorData: vi.fn(), aplicarBloqueiosSemanais: vi.fn(),
    OBS_BLOQUEIO_AUTOMATICO: 'AUTO', OBS_BLOQUEIO_SEMANAL: 'SEMANAL',
}));
vi.mock('./js/core/notificacao.js', () => ({ notificarErro: vi.fn(), notificarAviso: vi.fn() }));
const html = readFileSync('index.html', 'utf8');
let dashboard, home, service, db, state, render, filters, listener, charts;
const row = (id, data, paxs = 2, extra = {}) => ({ id, data, nomes: id, paxs, chd: 0, tipo: 'hospede', horario: '20:00', originalBase: '20:00', posicao: 0, ...extra });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };
const setRange = (a,b) => { document.getElementById('dashInicio').value = a; document.getElementById('dashFim').value = b; };
const value = id => document.getElementById(id).innerText;

beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    charts = [];
    vi.stubGlobal('Chart', class { constructor(ctx,config) { this.config=config; this.destroy=vi.fn(); charts.push(this); } });
    vi.stubGlobal('matchMedia', vi.fn(() => ({matches:false})));
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({});
    state = await import('./js/core/state.js'); state.setConfigSistema({capacidade:30,mesas:20});
    state.setTodasReservas([]); state.setLinhasExtras({}); state.setFiltroAtivo(null);
    ({db}=await import('./js/core/database.js'));
    db.aguardarInicializacao.mockResolvedValue(); db.getReservasPorPeriodo.mockResolvedValue([]);
    db.escutarConfigDia.mockImplementation((_d,cb)=>{cb({});return vi.fn();});
    service = await import('./js/features/reservas/service.js');
    service.buscarReservasPorPeriodo.mockResolvedValue([]); service.buscarReservasPorData.mockResolvedValue([]);
    service.aplicarBloqueiosSemanais.mockResolvedValue(0);
    dashboard = await import('./js/features/dashboard.js');
    home = await import('./js/features/home.js');
    render = await import('./js/ui/render.js'); filters=await import('./js/ui/filters.js');
    listener = await import('./js/features/reservas/listener.js');
    setRange('2026-10-20','2026-10-21');
});
afterEach(() => { listener?.pararEscuta(); home?.suspenderHome(); window.suspenderDashboard?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('OK: totais dos cards e Dashboard excluem canceladas e bloqueios sem nome', () => {
    const rows=[row('H','2026-10-21',2,{chd:1}),row('E','2026-10-21',3,{tipo:'externo'}),row('P','2026-10-21',1,{tipo:'passante'}),row('R','2026-10-21',4,{chd:1,tipo:'roomservice'}),row('C','2026-10-21',9,{canceladoEm:'2026-10-21'}),row('B','2026-10-21',20,{nomes:'',bloqueado:true})];
    render.atualizarMiniCards(rows); window.processarDashboard(rows,1);
    expect(value('dashTotalPax')).toBe(12); expect(value('kpiTotalPax')).toBe(12);
    expect(value('dashCriancas')).toBe(2); expect(value('kpiCriancas')).toBe(2);
    expect(value('dashCancelamentos')).toBe(1); expect(value('kpiCancelamentos')).toBe(1);
});

it.each([['hospede','H'],['externo','E'],['passante','P'],['roomservice','R'],['criancas','H'],['menuDegustacao','E'],['cancelados','C']])('OK: filtro %s exibe somente a reserva esperada', (type,id)=>{
    const rows=[row('H','2026-10-21',2,{chd:1}),row('E','2026-10-21',3,{tipo:'externo',menuDegustacao:true,posicao:1}),row('P','2026-10-21',1,{tipo:'passante',posicao:2}),row('R','2026-10-21',4,{tipo:'roomservice',posicao:3}),row('C','2026-10-21',9,{canceladoEm:'2026-10-21',posicao:4})];
    state.setTodasReservas(rows); filters.aplicarFiltro(type);
    const shown=[...document.querySelectorAll('#gridReservas .reserva-clicavel[data-id]')].map(el=>el.dataset.id);
    expect(shown.length).toBeGreaterThan(0); expect(new Set(shown)).toEqual(new Set([id]));
    expect(value('dashTotalPax')).toBe(11); // Os cards mantêm o total do dia.
});

it('OK: período inclui limites e desconta somente exclusões dentro do intervalo',async()=>{
    setRange('2026-10-20','2026-10-22');
    for(const date of ['2026-10-21','2026-11-01']){document.getElementById('dashDataExcluir').value=date;window.adicionarDataExcluida();}
    service.buscarReservasPorPeriodo.mockResolvedValue([row('A','2026-10-20',30),row('B','2026-10-21',30),row('C','2026-10-22',30)]);
    await window.carregarDadosDashboard();
    expect(service.buscarReservasPorPeriodo).toHaveBeenCalledWith('2026-10-20','2026-10-22');
    expect(value('kpiTotalPax')).toBe(60);expect(value('kpiOcupacao')).toBe('100.0%');
});

it('OK: datas específicas não duplicam dia e usam quantidade de dias selecionados',async()=>{
    document.getElementById('dashModo').value='especificas';window.alternarModoDashboard();
    for(const date of ['2026-10-20','2026-10-22','2026-10-20']){document.getElementById('dashDataEspecifica').value=date;window.adicionarDataEspecifica();}
    service.buscarReservasPorData.mockImplementation(async d=>[row(d,d,30)]);
    await window.carregarDadosDashboard();expect(service.buscarReservasPorData).toHaveBeenCalledTimes(2);expect(value('kpiOcupacao')).toBe('100.0%');
});

it('A1: resposta antiga não sobrescreve consulta de período mais recente',async()=>{
    const old=deferred();service.buscarReservasPorPeriodo.mockReturnValueOnce(old.promise).mockResolvedValueOnce([row('NOVO','2026-10-22',8)]);
    const a=window.carregarDadosDashboard();setRange('2026-10-22','2026-10-22');await window.carregarDadosDashboard();expect(value('kpiTotalPax')).toBe(8);
    old.resolve([row('ANTIGO','2026-10-20',2)]);await a;expect(value('kpiTotalPax')).toBe(8);expect(document.getElementById('dashInicio').value).toBe('2026-10-22');
});

it('A2: atualização da grade preserva o Dashboard do período',async()=>{
    service.buscarReservasPorPeriodo.mockResolvedValue([row('PERIODO','2026-10-20',30)]);
    await window.carregarDadosDashboard();expect(value('kpiOcupacao')).toBe('50.0%');
    document.getElementById('tela-dashboard').classList.remove('hidden');
    db.escutarReservasPorDataComMudancas.mockImplementation((_d,cb)=>{cb([row('DIA','2026-10-21',3)]);return vi.fn();});
    state.setDataAtual('2026-10-21');await listener.escutarReservas('2026-10-21');
    expect(value('kpiTotalPax')).toBe(30);expect(value('kpiOcupacao')).toBe('50.0%');expect(document.getElementById('dashInicio').value).toBe('2026-10-20');
});

it('A3: erro na nova consulta remove resultados antigos e sinaliza indisponibilidade',async()=>{
    service.buscarReservasPorPeriodo.mockResolvedValueOnce([row('A','2026-10-20',20)]).mockRejectedValueOnce(new Error('offline'));
    await window.carregarDadosDashboard();setRange('2026-10-25','2026-10-25');await window.carregarDadosDashboard();
    expect(value('kpiTotalPax')).toBe('—');expect(document.getElementById('dashStatus').dataset.estado).toBe('erro');expect(document.getElementById('dashInicio').value).toBe('2026-10-25');
});

it('A4: período invertido é rejeitado antes da consulta',async()=>{
    setRange('2026-10-22','2026-10-20');await window.carregarDadosDashboard();
    expect(service.buscarReservasPorPeriodo).not.toHaveBeenCalled();expect(value('kpiOcupacao')).toBe('—');expect(document.getElementById('dashStatus').dataset.estado).toBe('erro');
});

it('A5: alterar exclusões invalida consulta pendente até nova análise',async()=>{
    const pending=deferred();service.buscarReservasPorPeriodo.mockReturnValue(pending.promise);
    const request=window.carregarDadosDashboard();document.getElementById('dashDataExcluir').value='2026-10-20';window.adicionarDataExcluida();
    pending.resolve([row('A','2026-10-20',30)]);await request;expect(value('kpiTotalPax')).toBe('—');
});

it('A6: gráfico de composição usa PAX em todos os tipos',()=>{
    window.processarDashboard([row('H','2026-10-21',3),row('R','2026-10-21',4,{tipo:'roomservice'})]);
    const mix=charts.find(c=>c.config.data.labels?.some(label=>label.startsWith('Room Service'))).config.data.datasets[0].data;
    expect(value('kpiTotalPax')).toBe(7);expect(mix).toEqual([3,0,0,4]);expect(value('kpiOcupacao')).toBe('10.0%');
});

it('A7: horário personalizado aparece na curva e nos totais',()=>{
    window.processarDashboard([row('A','2026-10-21',6,{horario:'20:15',originalBase:'20:15'})]);
    expect(value('kpiTotalPax')).toBe(6);
    const curve=charts.find(c=>c.config.data.datasets?.some(d=>d.label==='Hóspede')).config;
    expect(curve.data.labels).toContain('20:15');expect(curve.data.datasets.flatMap(d=>d.data).reduce((a,b)=>a+b,0)).toBe(6);
});

it('A8: callbacks da assinatura anterior da Home são descartados',async()=>{
    const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    const callbacks=[];db.escutarReservasPorPeriodo.mockImplementation((_inicio,_fim,cb)=>{callbacks.push(cb);return vi.fn();});
    await home.carregarHome();await home.carregarHome();callbacks[1]([row('NOVO',hoje,8)]);callbacks[0]([row('ANTIGO',hoje,2)]);
    expect(document.getElementById('home-kpi-pax').textContent).toBe('8');expect(charts.at(-3).config.data.datasets[0].data[0]).toBe(8);
});

it('A9: erro da semana apresenta indisponibilidade em vez de série de zeros',async()=>{
    let callback,error;db.escutarReservasPorPeriodo.mockImplementation((_inicio,_fim,cb,err)=>{callback=cb;error=err;return vi.fn();});await home.carregarHome();
    callback([row('HOJE',new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),8)]);error(new Error('offline'));
    expect(document.getElementById('home-kpi-pax').textContent).toBe('—');expect(document.getElementById('home-analise-status').dataset.estado).toBe('erro');
    expect(charts.every(c=>c.destroy.mock.calls.length===1)).toBe(true);
});

it('A10: canceladas e no-show não entram no giro de mesas',async()=>{
    let callback;db.escutarReservasPorPeriodo.mockImplementation((_inicio,_fim,cb)=>{callback=cb;return vi.fn();});await home.carregarHome();
    const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    callback([row('CANCELADA',hoje,2,{canceladoEm:hoje,inicioMesa:hoje+'T18:00:00Z',mesa:'4'}),row('NO SHOW',hoje,2,{statusRecepcao:'no_show',inicioMesa:hoje+'T18:00:00Z',mesa:'5'})]);
    expect(document.getElementById('home-giro').textContent).not.toContain('Mesa 4');expect(document.getElementById('home-giro').textContent).not.toContain('Mesa 5');
});

it('A11: Home acompanha os sete dias e uma atualização futura redesenha a previsão', async()=>{
    let callback;db.escutarReservasPorPeriodo.mockImplementation((_inicio,_fim,cb)=>{callback=cb;return vi.fn();});await home.carregarHome();
    const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});const fim=new Date(hoje+'T12:00:00');fim.setDate(fim.getDate()+6);
    expect(db.escutarReservasPorPeriodo).toHaveBeenCalledWith(hoje,fim.toLocaleDateString('en-CA'),expect.any(Function),expect.any(Function));
    callback([]);callback([row('FUTURA',fim.toLocaleDateString('en-CA'),7)]);expect(charts.at(-1).config.data.datasets[0].data.at(-1)).toBe(7);
});

it('OK: trocar a data da grade ignora callback pendente do dia anterior',async()=>{
    const callbacks={};db.escutarReservasPorDataComMudancas.mockImplementation((d,cb)=>{callbacks[d]=cb;return vi.fn();});
    state.setDataAtual('2026-10-20');await listener.escutarReservas('2026-10-20');
    state.setDataAtual('2026-10-21');await listener.escutarReservas('2026-10-21');
    callbacks['2026-10-21']([row('NOVO','2026-10-21',4)]);callbacks['2026-10-20']([row('ANTIGO','2026-10-20',9)]);
    expect(state.getTodasReservas()[0].id).toBe('NOVO');expect(value('dashTotalPax')).toBe(4);
});

it('alterar datas na tela invalida uma análise pendente',async()=>{
    const pending=deferred();service.buscarReservasPorPeriodo.mockReturnValue(pending.promise);
    const request=window.carregarDadosDashboard();setRange('2026-10-25','2026-10-25');document.getElementById('dashInicio').dispatchEvent(new Event('change',{bubbles:true}));
    pending.resolve([row('ANTIGO','2026-10-20',20)]);await request;
    expect(value('kpiTotalPax')).toBe('—');expect(document.getElementById('dashStatus').dataset.estado).toBe('pendente');
});

it('excluir todos os dias é rejeitado sem produzir ocupação zero fictícia',async()=>{
    setRange('2026-10-20','2026-10-20');document.getElementById('dashDataExcluir').value='2026-10-20';window.adicionarDataExcluida();await window.carregarDadosDashboard();
    expect(service.buscarReservasPorPeriodo).not.toHaveBeenCalled();expect(document.getElementById('dashStatus').textContent).toContain('não contém dias');
});

it('sair do Dashboard descarta resposta pendente e encerra atualização ao vivo',async()=>{
    await window.carregarDadosDashboard();const stop=db.escutarAlteracoesReservas.mock.results[0].value;
    const pending=deferred();service.buscarReservasPorPeriodo.mockReturnValue(pending.promise);const request=window.carregarDadosDashboard();window.suspenderDashboard();
    pending.resolve([row('ANTIGO','2026-10-20',20)]);await request;expect(stop).toHaveBeenCalled();expect(value('kpiTotalPax')).toBe('—');
});

it('evento ao vivo refaz o período analisado em vez de usar o dia da grade',async()=>{
    vi.useFakeTimers();document.getElementById('tela-dashboard').classList.remove('hidden');
    service.buscarReservasPorPeriodo.mockResolvedValueOnce([row('A','2026-10-20',30)]).mockResolvedValueOnce([row('B','2026-10-20',60)]);
    await window.carregarDadosDashboard();const changed=db.escutarAlteracoesReservas.mock.calls[0][0];changed();expect(value('kpiTotalPax')).toBe('—');
    await vi.advanceTimersByTimeAsync(200);expect(service.buscarReservasPorPeriodo).toHaveBeenLastCalledWith('2026-10-20','2026-10-21');expect(value('kpiOcupacao')).toBe('100.0%');vi.useRealTimers();
});

it('trocar data da grade limpa totais antigos, sinaliza falha e recupera após nova leitura',async()=>{
    let callback,error;db.escutarReservasPorDataComMudancas.mockImplementation((_d,cb,_changes,err)=>{callback=cb;error=err;return vi.fn();});
    state.setTodasReservas([row('ANTIGO','2026-10-20',20)]);render.renderizarGrid(state.getTodasReservas());
    state.setDataAtual('2026-10-21');await listener.escutarReservas('2026-10-21');expect(state.getTodasReservas()).toEqual([]);expect(value('dashTotalPax')).toBe('…');
    error(new Error('offline'));expect(value('dashTotalPax')).toBe('—');expect(document.querySelector('#gridReservas').textContent).toContain('indisponíveis');
    callback([row('NOVO','2026-10-21',4)]);expect(value('dashTotalPax')).toBe(4);expect(document.querySelector('#gridReservas').inert).toBe(false);
});

it('tempo médio de mesa não mistura tempo de entrega de Room Service',()=>{
    const rows=[row('MESA','2026-10-21',2,{inicioMesa:'2026-10-21T20:00:00Z',fimMesa:'2026-10-21T21:00:00Z'}),row('ROOM','2026-10-21',2,{tipo:'roomservice',inicioMesa:'2026-10-21T20:00:00Z',fimMesa:'2026-10-21T20:10:00Z'})];
    render.atualizarMiniCards(rows);window.processarDashboard(rows);expect(value('countTempo')).toBe('60 min');expect(value('kpiTempoMedio')).toBe('60 min');
});
