// @vitest-environment jsdom
// (log.js importa database.js/state.js, que precisam de DOM na carga do módulo)
import { describe, it, expect } from 'vitest';
import { _paraLogApp, _resumir, _camposAlterados } from './log.js';

describe('_paraLogApp', () => {
    it('converte a linha de reservas_log (snake_case) pro formato da timeline', () => {
        expect(_paraLogApp({
            id: 'l1',
            acao: 'EDITAR',
            usuario: 'recepcao',
            criado_em: '2026-07-14T20:00:00Z',
            reserva_id: 'r1',
            dados_antes: { nomes: 'ANA' },
            dados_depois: { nomes: 'ANA MARIA' },
        })).toEqual({
            id: 'l1',
            acao: 'EDITAR',
            usuario: 'recepcao',
            timestamp: '2026-07-14T20:00:00Z',
            reservaId: 'r1',
            dadosAntes: { nomes: 'ANA' },
            dadosDepois: { nomes: 'ANA MARIA' },
        });
    });
});

describe('_resumir', () => {
    it('inclui a data da noite — única fonte histórica após EXCLUIR/RESTAURAR', () => {
        const resumo = _resumir({ data: '2026-07-14', nomes: 'ANA' });
        expect(resumo.data).toBe('2026-07-14');
    });

    it('aplica defaults seguros pra campos ausentes', () => {
        const resumo = _resumir({});
        expect(resumo).toMatchObject({
            id: '', data: '', nomes: '', apto: '', codigoReserva: '',
            horario: '', tipo: '', paxs: 0, chd: 0, obs: '', mesa: '',
            bloqueado: false, somenteHospedes: false, canceladoEm: '',
        });
    });

    it('carrega os campos de cancelamento (canceladoEm/depositoRetido)', () => {
        const resumo = _resumir({
            canceladoEm: '2026-07-13T18:00:00Z',
            depositoRetido: 200,
        });
        expect(resumo.canceladoEm).toBe('2026-07-13T18:00:00Z');
        expect(resumo.depositoRetido).toBe(200);
    });

    it('não inclui campos fora da lista rastreada (ex: pagamento)', () => {
        const resumo = _resumir({ pagamento: 'PIX', nomes: 'ANA' });
        expect(resumo).not.toHaveProperty('pagamento');
    });

    // Bug reportado: editar só whatsapp/avulsa/menuDegustacao não gerava diff nenhum no
    // log (campos ausentes de _resumir — o "antes" nunca era gravado) — o card ficava
    // sem nenhuma indicação de "toque para detalhes", como se nada tivesse mudado.
    it('inclui whatsapp/avulsa/menuDegustacao — evita reserva editada sem diff detectável', () => {
        const resumo = _resumir({ whatsapp: '(11) 99999-8888', avulsa: '50', menuDegustacao: true });
        expect(resumo.whatsapp).toBe('(11) 99999-8888');
        expect(resumo.avulsa).toBe('50');
        expect(resumo.menuDegustacao).toBe(true);
    });
});

describe('_camposAlterados', () => {
    it('detecta só os campos que mudaram', () => {
        const antes  = _resumir({ nomes: 'ANA', horario: '20:00', paxs: 2 });
        const depois = _resumir({ nomes: 'ANA', horario: '21:00', paxs: 4 });
        expect(_camposAlterados(antes, depois)).toEqual(['horario', 'paxs']);
    });

    it('retorna vazio quando nada mudou', () => {
        const dados = _resumir({ nomes: 'ANA', horario: '20:00' });
        expect(_camposAlterados(dados, { ...dados })).toEqual([]);
    });

    it('trata null/undefined como string vazia (não acusa mudança falsa)', () => {
        expect(_camposAlterados({ obs: null }, { obs: '' })).toEqual([]);
        expect(_camposAlterados({ obs: undefined }, { obs: '' })).toEqual([]);
    });

    it('compara por valor convertido em string (0 ≠ "", false ≠ true)', () => {
        expect(_camposAlterados({ paxs: 2 }, { paxs: '2' })).toEqual([]);
        expect(_camposAlterados({ bloqueado: false }, { bloqueado: true })).toEqual(['bloqueado']);
    });
});
