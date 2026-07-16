// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { atualizarMiniCards, renderizarGrid } from './render.js';
import { setLinhasExtras, setFiltroAtivo, setTodasReservas } from '../core/state.js';

// DOM mínimo que render.js espera: container da grade + mini-cards do header.
// Os cards condicionais (crianças/room/degustação/cancelamentos) precisam do
// wrapper .mini-card porque atualizarMiniCards() os oculta via closest().
function montarDOM() {
    document.body.innerHTML = `
        <div class="mini-card"><span id="dashTotalPax"></span></div>
        <div class="mini-card"><span id="dashCriancas"></span></div>
        <div class="mini-card"><span id="dashHospedes"></span></div>
        <div class="mini-card"><span id="dashExternos"></span></div>
        <div class="mini-card"><span id="dashPassantes"></span></div>
        <div class="mini-card"><span id="dashRoomService"></span></div>
        <div class="mini-card"><span id="dashMenuDegustacao"></span></div>
        <div class="mini-card"><span id="countTempo"></span></div>
        <div class="mini-card"><span id="dashCancelamentos"></span></div>
        <div id="gridReservas"></div>
    `;
}

function reserva(extras = {}) {
    return {
        id: 'r1', data: '2026-07-14', horario: '20:00', originalBase: '20:00',
        posicao: 0, tipo: 'hospede', nomes: 'ANA', apto: '101',
        paxs: 2, chd: 0, obs: '', mesa: '', bloqueado: false,
        somenteHospedes: false, canceladoEm: null,
        ...extras,
    };
}

beforeEach(() => {
    montarDOM();
    setLinhasExtras({});
    setFiltroAtivo(null);
    setTodasReservas([]);
});

describe('atualizarMiniCards', () => {
    it('soma adultos+crianças no total e separa por tipo', () => {
        atualizarMiniCards([
            reserva({ id: 'a', paxs: 2, chd: 1, tipo: 'hospede' }),
            reserva({ id: 'b', paxs: 4, chd: 0, tipo: 'externo', nomes: 'BRUNO' }),
            reserva({ id: 'c', paxs: 3, chd: 0, tipo: 'passante', nomes: 'CARLA' }),
        ]);
        expect(document.getElementById('dashTotalPax').innerText).toBe(10);
        expect(document.getElementById('dashCriancas').innerText).toBe(1);
        expect(document.getElementById('dashHospedes').innerText).toBe(3);
        expect(document.getElementById('dashExternos').innerText).toBe(4);
        expect(document.getElementById('dashPassantes').innerText).toBe(3);
    });

    it('cancelada conta no card Cancelamentos e sai de TODOS os outros totais', () => {
        atualizarMiniCards([
            reserva({ id: 'a', paxs: 2 }),
            reserva({ id: 'b', paxs: 6, canceladoEm: '2026-07-13T18:00:00Z' }),
        ]);
        expect(document.getElementById('dashTotalPax').innerText).toBe(2);
        expect(document.getElementById('dashCancelamentos').innerText).toBe(1);
    });

    it('bloqueios e linhas vazias não contam em nada', () => {
        atualizarMiniCards([
            reserva({ id: 'a', nomes: '', bloqueado: true }),
            reserva({ id: 'b', nomes: '' }),
        ]);
        expect(document.getElementById('dashTotalPax').innerText).toBe(0);
    });

    it('oculta cards condicionais quando zerados e mostra quando têm valor', () => {
        atualizarMiniCards([reserva({ paxs: 2, chd: 0 })]);
        expect(document.getElementById('dashCriancas').closest('.mini-card').style.display).toBe('none');
        expect(document.getElementById('dashCancelamentos').closest('.mini-card').style.display).toBe('none');

        atualizarMiniCards([reserva({ paxs: 2, chd: 2 })]);
        expect(document.getElementById('dashCriancas').closest('.mini-card').style.display).toBe('');
    });

    it('degustação soma só os ADULTOS das reservas com menu', () => {
        atualizarMiniCards([
            reserva({ id: 'a', paxs: 4, chd: 2, menuDegustacao: true }),
            reserva({ id: 'b', paxs: 3, menuDegustacao: false, nomes: 'BRUNO' }),
        ]);
        expect(document.getElementById('dashMenuDegustacao').innerText).toBe(4);
    });

    it('calcula o tempo médio só das mesas finalizadas em janela válida (0-300min)', () => {
        atualizarMiniCards([
            reserva({ id: 'a', inicioMesa: '2026-07-14T20:00:00Z', fimMesa: '2026-07-14T21:00:00Z' }), // 60 min
            reserva({ id: 'b', nomes: 'BRUNO', inicioMesa: '2026-07-14T20:00:00Z', fimMesa: '2026-07-14T20:30:00Z' }), // 30 min
            reserva({ id: 'c', nomes: 'CARLA', inicioMesa: '2026-07-14T10:00:00Z', fimMesa: '2026-07-14T20:00:00Z' }), // 600 min — fora da janela
        ]);
        expect(document.getElementById('countTempo').innerText).toBe('45 min');
    });

    it('mostra "-- min" quando nenhuma mesa foi finalizada', () => {
        atualizarMiniCards([reserva()]);
        expect(document.getElementById('countTempo').innerText).toBe('-- min');
    });
});

describe('renderizarGrid — sem filtro', () => {
    it('renderiza os 6 blocos padrão com 3 linhas base cada', () => {
        renderizarGrid([]);
        const celulasHora = document.querySelectorAll('#gridReservas td.linha-horario');
        expect(celulasHora.length).toBe(6);
        celulasHora.forEach(td => expect(td.getAttribute('rowspan')).toBe('3'));
        // 6 blocos × 3 linhas vazias
        expect(document.querySelectorAll('#gridReservas .reserva-vazia').length).toBe(18);
    });

    it('coloca a reserva na célula da sua posição dentro do bloco', () => {
        renderizarGrid([reserva({ posicao: 1 })]);
        const html = document.getElementById('gridReservas').innerHTML;
        expect(html).toContain('ANA');
        expect(document.querySelectorAll('#gridReservas .reserva-vazia').length).toBe(17);
    });

    it('linhas extras aumentam o bloco correspondente', () => {
        setLinhasExtras({ '20:00': 2 });
        renderizarGrid([]);
        const primeiraHora = document.querySelector('#gridReservas td.linha-horario');
        expect(primeiraHora.getAttribute('rowspan')).toBe('5'); // 3 base + 2 extras
    });

    it('cancelada NUNCA disputa posição com reserva ativa (bug #58)', () => {
        renderizarGrid([
            reserva({ id: 'cancelada', nomes: 'FANTASMA', posicao: 2, canceladoEm: '2026-07-13T18:00:00Z' }),
            reserva({ id: 'ativa', nomes: 'REAL', posicao: 2 }),
        ]);
        const html = document.getElementById('gridReservas').innerHTML;
        expect(html).toContain('REAL');
        expect(html).not.toContain('FANTASMA');
    });

    it('reserva real tem prioridade sobre doc vazio na mesma posição (v5.9)', () => {
        renderizarGrid([
            reserva({ id: 'vazio', nomes: '', posicao: 0 }),
            reserva({ id: 'real', nomes: 'REAL', posicao: 0 }),
        ]);
        expect(document.getElementById('gridReservas').innerHTML).toContain('REAL');
    });

    it('bloqueio renderiza com texto BLOQUEADO e observação', () => {
        renderizarGrid([reserva({ nomes: '', bloqueado: true, obs: 'EVENTO PRIVADO' })]);
        const html = document.getElementById('gridReservas').innerHTML;
        expect(html).toContain('BLOQUEADO');
        expect(html).toContain('EVENTO PRIVADO');
    });

    it('escapa HTML nos nomes (XSS armazenado, bug #32)', () => {
        renderizarGrid([reserva({ nomes: '<img src=x onerror=alert(1)>' })]);
        const container = document.getElementById('gridReservas');
        expect(container.querySelector('img')).toBe(null);
        expect(container.innerHTML).toContain('&lt;img');
    });

    it('expande o limite do bloco quando reserva real existe além do range (v5.8)', () => {
        renderizarGrid([reserva({ posicao: 4 })]); // além das 3 linhas base
        const primeiraHora = document.querySelector('#gridReservas td.linha-horario');
        expect(primeiraHora.getAttribute('rowspan')).toBe('5'); // expandiu até a posição 4
    });
});

describe('renderizarGrid — com filtro', () => {
    it('filtro por tipo mostra só as reservas daquele tipo', () => {
        setFiltroAtivo('externo');
        renderizarGrid([
            reserva({ id: 'a', tipo: 'hospede', nomes: 'HOSPEDE' }),
            reserva({ id: 'b', tipo: 'externo', nomes: 'EXTERNO', posicao: 1 }),
        ]);
        const html = document.getElementById('gridReservas').innerHTML;
        expect(html).toContain('EXTERNO');
        expect(html).not.toContain('HOSPEDE');
    });

    it('filtro "cancelados" mostra só as canceladas, com selo', () => {
        setFiltroAtivo('cancelados');
        renderizarGrid([
            reserva({ id: 'a', nomes: 'ATIVA' }),
            reserva({ id: 'b', nomes: 'CANCELADA JA', posicao: 1, canceladoEm: '2026-07-13T18:00:00Z' }),
        ]);
        const html = document.getElementById('gridReservas').innerHTML;
        expect(html).toContain('CANCELADA JA');
        expect(html).toContain('badge-cancelada');
        expect(html).not.toContain('ATIVA');
    });

    it('filtro "criancas" mostra só reservas com chd > 0', () => {
        setFiltroAtivo('criancas');
        renderizarGrid([
            reserva({ id: 'a', nomes: 'SEM CRIANCA', chd: 0 }),
            reserva({ id: 'b', nomes: 'COM CRIANCA', chd: 2, posicao: 1 }),
        ]);
        const html = document.getElementById('gridReservas').innerHTML;
        expect(html).toContain('COM CRIANCA');
        expect(html).not.toContain('SEM CRIANCA');
    });

    it('não quebra quando o container não existe', () => {
        document.body.innerHTML = '';
        expect(() => renderizarGrid([reserva()])).not.toThrow();
    });
});
