/* =========================================================================================
   OSTERIA DI LUCCA - CORE/NOTIFICACAO.JS v1.0
   RESPONSABILIDADE: Sistema centralizado de feedback ao usuário
   Substitui alert() bloqueante por toasts não-bloqueantes
   ========================================================================================= */

const DURACAO_PADRAO = {
    sucesso: 3000,
    aviso:   4000,
    erro:    6000,
};

const ICONES = {
    sucesso: '✅',
    aviso:   '⚠️',
    erro:    '❌',
};

const CORES = {
    sucesso: '#27ae60',
    aviso:   '#f39c12',
    erro:    '#e74c3c',
};

/**
 * Garante que o container de toasts existe no DOM
 * @returns {HTMLElement}
 */
function obterContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 360px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Exibe uma notificação toast
 * @param {'sucesso'|'aviso'|'erro'} tipo
 * @param {string} mensagem
 * @param {number} [duracao] - ms até fechar (0 = manual)
 */
export function notificar(tipo, mensagem, duracao) {
    const container = obterContainer();
    const ms = duracao !== undefined ? duracao : DURACAO_PADRAO[tipo] ?? 4000;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: #fff;
        color: #333;
        border-left: 4px solid ${CORES[tipo]};
        border-radius: 6px;
        padding: 12px 16px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        font-size: 0.88rem;
        line-height: 1.4;
        pointer-events: auto;
        cursor: pointer;
        opacity: 0;
        transform: translateX(20px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        word-break: break-word;
    `;

    // Dark mode
    if (document.body.classList.contains('dark-theme')) {
        toast.style.background = '#2d2d2d';
        toast.style.color = '#e0e0e0';
    }

    toast.innerHTML = `
        <span style="font-weight:700;color:${CORES[tipo]};">${ICONES[tipo]} ${tipo.toUpperCase()}</span>
        <div style="margin-top:4px;">${mensagem}</div>
    `;

    // Fecha ao clicar
    toast.addEventListener('click', () => fecharToast(toast));

    container.appendChild(toast);

    // Anima entrada
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });
    });

    // Auto-fechar
    if (ms > 0) {
        setTimeout(() => fecharToast(toast), ms);
    }

    return toast;
}

function fecharToast(toast) {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 200);
}

/**
 * Atalhos tipados
 */
export const notificarSucesso = (msg, duracao) => notificar('sucesso', msg, duracao);
export const notificarAviso   = (msg, duracao) => notificar('aviso',   msg, duracao);
export const notificarErro    = (msg, duracao) => notificar('erro',    msg, duracao);

/**
 * Exibe lista de erros de validação (substitui alert com lista)
 * @param {string[]} erros
 */
export function notificarErrosValidacao(erros) {
    const lista = erros.map(e => `• ${e}`).join('<br>');
    notificar('aviso', lista, 0); // duracao 0 = só fecha ao clicar
}

// Expõe globalmente para uso em onclick inline se necessário
window.notificar = notificar;

console.log('✅ core/notificacao.js v1.0 carregado');