// @vitest-environment jsdom
// (service.js importa database.js e notificacao.js, que mexem em window/document
// assim que o módulo carrega — precisamos de um DOM simulado só para o import funcionar)
import { describe, it, expect } from 'vitest';
import { _calcularPosicaoLivre } from './service.js';

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
