/* =========================================================================================
   OSTERIA DI LUCCA - RESERVAS/LISTENER.JS v4.0
   RESPONSABILIDADE: Escuta em Tempo Real do Firebase
   ✅ v3.1: Usa DatabaseService + notificacao.js
   ✅ v4.0: Etapa 5 — escuta config_dia em tempo real; linhasExtras vêm do Firestore
   ✅ v4.1: Usa getHorariosPadrao() de state.js — elimina array hardcoded (Manutenção #6)
   ✅ v4.2: pararEscutaNotificacoes()/recarregarNotificacoes() — sino reconecta em
            onAuthStateChanged, corrige dívida técnica #2 (mesma corrida do bug #37)
   ========================================================================================= */

import {
    getDataAtual,
    setTodasReservas,
    getTodasReservas,
    getUnsubscribe,
    setUnsubscribe,
    getUnsubscribeConfig,
    setUnsubscribeConfig,
    getLinhasExtras,
    setLinhasExtras,
    getHorariosPadrao,
} from '../../core/state.js';
import { renderizarGrid, atualizarMiniCards } from '../../ui/render.js';
import { db } from '../../core/database.js';
import { notificarErro } from '../../core/notificacao.js';

// Usuário logado — fonte única para controle de leitura
const USUARIO_ATUAL = localStorage.getItem('usuario_nome') || 'sistema';

// Unsubscribe do listener de notificações
let _unsubscribeNotificacoes = null;

// ─────────────────────────────────────────────────────────────────────────────
// Flag de sincronização entre os dois listeners
//
// Problema: dois listeners independentes chegam em ordem não determinística.
// Se reservas chegar antes de config_dia, a grade seria renderizada com
// linhasExtras = {} (vazio) e depois re-renderizada com os valores corretos,
// causando um flash visual perceptível.
//
// Solução: ambos os listeners marcam seu próprio flag quando recebem o
// primeiro dado. A grade só é renderizada quando os DOIS estiverem prontos.
// Nas atualizações subsequentes (flags já true), renderiza imediatamente.
// ─────────────────────────────────────────────────────────────────────────────
let reservasCarregadas = false;
let configCarregada = false;

/**
 * Reinicia os flags de sincronização.
 * Chamado sempre que escutarReservas() é invocado (troca de data, reload).
 */
function resetarFlags() {
    reservasCarregadas = false;
    configCarregada = false;
}

/**
 * Tenta renderizar a grade.
 * Só executa se ambos os listeners já tiverem entregue sua primeira carga.
 * Nas chamadas subsequentes (flags já true na próxima atualização), renderiza
 * diretamente porque resetarFlags() só é chamado no início de escutarReservas().
 */
function tentarRenderizar() {
    if (!reservasCarregadas || !configCarregada) {
        console.log(`⏳ Aguardando sincronização — reservas:${reservasCarregadas} config:${configCarregada}`);
        return;
    }
    const reservas = getTodasReservas();
    renderizarGrid(reservas);

    if (typeof window.processarDashboard === 'function') {
        const telaDashboard = document.getElementById('tela-dashboard');
        if (telaDashboard && !telaDashboard.classList.contains('hidden')) {
            window.processarDashboard(reservas, 1);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTENER DE CONFIG_DIA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicia escuta em tempo real do documento config_dia/{data}.
 * Quando recebe dados, atualiza linhasExtras em memória e tenta renderizar.
 *
 * Regra de merge com reservas existentes:
 * - O Firestore é a fonte da verdade para linhasExtras.
 * - Se um horário tem reservas em posições que não caberiam no valor salvo,
 *   o valor é expandido automaticamente (nunca deixa reserva fora da grade).
 * - O valor do Firestore é respeitado mesmo quando negativo (< 3 linhas base).
 *
 * @param {string} dataFiltro
 */
function iniciarListenerConfig(dataFiltro) {
    // Cancela listener anterior se existir
    const unsubAnterior = getUnsubscribeConfig();
    if (unsubAnterior) {
        unsubAnterior();
        console.log('ℹ️ Listener config_dia anterior cancelado');
    }

    const unsub = db.escutarConfigDia(dataFiltro, (linhasExtrasFirestore) => {
        console.log('📡 config_dia recebido, aplicando linhasExtras...');

        // Pega reservas já em memória para garantir que nenhuma fique fora da grade
        const reservas = getTodasReservas();
        const horariosPadrao = getHorariosPadrao();

        // Começa com os valores que vieram do Firestore (pode ser {} no primeiro uso)
        const linhasExtrasAtualizadas = { ...linhasExtrasFirestore };

        // Para cada horário padrão, garante que o valor é suficiente para exibir
        // todas as reservas existentes — nunca reduz abaixo do necessário
        horariosPadrao.forEach(hr => {
            const resDoHr = reservas.filter(
                r => r.originalBase === hr || (!r.originalBase && r.horario === hr)
            );
            const maiorPos = resDoHr.length > 0
                ? resDoHr.reduce((max, r) => Math.max(max, r.posicao || 0), 0)
                : -1;
            // Mínimo de extras necessário para que a posição maiorPos caiba nas 3 linhas base
            const minimoNecessario = Math.max(0, maiorPos + 1 - 3);

            const valorAtual = linhasExtrasAtualizadas[hr] !== undefined
                ? linhasExtrasAtualizadas[hr]
                : 0;

            if (minimoNecessario > 0 && minimoNecessario > valorAtual) {
                // Só expande — nunca reduz além do que as reservas exigem
                linhasExtrasAtualizadas[hr] = minimoNecessario;
                console.log(`🔧 config_dia: ${hr} expandido para ${minimoNecessario} (reserva na pos ${maiorPos})`);
            } else if (linhasExtrasAtualizadas[hr] === undefined) {
                linhasExtrasAtualizadas[hr] = 0;
            }
        });

        setLinhasExtras(linhasExtrasAtualizadas);
        console.log('🔧 linhasExtras aplicado do Firestore:', JSON.stringify(linhasExtrasAtualizadas));

        configCarregada = true;
        tentarRenderizar();
    });

    setUnsubscribeConfig(unsub);
    console.log('✅ Listener config_dia configurado');
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTENER DE RESERVAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicia escuta de reservas no Firebase.
 * Também inicia (ou reinicia) o listener de config_dia para a mesma data.
 *
 * @param {string} data - Data para filtrar (opcional, usa data atual se não fornecida)
 */
export async function escutarReservas(data = null) {
    console.log('🔄 Iniciando escuta de reservas...');

    try {
        await db.aguardarInicializacao();
        console.log('✅ DatabaseService inicializado');
    } catch (error) {
        console.error('❌ Erro ao inicializar DatabaseService:', error);
        notificarErro('Erro ao conectar com o banco de dados. Recarregue a página.', 0);
        return;
    }

    // Reinicia flags — nova data, nova sincronização
    resetarFlags();

    // Cancela listener de reservas anterior
    const unsubscribeAnterior = getUnsubscribe();
    if (unsubscribeAnterior) {
        unsubscribeAnterior();
        console.log('ℹ️ Listener reservas anterior cancelado');
    }

    const dataFiltro = data || getDataAtual();
    console.log(`📅 Buscando reservas para: ${dataFiltro}`);

    // Inicia listener de config_dia para a mesma data
    iniciarListenerConfig(dataFiltro);

    try {
        const unsubscribe = db.escutarReservasPorDataComMudancas(
            dataFiltro,
            // ── callback de reservas (igual ao anterior) ──
            (reservas) => {
                console.log(`📥 ${reservas.length} reservas recebidas do Firebase`);
                setTodasReservas(reservas);
                reservasCarregadas = true;
                tentarRenderizar();
            },
            // ── callback de mudanças — só nova reserva (added) ──
            (mudancas) => {
                mudancas.forEach(async m => {
                    if (m.type !== 'added') return;
                    const r = m.depois;
                    if (!r || !r.nomes || r.bloqueado || r.somenteHospedes) return;
                    const tipo = { hospede: 'Hóspede', externo: 'Externo', passante: 'Passante', roomservice: 'Room Service' }[r.tipo] || r.tipo || '';
                    try {
                        await db.salvarNotificacao({
                            texto: `${r.horario}  ·  ${tipo}  ·  ${r.nomes}`,
                            reservaId: r.id || '',
                        });
                    } catch (e) {
                        console.error('❌ Erro ao salvar notificação:', e);
                    }
                });
            }
        );

        setUnsubscribe(unsubscribe);
        console.log('✅ Listener reservas configurado via DatabaseService');

    } catch (error) {
        console.error('❌ Erro ao configurar listener de reservas:', error);
        notificarErro('Erro ao escutar reservas do banco de dados.');
    }
}

/**
 * Para de escutar reservas E config_dia.
 */
export function pararEscuta() {
    const unsubReservas = getUnsubscribe();
    if (unsubReservas) {
        unsubReservas();
        setUnsubscribe(null);
        console.log('ℹ️ Escuta de reservas parada');
    }

    const unsubConfig = getUnsubscribeConfig();
    if (unsubConfig) {
        unsubConfig();
        setUnsubscribeConfig(null);
        console.log('ℹ️ Escuta de config_dia parada');
    }
}

/**
 * Recarrega reservas (e config_dia) para uma data.
 * @param {string} data - Data para filtrar (opcional)
 */
export async function recarregarReservas(data = null) {
    console.log('🔄 Recarregando reservas...');
    pararEscuta();
    await escutarReservas(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESYNC AO VOLTAR PRA ABA
//
// Navegadores reduzem a prioridade de processamento/pintura de abas em segundo
// plano — o Realtime pode "perder" eventos ou a tela simplesmente não repintar
// até a aba voltar a ficar ativa. Recarrega a grade sempre que isso acontece,
// pra nunca depender só do usuário perceber e atualizar manualmente.
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('👁️ Aba voltou a ficar visível — recarregando reservas');
        recarregarReservas();
    }
});

/**
 * Inicia escuta em tempo real das notificações pendentes para o usuário atual.
 * Chamado no boot (init.js) e novamente por recarregarNotificacoes() sempre que
 * o Firebase Auth confirma um usuário real (ver dívida técnica #2 — corrigida).
 */
export function iniciarEscutaNotificacoes() {
    if (_unsubscribeNotificacoes) return; // já está escutando

    db.aguardarInicializacao().then(() => {
        _unsubscribeNotificacoes = db.escutarNotificacoesNaoLidas(USUARIO_ATUAL, (pendentes) => {
            if (pendentes.length > 0) {
                _acionarSino(pendentes);
            } else {
                _pararSino();
            }
        });
        console.log('✅ Escuta de notificações iniciada para:', USUARIO_ATUAL);
    });
}

/**
 * Para a escuta de notificações e libera o guard de iniciarEscutaNotificacoes(),
 * permitindo uma nova tentativa de conexão.
 */
export function pararEscutaNotificacoes() {
    if (_unsubscribeNotificacoes) {
        _unsubscribeNotificacoes();
        _unsubscribeNotificacoes = null;
        console.log('ℹ️ Escuta de notificações parada');
    }
}

/**
 * Reconecta a escuta de notificações — mesmo padrão de recarregarReservas().
 *
 * Corrige a dívida técnica #2: iniciarEscutaNotificacoes() era chamada uma
 * única vez no boot, antes de qualquer autenticação resolver. Se essa 1ª
 * tentativa caísse em permission-denied, o onSnapshot do sino morria e o
 * guard `if (_unsubscribeNotificacoes) return` impedia qualquer nova tentativa
 * — o sino ficava mudo pelo resto da sessão, mesmo após um login bem-sucedido.
 *
 * Chamada por index.html dentro de onAuthStateChanged, junto com
 * recarregarReservas() e carregarHome(), sempre que há um usuário confirmado.
 */
export function recarregarNotificacoes() {
    pararEscutaNotificacoes();
    iniciarEscutaNotificacoes();
}

// ─────────────────────────────────────────────────────────────────────────────
// SINO DE NOTIFICAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

let _notificacoesPendentes = [];

/**
 * Recebe lista atualizada de notificações pendentes do Firestore.
 * Se houver pendentes, sino pisca. Se vazio, para.
 */
function _acionarSino(pendentes) {
    _notificacoesPendentes = pendentes;
    const wrap  = document.getElementById('sino-notificacao');
    const badge = document.getElementById('sino-badge');
    if (!wrap) return;
    wrap.classList.add('sino-animando');
    if (badge) badge.classList.remove('hidden');
    wrap.onclick = () => _abrirPainelSino();
}

/**
 * Abre painel com as novas reservas pendentes.
 * Clicar num item ou em "OK" marca como lido para este usuário.
 */
function _abrirPainelSino() {
    _pararSino();
    document.getElementById('sino-painel')?.remove();

    const painel = document.createElement('div');
    painel.id = 'sino-painel';
    painel.style.cssText = `
        position: fixed; top: 56px; right: 12px; z-index: 99998;
        background: var(--card-bg, #fff); border: 1px solid var(--border, #ddd);
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        min-width: 260px; max-width: 340px; font-size: 0.85rem; color: var(--texto, #333);
    `;

    // Cabeçalho
    const cab = document.createElement('div');
    cab.style.cssText = 'padding: 10px 14px; font-weight: 700; font-size: 0.75rem; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border, #eee);';
    cab.textContent = `🔔 Nova${_notificacoesPendentes.length > 1 ? 's reservas' : ' reserva'}`;
    painel.appendChild(cab);

    // Itens
    _notificacoesPendentes.forEach(ev => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 10px 14px; border-bottom: 1px solid var(--border, #f0f0f0); line-height: 1.4;';
        item.textContent = ev.texto;
        painel.appendChild(item);
    });

    // Botão OK — marca todas como lidas
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.cssText = `
        display: block; width: calc(100% - 28px); margin: 10px 14px;
        padding: 7px; border: none; border-radius: 6px;
        background: var(--primaria, #d4a373); color: #fff;
        font-weight: 700; font-size: 0.82rem; cursor: pointer;
    `;
    btn.onclick = async () => {
        for (const ev of _notificacoesPendentes) {
            try { await db.marcarNotificacaoLida(ev.id, USUARIO_ATUAL); } catch(e) {}
        }
        painel.remove();
    };
    painel.appendChild(btn);

    document.body.appendChild(painel);

    // Fecha ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', function fecharFora(e) {
            if (!painel.contains(e.target) && e.target.id !== 'sino-notificacao') {
                painel.remove();
                document.removeEventListener('click', fecharFora);
            }
        });
    }, 100);
}

function _pararSino() {
    const wrap  = document.getElementById('sino-notificacao');
    const badge = document.getElementById('sino-badge');
    if (wrap)  wrap.classList.remove('sino-animando');
    if (badge) badge.classList.add('hidden');
}
