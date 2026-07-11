/* =========================================================================================
   OSTERIA DI LUCCA - LOG.JS v3.1
   ✅ v1.4: Padroniza error handling — usa notificacao.js
   ✅ v2.0: Timeline profissional — layout otimizado para tablet e PC de recepção
            Linha vertical conectando eventos, agrupamento por hora, ícones SVG por ação,
            diff expandido inline com tabela ANTES/DEPOIS, responsivo sem scroll horizontal
   ✅ v3.0: Fase 5 da migração Firestore → Supabase. Coleção 'logs' vira tabela
            'reservas_log'. FK de reserva_id foi removida (ver migration
            20260709161500) — um log precisa sobreviver à exclusão da reserva que
            o originou.
   ✅ v3.1: Ação CANCELAR (soft-delete, bug #57) — badge roxo próprio, campos
            canceladoEm/depositoRetido aparecem no diff expandido.
   ========================================================================================= */

import { db } from '../../core/database.js';
import { notificarErro } from '../../core/notificacao.js';

// ✅ v1.3: Lê usuário do localStorage (definido na tela de login)
const USUARIO_ATUAL = localStorage.getItem('usuario_nome') || 'sistema';

/**
 * Registra uma ação no log
 * @param {string} acao - 'CRIAR' | 'EDITAR' | 'EXCLUIR' | 'DESBLOQUEAR'
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
            usuario: USUARIO_ATUAL,
            dados_antes: dadosAntes ? _resumir(dadosAntes) : null,
            dados_depois: dadosDepois ? _resumir(dadosDepois) : null,
        });
        if (error) throw error;
        console.log(`📝 Log registrado: ${acao}`);
    } catch (e) {
        // Log de auditoria não deve interromper o fluxo principal
        console.error('❌ Erro ao registrar log:', e);
    }
}

/**
 * Converte uma linha de reservas_log (snake_case, criado_em) para o formato que a
 * timeline sempre usou (camelCase, timestamp) — equivalente ao doc do Firestore.
 */
function _paraLogApp(row) {
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

/** Resume dados da reserva para o log (evita salvar campos desnecessários) */
function _resumir(dados) {
    return {
        id:              dados.id              || '',
        nomes:           dados.nomes           || '',
        apto:            dados.apto            || '',
        codigoReserva:   dados.codigoReserva   || '',
        horario:         dados.horario         || '',
        tipo:            dados.tipo            || '',
        paxs:            dados.paxs            || 0,
        chd:             dados.chd             || 0,
        obs:             dados.obs             || '',
        mesa:            dados.mesa            || '',
        bloqueado:       dados.bloqueado       || false,
        somenteHospedes: dados.somenteHospedes || false,
        canceladoEm:     dados.canceladoEm     || '',
        depositoRetido:  dados.depositoRetido,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO VISUAL
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_ACAO = {
    CRIAR:       { cor: '#27ae60', label: 'CRIADO',       icone: _iconeCheck()   },
    EDITAR:      { cor: '#f39c12', label: 'EDITADO',      icone: _iconeLapis()   },
    EXCLUIR:     { cor: '#e74c3c', label: 'EXCLUÍDO',     icone: _iconeLixeira() },
    DESBLOQUEAR: { cor: '#3498db', label: 'DESBLOQUEADO', icone: _iconeCadeado() },
    CANCELAR:    { cor: '#8e44ad', label: 'CANCELADO',    icone: _iconeLixeira() },
};

const LABELS_CAMPOS = {
    nomes: 'Nome', apto: 'Apto', codigoReserva: 'Reserva', horario: 'Horário', tipo: 'Tipo',
    canceladoEm: 'Cancelado em', depositoRetido: 'Depósito retido',
    paxs: 'Adultos', chd: 'Crianças', obs: 'Obs', mesa: 'Mesa',
    bloqueado: 'Bloqueado', somenteHospedes: 'Só Hósp.',
};

// ─────────────────────────────────────────────────────────────────────────────
// ÍCONES SVG INLINE
// ─────────────────────────────────────────────────────────────────────────────

function _iconeCheck()   { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; }
function _iconeLapis()   { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'; }
function _iconeLixeira() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'; }
function _iconeCadeado() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'; }
function _iconeRelogio() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'; }
function _iconeUsuario() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'; }

// ─────────────────────────────────────────────────────────────────────────────
// CSS DA TIMELINE — injetado uma única vez no <head>
// ─────────────────────────────────────────────────────────────────────────────

function _injetarCSS() {
    if (document.getElementById('log-timeline-css')) return;
    const style = document.createElement('style');
    style.id = 'log-timeline-css';
    style.textContent = [
        '.tl-wrapper{position:relative;padding:4px 0 24px}',
        '.tl-wrapper::before{content:"";position:absolute;left:27px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,rgba(0,0,0,.1) 5%,rgba(0,0,0,.1) 95%,transparent)}',
        'body.dark-mode .tl-wrapper::before{background:linear-gradient(to bottom,transparent,rgba(255,255,255,.1) 5%,rgba(255,255,255,.1) 95%,transparent)}',

        '.tl-hora-sep{display:flex;align-items:center;gap:10px;margin:20px 0 10px;padding-left:56px;position:relative;z-index:1}',
        '.tl-hora-sep::before{content:"";position:absolute;left:22px;top:50%;transform:translateY(-50%);width:10px;height:10px;border-radius:50%;background:var(--fundo,#e8ebef);border:2px solid rgba(0,0,0,.18)}',
        '.tl-hora-sep::after{content:"";flex:1;height:1px;background:rgba(0,0,0,.07)}',
        'body.dark-mode .tl-hora-sep::before{background:#1e1e1e;border-color:rgba(255,255,255,.22)}',
        'body.dark-mode .tl-hora-sep::after{background:rgba(255,255,255,.07)}',
        '.tl-hora-sep span{font-size:.7rem;font-weight:800;letter-spacing:2px;opacity:.4;text-transform:uppercase;white-space:nowrap}',

        '.tl-item{display:flex;align-items:flex-start;gap:13px;margin-bottom:10px;position:relative}',

        '.tl-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.22);color:#fff;margin-top:2px}',

        '.tl-card{flex:1;min-width:0;background:var(--card-bg,#fff);border-radius:10px;border:1px solid rgba(0,0,0,.07);overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07);transition:box-shadow .15s,transform .1s}',
        'body.dark-mode .tl-card{border-color:rgba(255,255,255,.06)}',
        '.tl-card.tl-clicavel{cursor:pointer}',
        '.tl-card.tl-clicavel:hover{box-shadow:0 4px 16px rgba(0,0,0,.14);transform:translateY(-1px)}',
        '.tl-card.tl-clicavel:active{transform:translateY(0)}',

        '.tl-card-topo{height:3px}',
        '.tl-card-corpo{padding:11px 14px 10px}',

        '.tl-card-principal{display:flex;align-items:center;gap:9px;flex-wrap:nowrap}',
        '.tl-badge{font-size:.58rem;font-weight:900;letter-spacing:1.2px;padding:2px 9px;border-radius:20px;color:#fff;white-space:nowrap;flex-shrink:0}',
        '.tl-nome{font-size:.95rem;font-weight:800;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.tl-meta{display:flex;align-items:center;gap:10px;flex-shrink:0;opacity:.45;font-size:.71rem}',
        '.tl-meta-item{display:flex;align-items:center;gap:3px;white-space:nowrap}',

        '.tl-detalhes{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-top:5px;font-size:.76rem;opacity:.6}',
        '.tl-sep{opacity:.3;font-size:.6rem}',

        '.tl-dica{margin-top:6px;font-size:.68rem;opacity:.35;display:flex;align-items:center;gap:4px}',

        '.tl-diff{display:none;border-top:1px solid rgba(0,0,0,.07);padding:14px}',
        'body.dark-mode .tl-diff{border-color:rgba(255,255,255,.07)}',
        '.tl-diff.aberto{display:block}',

        '.tl-diff-cabecalho{font-size:.67rem;font-weight:900;letter-spacing:1.5px;opacity:.4;text-transform:uppercase;margin-bottom:10px}',

        '.tl-diff-tabela{width:100%;border-collapse:collapse;font-size:.8rem}',
        '.tl-diff-tabela th{font-size:.63rem;font-weight:900;letter-spacing:1px;text-transform:uppercase;padding:4px 8px 7px;text-align:left;border-bottom:2px solid rgba(0,0,0,.08);opacity:.5}',
        'body.dark-mode .tl-diff-tabela th{border-color:rgba(255,255,255,.08)}',
        '.tl-diff-tabela td{padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.04);vertical-align:middle}',
        'body.dark-mode .tl-diff-tabela td{border-color:rgba(255,255,255,.04)}',
        '.tl-diff-tabela tr:last-child td{border-bottom:none}',
        '.tl-diff-tabela .col-campo{opacity:.5;font-size:.74rem;width:80px;white-space:nowrap}',
        '.tl-diff-tabela .col-antes{color:#e74c3c;text-decoration:line-through;opacity:.8}',
        '.tl-diff-tabela .col-depois{color:#27ae60;font-weight:700}',
        '.tl-diff-tabela tr.linha-alterada{background:rgba(243,156,18,.06)}',
        '.tl-diff-tabela tr.linha-igual td{opacity:.38}',

        '.tl-btn-fechar{margin-top:12px;background:none;border:1px solid rgba(0,0,0,.13);border-radius:6px;padding:5px 13px;font-size:.72rem;cursor:pointer;opacity:.55;display:inline-flex;align-items:center;gap:5px;transition:opacity .1s}',
        'body.dark-mode .tl-btn-fechar{border-color:rgba(255,255,255,.15);color:inherit}',
        '.tl-btn-fechar:hover{opacity:1}',

        '.tl-vazio{text-align:center;padding:60px 20px;opacity:.38}',
        '.tl-vazio-icone{font-size:2.8rem;margin-bottom:12px}',
        '.tl-vazio-texto{font-size:.9rem;font-weight:600}',

        '@media(max-width:768px){',
        '.tl-wrapper::before{left:21px}',
        '.tl-hora-sep{padding-left:46px}',
        '.tl-hora-sep::before{left:16px}',
        '.tl-icon{width:30px;height:30px}',
        '.tl-icon svg{width:13px;height:13px}',
        '.tl-nome{font-size:.88rem}',
        '.tl-meta{display:none}',
        '.tl-detalhes{font-size:.72rem}',
        '.tl-diff-tabela{font-size:.75rem}',
        '.tl-diff-tabela .col-campo{width:64px}',
        '}',
    ].join('\n');
    document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// CARREGAMENTO
// ─────────────────────────────────────────────────────────────────────────────

export async function carregarLogs() {
    _injetarCSS();

    const container = document.getElementById('listaLogs');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:50px;opacity:.45;"><div style="font-size:1.6rem;margin-bottom:10px;">⏳</div><div style="font-size:.82rem;font-weight:600;letter-spacing:1px;">CARREGANDO...</div></div>';

    const inputData = document.getElementById('dataFiltroLog');
    const data = inputData?.value || new Date().toISOString().split('T')[0];

    try {
        await db.aguardarInicializacao();
        const client = db.getClient();

        const inicioDia = data + 'T00:00:00.000Z';
        const fimDia    = data + 'T23:59:59.999Z';

        const { data: rows, error } = await client.from('reservas_log')
            .select('*')
            .gte('criado_em', inicioDia)
            .lte('criado_em', fimDia)
            .order('criado_em', { ascending: false });
        if (error) throw error;

        const logs = rows.map(r => _paraLogApp(r));

        if (logs.length === 0) {
            container.innerHTML = '<div class="tl-vazio"><div class="tl-vazio-icone">📋</div><div class="tl-vazio-texto">Nenhuma alteração nesta data</div></div>';
            return;
        }

        container.innerHTML = _renderizarTimeline(logs);

    } catch (e) {
        console.error('❌ Erro ao carregar logs:', e);
        notificarErro('Erro ao carregar histórico de alterações.');
        container.innerHTML = '<p style="color:#e74c3c;text-align:center;padding:40px;">Erro ao carregar logs</p>';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERIZAÇÃO DA TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

function _renderizarTimeline(logs) {
    var html = '<div class="tl-wrapper">';
    var horaAtual = null;

    logs.forEach(function(log) {
        var dt = new Date(log.timestamp);
        var horaMin = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (horaMin !== horaAtual) {
            horaAtual = horaMin;
            html += '<div class="tl-hora-sep"><span>' + horaMin + '</span></div>';
        }

        html += _renderizarItem(log);
    });

    html += '</div>';
    return html;
}

function _renderizarItem(log) {
    var cfg     = CONFIG_ACAO[log.acao] || { cor: '#999', label: log.acao, icone: '' };
    var dt      = new Date(log.timestamp);
    var horaSec = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var reserva = log.dadosDepois || log.dadosAntes || {};

    // Título
    var isBloqueio   = reserva.bloqueado || reserva.somenteHospedes;
    var tipoBloqueio = reserva.bloqueado ? 'BLOQUEADO' : reserva.somenteHospedes ? 'SÓ HÓSPEDES' : null;
    var nome = log.acao === 'DESBLOQUEAR'
        ? (reserva.nomes ? reserva.nomes : 'DESBLOQUEADO')
        : (tipoBloqueio || reserva.nomes || '—');

    // Pills de detalhe
    var parts = (isBloqueio || log.acao === 'DESBLOQUEAR')
        ? [reserva.horario, tipoBloqueio].filter(Boolean)
        : [
            reserva.horario,
            reserva.apto                ? 'APT ' + reserva.apto      : '',
            reserva.tipo                ? reserva.tipo.toUpperCase()  : '',
            (reserva.paxs || 0) > 0    ? reserva.paxs + ' ADT'      : '',
            (reserva.chd  || 0) > 0    ? reserva.chd  + ' CHD'      : '',
            reserva.mesa                ? 'MESA ' + reserva.mesa      : '',
          ].filter(Boolean);

    var detalhesHtml = parts.length
        ? '<div class="tl-detalhes">' +
          parts.map(function(p, i) {
              return (i > 0 ? '<span class="tl-sep">●</span>' : '') + '<span>' + p + '</span>';
          }).join('') +
          '</div>'
        : '';

    // Diff
    var temDiff       = log.acao === 'EDITAR' && log.dadosAntes && log.dadosDepois;
    var diffHtml      = temDiff ? _renderizarDiff(log) : '';
    var clicavelClass = temDiff ? 'tl-clicavel' : '';
    var onclickAttr   = temDiff ? 'onclick="expandirLog(\'' + log.id + '\')"' : '';
    var dicaHtml      = temDiff
        ? '<div class="tl-dica">' + _iconeLapis() + ' <span>toque para ver comparação</span></div>'
        : '';

    return (
        '<div class="tl-item">' +
            '<div class="tl-icon" style="background:' + cfg.cor + ';">' + cfg.icone + '</div>' +
            '<div id="log-' + log.id + '" class="tl-card ' + clicavelClass + '" ' + onclickAttr + '>' +
                '<div class="tl-card-topo" style="background:' + cfg.cor + ';"></div>' +
                '<div class="tl-card-corpo">' +
                    '<div class="tl-card-principal">' +
                        '<span class="tl-badge" style="background:' + cfg.cor + ';">' + cfg.label + '</span>' +
                        '<span class="tl-nome">' + nome + '</span>' +
                        '<div class="tl-meta">' +
                            '<span class="tl-meta-item">' + _iconeRelogio() + ' ' + horaSec + '</span>' +
                            '<span class="tl-meta-item">' + _iconeUsuario() + ' ' + (log.usuario || 'sistema') + '</span>' +
                        '</div>' +
                    '</div>' +
                    detalhesHtml +
                    dicaHtml +
                '</div>' +
                diffHtml +
            '</div>' +
        '</div>'
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIFF EXPANDIDO
// ─────────────────────────────────────────────────────────────────────────────

function _renderizarDiff(log) {
    var antes  = log.dadosAntes  || {};
    var depois = log.dadosDepois || {};
    var campos = Object.keys(LABELS_CAMPOS);
    var mudancas = new Set(campos.filter(function(c) { return String(antes[c]) !== String(depois[c]); }));

    // Alterados primeiro, iguais depois
    var ordenados = campos.filter(function(c) { return  mudancas.has(c); })
        .concat(campos.filter(function(c) { return !mudancas.has(c); }));

    var linhas = ordenados.map(function(c) {
        var isAlterado = mudancas.has(c);
        var rowClass   = isAlterado ? 'linha-alterada' : 'linha-igual';
        var vAntes     = String(antes[c]  != null ? antes[c]  : '') || '—';
        var vDepois    = String(depois[c] != null ? depois[c] : '') || '—';
        return (
            '<tr class="' + rowClass + '">' +
                '<td class="col-campo">' + LABELS_CAMPOS[c] + '</td>' +
                '<td class="' + (isAlterado ? 'col-antes' : '') + '">' + vAntes  + '</td>' +
                '<td class="' + (isAlterado ? 'col-depois' : '') + '">' + vDepois + '</td>' +
            '</tr>'
        );
    }).join('');

    var qtd = mudancas.size;
    var subtitulo = qtd === 1 ? '1 campo alterado' : qtd + ' campos alterados';

    return (
        '<div id="diff-' + log.id + '" class="tl-diff">' +
            '<div class="tl-diff-cabecalho">Comparação — ' + subtitulo + '</div>' +
            '<table class="tl-diff-tabela">' +
                '<thead><tr>' +
                    '<th>Campo</th>' +
                    '<th style="color:#e74c3c;">Antes</th>' +
                    '<th style="color:#27ae60;">Depois</th>' +
                '</tr></thead>' +
                '<tbody>' + linhas + '</tbody>' +
            '</table>' +
            '<button class="tl-btn-fechar" onclick="recolherLog(\'' + log.id + '\');event.stopPropagation();">▲ fechar</button>' +
        '</div>'
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

function expandirLog(logId) {
    var diff = document.getElementById('diff-' + logId);
    if (!diff) return;

    var jaAberto = diff.classList.contains('aberto');

    // Fecha qualquer outro diff aberto
    document.querySelectorAll('.tl-diff.aberto').forEach(function(el) { el.classList.remove('aberto'); });

    if (!jaAberto) diff.classList.add('aberto');
}

function recolherLog(logId) {
    var diff = document.getElementById('diff-' + logId);
    if (diff) diff.classList.remove('aberto');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPOR GLOBALMENTE
// ─────────────────────────────────────────────────────────────────────────────

window.carregarLogs = carregarLogs;
window.expandirLog  = expandirLog;
window.recolherLog  = recolherLog;

/**
 * Chamado pelo sino após navegar para a tela de logs.
 * Carrega os logs do dia da reserva, destaca o item e expande o diff.
 * @param {string} reservaId
 */
window.destacarLogPorReservaId = async function(reservaId) {
    if (!reservaId) return;

    _injetarCSS();

    const container = document.getElementById('listaLogs');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:50px;opacity:.45;"><div style="font-size:1.6rem;margin-bottom:10px;">⏳</div><div style="font-size:.82rem;font-weight:600;letter-spacing:1px;">CARREGANDO...</div></div>';

    try {
        await db.aguardarInicializacao();
        const client = db.getClient();

        // Tenta até 5x com intervalo de 800ms — cobre race condition entre
        // notificação (evento de INSERT) e registrarLog (escrita no Supabase)
        let rows = [];
        for (let tentativa = 0; tentativa < 5; tentativa++) {
            const { data, error } = await client.from('reservas_log')
                .select('*')
                .eq('reserva_id', reservaId);
            if (error) throw error;
            rows = data;
            if (rows.length > 0) break;
            await new Promise(r => setTimeout(r, 800));
        }

        if (rows.length === 0) {
            container.innerHTML = '<div class="tl-vazio"><div class="tl-vazio-icone">📋</div><div class="tl-vazio-texto">Nenhum histórico encontrado para esta reserva</div></div>';
            return;
        }

        // Ordena no cliente e pega o mais recente
        const todos = rows.map(r => _paraLogApp(r));
        todos.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const logAlvo = todos[0];

        container.innerHTML = _renderizarTimeline([logAlvo]);

        requestAnimationFrame(() => {
            const cardEl = document.getElementById('log-' + logAlvo.id);
            if (!cardEl) return;
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.style.transition = 'box-shadow 0.3s, outline 0.3s';
            cardEl.style.outline = '3px solid var(--primaria, #d4a373)';
            cardEl.style.boxShadow = '0 0 0 6px rgba(212,163,115,0.2)';
            setTimeout(() => {
                cardEl.style.outline = '';
                cardEl.style.boxShadow = '';
            }, 3000);
            expandirLog(logAlvo.id);
        });

    } catch (e) {
        console.error('❌ Erro ao destacar log:', e);
        container.innerHTML = '<div class="tl-vazio"><div class="tl-vazio-icone">❌</div><div class="tl-vazio-texto">Erro ao carregar histórico</div></div>';
    }
};
