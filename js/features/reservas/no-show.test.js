// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/database.js', () => ({
    db: {
        getClient: vi.fn(),
        marcarNoShowsAnteriores: vi.fn(),
    },
}));
vi.mock('./log.js', () => ({ registrarLogEvento: vi.fn().mockResolvedValue(undefined) }));

import { atualizarNoShowsAutomaticamente, dataLocalHoje } from './no-show.js';
import { db } from '../../core/database.js';
import { registrarLogEvento } from './log.js';

beforeEach(() => {
    vi.clearAllMocks();
    db.getClient.mockReturnValue({ auth: { getSession: async () => ({ data: { session: { user: {} } } }) } });
});

describe('atualizarNoShowsAutomaticamente — log de auditoria', () => {
    it('registra NOSHOW com a quantidade quando marcou alguma reserva', async () => {
        db.marcarNoShowsAnteriores.mockResolvedValue(3);

        expect(await atualizarNoShowsAutomaticamente()).toBe(3);
        expect(registrarLogEvento).toHaveBeenCalledWith('NOSHOW', null, { quantidade: 3, data: dataLocalHoje() });
    });

    it('não registra nada quando não havia o que marcar (idempotente)', async () => {
        db.marcarNoShowsAnteriores.mockResolvedValue(0);

        expect(await atualizarNoShowsAutomaticamente()).toBe(0);
        expect(registrarLogEvento).not.toHaveBeenCalled();
    });

    it('sem sessão não toca no banco nem no log', async () => {
        db.getClient.mockReturnValue({ auth: { getSession: async () => ({ data: { session: null } }) } });

        expect(await atualizarNoShowsAutomaticamente()).toBe(0);
        expect(db.marcarNoShowsAnteriores).not.toHaveBeenCalled();
        expect(registrarLogEvento).not.toHaveBeenCalled();
    });

    it('falha ao registrar o log não lança exceção', async () => {
        db.marcarNoShowsAnteriores.mockResolvedValue(2);
        registrarLogEvento.mockRejectedValueOnce(new Error('log fora'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(atualizarNoShowsAutomaticamente()).resolves.toBe(0);
    });
});
