// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
    alternarTema,
    ajustarHora,
    ajustarMinuto,
    toggleAlterarHorario,
    alternarEdicaoConfig,
    alternarEdicaoBloqueiosSemanais,
    carregarConfiguracoes,
} from './controls.js';
import { setConfigSistema } from '../core/state.js';

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

describe('alternarEdicaoBloqueiosSemanais', () => {
    it('mostra a lista de regras + botão "+ ADICIONAR REGRA" quando o switch liga e esconde quando desliga', () => {
        document.body.innerHTML = `
            <div id="listaBloqueiosSemanais" class="hidden"></div>
            <button id="btnAdicionarRegraBloqueio" class="hidden"></button>
        `;
        alternarEdicaoBloqueiosSemanais(true);
        expect(document.getElementById('listaBloqueiosSemanais').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('btnAdicionarRegraBloqueio').classList.contains('hidden')).toBe(false);
        alternarEdicaoBloqueiosSemanais(false);
        expect(document.getElementById('listaBloqueiosSemanais').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('btnAdicionarRegraBloqueio').classList.contains('hidden')).toBe(true);
    });
});

describe('carregarConfiguracoes — bloqueios antecipados', () => {
    function montarTelaConfig() {
        document.body.innerHTML = `
            <input id="configCapacidade"><input id="toggleConfigCapacidade" type="checkbox">
            <input id="configMesas"><input id="toggleConfigMesas" type="checkbox">
            <input id="toggleBloqueioAutomatico" type="checkbox">
            <input id="toggleConfigBloqueiosSemanais" type="checkbox" checked>
            <div id="listaBloqueiosSemanais"></div>
            <button id="btnAdicionarRegraBloqueio"></button>
        `;
    }

    it('sempre abre com o switch desligado e a lista/botão de adicionar escondidos, mesmo se a config tiver regras', () => {
        setConfigSistema({
            capacidade: 30, mesas: 18, bloqueioAutomatico: true,
            bloqueiosSemanais: { 4: { '20:00': 1 } },
        });
        montarTelaConfig();

        carregarConfiguracoes();

        expect(document.getElementById('toggleConfigBloqueiosSemanais').checked).toBe(false);
        expect(document.getElementById('listaBloqueiosSemanais').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('btnAdicionarRegraBloqueio').classList.contains('hidden')).toBe(true);
    });

    it('renderiza as regras salvas na lista (mesmo oculta, os dados já estão prontos ao ligar o switch)', () => {
        setConfigSistema({
            capacidade: 30, mesas: 18, bloqueioAutomatico: true,
            bloqueiosSemanais: { 5: { '20:30': 2 } },
        });
        montarTelaConfig();

        carregarConfiguracoes();

        const linhas = document.querySelectorAll('#listaBloqueiosSemanais .regra-bloqueio-semanal');
        expect(linhas.length).toBe(1);
        expect(linhas[0].querySelector('.regra-horario').value).toBe('20:30');
        expect(linhas[0].querySelector('.regra-qtd').value).toBe('2');
    });
});
