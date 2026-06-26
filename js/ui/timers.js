/* =========================================================================================
   OSTERIA DI LUCCA - TIMERS.JS (v4.1 - CORRIGIDO)
   RESPONSABILIDADE: Atualização de Cronômetros com Cores Progressivas
   ✅ CORRIGIDO: Sem dependência de render.js, usa state.js
   ✅ Cores Verde (0-90min) → Amarelo (90-115min) → Vermelho (115min+)
   ========================================================================================= */

import { getTodasReservas } from '../core/state.js';

/**
 * Atualiza todos os timers visíveis na interface
 * ✅ Aplica cores baseadas no tempo decorrido
 */
export function atualizarTimers() {
    const reservas = getTodasReservas();
    const agora = new Date();

    reservas.forEach(res => {
        if (!res.inicioMesa || res.fimMesa) return;

        const timerEl = document.querySelector(`[data-timer-id="${res.id}"]`);
        if (!timerEl) return;

        const inicio = new Date(res.inicioMesa);
        const diffMs = agora - inicio;
        const totalSegundos = Math.floor(diffMs / 1000);
        
        // Formata tempo (HH:MM:SS)
        const horas = Math.floor(totalSegundos / 3600);
        const mins = Math.floor((totalSegundos % 3600) / 60);
        const segs = totalSegundos % 60;
        const tempoFormatado = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;

        // Atualiza texto
        timerEl.textContent = tempoFormatado;

        // ✅ CORES: room service tem regra própria (45min), demais usam regra padrão
        const minutos = Math.floor(diffMs / 60000);
        const tipo = timerEl.getAttribute('data-tipo');

        if (tipo === 'roomservice') {
            aplicarCorTimerRoomService(timerEl, minutos);
        } else {
            aplicarCorTimer(timerEl, minutos);
        }
    });
}

/**
 * Aplica cor ao timer baseado no tempo decorrido
 * @param {HTMLElement} elemento - Elemento do timer
 * @param {number} minutos - Minutos decorridos
 */
function aplicarCorTimer(elemento, minutos) {
    // Remove classes anteriores
    elemento.classList.remove('timer-verde', 'timer-amarelo', 'timer-vermelho');

    if (minutos < 90) {
        // 0-89 minutos: VERDE
        elemento.classList.add('timer-verde');
    } else if (minutos < 115) {
        // 90-114 minutos: AMARELO
        elemento.classList.add('timer-amarelo');
    } else {
        // 115+ minutos: VERMELHO
        elemento.classList.add('timer-vermelho');
    }
}


/**
 * Aplica cor ao timer de ROOM SERVICE (regra: 45min = vermelho piscante)
 * @param {HTMLElement} elemento
 * @param {number} minutos
 */
function aplicarCorTimerRoomService(elemento, minutos) {
    elemento.classList.remove('timer-verde', 'timer-amarelo', 'timer-vermelho', 'timer-piscante');
    if (minutos < 45) {
        elemento.classList.add('timer-verde');
    } else {
        elemento.classList.add('timer-vermelho', 'timer-piscante');
    }
}
/**
 * Inicia timer para uma mesa específica (chamado ao iniciar atendimento)
 * @param {string} idReserva - ID da reserva
 */
export function iniciarTimer(idReserva) {
    const timerEl = document.querySelector(`[data-timer-id="${idReserva}"]`);
    if (!timerEl) return;

    // Inicia com cor verde
    timerEl.textContent = "00:00:00";
    aplicarCorTimer(timerEl, 0);
}

/**
 * Para timer de uma mesa (chamado ao finalizar atendimento)
 * @param {string} idReserva - ID da reserva
 */
export function pararTimer(idReserva) {
    const timerEl = document.querySelector(`[data-timer-id="${idReserva}"]`);
    if (!timerEl) return;

    // Remove todas as classes de cor
    timerEl.classList.remove('timer-verde', 'timer-amarelo', 'timer-vermelho');
}

// Expor funções globalmente
window.atualizarTimers = atualizarTimers;
window.iniciarTimer = iniciarTimer;
window.pararTimer = pararTimer;

console.log('✅ timers.js v4.1 carregado');