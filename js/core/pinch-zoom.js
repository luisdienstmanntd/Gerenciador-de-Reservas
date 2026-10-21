/*
 * Zoom por pinça no modo tela cheia.
 *
 * O zoom nativo do navegador pode ficar indisponível quando a página entra em
 * fullscreen. Neste caso, duas pontas dos dedos ajustam a escala do documento;
 * toques simples continuam entregues normalmente aos botões e à planilha.
 */

const ZOOM_MIN = 1;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.01;
let zoomAtual = 1;
let distanciaInicial = 0;
let zoomInicial = 1;

function distanciaEntreToques(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

function aplicarZoom(zoom) {
    zoomAtual = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    document.documentElement.style.zoom = String(zoomAtual);
}

function resetarZoom() {
    zoomAtual = 1;
    distanciaInicial = 0;
    document.documentElement.style.zoom = '';
}

function iniciarPinch(event) {
    if (!document.fullscreenElement || event.touches.length !== 2) return;
    distanciaInicial = distanciaEntreToques(event.touches);
    zoomInicial = zoomAtual;
}

function atualizarPinch(event) {
    if (!document.fullscreenElement || event.touches.length !== 2 || !distanciaInicial) return;
    event.preventDefault();
    const fator = distanciaEntreToques(event.touches) / distanciaInicial;
    aplicarZoom(Math.round((zoomInicial * fator) / ZOOM_STEP) * ZOOM_STEP);
}

function terminarPinch(event) {
    if (event.touches && event.touches.length > 1) return;
    distanciaInicial = 0;
}

document.addEventListener('touchstart', iniciarPinch, { passive: true });
document.addEventListener('touchmove', atualizarPinch, { passive: false });
document.addEventListener('touchend', terminarPinch, { passive: true });
document.addEventListener('touchcancel', terminarPinch, { passive: true });
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) resetarZoom();
});
