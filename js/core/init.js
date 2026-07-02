/* =========================================================================================
   OSTERIA DI LUCCA - CORE/INIT.JS v2.1
   ✅ v1.6: Padroniza error handling — usa notificacao.js
   ✅ v1.7: Listener de editar reserva usa dataset.id — elimina duplo disparo
            (onclick inline no render.js + bubbling para init.js causavam dois disparos)
   ✅ v1.8: Substitui confirm() por modal de confirmação não-bloqueante — cumpre regra 5
            (nunca usar alert/confirm — notificacao.js é o canal oficial de feedback)
            Handlers de .linha-horario e .celula-mesa migrados para data-* + event delegation
   ✅ v1.9: Limpeza automática de config_dia antigos — chama db.limparConfigDiasAntigos()
            uma vez por sessão, em background, após o sistema inicializar.
   ✅ v2.0: Expõe window.modalConfirmar — permite que modal.js v3.2 (e qualquer outro módulo)
            use o modal de confirmação não-bloqueante sem dependência circular.
   ✅ v2.1: Limpeza proativa de docs fantasmas — chama limparFantasmasDoDia() em background
            após o boot, para o dia atual. Elimina o 🔴 bug aberto de fantasmas pré-v3.0.
   ========================================================================================= */

import { setDataAtual, getDataAtual, removerLinhaExtra, getTodasReservas } from './state.js';
import { escutarReservas, iniciarEscutaNotificacoes } from '../features/reservas/listener.js';
import { ReservaModal } from '../features/reservas/modal.js';
import { MesaModal } from '../features/mesas/modal.js';
import { salvarReserva, excluirReserva, desbloquearReserva, salvarApenasHorario, atualizarBloqueio, adicionarObservacao, limparFantasmasDoDia } from '../features/reservas/service.js';
import { atualizarTimers } from '../ui/timers.js';
import { renderizarGrid } from '../ui/render.js';
import { db } from './database.js';
import { notificarErrosValidacao, notificarErro } from './notificacao.js';
import { destacarCamposInvalidos } from '../features/reservas/validators.js';

// Instâncias globais dos modais
let reservaModal = null;
let mesaModal = null;

/**
 * Função principal de inicialização
 */
async function inicializar() {
    console.log('═══════════════════════════════════════');
    console.log('🚀 INICIALIZANDO OSTERIA DI LUCCA v7.1');
    console.log('═══════════════════════════════════════');
    
    // 1. Aguarda Firebase estar pronto
    await aguardarFirebase();
    
    // 2. Configura data inicial
    configurarDataInicial();
    
    // 3. Inicializa modais
    inicializarModais();
    
    // 4. Configura event listeners
    configurarEventListeners();
    
    // 5. Inicia escuta do Firebase
    escutarReservas();
    iniciarEscutaNotificacoes();
    
    // 6. Inicia sistema de timers
    iniciarTimers();
    
    // 7. Configura tema
    configurarTema();
    
    // 8. Expõe funções necessárias globalmente
    exponerFuncoesGlobais();
    
    console.log('═══════════════════════════════════════');
    console.log('✅ SISTEMA INICIALIZADO COM SUCESSO!');
    console.log('═══════════════════════════════════════');

    // 9. Limpeza de config_dia antigos — roda em background, sem bloquear a UI
    // ✅ v1.9: Uma vez por sessão, após o sistema estar 100% pronto.
    //          Falha silenciosa — nunca interrompe o fluxo principal.
    limparConfigDiasAntigosBackground();

    // 10. Limpeza proativa de docs fantasmas do dia atual — roda em background
    // ✅ v2.1: Resolve o 🔴 bug de fantasmas pré-v3.0 que removerLinhaDoBloco() não alcançava.
    //          Aguarda um tick para não competir com o onSnapshot inicial da grade.
    setTimeout(() => limparFantasmasDoDiaBackground(), 2000);
}

/**
 * Aguarda Firebase estar disponível
 */
function aguardarFirebase() {
    console.log('✅ Aguardando Firebase via DatabaseService...');
    return db.aguardarInicializacao();
}

/**
 * Configura data inicial no input
 */
function configurarDataInicial() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataLocal = `${ano}-${mes}-${dia}`;
    
    const inputData = document.getElementById('dataFiltro');
    
    if (inputData) {
        if (!inputData.value) {
            inputData.value = dataLocal;
        }
        setDataAtual(inputData.value);
        
        inputData.addEventListener('change', (e) => {
            setDataAtual(e.target.value);
            escutarReservas(e.target.value);
        });
        
        console.log(`📅 Data configurada: ${inputData.value}`);
    }
}

/**
 * Inicializa instâncias dos modais
 */
function inicializarModais() {
    reservaModal = new ReservaModal();
    mesaModal = new MesaModal();
    
    mesaModal.gerarBotoesMesas();
    
    console.log('📋 Modais inicializados');
}

/**
 * Configura todos os event listeners
 */
function configurarEventListeners() {
    const gridReservas = document.getElementById('gridReservas');
    if (gridReservas) {
        gridReservas.addEventListener('click', (e) => {
            // 1. Menu de horário
            // ✅ v1.8: lê data-hrbase — onclick inline removido em render.js v5.7
            const celulaHorario = e.target.closest('.linha-horario');
            if (celulaHorario) {
                const hrbase = celulaHorario.dataset.hrbase;
                if (hrbase) {
                    window.abrirMenuHorario(hrbase);
                    e.preventDefault();
                    return;
                }
            }
            
            // 2. Células vazias
            const celulaVazia = e.target.closest('.reserva-vazia');
            if (celulaVazia) {
                const horario = celulaVazia.dataset.horario;
const posicao = celulaVazia.dataset.posicao;
const hrBase  = celulaVazia.dataset.hrbase;
if (horario) reservaModal.abrirNova(horario, parseInt(posicao), hrBase);
                e.preventDefault();
                return;
            }
            
            // 3. Editar reserva
            const celulaReserva = e.target.closest('.reserva-clicavel:not(.reserva-vazia)');
            if (celulaReserva) {
                const id = celulaReserva.dataset.id;
                if (id) reservaModal.abrirEditar(id);
                e.preventDefault();
                return;
            }
            
            // 4. Atribuir mesa
            // ✅ v1.8: lê .celula-mesa + data-id-mesa — onclick inline removido em render.js v5.7
            const celulaMesa = e.target.closest('.celula-mesa');
            if (celulaMesa) {
                const id = celulaMesa.dataset.idMesa;
                if (id) mesaModal.abrir(id);
                e.preventDefault();
            }
        });
    }
    
    const btnSalvar = document.getElementById('btnSalvar');
    const btnExcluir = document.getElementById('btnExcluir');
    const btnCancelarReserva = document.querySelector('#modalReserva .cancel-btn');
    
    if (btnSalvar) {
        btnSalvar.addEventListener('click', async () => {
            const dados = reservaModal.obterDados();
            const checkAlterarHorario = document.getElementById('checkAlterarHorario');

            // 1. DESBLOQUEAR
            if (btnSalvar.innerText === 'DESBLOQUEAR') {
                await desbloquearReserva(dados.id);
                reservaModal.fechar();
                return;
            }

            // 2. Salvar bloqueio existente (atualiza tipo + obs)
            if (btnSalvar.innerText === 'SALVAR' && dados.id && (dados.bloqueado || dados.somenteHospedes)) {
                await atualizarBloqueio(dados.id, dados);
                reservaModal.fechar();
                return;
            }

            // 3. Alterar horário
            if (checkAlterarHorario && checkAlterarHorario.checked) {
                const displayHoras   = document.getElementById('displayHoras');
                const displayMinutos = document.getElementById('displayMinutos');
                if (displayHoras && displayMinutos) {
                    const horarioDoRelogio = `${displayHoras.innerText}:${displayMinutos.innerText}`;
                    const inputHorario = document.getElementById('horario');
                    if (inputHorario) inputHorario.value = horarioDoRelogio;
                    dados.horario = horarioDoRelogio;
                }

                const originalBaseAntes = dados.originalBase;
                const tinhaId = !!dados.id;
                await salvarApenasHorario(dados);
                if (!tinhaId && originalBaseAntes) {
                    removerLinhaExtra(originalBaseAntes);
                    renderizarGrid(getTodasReservas());
                }
                reservaModal.fechar();
                return;
            }

            // 4. Adicionar observação
            if (btnSalvar.innerText === 'ADICIONAR OBS') {
                if (dados.obs) {
                    await adicionarObservacao(dados.id, dados.obs);
                }
                reservaModal.fechar();
                return;
            }

            // 5. Salvar reserva normal
            const validacao = reservaModal.validar();
            if (!validacao.valido) {
                notificarErrosValidacao(validacao.erros);
                destacarCamposInvalidos(dados);
                return;
            }
            await salvarReserva(dados);
            reservaModal.fechar();
        });
    }
    
    if (btnExcluir) {
        btnExcluir.addEventListener('click', () => {
            const dados = reservaModal.obterDados();
            // ✅ v1.8: modalConfirmar() substitui confirm() nativo (regra 5 — nunca usar confirm)
            modalConfirmar('Deseja realmente excluir esta reserva?', async () => {
                try {
                    await excluirReserva(dados.id);
                    reservaModal.fechar();
                } catch (e) {
                    console.error('❌ Erro ao excluir reserva:', e);
                    notificarErro('Erro ao excluir reserva. Tente novamente.');
                }
            });
        });
    }
    
    if (btnCancelarReserva) {
        btnCancelarReserva.addEventListener('click', () => {
            reservaModal.fechar();
        });
    }
    
    const btnIniciar = document.getElementById('btnIniciarAtendimento');
    const btnTrocar = document.getElementById('btnTrocarMesa');
    const btnCancelarMesa = document.getElementById('btnCancelarMesa');
    const btnLiberar = document.getElementById('btnLiberarMesa');
    
    if (btnIniciar) btnIniciar.addEventListener('click', () => mesaModal.iniciarAtendimento());
    if (btnTrocar) btnTrocar.addEventListener('click', () => mesaModal.trocarMesa());
    if (btnCancelarMesa) btnCancelarMesa.addEventListener('click', () => mesaModal.cancelarMesa());
    if (btnLiberar) btnLiberar.addEventListener('click', () => mesaModal.liberarMesa());
    
    console.log('🎛️ Event listeners configurados');
}

/**
 * Inicia sistema de timers
 */
function iniciarTimers() {
    if (typeof atualizarTimers === 'function') {
        atualizarTimers();
        setInterval(() => atualizarTimers(), 1000);
        console.log('⏱️ Sistema de timers iniciado');
    }
}

/**
 * Configura tema inicial
 */
function configurarTema() {
    const tema = localStorage.getItem('tema');
    const switchBtn = document.getElementById('theme-switch');
    
    if (tema === 'dark') {
        document.body.classList.add('dark-theme');
        if (switchBtn) switchBtn.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        if (switchBtn) switchBtn.checked = false;
    }
    
    console.log(`🎨 Tema inicial: ${tema || 'light'}`);
}

/**
 * Chama db.limparConfigDiasAntigos() em background — falha silenciosa.
 *
 * Motivação (v1.9):
 *   config_dia acumula um documento por dia de operação sem expiração automática.
 *   Sem limpeza, a coleção cresce indefinidamente (1 doc/dia = ~365 docs/ano).
 *   Rodando client-side uma vez por sessão, o custo é mínimo e não precisa de
 *   Cloud Function (plano Blaze / pago).
 *
 * Regra de retenção: 90 dias (3 meses).
 *   Alinhado com a janela máxima de análise do Dashboard. Ajuste aqui se necessário.
 */
async function limparConfigDiasAntigosBackground() {
    try {
        await db.limparConfigDiasAntigos(90);
    } catch (e) {
        // Não propaga — limpeza de manutenção nunca deve derrubar o sistema
        console.error('⚠️ Limpeza de config_dia falhou silenciosamente:', e.message);
    }
}

/**
 * Chama limparFantasmasDoDia() para o dia atual — falha silenciosa. (v2.1)
 *
 * Motivação:
 *   Docs vazios fantasmas gerados por sessões anteriores ao v3.0 podiam permanecer
 *   no Firestore indefinidamente, causando comportamentos visuais inesperados na grade
 *   (slots duplicados, "todas as linhas têm reserva" falso, etc.).
 *   removerLinhaDoBloco() faz limpeza reativa por bloco, mas nunca varreia o dia inteiro.
 *   Esta função resolve isso proativamente, uma vez por sessão, 2 segundos após o boot
 *   (aguarda o onSnapshot inicial da grade para não competir com ele).
 */
async function limparFantasmasDoDiaBackground() {
    try {
        const data = getDataAtual();
        const removidos = await limparFantasmasDoDia(data);
        if (removidos > 0) {
            console.log(`✅ Boot: ${removidos} fantasma(s) removido(s) do dia ${data}`);
        }
    } catch (e) {
        // Não propaga — limpeza proativa nunca deve derrubar o sistema
        console.error('⚠️ Limpeza de fantasmas falhou silenciosamente:', e.message);
    }
}

/**
 * Modal de confirmação não-bloqueante — substitui confirm() nativo (v1.8).
 * @param {string}   mensagem  - Texto exibido no modal
 * @param {Function} onConfirm - Callback chamado somente se o usuário confirmar
 */
function modalConfirmar(mensagem, onConfirm) {
    const anterior = document.getElementById('modalConfirmacao');
    if (anterior) anterior.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modalConfirmacao';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
    `;

    const isDark = document.body.classList.contains('dark-theme');
    const bgCard  = isDark ? '#2d2d2d' : '#fff';
    const txtPrin = isDark ? '#e0e0e0' : '#1a1a1a';

    overlay.innerHTML = `
        <div style="
            background:${bgCard}; color:${txtPrin};
            border-radius:12px; padding:28px 28px 20px;
            width:min(320px,90vw); box-shadow:0 8px 32px rgba(0,0,0,0.25);
            font-family: inherit; text-align:center;
        ">
            <p style="font-size:1rem; font-weight:600; margin:0 0 22px; line-height:1.4;">
                ${mensagem}
            </p>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button id="_btnConfNao" style="
                    flex:1; padding:12px; border:1px solid #ccc; border-radius:8px;
                    background:transparent; color:${txtPrin}; font-size:0.9rem;
                    font-weight:700; cursor:pointer; letter-spacing:.5px;
                ">NÃO</button>
                <button id="_btnConfSim" style="
                    flex:1; padding:12px; border:none; border-radius:8px;
                    background:#e74c3c; color:#fff; font-size:0.9rem;
                    font-weight:700; cursor:pointer; letter-spacing:.5px;
                ">SIM</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.querySelector('#_btnConfNao').addEventListener('click', fechar);
    overlay.querySelector('#_btnConfSim').addEventListener('click', () => { fechar(); onConfirm(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    const onKey = (e) => { if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}

/**
 * Expõe funções globais
 */
function exponerFuncoesGlobais() {
    window.abrirModal = (hr, pos, base) => reservaModal.abrirNova(hr, pos, base);
    window.abrirEditar = (id) => reservaModal.abrirEditar(id);
    window.atribuirMesa = (id) => mesaModal.abrir(id);
    window.toggleCampos = () => {
        if (reservaModal) reservaModal._toggleCampos();
    };
    window.fecharModalMesa = () => mesaModal.fechar();
    // ✅ v2.0: Expõe modalConfirmar globalmente — modal.js v3.2 usa window.modalConfirmar()
    // para substituir confirm() nativo sem criar dependência circular (init.js importa modal.js)
    window.modalConfirmar = modalConfirmar;
    
    console.log('🌍 Funções globais expostas');
}

// Auto-inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
