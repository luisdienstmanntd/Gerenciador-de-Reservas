// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
    alternarTema,
    ajustarHora,
    ajustarMinuto,
    toggleAlterarHorario,
    alternarEdicaoConfig,
} from './controls.js';

beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    localStorage.clear();
});

describe('ajustarHora', () => {
    // jsdom não deriva .innerText do HTML parseado (depende de layout) —
    // seta a propriedade diretamente, como o app faz em runtime.
    function montarRelogio(horas = '20') {
        document.body.innerHTML = '<span id="displayHoras"></span>';
        const display = document.getElementById('displayHoras');
        display.innerText = horas;
        return display;
    }

    it('incrementa e decrementa a hora', () => {
        const display = montarRelogio('20');
        ajustarHora(1);
        expect(display.innerText).toBe('21');
        ajustarHora(-1);
        expect(display.innerText).toBe('20');
    });

    it('dá a volta: 23 + 1 → 00', () => {
        const display = montarRelogio('23');
        ajustarHora(1);
        expect(display.innerText).toBe('00');
    });

    it('dá a volta: 00 - 1 → 23', () => {
        const display = montarRelogio('00');
        ajustarHora(-1);
        expect(display.innerText).toBe('23');
    });

    it('sempre exibe dois dígitos (zero à esquerda)', () => {
        const display = montarRelogio('08');
        ajustarHora(1);
        expect(display.innerText).toBe('09');
    });

    it('não quebra quando o display não existe', () => {
        expect(() => ajustarHora(1)).not.toThrow();
    });
});

describe('ajustarMinuto', () => {
    function montarRelogio(minutos = '30') {
        document.body.innerHTML = '<span id="displayMinutos"></span>';
        const display = document.getElementById('displayMinutos');
        display.innerText = minutos;
        return display;
    }

    it('avança em passos de 15 minutos', () => {
        const display = montarRelogio('30');
        ajustarMinuto(15);
        expect(display.innerText).toBe('45');
    });

    it('dá a volta: 45 + 15 → 00', () => {
        const display = montarRelogio('45');
        ajustarMinuto(15);
        expect(display.innerText).toBe('00');
    });

    it('dá a volta: 00 - 15 → 45', () => {
        const display = montarRelogio('00');
        ajustarMinuto(-15);
        expect(display.innerText).toBe('45');
    });
});

describe('alternarTema', () => {
    it('switch ligado → dark-theme no body + persiste no localStorage', () => {
        document.body.innerHTML = '<input type="checkbox" id="theme-switch" checked>';
        alternarTema();
        expect(document.body.classList.contains('dark-theme')).toBe(true);
        expect(localStorage.getItem('tema')).toBe('dark');
    });

    it('switch desligado → remove dark-theme + persiste light', () => {
        document.body.classList.add('dark-theme');
        document.body.innerHTML = '<input type="checkbox" id="theme-switch">';
        alternarTema();
        expect(document.body.classList.contains('dark-theme')).toBe(false);
        expect(localStorage.getItem('tema')).toBe('light');
    });
});

describe('toggleAlterarHorario', () => {
    it('mostra o relógio quando o checkbox está marcado', () => {
        document.body.innerHTML = `
            <input type="checkbox" id="checkAlterarHorario" checked>
            <div id="containerNovoHorario" class="hidden"></div>
        `;
        toggleAlterarHorario();
        expect(document.getElementById('containerNovoHorario').classList.contains('hidden')).toBe(false);
    });

    it('esconde o relógio quando o checkbox está desmarcado', () => {
        document.body.innerHTML = `
            <input type="checkbox" id="checkAlterarHorario">
            <div id="containerNovoHorario"></div>
        `;
        toggleAlterarHorario();
        expect(document.getElementById('containerNovoHorario').classList.contains('hidden')).toBe(true);
    });
});

describe('alternarEdicaoConfig', () => {
    it('destrava o input quando o switch liga e trava quando desliga', () => {
        document.body.innerHTML = '<input id="configCapacidade" disabled>';
        alternarEdicaoConfig('configCapacidade', true);
        expect(document.getElementById('configCapacidade').disabled).toBe(false);
        alternarEdicaoConfig('configCapacidade', false);
        expect(document.getElementById('configCapacidade').disabled).toBe(true);
    });
});
