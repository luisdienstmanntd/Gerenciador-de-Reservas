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
    
    // Se clicar em "TOTAL PAX"
    if (tipo === 'todos') {
        if (filtroAtual === 'todos') {
            setFiltroAtivo(null);
            document.querySelectorAll('.mini-card').forEach(c => c.style.opacity = '1');
        } else {
            setFiltroAtivo('todos');
            document.querySelectorAll('.mini-card').forEach(c => c.style.opacity = '0.4');
            const cardTodos = document.querySelector(`[data-filtro="todos"]`);
            if (cardTodos) cardTodos.style.opacity = '1';
        }
        
        // ✅ Usa função modular importada
        renderizarGrid(getTodasReservas());
        return;
    }
    
    if (filtroAtual === tipo) {
        // Desativa o filtro
        setFiltroAtivo(null);
        document.querySelectorAll('.mini-card').forEach(c => c.style.opacity = '1');
    } else {
        // Ativa o filtro
        setFiltroAtivo(tipo);
        document.querySelectorAll('.mini-card').forEach(c => c.style.opacity = '0.4');
        const cardFiltro = document.querySelector(`[data-filtro="${tipo}"]`);
        if (cardFiltro) cardFiltro.style.opacity = '1';
    }
    
    // ✅ Usa função modular importada
    renderizarGrid(getTodasReservas());
}

// Expor globalmente
window.aplicarFiltro = aplicarFiltro;

console.log('✅ filters.js v3.0 carregado - 100% modular');