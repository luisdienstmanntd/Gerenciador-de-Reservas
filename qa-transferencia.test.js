// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('./js/core/database.js', () => ({ db: {
    aguardarInicializacao: vi.fn(), getClient: vi.fn(), getReservaPorId: vi.fn(),
    getReservasPorData: vi.fn(), getLinhasExtrasPorData: vi.fn(), getBloqueiosSemanaisAplicados: vi.fn(),
    aplicarBloqueiosSemanaisAtomico: vi.fn(), buscarReservasPorBloco: vi.fn(),
    buscarBloqueiosAutomaticos: vi.fn(), criarReserva: vi.fn(), excluirReserva: vi.fn(),
} }));
vi.mock('./js/features/reservas/log.js', () => ({ registrarLog: vi.fn() }));
vi.mock('./js/features/reservas/listener.js', () => ({ recarregarReservas: vi.fn() }));
vi.mock('./js/core/notificacao.js', () => ({ notificarErro: vi.fn(), notificarSucesso: vi.fn(), notificarAviso: vi.fn() }));
import { db } from './js/core/database.js';
import { alterarData, consultarHorariosTransferencia } from './js/features/reservas/service.js';
import { registrarLog } from './js/features/reservas/log.js';
import { recarregarReservas } from './js/features/reservas/listener.js';
import { notificarErro } from './js/core/notificacao.js';
import { ReservaModal } from './js/features/reservas/modal.js';
import { setConfigSistema, setDataAtual, setTodasReservas, setLinhasExtras } from './js/core/state.js';

const html = readFileSync('index.html', 'utf8');
const origem = { id: 'r1', nomes: 'CLIENTE FICTÍCIO', data: '2027-07-01', horario: '21:00', originalBase: '21:00', posicao: 0, paxs: 2, tipo: 'hospede' };
const cheio = (horario = '21:00') => [0, 1, 2].map(posicao => ({ id: `ocupada-${posicao}`, nomes: 'OUTRO', horario, originalBase: horario, posicao }));
let writes, destino;
beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    setDataAtual(origem.data); setTodasReservas([origem]); setLinhasExtras({});
    setConfigSistema({ capacidade: 30, mesas: 18, bloqueioAutomatico: false, bloqueiosSemanais: {} });
    destino = cheio(); writes = [];
    db.aguardarInicializacao.mockResolvedValue();
    db.getReservaPorId.mockResolvedValue({ ...origem });
    db.getReservasPorData.mockImplementation(async data => data === origem.data ? [origem] : destino);
    db.getLinhasExtrasPorData.mockResolvedValue({});
    db.getBloqueiosSemanaisAplicados.mockResolvedValue(true);
    db.aplicarBloqueiosSemanaisAtomico.mockResolvedValue(0);
    db.buscarReservasPorBloco.mockImplementation(async (_data, base) => destino.filter(r => r.originalBase === base));
    db.buscarBloqueiosAutomaticos.mockResolvedValue([]);
    db.criarReserva.mockResolvedValue('novo-bloqueio'); db.excluirReserva.mockResolvedValue();
    db.getClient.mockReturnValue({ from: () => ({ update: cols => ({ eq: (_column, id) => ({ select: async () => { writes.push({ id, cols }); return { data: [{ id }] }; } }) }) }) });
    registrarLog.mockResolvedValue(); window.modalConfirmar = vi.fn();
});

async function abrirTransferencia() {
    const modal = new ReservaModal(); await modal.abrirEditar(origem.id);
    document.getElementById('btnResumoData').click();
    await vi.waitFor(() => expect(document.getElementById('inputNovoHorario').disabled).toBe(false));
    return modal;
}
async function escolherData(data) {
    const input = document.getElementById('inputNovaData'); input.value = data;
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(document.getElementById('inputNovoHorario').disabled).toBe(false));
}

it('consulta é somente leitura e diferencia horário cheio de horário livre', async () => {
    const horarios = await consultarHorariosTransferencia(origem, '2027-07-02');
    expect(horarios.find(h => h.horario === '21:00').disponivel).toBe(false);
    expect(horarios.find(h => h.horario === '20:30').disponivel).toBe(true);
    expect(writes).toEqual([]); expect(db.aplicarBloqueiosSemanaisAtomico).not.toHaveBeenCalled();
});
it('grava nova data e horário em um único update e registra ambos no log', async () => {
    await alterarData('r1', '2027-07-02', { horario: '20:30' });
    expect(writes).toEqual([{ id: 'r1', cols: { data: '2027-07-02', horario: '20:30', original_base: '20:30', posicao: 0 } }]);
    expect(registrarLog).toHaveBeenCalledWith('EDITAR', expect.objectContaining({ horario: '21:00' }), expect.objectContaining({ data: '2027-07-02', horario: '20:30', originalBase: '20:30' }));
});
it('revalida horário cheio no destino sem gravar alteração parcial', async () => {
    await expect(alterarData('r1', '2027-07-02', { horario: '21:00' })).rejects.toMatchObject({ semDisponibilidade: true });
    expect(writes).toEqual([]); expect(registrarLog).not.toHaveBeenCalled();
});
it('posição extra na origem não força encaixe quando o destino tem vagas', async () => {
    db.getReservaPorId.mockResolvedValue({ ...origem, posicao: 4 }); destino = [];
    await alterarData('r1', '2027-07-02'); expect(writes[0].cols.posicao).toBe(0);
});
it('não conta canceladas, Room Service, a própria reserva ou seus bloqueios como outra ocupação', async () => {
    destino = [origem, { id: 'b', bloqueado: true, bloqueioOrigemId: 'r1', originalBase: '21:00', posicao: 1 },
        { ...cheio()[0], canceladoEm: '2027-07-01' }, { ...cheio()[2], tipo: 'roomservice' }];
    expect((await consultarHorariosTransferencia(origem, '2027-07-02')).find(h => h.horario === '21:00').disponivel).toBe(true);
});
it('prévia respeita bloqueios semanais ainda não materializados sem gravá-los', async () => {
    destino = []; db.getBloqueiosSemanaisAplicados.mockResolvedValue(false);
    setConfigSistema({ bloqueioAutomatico: false, bloqueiosSemanais: { 5: { '21:00': 3 } } });
    expect((await consultarHorariosTransferencia(origem, '2027-07-02')).find(h => h.horario === '21:00').disponivel).toBe(false);
    expect(db.aplicarBloqueiosSemanaisAtomico).not.toHaveBeenCalled();
});
it('bloqueios semanais já removidos manualmente não voltam na prévia', async () => {
    destino = []; setConfigSistema({ bloqueioAutomatico: false, bloqueiosSemanais: { 5: { '21:00': 3 } } });
    expect((await consultarHorariosTransferencia(origem, '2027-07-02')).find(h => h.horario === '21:00').disponivel).toBe(true);
});
it('mudança de dia sem mudar hora preserva o bloco de um horário personalizado', async () => {
    db.getReservaPorId.mockResolvedValue({ ...origem, horario: '21:15' }); destino = [];
    await alterarData('r1', '2027-07-02');
    expect(writes[0].cols).toEqual({ data: '2027-07-02', posicao: 0 });
    expect(db.buscarReservasPorBloco).toHaveBeenCalledWith('2027-07-02', '21:00');
});
it('reconcilia os bloqueios de grupo no novo dia e horário', async () => {
    setConfigSistema({ bloqueioAutomatico: true, bloqueiosSemanais: {} });
    db.getReservaPorId.mockResolvedValue({ ...origem, paxs: 4 });
    db.buscarBloqueiosAutomaticos.mockResolvedValue([{ id: 'b-antigo', posicao: 1 }]);
    await alterarData('r1', '2027-07-02', { horario: '20:30' });
    expect(db.excluirReserva).toHaveBeenCalledWith('b-antigo');
    expect(db.criarReserva).toHaveBeenCalledWith(expect.objectContaining({ data: '2027-07-02', originalBase: '20:30', bloqueioOrigemId: 'r1' }));
});
it('formulário permite escolher outro horário após encontrar 21h cheio', async () => {
    await abrirTransferencia(); await escolherData('2027-07-02');
    const select = document.getElementById('inputNovoHorario');
    expect(select.selectedOptions[0].textContent).toContain('Sem vaga');
    select.value = '20:30'; select.dispatchEvent(new Event('change'));
    expect(document.getElementById('disponibilidadeTransferencia').textContent).toContain('Horário disponível');
    document.getElementById('btnConfirmarData').click();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].cols).toEqual(expect.objectContaining({ data: '2027-07-02', horario: '20:30' }));
    await vi.waitFor(() => expect(recarregarReservas).toHaveBeenCalledWith(origem.data));
});
it('troca somente o horário mesmo mantendo a data', async () => {
    await abrirTransferencia(); document.getElementById('inputNovoHorario').value = '20:30';
    document.getElementById('btnConfirmarData').click();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].cols.horario).toBe('20:30');
});
it('falha de consulta não permite confirmar e uma nova data permite tentar novamente', async () => {
    await abrirTransferencia(); db.getReservasPorData.mockRejectedValueOnce(new Error('offline'));
    const date = document.getElementById('inputNovaData'); date.value = '2027-07-02'; date.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(document.getElementById('disponibilidadeTransferencia').textContent).toContain('Não foi possível'));
    expect(document.getElementById('btnConfirmarData').disabled).toBe(true);
    await escolherData('2027-07-03'); expect(document.getElementById('btnConfirmarData').disabled).toBe(false);
});
it('resposta antiga não substitui disponibilidade da data mais recente', async () => {
    await abrirTransferencia(); let entregar;
    db.getReservasPorData.mockImplementation(data => data === '2027-07-02' ? new Promise(resolve => { entregar = resolve; }) : Promise.resolve([]));
    const date = document.getElementById('inputNovaData'); date.value = '2027-07-02'; date.dispatchEvent(new Event('change'));
    await escolherData('2027-07-03'); entregar(cheio()); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('inputNovoHorario').selectedOptions[0].textContent).toContain('Disponível');
});
it('confirmação de encaixe usa a data e o horário selecionados', async () => {
    await abrirTransferencia(); await escolherData('2027-07-02');
    document.getElementById('btnConfirmarData').click();
    await vi.waitFor(() => expect(window.modalConfirmar).toHaveBeenCalled());
    expect(window.modalConfirmar.mock.calls[0][0]).toContain('21:00'); expect(writes).toEqual([]);
    await window.modalConfirmar.mock.calls[0][1](); expect(writes[0].cols.posicao).toBe(3);
});
it('erro de escrita mantém formulário aberto e permite tentar outro horário', async () => {
    await abrirTransferencia(); await escolherData('2027-07-02');
    db.getClient.mockReturnValueOnce({ from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ error: { code: '42501' } }) }) }) }) });
    document.getElementById('inputNovoHorario').value = '20:30'; document.getElementById('btnConfirmarData').click();
    await vi.waitFor(() => expect(notificarErro).toHaveBeenCalled());
    expect(document.getElementById('modalReserva').style.display).toBe('flex');
    document.getElementById('inputNovoHorario').value = '22:00'; document.getElementById('btnConfirmarData').click();
    await vi.waitFor(() => expect(writes).toHaveLength(1)); expect(writes[0].cols.horario).toBe('22:00');
});
