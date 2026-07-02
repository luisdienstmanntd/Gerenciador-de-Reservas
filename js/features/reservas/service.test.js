// @vitest-environment jsdom
// (service.js importa database.js e notificacao.js, que mexem em window/document
// assim que o módulo carrega — precisamos de um DOM simulado só para o import funcionar)
import { describe, it, expect } from 'vitest';
import { _calcularPosicaoLivre } from './service.js';

/**
 * Simula um QuerySnapshot do Firestore com a única interface que
 * _calcularPosicaoLivre() usa: .forEach(doc => doc.data()).
 * Evita precisar de um Firestore real (ou emulador) só para testar
 * a lógica de cálculo de posição, que é pura.
 */
function snapshotFalso(docs) {
    return {
        forEach(callback) {
            docs.forEach(d => callback({ data: () => d }));
        },
    };
}

describe('_calcularPosicaoLivre', () => {
    it('retorna a posição desejada quando o bloco está vazio', () => {
        const snap = snapshotFalso([]);
        expect(_calcularPosicaoLivre(snap, 0)).toBe(0);
    });

    it('retorna a posição desejada quando ela está livre, mesmo com outras ocupadas', () => {
        const snap = snapshotFalso([
            { nomes: 'ANA', posicao: 0 },
        ]);
        expect(_calcularPosicaoLivre(snap, 2)).toBe(2);
    });

    it('ignora docs vazios (sem nomes/bloqueado/somenteHospedes) ao calcular ocupação', () => {
        const snap = snapshotFalso([
            { nomes: '', bloqueado: false, somenteHospedes: false, posicao: 0 }, // vazio — não conta
        ]);
        expect(_calcularPosicaoLivre(snap, 0)).toBe(0);
    });

    it('considera bloqueio (sem nome) como posição ocupada', () => {
        const snap = snapshotFalso([
            { bloqueado: true, posicao: 0 },
        ]);
        expect(_calcularPosicaoLivre(snap, 0)).toBe(1);
    });

    it('considera "somente hóspedes" como posição ocupada', () => {
        const snap = snapshotFalso([
            { somenteHospedes: true, posicao: 0 },
        ]);
        expect(_calcularPosicaoLivre(snap, 0)).toBe(1);
    });

    it('quando a posição desejada está ocupada, procura a partir de 0 (preenche buracos, não só cresce) — bug histórico #25/#26', () => {
        // Ocupadas: 1 e 2. Posição 0 está livre — deve preencher o buraco em vez de ir para 3.
        const snap = snapshotFalso([
            { nomes: 'ANA', posicao: 1 },
            { nomes: 'BRUNO', posicao: 2 },
        ]);
        expect(_calcularPosicaoLivre(snap, 1)).toBe(0);
    });

    it('encontra a primeira posição livre em sequência quando 0 também está ocupada', () => {
        const snap = snapshotFalso([
            { nomes: 'ANA', posicao: 0 },
            { nomes: 'BRUNO', posicao: 1 },
            { nomes: 'CARLA', posicao: 2 },
        ]);
        expect(_calcularPosicaoLivre(snap, 1)).toBe(3);
    });

    it('trata posicao ausente no doc como 0 (?? 0)', () => {
        const snap = snapshotFalso([
            { nomes: 'ANA' }, // sem campo posicao
        ]);
        expect(_calcularPosicaoLivre(snap, 0)).toBe(1);
    });

    it('usa 0 como posição desejada padrão quando não informada', () => {
        const snap = snapshotFalso([]);
        expect(_calcularPosicaoLivre(snap)).toBe(0);
    });
});
