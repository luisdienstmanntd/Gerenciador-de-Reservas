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

import { salvarApenasHorario, alterarData, aplicarBloqueiosSemanais, OBS_BLOQUEIO_SEMANAL, salvarReserva } from './service.js';
import { db } from '../../core/database.js';
import { registrarLog } from './log.js';
import { setConfigSistema, setLinhasExtras } from '../../core/state.js';

/** Cliente Supabase fake — registra os UPDATEs/DELETEs pra inspeção. */
function criarClienteFake() {
    const chamadas = { updates: [], deletes: [] };
    const client = {
        from: () => ({
            update: (cols) => ({
                eq: async (_col, id) => { chamadas.updates.push({ cols, id }); return {}; },
            }),
            delete: () => ({
                eq: async (_col, id) => { chamadas.deletes.push(id); return {}; },
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

describe('aplicarBloqueiosSemanais — bloqueios antecipados de dia de movimento', () => {
    // Datas futuras fixas com dia da semana conhecido (2027-07-15 = quinta, 16 = sexta, 19 = segunda)
    const QUINTA = '2027-07-15';
    const SEGUNDA = '2027-07-19';

    function configComRegras() {
        setConfigSistema({
            capacidade: 30, mesas: 18, bloqueioAutomatico: false,
            bloqueiosSemanais: { 4: { '20:00': 1, '20:30': 2 } }, // quinta
        });
    }

    it('cria os bloqueios configurados nas primeiras linhas livres e marca a data', async () => {
        configComRegras();
        // Array NOVO a cada chamada — aplicarBloqueiosSemanais faz push local no
        // bloco pra ocupar posições; um mockResolvedValue([]) compartilharia a
        // mesma instância entre os horários e vazaria ocupação de um pro outro.
        db.buscarReservasPorBloco.mockImplementation(async () => []);

        const criados = await aplicarBloqueiosSemanais(QUINTA);

        expect(criados).toBe(3); // 1×20:00 + 2×20:30
        expect(db.criarReserva).toHaveBeenCalledTimes(3);
        expect(db.criarReserva).toHaveBeenCalledWith(expect.objectContaining({
            data: QUINTA, horario: '20:00', posicao: 0,
            bloqueado: true, obs: OBS_BLOQUEIO_SEMANAL,
        }));
        // As 2 linhas de 20:30 ocupam posições consecutivas
        expect(db.criarReserva).toHaveBeenCalledWith(expect.objectContaining({ horario: '20:30', posicao: 0 }));
        expect(db.criarReserva).toHaveBeenCalledWith(expect.objectContaining({ horario: '20:30', posicao: 1 }));
        expect(db.marcarBloqueiosSemanaisAplicados).toHaveBeenCalledWith(QUINTA);
    });

    it('pula posições já ocupadas — nunca atropela reserva existente', async () => {
        configComRegras();
        db.buscarReservasPorBloco.mockResolvedValue([{ id: 'x', nomes: 'OCUPA', posicao: 0 }]);

        await aplicarBloqueiosSemanais(QUINTA);

        expect(db.criarReserva).toHaveBeenCalledWith(expect.objectContaining({ horario: '20:00', posicao: 1 }));
    });

    it('bloco cheio → não cria nada nesse horário e nunca abre linha extra', async () => {
        configComRegras();
        db.buscarReservasPorBloco.mockResolvedValue(blocoCheio());

        const criados = await aplicarBloqueiosSemanais(QUINTA);

        expect(criados).toBe(0);
        expect(db.criarReserva).not.toHaveBeenCalled();
        // A data ainda é marcada — foi avaliada; a recepção já controla o dia manualmente
        expect(db.marcarBloqueiosSemanaisAplicados).toHaveBeenCalledWith(QUINTA);
    });

    it('não reaplica quando a data já foi semeada (flag em config_dia)', async () => {
        configComRegras();
        db.getBloqueiosSemanaisAplicados.mockResolvedValue(true);

        const criados = await aplicarBloqueiosSemanais(QUINTA);

        expect(criados).toBe(0);
        expect(db.criarReserva).not.toHaveBeenCalled();
        expect(db.marcarBloqueiosSemanaisAplicados).not.toHaveBeenCalled();
    });

    it('dia da semana sem regra → não faz nada', async () => {
        configComRegras();
        const criados = await aplicarBloqueiosSemanais(SEGUNDA);
        expect(criados).toBe(0);
        expect(db.criarReserva).not.toHaveBeenCalled();
    });

    it('nunca semeia datas passadas', async () => {
        configComRegras();
        const criados = await aplicarBloqueiosSemanais('2020-07-16'); // quinta no passado
        expect(criados).toBe(0);
        expect(db.criarReserva).not.toHaveBeenCalled();
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
