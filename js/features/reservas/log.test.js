// @vitest-environment jsdom
// (log.js importa database.js/state.js, que precisam de DOM na carga do módulo)
import { describe, it, expect } from 'vitest';
import { _paraLogApp, _resumir, _camposAlterados, _aplicarFiltros, _resumoDosLogs, _renderizarTimeline } from './log.js';

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

    it('não inclui campos fora da lista rastreada (ex: status de recepção)', () => {
        const resumo = _resumir({ statusRecepcao: 'chegou', nomes: 'ANA' });
        expect(resumo).not.toHaveProperty('statusRecepcao');
    });

    // Recriar uma reserva excluída precisa saber onde ela estava e como foi paga.
    it('guarda originalBase, posicao e pagamento pra permitir recriar a reserva', () => {
        const resumo = _resumir({ originalBase: '20:00', posicao: 2, pagamento: 'PIX' });
        expect(resumo).toMatchObject({ originalBase: '20:00', posicao: 2, pagamento: 'PIX' });
        expect(_resumir({}).posicao).toBe(0);
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


// Query falsa que só registra as chamadas encadeadas do PostgREST.
function queryFalsa() {
    const chamadas = [];
    const q = new Proxy({}, { get: (_, metodo) => (...args) => { chamadas.push([metodo, ...args]); return q; } });
    return { q, chamadas };
}
const base = { de: '2026-07-14', ate: '2026-07-14', modo: 'alteracao', usuario: '', termo: '', chips: new Set() };

describe('_aplicarFiltros', () => {
    it('modo "dia da alteração" filtra criado_em pelos limites do dia LOCAL convertidos pra UTC', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, base);
        expect(chamadas[0]).toEqual(['gte', 'criado_em', new Date('2026-07-14T00:00:00').toISOString()]);
        expect(chamadas[1]).toEqual(['lte', 'criado_em', new Date('2026-07-14T23:59:59.999').toISOString()]);
    });

    it('modo "noite da reserva" filtra a data dentro dos dois snapshots', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, { ...base, modo: 'noite', ate: '2026-07-20' });
        expect(chamadas).toHaveLength(1);
        expect(chamadas[0][0]).toBe('or');
        expect(chamadas[0][1]).toContain('dados_depois->>data.gte.2026-07-14');
        expect(chamadas[0][1]).toContain('dados_antes->>data.lte.2026-07-20');
    });

    it('chips viram um IN de ações; chip "Editados" inclui OBSERVAR', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, { ...base, chips: new Set(['EDITAR', 'EXCLUIR']) });
        const filtro = chamadas.find(c => c[0] === 'in');
        expect(filtro[2]).toEqual(['EDITAR', 'OBSERVAR', 'EXCLUIR']);
    });

    it('filtra por usuário exato', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, { ...base, usuario: 'recepcao' });
        expect(chamadas).toContainEqual(['eq', 'usuario', 'recepcao']);
    });

    it('busca procura nome, apto, código e mesa nos dois snapshots e neutraliza caracteres do PostgREST', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, { ...base, termo: 'a_b%,(x)' });
        const cond = chamadas.find(c => c[0] === 'or')[1];
        expect(cond.split(',')).toHaveLength(8);
        expect(cond).toContain('dados_antes->>apto.ilike.%a\\_b\\%x%');
        expect(cond).toContain('dados_depois->>mesa.ilike.');
    });
});

describe('_aplicarFiltros - noite + busca', () => {
    it('combina os dois num único .or() com and(), sem depender de parâmetros repetidos', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, { ...base, modo: 'noite', termo: 'ana' });
        const ors = chamadas.filter(c => c[0] === 'or');
        expect(ors).toHaveLength(1);
        expect(ors[0][1]).toMatch(/^and\(or\(.*\),or\(.*\)\)$/);
    });

    it('remove *, \ e delimitadores do termo', () => {
        const { q, chamadas } = queryFalsa();
        _aplicarFiltros(q, { ...base, termo: 'an*a\\' });
        expect(chamadas.find(c => c[0] === 'or')[1]).toContain('nomes.ilike.%ana%');
    });
});

describe('_resumoDosLogs', () => {
    it('conta por ação e ordena usuários do mais ativo pro menos', () => {
        const r = _resumoDosLogs([
            { acao: 'CRIAR', usuario: 'ana' }, { acao: 'EDITAR', usuario: 'bia' },
            { acao: 'EDITAR', usuario: 'bia' }, { acao: 'EXCLUIR', usuario: null },
        ]);
        expect(r.porAcao).toEqual({ CRIAR: 1, EDITAR: 2, EXCLUIR: 1 });
        expect(r.usuarios[0]).toEqual(['bia', 2]);
        expect(r.usuarios.map(u => u[0])).toContain('sistema');
    });
});

describe('_renderizarTimeline', () => {
    const log = (extra) => ({ id: 'l1', acao: 'EDITAR', usuario: 'ana', timestamp: '2026-07-14T23:30:00Z', reservaId: 'r1', dadosAntes: null, dadosDepois: null, ...extra });

    // Regressão de segurança: nome, obs e usuário eram interpolados crus no innerHTML.
    it('escapa nome, obs e usuário (XSS armazenado)', () => {
        const xss = '<img src=x onerror=alert(1)>';
        const html = _renderizarTimeline([log({
            usuario: xss,
            dadosAntes:  { nomes: 'ANA', obs: 'ok' },
            dadosDepois: { nomes: xss, obs: xss },
        })]);
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('EDITAR com campos alterados vira cartão expansível acessível, com diff', () => {
        const html = _renderizarTimeline([log({ dadosAntes: { nomes: 'ANA', paxs: 2 }, dadosDepois: { nomes: 'ANA', paxs: 4 } })]);
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain('id="diff-l1"');
        expect(html).toContain('Adultos');
    });

    it('EXCLUIR oferece "Recriar reserva" e mostra os dados registrados; EDITAR não oferece', () => {
        const excluir = _renderizarTimeline([log({ acao: 'EXCLUIR', dadosAntes: { nomes: 'ANA', data: '2026-07-14', horario: '20:00' } })]);
        expect(excluir).toContain('data-log-acao="recriar"');
        expect(excluir).toContain('Dados registrados');
        const editar = _renderizarTimeline([log({ dadosAntes: { nomes: 'ANA' }, dadosDepois: { nomes: 'ANA' } })]);
        expect(editar).not.toContain('data-log-acao="recriar"');
    });

    it('não oferece recriar quando um RECRIAR da mesma reserva já está na lista; histórico não repete o botão "Histórico"', () => {
        const html = _renderizarTimeline([
            log({ id: 'l2', acao: 'RECRIAR', timestamp: '2026-07-14T23:45:00Z', dadosDepois: { nomes: 'ANA' } }),
            log({ id: 'l1', acao: 'EXCLUIR', dadosAntes: { nomes: 'ANA' } }),
        ], { contextoHistorico: true });
        expect(html).not.toContain('data-log-acao="recriar"');
        expect(html).not.toContain('data-log-acao="historico"');
    });

    it('EXCLUIR -> RECRIAR -> EXCLUIR de novo: só o último EXCLUIR oferece recriar', () => {
        const html = _renderizarTimeline([
            log({ id: 'l3', acao: 'EXCLUIR', timestamp: '2026-07-15T10:00:00Z', dadosAntes: { nomes: 'ANA' } }),
            log({ id: 'l2', acao: 'RECRIAR', timestamp: '2026-07-14T23:45:00Z', dadosDepois: { nomes: 'ANA' } }),
            log({ id: 'l1', acao: 'EXCLUIR', dadosAntes: { nomes: 'ANA' } }),
        ]);
        expect(html.match(/data-log-acao="recriar"/g)).toHaveLength(1);
        expect(html).toContain('data-log-acao="recriar" data-log-id="l3"');
    });

    it('reserva cancelada e depois excluída não oferece recriar', () => {
        const html = _renderizarTimeline([log({ acao: 'EXCLUIR', dadosAntes: { nomes: 'ANA', canceladoEm: '2026-07-10T10:00:00Z' } })]);
        expect(html).not.toContain('data-log-acao="recriar"');
    });

    it('eventos sem reserva (LOGIN, CONFIG, NOSHOW) renderizam sem quebrar', () => {
        const html = _renderizarTimeline([
            log({ id: 'a', acao: 'LOGIN', reservaId: null }),
            log({ id: 'b', acao: 'CONFIG', reservaId: null, dadosAntes: { capacidade: 30 }, dadosDepois: { capacidade: 40 } }),
            log({ id: 'c', acao: 'NOSHOW', reservaId: null, dadosDepois: { quantidade: 2, data: '2026-07-15' } }),
        ]);
        expect(html).toContain('Capacidade');
        expect(html).toContain('2 reservas marcadas como no-show');
        expect(html).not.toContain('data-log-acao="historico"');
    });
});
