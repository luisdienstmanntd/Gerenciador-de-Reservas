/* =========================================================================================
   OSTERIA DI LUCCA - FILTERS.JS (v3.0 - 100% MODULAR)
   RESPONSABILIDADE: Sistema de Filtros por Tipo de Cliente
   ✅ CORRIGIDO: Importa renderizarGrid do render.js
   ========================================================================================= */

import { getFiltroAtivo, setFiltroAtivo, getTodasReservas } from '../core/state.js';
import { renderizarGrid } from './render.js';// ✅ ADICIONADO

/**
 * Aplica filtro por tipo de cliente
 * ✅ USA renderizarGrid importado (modular)
 */
export function aplicarFiltro(tipo) {
    const filtroAtual = getFiltroAtivo();
    const novoFiltro = filtroAtual === tipo ? null : tipo;
    setFiltroAtivo(novoFiltro);
    // Os demais cartões continuam sendo controles utilizáveis. Seleção não
    // deve reduzir a legibilidade deles como se estivessem desabilitados.
    document.querySelectorAll('.mini-card').forEach(card => {
        card.style.removeProperty('opacity');
        card.setAttribute('aria-pressed', String(card.dataset.filtro === novoFiltro));
    });
    
    // ✅ Usa função modular importada
    renderizarGrid(getTodasReservas());
}

// Expor globalmente
window.aplicarFiltro = aplicarFiltro;

