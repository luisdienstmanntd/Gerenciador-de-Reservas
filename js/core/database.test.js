// @vitest-environment jsdom
// (database.js importa supabaseClient.js, que cria o cliente na carga do módulo —
// criar o cliente não abre conexão nenhuma, então funciona offline nos testes)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { db } from './database.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('_horaCurta', () => {
    it('corta os segundos do formato time do Postgres (HH:MM:SS → HH:MM)', () => {
        expect(db._horaCurta('20:30:00')).toBe('20:30');
    });

    it('mantém HH:MM intacto', () => {
        expect(db._horaCurta('20:30')).toBe('20:30');
    });

    it('repassa null/undefined/vazio sem quebrar', () => {
        expect(db._horaCurta(null)).toBe(null);
        expect(db._horaCurta(undefined)).toBe(undefined);
        expect(db._horaCurta('')).toBe('');
    });
});

describe('_paraReservaApp', () => {
    const rowCompleta = {
        id: 'r1',
        data: '2026-07-14',
        horario: '20:30:00',
        original_base: '20:00:00',
        posicao: 2,
        avulsa: '123',
        paxs: 4,
        chd: 1,
        obs: 'ANIVERSÁRIO',
        mesa_identificador: '7',
        bloqueado: false,
        somente_hospedes: false,
        pagamento: 'PIX',
        menu_degustacao: true,
        inicio_mesa: '2026-07-14T20:35:00Z',
        fim_mesa: null,
        bloqueio_origem_id: null,
        cancelado_em: null,
        deposito_retido: null,
        hospedes: {
            nome: 'ANA SILVA',
            apto: '101',
            codigo_reserva: 'RES-9',
            telefone: '(11) 99999-8888',
            tipo: 'hospede',
        },
    };

    it('achata o join reservas+hospedes no formato camelCase que a UI usa', () => {
        const app = db._paraReservaApp(rowCompleta);
        expect(app).toMatchObject({
            id: 'r1',
            data: '2026-07-14',
            horario: '20:30',        // segundos cortados
            originalBase: '20:00',   // segundos cortados
            posicao: 2,
            nomes: 'ANA SILVA',
            apto: '101',
            codigoReserva: 'RES-9',
            whatsapp: '(11) 99999-8888',
            tipo: 'hospede',
            mesa: '7',
            menuDegustacao: true,
            inicioMesa: '2026-07-14T20:35:00Z',
            fimMesa: null,
        });
    });

    it('aplica defaults seguros quando a linha não tem hóspede (bloqueio/slot vazio)', () => {
        const app = db._paraReservaApp({ id: 'r2', data: '2026-07-14', horario: '21:00:00', posicao: 0 });
        expect(app.nomes).toBe('');
        expect(app.apto).toBe('');
        expect(app.tipo).toBe('hospede');
        expect(app.mesa).toBe('');
        expect(app.paxs).toBe(0);
        expect(app.bloqueado).toBe(false);
        expect(app.canceladoEm).toBe(null);
    });

    it('mapeia os campos de cancelamento (soft-delete, bug #57)', () => {
        const app = db._paraReservaApp({
            ...rowCompleta,
            cancelado_em: '2026-07-13T18:00:00Z',
            deposito_retido: 200,
        });
        expect(app.canceladoEm).toBe('2026-07-13T18:00:00Z');
        expect(app.depositoRetido).toBe(200);
    });

    it('preserva depositoRetido === 0 (não vira null pelo || )', () => {
        const app = db._paraReservaApp({ ...rowCompleta, deposito_retido: 0 });
        expect(app.depositoRetido).toBe(0);
    });
});

describe('_paraColunasReserva', () => {
    it('NUNCA inclui mesa_identificador — mesa é só de atribuirMesa()/cancelarMesa() (bug #63)', async () => {
        vi.spyOn(db, '_resolverHospedeId').mockResolvedValue('h1');
        const colunas = await db._paraColunasReserva({
            data: '2026-07-14', horario: '20:30', nomes: 'ANA', paxs: 2,
        });
        expect(colunas).not.toHaveProperty('mesa_identificador');
    });

    it('converte o formato achatado da UI pras colunas snake_case do Postgres', async () => {
        vi.spyOn(db, '_resolverHospedeId').mockResolvedValue('h1');
        const colunas = await db._paraColunasReserva({
            data: '2026-07-14',
            horario: '20:30',
            originalBase: '20:00',
            posicao: '2',          // vem como string do formulário
            paxs: '4',
            chd: '1',
            obs: 'JANELA',
            bloqueado: false,
            somenteHospedes: true,
            menuDegustacao: true,
        });
        expect(colunas).toEqual({
            hospede_id: 'h1',
            data: '2026-07-14',
            horario: '20:30',
            original_base: '20:00',
            posicao: 2,            // parseInt aplicado
            paxs: 4,
            chd: 1,
            avulsa: null,
            obs: 'JANELA',
            bloqueado: false,
            somente_hospedes: true,
            pagamento: null,
            menu_degustacao: true,
            bloqueio_origem_id: null,
        });
    });

    it('usa horario como original_base quando originalBase não veio', async () => {
        vi.spyOn(db, '_resolverHospedeId').mockResolvedValue(null);
        const colunas = await db._paraColunasReserva({ data: '2026-07-14', horario: '21:00' });
        expect(colunas.original_base).toBe('21:00');
    });
});

describe('_paraConfigSistemaApp', () => {
    it('converte a linha snake_case pro formato achatado da UI', () => {
        expect(db._paraConfigSistemaApp({
            capacidade: 40, mesas: 20, bloqueio_automatico: false,
        })).toEqual({
            capacidade: 40, mesas: 20, bloqueioAutomatico: false,
        });
    });
});
