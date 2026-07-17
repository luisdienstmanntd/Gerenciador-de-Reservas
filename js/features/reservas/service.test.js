// @vitest-environment jsdom
// (service.js importa database.js e notificacao.js, que mexem em window/document
// assim que o módulo carrega — precisamos de um DOM simulado só para o import funcionar)
import { describe, it, expect, beforeEach } from 'vitest';
import {
    _calcularPosicaoLivre,
    _totalLinhasBloco,
    _linhasExtrasNecessarias,
    _diaSemanaDe,
} from './service.js';
import { setLinhasExtras } from '../../core/state.js';

describe('_calcularPosicaoLivre', () => {
    it('retorna a posição desejada quando o bloco está vazio', () => {
        expect(_calcularPosicaoLivre([], 0)).toBe(0);
    });

    it('retorna a posição desejada quando ela está livre, mesmo com outras ocupadas', () => {
        const reservas = [
            { nomes: 'ANA', posicao: 0 },
        ];
        expect(_calcularPosicaoLivre(reservas, 2)).toBe(2);
    });

    it('ignora reservas vazias (sem nomes/bloqueado/somenteHospedes) ao calcular ocupação', () => {
        const reservas = [
            { nomes: '', bloqueado: false, somenteHospedes: false, posicao: 0 }, // vazio — não conta
        ];
        expect(_calcularPosicaoLivre(reservas, 0)).toBe(0);
    });

    it('considera bloqueio (sem nome) como posição ocupada', () => {
        const reservas = [
            { bloqueado: true, posicao: 0 },
        ];
        expect(_calcularPosicaoLivre(reservas, 0)).toBe(1);
    });

    it('considera "somente hóspedes" como posição ocupada', () => {
        const reservas = [
            { somenteHospedes: true, posicao: 0 },
        ];
        expect(_calcularPosicaoLivre(reservas, 0)).toBe(1);
    });

    it('quando a posição desejada está ocupada, procura a partir de 0 (preenche buracos, não só cresce) — bug histórico #25/#26', () => {
        // Ocupadas: 1 e 2. Posição 0 está livre — deve preencher o buraco em vez de ir para 3.
        const reservas = [
            { nomes: 'ANA', posicao: 1 },
            { nomes: 'BRUNO', posicao: 2 },
        ];
        expect(_calcularPosicaoLivre(reservas, 1)).toBe(0);
    });

    it('encontra a primeira posição livre em sequência quando 0 também está ocupada', () => {
        const reservas = [
            { nomes: 'ANA', posicao: 0 },
            { nomes: 'BRUNO', posicao: 1 },
            { nomes: 'CARLA', posicao: 2 },
        ];
        expect(_calcularPosicaoLivre(reservas, 1)).toBe(3);
    });

    it('trata posicao ausente na reserva como 0 (?? 0)', () => {
        const reservas = [
            { nomes: 'ANA' }, // sem campo posicao
        ];
        expect(_calcularPosicaoLivre(reservas, 0)).toBe(1);
    });

    it('usa 0 como posição desejada padrão quando não informada', () => {
        expect(_calcularPosicaoLivre([])).toBe(0);
    });
});

describe('_totalLinhasBloco', () => {
    beforeEach(() => setLinhasExtras({}));

    it('bloco de horário padrão tem 3 linhas base', () => {
        expect(_totalLinhasBloco('20:00')).toBe(3);
        expect(_totalLinhasBloco('22:30')).toBe(3);
    });

    it('bloco de horário editado (fora do padrão) tem 1 linha base', () => {
        expect(_totalLinhasBloco('19:00')).toBe(1);
        expect(_totalLinhasBloco('21:15')).toBe(1);
    });

    it('soma as linhas extras abertas pro bloco', () => {
        setLinhasExtras({ '20:00': 2 });
        expect(_totalLinhasBloco('20:00')).toBe(5);
        expect(_totalLinhasBloco('20:30')).toBe(3); // extras são por bloco
    });
});

describe('_linhasExtrasNecessarias', () => {
    it('reservas de até 3 pessoas não consomem linha extra', () => {
        expect(_linhasExtrasNecessarias(1)).toBe(0);
        expect(_linhasExtrasNecessarias(2)).toBe(0);
        expect(_linhasExtrasNecessarias(3)).toBe(0);
    });

    it('cada 2 pessoas além da linha própria consomem 1 linha extra', () => {
        expect(_linhasExtrasNecessarias(4)).toBe(1);
        expect(_linhasExtrasNecessarias(5)).toBe(1);
        expect(_linhasExtrasNecessarias(6)).toBe(2);
        expect(_linhasExtrasNecessarias(7)).toBe(2);
        expect(_linhasExtrasNecessarias(8)).toBe(3);
    });

    it('nunca retorna negativo (0 pessoas, dados sujos)', () => {
        expect(_linhasExtrasNecessarias(0)).toBe(0);
        expect(_linhasExtrasNecessarias(-2)).toBe(0);
    });
});

describe('_diaSemanaDe', () => {
    it('retorna o dia da semana correto (getDay 0-6) sem rollover de fuso', () => {
        expect(_diaSemanaDe('2026-07-12')).toBe(0); // domingo
        expect(_diaSemanaDe('2026-07-13')).toBe(1); // segunda
        expect(_diaSemanaDe('2026-07-16')).toBe(4); // quinta
        expect(_diaSemanaDe('2026-07-17')).toBe(5); // sexta
        expect(_diaSemanaDe('2026-07-18')).toBe(6); // sábado
    });
});
