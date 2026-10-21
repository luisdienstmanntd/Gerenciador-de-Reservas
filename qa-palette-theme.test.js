// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
const mock = vi.hoisted(() => ({ subscription: null }));
vi.mock('./js/core/database.js', () => ({ db: {
    aguardarInicializacao: vi.fn().mockResolvedValue(),
    getReservasPorPeriodo: vi.fn().mockResolvedValue([]),
    escutarReservasPorData: vi.fn((date, callback) => { mock.subscription = callback; return vi.fn(); }),
} }));
vi.mock('./js/features/reservas/service.js', () => ({
    buscarReservasPorPeriodo: vi.fn().mockResolvedValue([]), buscarReservasPorData: vi.fn().mockResolvedValue([]),
    removerLinhaDoBloco: vi.fn(),
}));
vi.mock('./js/ui/render.js', () => ({ renderizarGrid: vi.fn() }));
import { carregarHome } from './js/features/home.js';
import './js/features/dashboard.js';
import { alternarTema } from './js/ui/controls.js';
import { aplicarFiltro } from './js/ui/filters.js';
import { setFiltroAtivo, getFiltroAtivo } from './js/core/state.js';
import { db } from './js/core/database.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; document.body.className = ''; document.body.removeAttribute('style'); });

it('a troca de tema recria Home e Dashboard com os tokens atuais sem consultar o banco novamente', async () => {
    document.body.innerHTML = '<input type="checkbox" id="theme-switch"><canvas id="home-chart-gauge"></canvas><canvas id="home-chart-bars"></canvas><canvas id="chartHorario"></canvas>';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const charts = [];
    vi.stubGlobal('Chart', class { constructor(ctx, config) { this.config = config; this.destroy = vi.fn(); charts.push(this); } });
    document.body.style.setProperty('--texto', '#332e2b');
    document.body.style.setProperty('--primaria', '#6a5644');
    document.body.style.setProperty('--cor-hospede', '#486676');
    await carregarHome();
    await mock.subscription([{ nomes: 'Cliente fictício', tipo: 'hospede', paxs: 2, horario: '20:00' }]);
    window.processarDashboard([{ nomes: 'Cliente fictício', tipo: 'hospede', paxs: 2, horario: '20:00' }]);
    const previous = [...charts];
    expect(previous.length).toBeGreaterThanOrEqual(2);
    const switcher = document.getElementById('theme-switch');
    switcher.checked = true;
    document.body.style.setProperty('--texto', '#f4efea');
    document.body.style.setProperty('--primaria', '#d0b18a');
    document.body.style.setProperty('--cor-hospede', '#9ab5c0');
    alternarTema();
    expect(document.body.classList.contains('dark-theme')).toBe(true);
    expect(previous.every(chart => chart.destroy.mock.calls.length === 1)).toBe(true);
    const darkCharts = charts.slice(previous.length);
    expect(darkCharts.length).toBe(previous.length);
    const darkDashboard = darkCharts.find(chart => chart.config.options.scales);
    expect(darkDashboard.config.options.scales.x.ticks.color).toBe('#f4efea');
    expect(darkDashboard.config.data.datasets[0].backgroundColor).toBe('#9ab5c0');
    switcher.checked = false;
    document.body.style.setProperty('--texto', '#332e2b');
    document.body.style.setProperty('--cor-hospede', '#486676');
    alternarTema();
    const last = charts.at(-1).config;
    expect(last.options.scales.x.ticks.color).toBe('#332e2b');
    expect(last.data.datasets[0].backgroundColor).toBe('#486676');
    expect(db.getReservasPorPeriodo).toHaveBeenCalledTimes(1);
    expect(db.escutarReservasPorData).toHaveBeenCalledTimes(1);
});

it('filtro selecionado mantém cartões utilizáveis opacos e anuncia a seleção', () => {
    document.body.innerHTML = '<div class="mini-card" data-filtro="todos"></div><div class="mini-card" data-filtro="hospede" style="opacity:.4"></div>';
    setFiltroAtivo(null);
    aplicarFiltro('hospede');
    expect(getFiltroAtivo()).toBe('hospede');
    const selected = document.querySelector('[data-filtro="hospede"]');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect([...document.querySelectorAll('.mini-card')].every(card => !card.style.opacity)).toBe(true);
    aplicarFiltro('hospede');
    expect(getFiltroAtivo()).toBe(null);
    expect(selected.getAttribute('aria-pressed')).toBe('false');
});
