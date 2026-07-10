// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
    getDataAtual,
    setDataAtual,
    getTodasReservas,
    setTodasReservas,
    getHorariosPadrao,
    getConfig,
    getLinhasExtras,
    setLinhasExtras,
    adicionarLinhaExtra,
    removerLinhaExtra,
    getFiltroAtivo,
    setFiltroAtivo,
    getUnsubscribe,
    setUnsubscribe,
    getUnsubscribeConfig,
    setUnsubscribeConfig,
} from './state.js';

// state.js guarda tudo em variáveis de módulo (sem função de reset própria),
// então cada teste começa limpando explicitamente o que for usar.
beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    setLinhasExtras({});
    setFiltroAtivo(null);
    setTodasReservas([]);
    setUnsubscribe(null);
    setUnsubscribeConfig(null);
});

describe('getHorariosPadrao', () => {
    it('retorna os 6 horários fixos do serviço de jantar', () => {
        expect(getHorariosPadrao()).toEqual([
            '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
        ]);
    });
});

describe('getDataAtual / setDataAtual', () => {
    it('retorna a data em memória quando não há input #dataFiltro na tela', () => {
        setDataAtual('2026-07-02');
        expect(getDataAtual()).toBe('2026-07-02');
    });

    it('prioriza o valor do input #dataFiltro quando presente', () => {
        document.body.innerHTML = '<input id="dataFiltro" value="2026-12-25" />';
        expect(getDataAtual()).toBe('2026-12-25');
    });

    it('setDataAtual também atualiza o input #dataFiltro se ele existir', () => {
        document.body.innerHTML = '<input id="dataFiltro" />';
        setDataAtual('2026-01-01');
        expect(document.getElementById('dataFiltro').value).toBe('2026-01-01');
    });
});

describe('getTodasReservas / setTodasReservas', () => {
    it('começa vazio', () => {
        expect(getTodasReservas()).toEqual([]);
    });

    it('retorna o array definido por setTodasReservas', () => {
        const reservas = [{ id: '1', nomes: 'ANA' }];
        setTodasReservas(reservas);
        expect(getTodasReservas()).toBe(reservas);
    });
});

describe('getConfig', () => {
    it('retorna valores padrão quando não há configuração salva', () => {
        expect(getConfig()).toEqual({ capacidade: 30, mesas: 18, bloqueioAutomatico: true });
    });

    it('retorna a configuração salva no localStorage', () => {
        localStorage.setItem('osteria_config', JSON.stringify({ capacidade: 40, mesas: 20 }));
        expect(getConfig()).toEqual({ capacidade: 40, mesas: 20 });
    });
});

describe('linhasExtras (getLinhasExtras / setLinhasExtras / adicionarLinhaExtra / removerLinhaExtra)', () => {
    it('começa vazio', () => {
        expect(getLinhasExtras()).toEqual({});
    });

    it('adicionarLinhaExtra incrementa a partir de zero', () => {
        adicionarLinhaExtra('20:00');
        expect(getLinhasExtras()['20:00']).toBe(1);
    });

    it('adicionarLinhaExtra acumula em chamadas sucessivas', () => {
        adicionarLinhaExtra('20:00');
        adicionarLinhaExtra('20:00');
        adicionarLinhaExtra('20:00');
        expect(getLinhasExtras()['20:00']).toBe(3);
    });

    it('removerLinhaExtra permite valores negativos (Regra Absoluta #3 — nunca aplicar Math.max(0, ...))', () => {
        removerLinhaExtra('21:00');
        expect(getLinhasExtras()['21:00']).toBe(-1);
    });

    it('cada horário é independente', () => {
        adicionarLinhaExtra('20:00');
        removerLinhaExtra('21:00');
        expect(getLinhasExtras()).toEqual({ '20:00': 1, '21:00': -1 });
    });

    it('setLinhasExtras substitui o objeto inteiro', () => {
        adicionarLinhaExtra('20:00');
        setLinhasExtras({ '22:00': 5 });
        expect(getLinhasExtras()).toEqual({ '22:00': 5 });
    });
});

describe('getFiltroAtivo / setFiltroAtivo', () => {
    it('começa sem filtro (null)', () => {
        expect(getFiltroAtivo()).toBeNull();
    });

    it('retorna o filtro definido', () => {
        setFiltroAtivo('externo');
        expect(getFiltroAtivo()).toBe('externo');
    });
});

describe('unsubscribe (reservas e config_dia)', () => {
    it('getUnsubscribe/setUnsubscribe armazenam a função de cancelamento do listener', () => {
        const fnFalsa = () => {};
        setUnsubscribe(fnFalsa);
        expect(getUnsubscribe()).toBe(fnFalsa);
    });

    it('getUnsubscribeConfig/setUnsubscribeConfig são independentes do listener de reservas', () => {
        const fnReservas = () => {};
        const fnConfig = () => {};
        setUnsubscribe(fnReservas);
        setUnsubscribeConfig(fnConfig);
        expect(getUnsubscribe()).toBe(fnReservas);
        expect(getUnsubscribeConfig()).toBe(fnConfig);
    });
});
