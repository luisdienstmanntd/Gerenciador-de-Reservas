/* =========================================================================================
   OSTERIA DI LUCCA - NAVIGATION.JS v5.3
   RESPONSABILIDADE: Navegação entre telas + controle da sidebar em touch devices

   Comportamento por dispositivo:
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  Desktop (> 768px)  │ Hover CSS expande 52px → 220px. Botão ☰ oculto.  │
   │  Tablet / Mobile    │ Sidebar fora da tela. Botão ☰ abre/fecha via JS. │
   └──────────────────────────────────────────────────────────────────────────┘

   ✅ v5.1: Hook home → carregarHome() + label de data
   ✅ v5.2: Remove código duplicado v4.10
   ✅ v5.3: toggleMenu() funcional — sidebar desliza com overlay escuro no mobile
            Fecha ao navegar / ao clicar overlay / ao redimensionar para desktop
   ✅ v5.4: stopPropagation no overlay da sidebar — impede bubble para o grid ao fechar menu
   ✅ v5.5: Tablet — sidebar ícones visíveis por padrão, expande por cima via JS
            body.sidebar-aberta remove overflow:hidden para não cortar a expansão
   ========================================================================================= */

// ===== ESTADO DA SIDEBAR =====
let _sidebarAberta = false;

// ===== HELPERS =====
function _isMobile() {
    // Mobile landscape E tablet (até 1200px) usam sidebar com toggle JS
    // Desktop (> 1200px) usa hover CSS
    return window.matchMedia('(max-width: 1200px) and (orientation: landscape)').matches
        || window.matchMedia('(min-width: 768px) and (max-width: 1200px)').matches;
}

function _isPortrait() {
    // Portrait mobile usa bottombar — sem sidebar
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
}

function _abrirSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!sidebar) return;
    sidebar.classList.add('sb-aberta');
    document.body.classList.add('sidebar-aberta');
    if (overlay) {
        overlay.style.display = 'block';
        overlay.getBoundingClientRect();
        overlay.classList.add('sb-overlay-ativo');
    }
    _sidebarAberta = true;
}

function _fecharSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!sidebar) return;
    sidebar.classList.remove('sb-aberta');
    document.body.classList.remove('sidebar-aberta');
    if (overlay) {
        overlay.classList.remove('sb-overlay-ativo');
        setTimeout(() => {
            if (!_sidebarAberta) overlay.style.display = 'none';
        }, 280);
    }
    _sidebarAberta = false;
}

// ===== API PÚBLICA =====
function toggleMenu() {
    // Portrait: sem sidebar, bottombar cuida da navegação
    if (_isPortrait()) return;
    // Desktop/tablet: hover CSS cuida de tudo
    if (!_isMobile()) return;
    _sidebarAberta ? _fecharSidebar() : _abrirSidebar();
}

function fecharMenu() {
    if (_sidebarAberta) _fecharSidebar();
}

// ===== NAVEGAÇÃO =====
function navegar(tela) {
    console.log(`📄 Navegando para: ${tela}`);

    // Fecha sidebar ao navegar (mobile)
    if (_sidebarAberta) _fecharSidebar();

    // Oculta todas as telas
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

    // Mostra a tela solicitada
    const alvo = document.getElementById(`tela-${tela}`);
    if (alvo) {
        alvo.classList.remove('hidden');
        console.log(`✅ Tela "${tela}" ativada`);
    } else {
        console.error(`❌ Tela "${tela}" não encontrada!`);
    }

    // ── Sincroniza bottombar ativo ──────────────────────────────────────────
    document.querySelectorAll('#bottom-nav .bn-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tela === tela);
    });

    // ── Hooks por tela ──────────────────────────────────────────────────────
    if (tela === 'home') {
        _atualizarLabelDataHome();
        if (typeof window.carregarHome === 'function') window.carregarHome();
    }

    if (tela === 'dashboard' && typeof window.carregarDadosDashboard === 'function') {
        setTimeout(() => window.carregarDadosDashboard(), 100);
    }

    if (tela === 'roomservice') {
        const dataInput = document.getElementById('dataRoomService');
        if (dataInput && !dataInput.value) {
            dataInput.value = new Date().toISOString().split('T')[0];
        }
        if (typeof window.carregarRoomServices === 'function') window.carregarRoomServices();
    }

    if (tela === 'configuracoes' && typeof window.carregarConfiguracoes === 'function') {
        window.carregarConfiguracoes();
    }
}

// ── Label de data no header da home ────────────────────────────────────────
function _atualizarLabelDataHome() {
    const el = document.getElementById('home-data-label');
    if (!el) return;
    const opcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    el.textContent = new Date().toLocaleDateString('pt-BR', opcoes);
}

// ===== EXPOSIÇÃO GLOBAL =====
window.navegar    = navegar;
window.toggleMenu = toggleMenu;
window.fecharMenu = fecharMenu;

// ===== INICIALIZAÇÃO =====
function inicializarNavegacao() {
    console.log('🚀 NAVIGATION.JS v5.3');

    // Remove estilo inline residual de versões antigas
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.removeAttribute('style');
        sidebar.classList.remove('active', 'sb-aberta');
        sidebar.setAttribute('data-menu-aberto', 'false');
    }

    // Overlay: garante estado inicial e registra listener de fechamento
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('sb-overlay-ativo');
        // Clona para limpar listeners antigos
        const novoOverlay = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(novoOverlay, overlay);
        novoOverlay.addEventListener('click', (e) => { e.stopPropagation(); _fecharSidebar(); });
    }

    // Botão ☰ (#sb-btn-toggle) dentro da sidebar
    const btnToggle = document.getElementById('sb-btn-toggle');
    if (btnToggle) {
        const novo = btnToggle.cloneNode(true);
        btnToggle.parentNode.replaceChild(novo, btnToggle);
        novo.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
            novo.blur();
        });
    }

    // Fecha ao sair do landscape mobile (rotacionar ou redimensionar para desktop)
    window.addEventListener('resize', () => {
        if (!_isMobile() && _sidebarAberta) _fecharSidebar();
    });

    // Carrega a home (tela padrão)
    _atualizarLabelDataHome();
    if (typeof window.carregarHome === 'function') {
        window.carregarHome();
    } else {
        setTimeout(() => {
            if (typeof window.carregarHome === 'function') window.carregarHome();
        }, 300);
    }

    console.log('✅ NAVIGATION.JS v5.3 PRONTO');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarNavegacao);
} else {
    inicializarNavegacao();
}
