/* Inicialização leve da casca da aplicação. */

function marcarNavegacaoAtiva(elemento) {
    document.querySelectorAll('.nav-item').forEach(botao => botao.classList.remove('active'));
    elemento?.classList.add('active');
}

function inicializarIdentidadeSidebar() {
    const nome = localStorage.getItem('usuario_nome') || '—';
    const nomeEl = document.getElementById('nomeUsuarioSidebar');
    const home = document.querySelector('.nav-item[data-tela="home"]');
    if (nomeEl) nomeEl.textContent = nome;
    marcarNavegacaoAtiva(home);
}

function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log('✅ Service Worker registrado'))
        .catch(error => console.warn('⚠️ Falha ao registrar Service Worker:', error.message));
}

window._sbAtivo = marcarNavegacaoAtiva;

function inicializarCasca() {
    inicializarIdentidadeSidebar();
    registrarServiceWorker();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarCasca, { once: true });
} else {
    inicializarCasca();
}
