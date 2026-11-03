// @vitest-environment jsdom
// Testes de FLUXO de salvarApenasHorario()/alterarData() com o banco mockado —
// travam as regras de negócio dos bugs #65/#66: ao mover uma reserva de
// horário/data, ocupar a primeira linha base livre do destino; se o destino
// estiver cheio, perguntar (erro semDisponibilidade) em vez de criar linha nova.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// O mock precisa ser declarado antes do import de service.js (vi.mock é içado).
vi.mock('../../core/database.js', () => {
    const db = {
        aguardarInicializacao: vi.fn().mockResolvedValue(undefined),
        getClient: vi.fn(),
        getLinhasExtrasPorData: vi.fn().mockResolvedValue({}),
        aplicarBloqueiosSemanaisAtomico: vi.fn(),
        getReservaPorId: vi.fn(),
        buscarReservasPorBloco: vi.fn(),
        buscarBloqueiosAutomaticos: vi.fn().mockResolvedValue([]),
        garantirMesaExiste: vi.fn().mockResolvedValue(undefined),
        criarReserva: vi.fn().mockResolvedValue('novo-id'),
        atualizarReserva: vi.fn().mockResolvedValue(undefined),
        excluirReserva: vi.fn().mockResolvedValue(undefined),
        getBloqueiosSemanaisAplicados: vi.fn().mockResolvedValue(false),
        marcarBloqueiosSemanaisAplicados: vi.fn().mockResolvedValue(undefined),
    };
    return { db };
});
// registrarLog grava no Supabase — nos testes vira um no-op observável.
vi.mock('./log.js', () => ({ registrarLog: vi.fn().mockResolvedValue(undefined) }));

import { salvarApenasHorario, alterarData, aplicarBloqueiosSemanais, OBS_BLOQUEIO_SEMANAL, salvarReserva, recriarReservaDoLog, adicionarObservacao, atualizarBloqueio } from './service.js';
import { db } from '../../core/database.js';
import { registrarLog } from './log.js';
import { setConfigSistema, setLinhasExtras } from '../../core/state.js';

/** Cliente Supabase fake — registra os UPDATEs/DELETEs pra inspeção. */
function criarClienteFake() {
    const chamadas = { updates: [], deletes: [] };
    const client = {
        from: () => ({
            update: (cols) => ({
                eq: (_col, id) => ({ select: async () => { chamadas.updates.push({ cols, id }); return { data: [{id}] }; } }),
            }),
            delete: () => ({
                eq: (_col, id) => ({ select: async () => { chamadas.deletes.push(id); return { data: [{id}] }; } }),
            }),
        }),
    };
    return { client, chamadas };
}

/** 3 reservas reais ocupando as posições 0-2 (bloco padrão cheio). */
function blocoCheio() {
    return [
        { id: 'x0', nomes: 'OCUPA-0', posicao: 0 },
        { id: 'x1', nomes: 'OCUPA-1', posicao: 1 },
        { id: 'x2', nomes: 'OCUPA-2', posicao: 2 },
    ];
}

let chamadas;

beforeEach(() => {
    vi.clearAllMocks();
    const fake = criarClienteFake();
    chamadas = fake.chamadas;
    db.getClient.mockReturnValue(fake.client);
    // Bloqueio automático desligado: os fluxos aqui testam só o posicionamento —
    // a reconciliação de bloqueio tem cobertura própria via _linhasExtrasNecessarias.
    setConfigSistema({ capacidade: 30, mesas: 18, bloqueioAutomatico: false });
    setLinhasExtras({});
});

describe('salvarApenasHorario — reserva real mudando de bloco', () => {
    const reservaOrigem = {
        id: 'r1', nomes: 'ANA', paxs: 2, posicao: 3,
        horario: '22:00', originalBase: '22:00',
    };

    it('ocupa a primeira linha base livre do destino, ignorando a posição de origem (bug #65)', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        // destino 21:30: posição 0 ocupada, 1 e 2 livres
        db.buscarReservasPorBloco.mockResolvedValue([{ id: 'x0', nomes: 'OUTRO', posicao: 0 }]);

        await salvarApenasHorario({ id: 'r1', horario: '21:30' });

        expect(chamadas.updates.length).toBe(1);
        expect(chamadas.updates[0].id).toBe('r1');
        expect(chamadas.updates[0].cols).toMatchObject({
            horario: '21:30', original_base: '21:30', posicao: 1,
        });
    });

    it('destino cheio → lança semDisponibilidade e NÃO grava nada', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue(blocoCheio());

        await expect(salvarApenasHorario({ id: 'r1', horario: '21:30' }))
            .rejects.toMatchObject({ semDisponibilidade: true });
        expect(chamadas.updates.length).toBe(0);
    });

    it('destino cheio + permitirNovaLinha → grava na primeira posição além das linhas base', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue(blocoCheio());

        await salvarApenasHorario({ id: 'r1', horario: '21:30' }, { permitirNovaLinha: true });

        expect(chamadas.updates.length).toBe(1);
        expect(chamadas.updates[0].cols.posicao).toBe(3);
    });

    it('linhas extras já abertas no destino contam como capacidade disponível', async () => {
        setLinhasExtras({ '21:30': 1 }); // bloco 21:30 tem 4 linhas (3 base + 1 extra)
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue(blocoCheio()); // posições 0-2 ocupadas

        await salvarApenasHorario({ id: 'r1', horario: '21:30' });

        expect(chamadas.updates.length).toBe(1);
        expect(chamadas.updates[0].cols.posicao).toBe(3); // linha extra livre — sem aviso
    });
});

describe('salvarApenasHorario — linha vazia', () => {
    it('move deletando o doc antigo e criando um novo no destino', async () => {
        db.getReservaPorId.mockResolvedValue({
            id: 'v1', nomes: '', bloqueado: false, somenteHospedes: false,
            posicao: 2, horario: '22:00', originalBase: '22:00',
        });
        db.buscarReservasPorBloco.mockResolvedValue([]);

        const novoId = await salvarApenasHorario({ id: 'v1', horario: '21:30' });

        expect(chamadas.deletes).toEqual(['v1']);
        expect(db.criarReserva).toHaveBeenCalledWith(expect.objectContaining({
            horario: '21:30', originalBase: '21:30',
        }));
        expect(novoId).toBe('novo-id');
    });
});

describe('alterarData — checagem de capacidade no destino (bug #66)', () => {
    const reservaOrigem = {
        id: 'r1', nomes: 'ANA', paxs: 2, posicao: 0,
        data: '2026-07-14', horario: '20:00', originalBase: '20:00',
    };

    it('mantém a posição quando ela está livre na data de destino', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue([]);

        await alterarData('r1', '2026-07-20');

        expect(chamadas.updates.length).toBe(1);
        expect(chamadas.updates[0].cols).toEqual({ data: '2026-07-20', posicao: 0 });
    });

    it('posição ocupada mas bloco com vaga → usa outra linha base livre', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue([{ id: 'x0', nomes: 'OUTRO', posicao: 0 }]);

        await alterarData('r1', '2026-07-20');

        expect(chamadas.updates[0].cols.posicao).toBe(1);
    });

    it('destino cheio → lança semDisponibilidade e NÃO grava nada', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue(blocoCheio());

        await expect(alterarData('r1', '2026-07-20'))
            .rejects.toMatchObject({ semDisponibilidade: true });
        expect(chamadas.updates.length).toBe(0);
    });

    it('destino cheio + permitirNovaLinha → grava além das linhas base', async () => {
        db.getReservaPorId.mockResolvedValue(reservaOrigem);
        db.buscarReservasPorBloco.mockResolvedValue(blocoCheio());

        await alterarData('r1', '2026-07-20', { permitirNovaLinha: true });

        expect(chamadas.updates.length).toBe(1);
        expect(chamadas.updates[0].cols.posicao).toBe(3);
    });

    it('exige id e novaData', async () => {
        await expect(alterarData(null, '2026-07-20')).rejects.toThrow('ID obrigatório');
        await expect(alterarData('r1', '')).rejects.toThrow('Nova data é obrigatória');
    });
});

describe('aplicarBloqueiosSemanais — transação no servidor', () => {
    it('delega a data para RPC transacional, sem semeadura client-side', async () => {
        db.aplicarBloqueiosSemanaisAtomico.mockResolvedValue(3);
        expect(await aplicarBloqueiosSemanais('2027-07-15')).toBe(3);
        expect(db.aplicarBloqueiosSemanaisAtomico).toHaveBeenCalledWith('2027-07-15');
        expect(db.criarReserva).not.toHaveBeenCalled();
    });
    it('não oculta erros da transação', async () => {
        db.aplicarBloqueiosSemanaisAtomico.mockRejectedValue(new Error('SQL failed'));
        await expect(aplicarBloqueiosSemanais('2027-07-15')).rejects.toThrow('SQL failed');
    });
});

describe('salvarReserva — log de auditoria (bug: editar paxs não abria detalhes no Log)', () => {
    it('registra o log com o estado REAL anterior (do banco), não os dados recém-submetidos', async () => {
        // Estado anterior de verdade, buscado no banco antes do UPDATE.
        db.getReservaPorId.mockResolvedValue({ id: 'r1', nomes: 'ANA', horario: '20:00', paxs: 2 });

        await salvarReserva({ id: 'r1', nomes: 'ANA', horario: '20:00', paxs: 4 });

        expect(registrarLog).toHaveBeenCalledWith(
            'EDITAR',
            expect.objectContaining({ paxs: 2 }),
            expect.objectContaining({ paxs: 4 }),
        );
    });
});


describe('recriarReservaDoLog — desfazer exclusão a partir do snapshot do log', () => {
    const snapshot = {
        id: 'excluida-1', data: '2027-07-15', horario: '20:00', originalBase: '20:00', posicao: 1,
        nomes: 'ANA', apto: '101', codigoReserva: 'ABC', tipo: 'hospede', paxs: 2, chd: 0,
        obs: 'ANIVERSARIO', pagamento: 'PIX',
    };

    beforeEach(() => {
        db.getReservaPorId.mockResolvedValue(null);
        db.buscarReservasPorBloco.mockResolvedValue([]);
        db.criarReserva.mockResolvedValue('excluida-1');
    });

    it('recusa quando a reserva já existe e não grava nada', async () => {
        db.getReservaPorId.mockResolvedValue({ id: 'excluida-1', nomes: 'ANA' });

        await expect(recriarReservaDoLog(snapshot)).rejects.toThrow('já existe');
        expect(db.criarReserva).not.toHaveBeenCalled();
        expect(registrarLog).not.toHaveBeenCalled();
    });

    it('recusa snapshot de bloqueio ou sem nome', async () => {
        await expect(recriarReservaDoLog({ ...snapshot, bloqueado: true })).rejects.toThrow('bloqueio');
        await expect(recriarReservaDoLog({ ...snapshot, nomes: '' })).rejects.toThrow('bloqueio');
        expect(db.criarReserva).not.toHaveBeenCalled();
    });

    it('cria com o MESMO id (idFixo) e registra RECRIAR', async () => {
        const id = await recriarReservaDoLog(snapshot);

        expect(id).toBe('excluida-1');
        expect(db.criarReserva).toHaveBeenCalledWith(
            expect.objectContaining({ nomes: 'ANA', posicao: 1, originalBase: '20:00', pagamento: 'PIX' }),
            'excluida-1',
        );
        expect(registrarLog).toHaveBeenCalledWith('RECRIAR', null, expect.objectContaining({ id: 'excluida-1', nomes: 'ANA' }));
    });

    it('log antigo sem originalBase/posicao: usa horario e posição 0', async () => {
        const antigo = { ...snapshot };
        delete antigo.originalBase; delete antigo.posicao; delete antigo.pagamento;

        await recriarReservaDoLog(antigo);

        expect(db.criarReserva).toHaveBeenCalledWith(
            expect.objectContaining({ originalBase: '20:00', posicao: 0, pagamento: '' }),
            'excluida-1',
        );
    });

    it('posição original ocupada → usa a primeira livre do bloco', async () => {
        db.buscarReservasPorBloco.mockResolvedValue([{ id: 'x1', nomes: 'OUTRO', posicao: 1 }]);

        await recriarReservaDoLog(snapshot);

        expect(db.criarReserva.mock.calls[0][0].posicao).toBe(0);
    });

    it('23505 na corrida de posição: recalcula e tenta de novo', async () => {
        db.criarReserva.mockRejectedValueOnce({ code: '23505' }).mockResolvedValueOnce('excluida-1');
        db.buscarReservasPorBloco
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'x1', nomes: 'CONCORRENTE', posicao: 1 }]);

        await recriarReservaDoLog(snapshot);

        expect(db.criarReserva).toHaveBeenCalledTimes(2);
        expect(db.criarReserva.mock.calls[1][0].posicao).toBe(0);
        expect(registrarLog).toHaveBeenCalledWith('RECRIAR', null, expect.objectContaining({ posicao: 0 }));
    });

    it('erro do banco: propaga (rethrow) e não registra log', async () => {
        db.criarReserva.mockRejectedValue(new Error('falhou'));

        await expect(recriarReservaDoLog(snapshot)).rejects.toThrow('falhou');
        expect(registrarLog).not.toHaveBeenCalled();
    });
});

describe('adicionarObservacao / atualizarBloqueio — auditoria', () => {
    it('adicionarObservacao registra OBSERVAR com obs antes e depois', async () => {
        db.getReservaPorId.mockResolvedValue({ id: 'r1', nomes: 'ANA', obs: 'ALERGIA' });

        await adicionarObservacao('r1', 'sem gluten');

        expect(registrarLog).toHaveBeenCalledWith(
            'OBSERVAR',
            expect.objectContaining({ obs: 'ALERGIA' }),
            expect.objectContaining({ obs: 'ALERGIA | SEM GLUTEN' }),
        );
    });

    it('atualizarBloqueio registra EDITAR com o estado anterior', async () => {
        db.getReservaPorId.mockResolvedValue({ id: 'b1', bloqueado: true, obs: 'MANUTENCAO' });

        await atualizarBloqueio('b1', { obs: 'evento', bloqueado: false, somenteHospedes: true });

        expect(registrarLog).toHaveBeenCalledWith(
            'EDITAR',
            expect.objectContaining({ bloqueado: true, obs: 'MANUTENCAO' }),
            expect.objectContaining({ bloqueado: false, somenteHospedes: true, obs: 'EVENTO' }),
        );
    });
});
