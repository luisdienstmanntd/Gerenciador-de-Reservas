/* =========================================================================================
   OSTERIA DI LUCCA - LOG.JS v4.0
   ✅ v1.4: Padroniza error handling — usa notificacao.js
   ✅ v2.0: Timeline profissional (linha vertical, agrupamento, diff ANTES/DEPOIS inline)
   ✅ v3.0: Fase 5 da migração Firestore → Supabase. Coleção 'logs' vira tabela
            'reservas_log'. FK de reserva_id foi removida (ver migration
            20260709161500) — um log precisa sobreviver à exclusão da reserva que o originou.
   ✅ v3.1: Ação CANCELAR (soft-delete, bug #57).
   ✅ v3.2: Diff mostra SOMENTE os campos alterados; datas do filtro usam o dia LOCAL.
   ✅ v4.0: Auditoria completa (PL-2026-11-03-001):
            - SEGURANÇA: tudo que vai pro innerHTML passa por escapeHtml (nome, obs e
              usuário eram interpolados crus → XSS armazenado). Falha ao gravar log agora
              avisa a recepção (antes era só console.error — auditoria falhava calada).
            - Filtros: período (de/até), "dia da alteração" × "noite da reserva", ação,
              usuário e busca única (nome, apto, código, mesa). Paginação com contagem real.
            - Resumo do período, histórico completo de uma reserva e recriação de reserva
              excluída a partir do snapshot do log.
            - Novos eventos: OBSERVAR, RECRIAR, NOSHOW, CONFIG, LOGIN, LOGOUT
              (registrarLogEvento grava payload livre, sem o formato de reserva).
            - Visual neutro: o cartão não usa mais faixa colorida; a cor semântica aparece
              só no ponto do selo e no ícone, sempre via tokens da paleta (css/log.css).
   ========================================================================================= */

import { db } from '../../core/database.js';
import { notificarErro, notificarAviso, notificarSucesso } from '../../core/notificacao.js';
import { escapeHtml } from './validators.js';

// ✅ v1.3: Lê usuário do localStorage (definido na tela de login)
const usuarioAtual = () => localStorage.getItem('usuario_nome') || 'sistema';

const esc = escapeHtml;
const TAMANHO_PAGINA = 100;

// Aviso de falha de gravação: no máximo 1 por minuto, senão uma queda de rede durante
// o serviço empilharia um toast por reserva editada.
let _ultimoAvisoFalhaLog = 0;
function _avisarFalhaLog() {
    const agora = Date.now();
    if (agora - _ultimoAvisoFalhaLog < 60000) return;
    _ultimoAvisoFalhaLog = agora;
    notificarAviso('Não foi possível registrar o histórico desta alteração. Avise a gerência.');
}

// ─────────────────────────────────────────────────────────────────────────────
// GRAVAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra uma ação de reserva no log (o snapshot passa por _resumir).
 * @param {string} acao - 'CRIAR' | 'EDITAR' | 'EXCLUIR' | 'DESBLOQUEAR' | 'CANCELAR' | 'RESTAURAR' | 'RECRIAR' | 'OBSERVAR'
 * @param {Object} dadosAntes - Dados antes da alteração (null para criar)
 * @param {Object} dadosDepois - Dados depois da alteração (null para excluir)
 */
export async function registrarLog(acao, dadosAntes = null, dadosDepois = null) {
    try {
        await db.aguardarInicializacao();
        const client = db.getClient();

        const { error } = await client.from('reservas_log').insert({
            reserva_id: dadosDepois?.id || dadosAntes?.id || null,
            acao,
            usuario: usuarioAtual(),
            dados_antes: dadosAntes ? _resumir(dadosAntes) : null,
            dados_depois: dadosDepois ? _resumir(dadosDepois) : null,
        });
        if (error) throw error;
        console.log(`📝 Log registrado: ${acao}`);
    } catch (e) {
        // Log de auditoria não deve interromper o fluxo principal — mas também não pode
        // falhar calado (REVISAO_TECNICA B6): a recepção precisa saber pra reportar.
        console.error('❌ Erro ao registrar log:', e);
        _avisarFalhaLog();
    }
}

/**
 * Registra um evento que NÃO é uma reserva (CONFIG, NOSHOW, LOGIN, LOGOUT). Os dados
 * são gravados como vieram, sem _resumir, e reserva_id fica nulo. Nunca lança.
 * @param {string} acao
 * @param {Object|null} dadosAntes
 * @param {Object|null} dadosDepois
 * @param {{usuario?: string}} [opcoes] - LOGIN grava antes do localStorage estar pronto
 */
export async function registrarLogEvento(acao, dadosAntes = null, dadosDepois = null, opcoes = {}) {
    try {
        await db.aguardarInicializacao();
        const { error } = await db.getClient().from('reservas_log').insert({
            reserva_id: null,
            acao,
            usuario: opcoes.usuario || usuarioAtual(),
            dados_antes: dadosAntes,
            dados_depois: dadosDepois,
        });
        if (error) throw error;
    } catch (e) {
        console.error(`❌ Erro ao registrar evento ${acao}:`, e);
        // Sessão (LOGIN/LOGOUT) é ruído operacional: não vale incomodar a recepção.
        if (acao !== 'LOGIN' && acao !== 'LOGOUT') _avisarFalhaLog();
    }
}

/**
 * Converte uma linha de reservas_log (snake_case, criado_em) para o formato que a
 * timeline sempre usou (camelCase, timestamp) — equivalente ao doc do Firestore.
 */
export function _paraLogApp(row) {
    return {
        id: row.id,
        acao: row.acao,
        usuario: row.usuario,
        timestamp: row.criado_em,
        reservaId: row.reserva_id,
        dadosAntes: row.dados_antes,
        dadosDepois: row.dados_depois,
    };
}

/** Resume dados da reserva para o log (evita salvar campos desnecessários).
 *  Exportada para testes (mesmo padrão dos helpers _-prefixados de service.js). */
export function _resumir(dados) {
    return {
        id:              dados.id              || '',
        // A data da noite é essencial pra análise: após EXCLUIR (linha apagada) ou
        // RESTAURAR (cancelamento limpo da linha), o log é a única fonte histórica —
        // sem a data, é impossível saber pra qual noite era a reserva (REVISAO_TECNICA.md A2).
        data:            dados.data            || '',
        nomes:           dados.nomes           || '',
        apto:            dados.apto            || '',
        codigoReserva:   dados.codigoReserva   || '',
        horario:         dados.horario         || '',
        // originalBase/posicao: sem eles, recriar uma reserva excluída não sabe em que
        // bloco/linha ela estava (logs antigos não têm — o service usa fallback).
        originalBase:    dados.originalBase    || '',
        posicao:         Number.isInteger(dados.posicao) ? dados.posicao : 0,
        tipo:            dados.tipo            || '',
        paxs:            dados.paxs            || 0,
        chd:             dados.chd             || 0,
        obs:             dados.obs             || '',
        mesa:            dados.mesa            || '',
        bloqueado:       dados.bloqueado       || false,
        somenteHospedes: dados.somenteHospedes || false,
        canceladoEm:     dados.canceladoEm     || '',
        depositoRetido:  dados.depositoRetido,
        whatsapp:        dados.whatsapp        || '',
        avulsa:          dados.avulsa          || '',
        pagamento:       dados.pagamento       || '',
        menuDegustacao:  dados.menuDegustacao  || false,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO VISUAL
// ─────────────────────────────────────────────────────────────────────────────

// `tom` escolhe o token semântico (css/log.css) usado no ponto do selo e no ícone;
// o cartão em si é neutro. `curto` é o texto do chip de filtro.
const CONFIG_ACAO = {
    CRIAR:       { tom: 'sucesso', label: 'CRIADO',       curto: 'Criados',       icone: _iconeCheck()   },
    EDITAR:      { tom: 'aviso',   label: 'EDITADO',      curto: 'Editados',      icone: _iconeLapis()   },
    EXCLUIR:     { tom: 'erro',    label: 'EXCLUÍDO',     curto: 'Excluídos',     icone: _iconeLixeira() },
    DESBLOQUEAR: { tom: 'info',    label: 'DESBLOQUEADO', curto: 'Desbloqueios',  icone: _iconeCadeado() },
    CANCELAR:    { tom: 'erro',    label: 'CANCELADO',    curto: 'Cancelados',    icone: _iconeLixeira() },
    RESTAURAR:   { tom: 'sucesso', label: 'RESTAURADO',   curto: 'Restaurados',   icone: _iconeCheck()   },
    RECRIAR:     { tom: 'sucesso', label: 'RECRIADO',     curto: 'Recriados',     icone: _iconeRecriar() },
    OBSERVAR:    { tom: 'aviso',   label: 'OBSERVAÇÃO',   curto: 'Observações',   icone: _iconeLapis()   },
    NOSHOW:      { tom: 'info',    label: 'NO-SHOW',      curto: 'No-show',       icone: _iconeRelogio(16) },
    CONFIG:      { tom: 'info',    label: 'CONFIGURAÇÃO', curto: 'Configurações', icone: _iconeEngrenagem() },
    LOGIN:       { tom: 'info',    label: 'ENTROU',       curto: 'Acessos',       icone: _iconeUsuario(16) },
    LOGOUT:      { tom: 'info',    label: 'SAIU',         curto: 'Acessos',       icone: _iconeUsuario(16) },
};

// Chips do filtro: LOGIN e LOGOUT compartilham o chip "Acessos".
const CHIPS_ACAO = [
    { id: 'CRIAR',       acoes: ['CRIAR'],               texto: 'Criados' },
    { id: 'EDITAR',      acoes: ['EDITAR', 'OBSERVAR'],  texto: 'Editados' },
    { id: 'EXCLUIR',     acoes: ['EXCLUIR'],             texto: 'Excluídos' },
    { id: 'CANCELAR',    acoes: ['CANCELAR', 'RESTAURAR'], texto: 'Cancelamentos' },
    { id: 'RECRIAR',     acoes: ['RECRIAR'],             texto: 'Recriados' },
    { id: 'BLOQUEIO',    acoes: ['DESBLOQUEAR'],         texto: 'Bloqueios' },
    { id: 'SISTEMA',     acoes: ['NOSHOW', 'CONFIG', 'LOGIN', 'LOGOUT'], texto: 'Sistema' },
];

const LABELS_CAMPOS = {
    data: 'Data', nomes: 'Nome', apto: 'Apto', codigoReserva: 'Reserva', horario: 'Horário', tipo: 'Tipo',
    canceladoEm: 'Cancelado em', depositoRetido: 'Depósito retido',
    paxs: 'Adultos', chd: 'Crianças', obs: 'Obs', mesa: 'Mesa',
    bloqueado: 'Bloqueado', somenteHospedes: 'Só Hósp.',
    whatsapp: 'WhatsApp', avulsa: 'Avulsa', pagamento: 'Pagamento', menuDegustacao: 'Menu Deg.',
};

const LABELS_CONFIG = {
    capacidade: 'Capacidade', mesas: 'Mesas',
    bloqueioAutomatico: 'Bloqueio automático', bloqueiosSemanais: 'Bloqueios semanais',
};

// ─────────────────────────────────────────────────────────────────────────────
// ÍCONES SVG INLINE (estáticos — nenhum dado do usuário entra aqui)
// ─────────────────────────────────────────────────────────────────────────────

function _svg(tam, miolo) { return '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + miolo + '</svg>'; }

function _iconeCheck()   { return _svg(16, '<polyline points="20 6 9 17 4 12"/>'); }
function _iconeLapis()   { return _svg(16, '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'); }
function _iconeLixeira() { return _svg(16, '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>'); }
function _iconeCadeado() { return _svg(16, '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'); }
function _iconeRelogio(t = 13) { return _svg(t, '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'); }
function _iconeUsuario(t = 13) { return _svg(t, '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'); }
function _iconeRecriar() { return _svg(16, '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'); }
function _iconeEngrenagem() { return _svg(16, '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'); }

// ─────────────────────────────────────────────────────────────────────────────
// FILTROS E CONSULTA
// ─────────────────────────────────────────────────────────────────────────────

/** Data de hoje no fuso LOCAL (YYYY-MM-DD) — toISOString() é UTC e vira "amanhã" após as 21h. */
function _hojeLocal() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' (sem passar por Date: evita virar o dia por fuso). */
function _formatarData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const _el = (id) => document.getElementById(id);

/** Lê os controles da tela. Datas invertidas (de > até) são trocadas em vez de dar erro. */
export function _lerFiltros() {
    const hoje = _hojeLocal();
    let de  = _el('dataFiltroLog')?.value    || hoje;
    let ate = _el('dataFiltroLogAte')?.value || de;
    if (de > ate) [de, ate] = [ate, de];
    return {
        de, ate,
        modo:    _el('logModo')?.value === 'noite' ? 'noite' : 'alteracao',
        usuario: _el('logUsuario')?.value || '',
        termo:   (_el('filtroNomeLog')?.value || '').trim(),
        chips:   new Set(_chipsAtivos),
    };
}

/** Chips de ação selecionados (vazio = todas as ações). */
const _chipsAtivos = new Set();

/**
 * Aplica os filtros a uma query de reservas_log (PostgREST). Exportada pra teste.
 *
 * - "dia da alteração": criado_em é timestamptz; os limites do dia local (00:00–23:59)
 *   são convertidos pra UTC aqui — com limites em UTC puro, alterações após as 21h
 *   (UTC-3) caíam no dia seguinte.
 * - "noite da reserva": filtra pela data DENTRO do snapshot (dados_antes/dados_depois —
 *   uma linha EXCLUIR só tem dados_antes).
 * - Busca: nome, apto, código e mesa, também nos dois snapshots. Escapa curingas do
 *   ILIKE (% e _) e remove vírgula/parênteses, delimitadores do .or() do PostgREST.
 */
export function _aplicarFiltros(query, f) {
    let condNoite = null;
    if (f.modo === 'noite') {
        const lado = (s) => `and(${s}->>data.gte.${f.de},${s}->>data.lte.${f.ate})`;
        condNoite = `${lado('dados_depois')},${lado('dados_antes')}`;
    } else {
        query = query
            .gte('criado_em', new Date(f.de + 'T00:00:00').toISOString())
            .lte('criado_em', new Date(f.ate + 'T23:59:59.999').toISOString());
    }

    if (f.chips && f.chips.size) {
        const acoes = CHIPS_ACAO.filter(c => f.chips.has(c.id)).flatMap(c => c.acoes);
        query = query.in('acao', acoes);
    }
    if (f.usuario) query = query.eq('usuario', f.usuario);

    // Virgula/parenteses sao delimitadores do .or(); '*' e curinga alternativo do
    // PostgREST e '\' escaparia o '%' final - todos saem do termo antes de escapar % e _.
    let condBusca = null;
    const t = (f.termo || '').replace(/[,()*\\]/g, '').replace(/[%_]/g, '\\$&');
    if (t.trim()) {
        const condicoes = [];
        ['dados_antes', 'dados_depois'].forEach(lado => {
            ['nomes', 'apto', 'codigoReserva', 'mesa'].forEach(campo => {
                condicoes.push(`${lado}->>${campo}.ilike.%${t}%`);
            });
        });
        condBusca = condicoes.join(',');
    }

    // Dois .or() viram dois parametros `or=` na URL; em vez de depender de como o
    // PostgREST combina parametros repetidos, noite + busca vao num unico grupo and().
    if (condNoite && condBusca) query = query.or(`and(or(${condNoite}),or(${condBusca}))`);
    else if (condNoite) query = query.or(condNoite);
    else if (condBusca) query = query.or(condBusca);
    return query;
}

// Estado da listagem atual (a paginação precisa lembrar os filtros usados na 1ª página).
let _geracao = 0;
const _estado = { filtros: null, logs: [], total: 0, usuariosVistos: new Set(), emHistorico: false };
const _logsPorId = new Map();

function _mensagemCentral(icone, texto) {
    return '<div class="tl-vazio"><div class="tl-vazio-icone">' + icone + '</div><div class="tl-vazio-texto">' + esc(texto) + '</div></div>';
}

function _carregando(texto) {
    return '<div class="tl-vazio"><div class="tl-vazio-texto">' + esc(texto) + '</div></div>';
}

/**
 * Carrega (ou recarrega) a primeira página com os filtros atuais da tela.
 * É o ponto de entrada de navegação, do botão APLICAR e dos chips.
 */
export async function carregarLogs() {
    const container = _el('listaLogs');
    if (!container) return;
    _configurarTela();
    _estado.emHistorico = false;
    _el('logPainelHistorico')?.setAttribute('hidden', '');
    _el('logFiltros')?.removeAttribute('hidden');

    const filtros = _lerFiltros();
    // Espelha na tela o que foi de fato usado (data vazia → hoje; invertida → trocada).
    if (_el('dataFiltroLog'))    _el('dataFiltroLog').value    = filtros.de;
    if (_el('dataFiltroLogAte')) _el('dataFiltroLogAte').value = filtros.ate;

    container.innerHTML = _carregando('Carregando...');
    // Respostas de consultas antigas (busca digitando, chips em sequencia) sao descartadas.
    const minhaGeracao = ++_geracao;
    try {
        const { logs, total } = await _buscarPagina(filtros, 0);
        if (minhaGeracao !== _geracao) return;
        _estado.filtros = filtros;
        _estado.logs = logs;
        _estado.total = total;
        _desenharLista();
    } catch (e) {
        if (minhaGeracao !== _geracao) return;
        console.error('❌ Erro ao carregar logs:', e);
        notificarErro('Erro ao carregar histórico de alterações.');
        container.innerHTML = _mensagemCentral('!', 'Erro ao carregar o histórico.');
        _atualizarRodape(false);
    }
}

async function carregarMaisLogs() {
    if (!_estado.filtros) return;
    const botao = _el('logCarregarMais');
    if (botao) botao.disabled = true;
    const minhaGeracao = _geracao;
    try {
        const { logs } = await _buscarPagina(_estado.filtros, _estado.logs.length);
        if (minhaGeracao !== _geracao) return;
        // Entrou log novo entre as paginas -> o offset desloca e repete linhas; ids de DOM
        // duplicados quebrariam expandir/aria-controls. Dedupe por id.
        const vistos = new Set(_estado.logs.map(l => l.id));
        _estado.logs = _estado.logs.concat(logs.filter(l => !vistos.has(l.id)));
        _desenharLista();
    } catch (e) {
        console.error('❌ Erro ao carregar mais logs:', e);
        notificarErro('Erro ao carregar mais registros.');
    } finally {
        if (botao) botao.disabled = false;
    }
}

async function _buscarPagina(filtros, offset) {
    await db.aguardarInicializacao();
    const client = db.getClient();
    const base = client.from('reservas_log').select('*', { count: 'exact' });
    const { data: rows, count, error } = await _aplicarFiltros(base, filtros)
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + TAMANHO_PAGINA - 1);
    if (error) throw error;
    const logs = (rows || []).map(_paraLogApp);
    logs.forEach(l => { _logsPorId.set(l.id, l); if (l.usuario) _estado.usuariosVistos.add(l.usuario); });
    return { logs, total: Number.isInteger(count) ? count : offset + logs.length };
}

/**
 * Totais do que está carregado (exportada pra teste). O resumo avisa quando a lista
 * está truncada pela paginação, pra ninguém ler "12 exclusões" achando que é o total.
 */
export function _resumoDosLogs(logs) {
    const porAcao = {};
    const porUsuario = {};
    logs.forEach(l => {
        porAcao[l.acao] = (porAcao[l.acao] || 0) + 1;
        const u = l.usuario || 'sistema';
        porUsuario[u] = (porUsuario[u] || 0) + 1;
    });
    const usuarios = Object.entries(porUsuario).sort((a, b) => b[1] - a[1]);
    return { porAcao, usuarios };
}

function _desenharLista() {
    const container = _el('listaLogs');
    const { filtros, logs, total } = _estado;
    _atualizarSeletorUsuario();
    _desenharResumo();

    if (!logs.length) {
        const buscando = filtros.termo || filtros.usuario || filtros.chips.size;
        container.innerHTML = _mensagemCentral(
            '',
            buscando ? 'Nenhuma alteração encontrada com esses filtros.' : 'Nenhuma alteração neste período.'
        );
        _atualizarRodape(false);
        return;
    }

    const umDia = filtros.de === filtros.ate && filtros.modo === 'alteracao';
    container.innerHTML = _renderizarTimeline(logs, { agruparPorDia: !umDia });
    _atualizarRodape(logs.length < total);
}

function _desenharResumo() {
    const el = _el('logResumo');
    if (!el) return;
    const { logs, total } = _estado;
    if (!logs.length) { el.innerHTML = ''; return; }

    const { porAcao, usuarios } = _resumoDosLogs(logs);
    const n = (...acoes) => acoes.reduce((s, a) => s + (porAcao[a] || 0), 0);
    const celula = (rotulo, valor) =>
        '<div class="log-resumo-item"><span class="log-resumo-valor">' + esc(valor) + '</span><span class="log-resumo-rotulo">' + esc(rotulo) + '</span></div>';

    const topo = usuarios[0] ? usuarios[0][0] + ' (' + usuarios[0][1] + ')' : '—';
    const parcial = logs.length < total
        ? '<div class="log-resumo-nota">Resumo dos ' + logs.length + ' registros carregados de ' + total + '.</div>'
        : '';
    el.innerHTML =
        '<div class="log-resumo-grade">' +
            celula('Alterações', total) +
            celula('Criados', n('CRIAR', 'RECRIAR')) +
            celula('Editados', n('EDITAR', 'OBSERVAR')) +
            celula('Excluídos', n('EXCLUIR')) +
            celula('Cancelados', n('CANCELAR')) +
            celula('Mais ativo', topo) +
        '</div>' + parcial;
}

function _atualizarRodape(temMais) {
    const rodape = _el('logRodape');
    if (!rodape) return;
    const { logs, total } = _estado;
    rodape.hidden = !logs.length;
    const contador = _el('logContador');
    if (contador) contador.textContent = 'Mostrando ' + logs.length + ' de ' + total;
    const botao = _el('logCarregarMais');
    if (botao) botao.hidden = !temMais;
}

/** Mantém o seletor de usuário com todos que já apareceram, sem perder a escolha atual. */
function _atualizarSeletorUsuario() {
    const sel = _el('logUsuario');
    if (!sel) return;
    const atual = sel.value;
    const nomes = Array.from(_estado.usuariosVistos).sort();
    if (atual && !nomes.includes(atual)) nomes.push(atual);
    sel.innerHTML = '<option value="">Todos</option>' +
        nomes.map(u => '<option value="' + esc(u) + '">' + esc(u) + '</option>').join('');
    sel.value = atual;
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO DE UMA RESERVA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mostra a vida inteira de uma reserva (todos os logs com o mesmo reserva_id), do mais
 * antigo pro mais recente. Usado pelo botão "Histórico" do cartão e pelo sino.
 * @param {string} reservaId
 * @param {string} [destacarLogId] - cartão a rolar até, destacar e expandir
 */
export async function mostrarHistoricoReserva(reservaId, destacarLogId = null, tentativas = 1) {
    const container = _el('listaLogs');
    if (!container || !reservaId) return;
    _configurarTela();
    _estado.emHistorico = true;
    _el('logFiltros')?.setAttribute('hidden', '');
    _el('logResumo').innerHTML = '';
    _atualizarRodape(false);
    if (_el('logRodape')) _el('logRodape').hidden = true;
    container.innerHTML = _carregando('Carregando histórico...');

    try {
        await db.aguardarInicializacao();
        // O sino dispara este fluxo logo após o INSERT da notificação; o log pode ainda
        // não ter chegado (race entre notificação e registrarLog) — o sino pede 5 tentativas.
        let rows = [];
        for (let tentativa = 0; tentativa < tentativas; tentativa++) {
            const { data, error } = await db.getClient().from('reservas_log')
                .select('*').eq('reserva_id', reservaId).order('criado_em', { ascending: true });
            if (error) throw error;
            rows = data || [];
            if (rows.length > 0 && (!destacarLogId || rows.some(r => r.id === destacarLogId))) break;
            await new Promise(r => setTimeout(r, 800));
        }

        const painel = _el('logPainelHistorico');
        if (!rows.length) {
            if (painel) painel.setAttribute('hidden', '');
            container.innerHTML = _mensagemCentral('', 'Nenhum histórico encontrado para esta reserva.');
            _el('logFiltros')?.removeAttribute('hidden');
            return;
        }

        const logs = rows.map(_paraLogApp);
        logs.forEach(l => _logsPorId.set(l.id, l));
        const ultimo = logs[logs.length - 1];
        const ref = ultimo.dadosDepois || ultimo.dadosAntes || {};
        if (painel) {
            painel.removeAttribute('hidden');
            painel.innerHTML =
                '<div><div class="log-historico-titulo">Histórico da reserva</div>' +
                '<div class="log-historico-nome">' + esc(ref.nomes || 'Reserva') + '</div>' +
                '<div class="log-historico-sub">' + logs.length + (logs.length === 1 ? ' registro' : ' registros') + '</div></div>' +
                '<button type="button" class="btn-main cancel-btn" data-log-acao="voltar">Voltar</button>';
        }
        container.innerHTML = _renderizarTimeline(logs, { agruparPorDia: true, contextoHistorico: true });
        // O botao que levou ate aqui foi destruido pelo re-render: foco no painel do historico.
        if (painel && typeof painel.focus === 'function') { painel.setAttribute('tabindex', '-1'); painel.focus({ preventScroll: true }); }

        const alvoId = destacarLogId || ultimo.id;
        requestAnimationFrame(() => {
            const card = _el('log-' + alvoId);
            if (!card) return;
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('tl-destaque');
            setTimeout(() => card.classList.remove('tl-destaque'), 3000);
            if (_el('diff-' + alvoId)) expandirLog(alvoId);
        });
    } catch (e) {
        console.error('❌ Erro ao carregar histórico da reserva:', e);
        notificarErro('Erro ao carregar o histórico da reserva.');
        container.innerHTML = _mensagemCentral('!', 'Erro ao carregar o histórico.');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERIZAÇÃO DA TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Array} logs
 * @param {{agruparPorDia?: boolean, contextoHistorico?: boolean}} [opcoes]
 *   agruparPorDia: separadores por data (DD/MM/AAAA) em vez de só hora — necessário
 *   quando os resultados cruzam datas (agrupar só por hora misturaria dias diferentes
 *   sob o mesmo rótulo "20:30"). Cada cartão já mostra a própria hora.
 *   contextoHistorico: dentro do histórico de uma reserva não faz sentido oferecer
 *   "Histórico" de novo.
 */
export function _renderizarTimeline(logs, opcoes) {
    const agruparPorDia = !!(opcoes && opcoes.agruparPorDia);
    // Ultima recriacao de cada reserva: o botao so some dos EXCLUIR ANTERIORES a ela
    // (EXCLUIR -> RECRIAR -> EXCLUIR de novo precisa poder recriar outra vez).
    const recriados = new Map();
    logs.filter(l => l.acao === 'RECRIAR').forEach(l => {
        if (!recriados.has(l.reservaId) || l.timestamp > recriados.get(l.reservaId)) recriados.set(l.reservaId, l.timestamp);
    });
    let html = '<div class="tl-wrapper">';
    let chaveAtual = null;

    logs.forEach(function(log) {
        const dt = new Date(log.timestamp);
        const chave = agruparPorDia
            ? dt.toLocaleDateString('pt-BR')
            : dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (chave !== chaveAtual) {
            chaveAtual = chave;
            html += '<div class="tl-hora-sep"><span>' + esc(chave) + '</span></div>';
        }
        html += _renderizarItem(log, { ...opcoes, recriados });
    });

    return html + '</div>';
}

/** Linhas {rotulo, antes, depois} do que mudou — reserva (EDITAR/OBSERVAR) ou configuração. */
function _linhasDiff(log) {
    if (log.acao === 'CONFIG') {
        const a = log.dadosAntes || {}, d = log.dadosDepois || {};
        return Object.keys(LABELS_CONFIG)
            .filter(c => JSON.stringify(a[c] ?? null) !== JSON.stringify(d[c] ?? null))
            .map(c => ({ rotulo: LABELS_CONFIG[c], antes: _valorConfig(a[c]), depois: _valorConfig(d[c]) }));
    }
    if ((log.acao === 'EDITAR' || log.acao === 'OBSERVAR') && log.dadosAntes && log.dadosDepois) {
        return _camposAlterados(log.dadosAntes, log.dadosDepois).map(c => ({
            rotulo: LABELS_CAMPOS[c],
            antes:  _valorCampo(log.dadosAntes[c]),
            depois: _valorCampo(log.dadosDepois[c]),
        }));
    }
    return [];
}

function _valorCampo(v) {
    if (v === true) return 'Sim';
    if (v === false) return '—';
    const s = String(v != null ? v : '');
    return s || '—';
}

function _valorConfig(v) {
    if (v === undefined || v === null) return '—';
    if (typeof v === 'boolean') return v ? 'Ligado' : 'Desligado';
    if (typeof v === 'object') return Object.keys(v).length ? JSON.stringify(v) : '—';
    return String(v);
}

/** Dados registrados no momento da ação (EXCLUIR/CANCELAR/RECRIAR) — só campos preenchidos. */
function _linhasSnapshot(log) {
    const r = log.dadosAntes || log.dadosDepois || {};
    return Object.keys(LABELS_CAMPOS)
        .filter(c => r[c] !== undefined && r[c] !== null && r[c] !== '' && r[c] !== false && r[c] !== 0)
        .map(c => ({ rotulo: LABELS_CAMPOS[c], valor: _valorCampo(r[c]) }));
}

function _titulo(log, reserva) {
    switch (log.acao) {
        case 'LOGIN':  return log.usuario || 'Usuário';
        case 'LOGOUT': return log.usuario || 'Usuário';
        case 'CONFIG': return 'Configurações do sistema';
        case 'NOSHOW': {
            const q = (log.dadosDepois && log.dadosDepois.quantidade) || 0;
            return q + (q === 1 ? ' reserva marcada como no-show' : ' reservas marcadas como no-show');
        }
        case 'DESBLOQUEAR': return reserva.nomes || 'Desbloqueado';
        default: {
            const tipoBloqueio = reserva.bloqueado ? 'BLOQUEADO' : reserva.somenteHospedes ? 'SÓ HÓSPEDES' : null;
            return tipoBloqueio || reserva.nomes || '—';
        }
    }
}

function _renderizarItem(log, opcoes) {
    const cfg     = CONFIG_ACAO[log.acao] || { tom: 'neutro', label: log.acao, icone: '' };
    const dt      = new Date(log.timestamp);
    const horaSec = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const reserva = log.dadosDepois || log.dadosAntes || {};
    const ehReserva = !['LOGIN', 'LOGOUT', 'CONFIG', 'NOSHOW'].includes(log.acao);

    const isBloqueio   = ehReserva && (reserva.bloqueado || reserva.somenteHospedes);
    const tipoBloqueio = reserva.bloqueado ? 'BLOQUEADO' : reserva.somenteHospedes ? 'SÓ HÓSPEDES' : null;

    // Pills de detalhe. A noite da reserva vem primeiro: a data do log é QUANDO mexeram,
    // a noite é DE QUAL reserva se trata — a distinção que mais gerava dúvida.
    let partes = [];
    if (log.acao === 'NOSHOW') {
        partes = [log.dadosDepois && log.dadosDepois.data ? 'Até ' + _formatarData(log.dadosDepois.data) : ''];
    } else if (ehReserva) {
        const noite = reserva.data ? 'Noite ' + _formatarData(reserva.data).slice(0, 5) : '';
        partes = (isBloqueio || log.acao === 'DESBLOQUEAR')
            ? [noite, reserva.horario, tipoBloqueio]
            : [
                noite,
                reserva.horario,
                reserva.apto ? 'APT ' + reserva.apto : '',
                reserva.tipo ? String(reserva.tipo).toUpperCase() : '',
                (reserva.paxs || 0) > 0 ? reserva.paxs + ' ADT' : '',
                (reserva.chd  || 0) > 0 ? reserva.chd  + ' CHD' : '',
                reserva.mesa ? 'MESA ' + reserva.mesa : '',
            ];
    }
    partes = partes.filter(Boolean);
    const detalhesHtml = partes.length
        ? '<div class="tl-detalhes">' + partes.map((p, i) =>
            (i > 0 ? '<span class="tl-sep" aria-hidden="true">·</span>' : '') + '<span>' + esc(p) + '</span>').join('') + '</div>'
        : '';

    // Conteúdo expansível: diff (edições/config) ou os dados registrados (exclusão/cancelamento).
    const diff = _linhasDiff(log);
    const snapshot = (!diff.length && (log.acao === 'EXCLUIR' || log.acao === 'CANCELAR') && ehReserva)
        ? _linhasSnapshot(log) : [];
    const expansivel = diff.length > 0 || snapshot.length > 0;
    const dicaHtml = diff.length
        ? '<div class="tl-dica">Alterou: ' + esc(diff.map(l => l.rotulo).join(', ')) + ' — toque para detalhes</div>'
        : (snapshot.length ? '<div class="tl-dica">Toque para ver os dados registrados</div>' : '');

    // Ações do cartão
    const acoes = [];
    if (log.reservaId && ehReserva && !(opcoes && opcoes.contextoHistorico)) {
        acoes.push('<button type="button" class="tl-btn" data-log-acao="historico" data-log-reserva="' + esc(log.reservaId) + '" data-log-id="' + esc(log.id) + '">Histórico da reserva</button>');
    }
    const recriadaEm = opcoes && opcoes.recriados && opcoes.recriados.get(log.reservaId);
    const jaRecriada = !!recriadaEm && recriadaEm > log.timestamp;
    // Reserva cancelada e depois excluida nao e recriada como ativa (o service tambem recusa).
    if (log.acao === 'EXCLUIR' && log.dadosAntes && log.dadosAntes.nomes && !log.dadosAntes.canceladoEm && !jaRecriada) {
        acoes.push('<button type="button" class="tl-btn tl-btn-primario" data-log-acao="recriar" data-log-id="' + esc(log.id) + '">Recriar reserva</button>');
    }
    const acoesHtml = acoes.length ? '<div class="tl-acoes">' + acoes.join('') + '</div>' : '';

    const corpoExpandido = expansivel ? _renderizarExpandido(log, diff, snapshot) : '';
    const attrsClique = expansivel
        ? ' role="button" tabindex="0" aria-expanded="false" aria-controls="diff-' + esc(log.id) + '" data-log-acao="expandir" data-log-id="' + esc(log.id) + '"'
        : '';

    return (
        '<div class="tl-item" data-tom="' + cfg.tom + '">' +
            '<div class="tl-icon" aria-hidden="true">' + cfg.icone + '</div>' +
            '<div id="log-' + esc(log.id) + '" class="tl-card' + (expansivel ? ' tl-clicavel' : '') + '">' +
                '<div class="tl-card-corpo' + (expansivel ? ' tl-clicavel' : '') + '"' + attrsClique + '>' +
                    '<div class="tl-card-principal">' +
                        '<span class="tl-badge">' + esc(cfg.label) + '</span>' +
                        '<span class="tl-nome">' + esc(_titulo(log, reserva)) + '</span>' +
                        '<div class="tl-meta">' +
                            '<span class="tl-meta-item">' + _iconeRelogio() + ' ' + esc(horaSec) + '</span>' +
                            '<span class="tl-meta-item">' + _iconeUsuario() + ' ' + esc(log.usuario || 'sistema') + '</span>' +
                        '</div>' +
                    '</div>' +
                    detalhesHtml +
                    dicaHtml +
                '</div>' +
                acoesHtml +
                corpoExpandido +
            '</div>' +
        '</div>'
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIFF / DADOS REGISTRADOS
// ─────────────────────────────────────────────────────────────────────────────

/** Campos rastreados cujo valor mudou entre antes e depois, na ordem de LABELS_CAMPOS. */
export function _camposAlterados(antes, depois) {
    return Object.keys(LABELS_CAMPOS).filter(function(c) {
        return String(antes[c] != null ? antes[c] : '') !== String(depois[c] != null ? depois[c] : '');
    });
}

function _renderizarExpandido(log, diff, snapshot) {
    let miolo;
    if (diff.length) {
        const qtd = diff.length;
        miolo =
            '<div class="tl-diff-cabecalho">Alterações — ' + (qtd === 1 ? '1 campo alterado' : qtd + ' campos alterados') + '</div>' +
            '<table class="tl-diff-tabela"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>' +
            diff.map(l =>
                '<tr><td class="col-campo">' + esc(l.rotulo) + '</td>' +
                '<td class="col-antes">' + esc(l.antes) + '</td>' +
                '<td class="col-depois">' + esc(l.depois) + '</td></tr>').join('') +
            '</tbody></table>';
    } else {
        miolo =
            '<div class="tl-diff-cabecalho">Dados registrados no momento da ação</div>' +
            '<table class="tl-diff-tabela"><tbody>' +
            snapshot.map(l => '<tr><td class="col-campo">' + esc(l.rotulo) + '</td><td>' + esc(l.valor) + '</td></tr>').join('') +
            '</tbody></table>';
    }
    return '<div id="diff-' + esc(log.id) + '" class="tl-diff">' + miolo +
        '<button type="button" class="tl-btn" data-log-acao="recolher" data-log-id="' + esc(log.id) + '">Fechar</button></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

function expandirLog(logId) {
    const diff = _el('diff-' + logId);
    if (!diff) return;
    const jaAberto = diff.classList.contains('aberto');

    // Fecha qualquer outro diff aberto
    document.querySelectorAll('.tl-diff.aberto').forEach(function(el) { el.classList.remove('aberto'); });
    document.querySelectorAll('.tl-card-corpo[aria-expanded="true"]').forEach(function(el) { el.setAttribute('aria-expanded', 'false'); });

    if (!jaAberto) {
        diff.classList.add('aberto');
        _el('log-' + logId)?.querySelector('.tl-card-corpo')?.setAttribute('aria-expanded', 'true');
    }
}

function recolherLog(logId) {
    _el('diff-' + logId)?.classList.remove('aberto');
    const corpo = _el('log-' + logId)?.querySelector('.tl-card-corpo');
    corpo?.setAttribute('aria-expanded', 'false');
    // O botao "Fechar" some junto com o painel: devolve o foco ao cartao (teclado/leitor de tela).
    if (corpo && typeof corpo.focus === 'function') corpo.focus();
}

/**
 * Recria uma reserva excluída a partir do snapshot do log. Confirma antes (a recepção
 * pode estar com a mesma reserva já refeita à mão) e delega a escrita ao service, que
 * recalcula a posição livre e registra o log RECRIAR. A mesa não é restaurada.
 */
async function recriarReservaDoLog(logId) {
    const log = _logsPorId.get(logId);
    if (!log || !log.dadosAntes) return;
    const r = log.dadosAntes;
    try {
        const existente = log.reservaId ? await db.getReservaPorId(log.reservaId) : null;
        if (existente) {
            notificarAviso('Esta reserva já existe — não é preciso recriá-la.');
            return;
        }
    } catch (e) {
        console.error('❌ Erro ao conferir a reserva antes de recriar:', e);
        notificarErro('Não foi possível conferir a reserva. Tente novamente.');
        return;
    }

    const quando = [r.data ? _formatarData(r.data) : '', r.horario].filter(Boolean).join(' às ');
    window.modalConfirmar(
        'Recriar a reserva de <strong>' + esc(r.nomes) + '</strong>' + (quando ? ' (' + esc(quando) + ')' : '') +
        '? Ela volta à grade na primeira linha livre do horário; a mesa não é restaurada.',
        async () => {
            try {
                const { recriarReservaDoLog: recriar } = await import('./service.js');
                await recriar(r);
                notificarSucesso('Reserva recriada.');
                if (_estado.emHistorico && log.reservaId) await mostrarHistoricoReserva(log.reservaId);
                else await carregarLogs();
            } catch (e) {
                // o service já notifica o erro; aqui só garantimos que não vire rejeição solta
                console.error('❌ Erro ao recriar reserva:', e);
            }
        }
    );
}

/** Delegação de eventos: um único listener serve a todos os cartões, inclusive os novos. */
function _aoClicarNaLista(ev) {
    const alvo = ev.target.closest('[data-log-acao]');
    if (!alvo) return;
    const id = alvo.getAttribute('data-log-id');
    switch (alvo.getAttribute('data-log-acao')) {
        case 'expandir':  expandirLog(id); break;
        case 'recolher':  recolherLog(id); break;
        case 'historico': mostrarHistoricoReserva(alvo.getAttribute('data-log-reserva'), id); break;
        case 'recriar':   recriarReservaDoLog(id); break;
        case 'voltar':    carregarLogs().then(() => _el('dataFiltroLog')?.focus()); break;
    }
}

function _aoTeclarNaLista(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const alvo = ev.target.closest('[role="button"][data-log-acao="expandir"]');
    if (!alvo) return;
    ev.preventDefault();
    expandirLog(alvo.getAttribute('data-log-id'));
}

let _debounceBusca = null;
/** Debounce (400ms) do campo de busca — evita uma query a cada tecla digitada. */
function buscarLogsPorNomeDebounced() {
    clearTimeout(_debounceBusca);
    _debounceBusca = setTimeout(carregarLogs, 400);
}

function _desenharChips() {
    const el = _el('logChips');
    if (!el) return;
    el.innerHTML = CHIPS_ACAO.map(c =>
        '<button type="button" class="log-chip" data-log-chip="' + c.id + '" aria-pressed="' + _chipsAtivos.has(c.id) + '">' + esc(c.texto) + '</button>'
    ).join('');
}

function _limparFiltros() {
    const hoje = _hojeLocal();
    if (_el('dataFiltroLog'))    _el('dataFiltroLog').value = hoje;
    if (_el('dataFiltroLogAte')) _el('dataFiltroLogAte').value = hoje;
    if (_el('logModo'))          _el('logModo').value = 'alteracao';
    if (_el('logUsuario'))       _el('logUsuario').value = '';
    if (_el('filtroNomeLog'))    _el('filtroNomeLog').value = '';
    _chipsAtivos.clear();
    _desenharChips();
    carregarLogs();
}

/** Liga os listeners da tela uma única vez (a tela existe desde o carregamento do index). */
function _configurarTela() {
    const lista = _el('listaLogs');
    if (!lista || lista.dataset.logPronto) return;
    lista.dataset.logPronto = '1';

    lista.addEventListener('click', _aoClicarNaLista);
    lista.addEventListener('keydown', _aoTeclarNaLista);
    _el('logPainelHistorico')?.addEventListener('click', _aoClicarNaLista);

    _desenharChips();
    _el('logChips')?.addEventListener('click', (ev) => {
        const chip = ev.target.closest('[data-log-chip]');
        if (!chip) return;
        const id = chip.getAttribute('data-log-chip');
        if (_chipsAtivos.has(id)) _chipsAtivos.delete(id); else _chipsAtivos.add(id);
        chip.setAttribute('aria-pressed', String(_chipsAtivos.has(id)));
        carregarLogs();
    });

    _el('logBtnAplicar')?.addEventListener('click', carregarLogs);
    _el('logBtnLimpar')?.addEventListener('click', _limparFiltros);
    _el('filtroNomeLog')?.addEventListener('input', buscarLogsPorNomeDebounced);
    _el('filtroNomeLog')?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { clearTimeout(_debounceBusca); carregarLogs(); } });
    ['dataFiltroLog', 'dataFiltroLogAte', 'logModo', 'logUsuario'].forEach(id =>
        _el(id)?.addEventListener('change', carregarLogs));
    _el('logCarregarMais')?.addEventListener('click', carregarMaisLogs);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPOR GLOBALMENTE
// ─────────────────────────────────────────────────────────────────────────────

window.carregarLogs = carregarLogs;
window.expandirLog  = expandirLog;
window.recolherLog  = recolherLog;
window.registrarLogEvento = registrarLogEvento;
window.buscarLogsPorNomeDebounced = buscarLogsPorNomeDebounced;

/**
 * Chamado pelo sino após navegar para a tela de logs: abre o histórico da reserva e
 * destaca o registro mais recente.
 * @param {string} reservaId
 */
window.destacarLogPorReservaId = function(reservaId) {
    if (!reservaId) return;
    return mostrarHistoricoReserva(reservaId, null, 5);
};
