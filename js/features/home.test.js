// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/database.js', () => ({ db: { aguardarInicializacao: vi.fn(), escutarReservasPorPeriodo: vi.fn() } }));
import { db } from '../core/database.js';
import { carregarHome, suspenderHome } from './home.js';

let receber, falhar, parar, atualizar, graficos;
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const reserva = (paxs = 2) => ({ id: 'r1', data: hoje(), horario: '20:00', nomes: 'TESTE', paxs, tipo: 'hospede' });

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T22:00:00Z'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.body.innerHTML = '<section id="tela-home"><p id="home-analise-status" hidden></p><span id="home-kpi-pax"></span><span id="home-gauge-pct"></span><div id="home-giro"></div><div id="home-obs-lista"></div><canvas id="home-chart-gauge"></canvas></section>';
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    window.matchMedia = globalThis.matchMedia;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
    graficos = [];
    vi.stubGlobal('Chart', class { constructor() { this.destroy = vi.fn(); graficos.push(this); } });
    parar = vi.fn(); atualizar = vi.fn(); parar.atualizar = atualizar;
    db.aguardarInicializacao.mockResolvedValue();
    db.escutarReservasPorPeriodo.mockImplementation((_inicio, _fim, cb, err) => { receber = cb; falhar = err; return parar; });
});

afterEach(() => {
    suspenderHome(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers();
});

describe('Home em atualização automática', () => {
    it('repete inicialização que falhou e cancela a tentativa ao sair da tela', async () => {
        db.aguardarInicializacao.mockRejectedValueOnce(new Error('inicialização'));
        await carregarHome();
        expect(db.escutarReservasPorPeriodo).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5000);
        expect(db.escutarReservasPorPeriodo).toHaveBeenCalledOnce();
        suspenderHome(); db.aguardarInicializacao.mockRejectedValueOnce(new Error('inicialização'));
        await carregarHome(); suspenderHome();
        await vi.advanceTimersByTimeAsync(30000);
        expect(db.escutarReservasPorPeriodo).toHaveBeenCalledOnce();
    });

    it('atualiza KPIs por evento, mantém status oculto e evita recriar gráficos idênticos', async () => {
        await carregarHome(); receber([reserva()]);
        expect(document.getElementById('home-kpi-pax').textContent).toBe('2');
        expect(document.getElementById('home-analise-status').hidden).toBe(true);
        expect(document.getElementById('home-analise-status').textContent).toBe('');
        receber([reserva()]); expect(graficos).toHaveLength(1);
        receber([reserva(4)]); expect(graficos).toHaveLength(2);
        expect(document.getElementById('home-kpi-pax').textContent).toBe('4');
    });

    it('retorno à aba e rede restaurada solicitam atualização sem limpar dados ou abrir outro canal', async () => {
        await carregarHome(); receber([reserva()]);
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('online'));
        expect(atualizar).toHaveBeenCalledTimes(2);
        expect(db.escutarReservasPorPeriodo).toHaveBeenCalledTimes(1);
        expect(document.getElementById('home-kpi-pax').textContent).toBe('2');
        expect(graficos[0].destroy).not.toHaveBeenCalled();
    });

    it('mantém últimos dados na falha e remove erro após recuperação', async () => {
        await carregarHome(); receber([reserva()]); falhar();
        const status = document.getElementById('home-analise-status');
        expect(status.hidden).toBe(false); expect(status.textContent).toContain('últimos dados');
        expect(status.textContent).not.toContain('ATUALIZAR');
        expect(document.getElementById('home-kpi-pax').textContent).toBe('2');
        receber([reserva()]); expect(status.hidden).toBe(true);
    });

    it('navegação suspende assinatura e impede respostas atrasadas', async () => {
        await carregarHome(); receber([reserva()]); suspenderHome(); receber([reserva(9)]);
        expect(parar).toHaveBeenCalledOnce();
        expect(document.getElementById('home-kpi-pax').textContent).toBe('2');
        document.getElementById('tela-home').classList.add('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(60000);
        expect(db.escutarReservasPorPeriodo).toHaveBeenCalledTimes(1);
    });

    it('atualiza previsões de mesa pelo relógio sem nova consulta', async () => {
        await carregarHome(); receber([{ ...reserva(), mesa: '1', inicioMesa: '2026-10-24T20:45:00Z' }]);
        expect(document.getElementById('home-giro').textContent).toContain('em 15 min');
        await vi.advanceTimersByTimeAsync(60000);
        expect(document.getElementById('home-giro').textContent).toContain('em 14 min');
        expect(db.escutarReservasPorPeriodo).toHaveBeenCalledTimes(1);
    });

    it('troca período automaticamente à meia-noite de São Paulo', async () => {
        vi.setSystemTime(new Date('2026-10-25T02:59:45Z'));
        await carregarHome(); receber([reserva()]);
        await vi.advanceTimersByTimeAsync(30000);
        expect(parar).toHaveBeenCalledOnce();
        expect(db.escutarReservasPorPeriodo).toHaveBeenLastCalledWith('2026-10-25', '2026-10-31', expect.any(Function), expect.any(Function));
    });
});
