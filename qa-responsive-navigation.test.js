import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const code = readFileSync('js/core/navigation.js', 'utf8');
async function fixture() {
    const dom = new JSDOM(`<style>.modal{display:none}</style>
        <div id="sidebar"><button id="sb-btn-toggle">Menu</button></div><div id="overlay"></div>
        <main class="main-content"><button id="origem">Abrir</button><div class="view" id="tela-home"></div></main>
        <nav id="bottom-nav"><button>Início</button></nav>
        <div class="modal" id="dialogo"><button id="primeiro">Salvar</button><button id="ultimo">Cancelar</button></div>`, { runScripts: 'outside-only' });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false });
    w.console.log = () => {};
    w.HTMLElement.prototype.getClientRects = function () { return this.closest('.modal')?.style.display === 'flex' ? [{}] : []; };
    w.eval(code);
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve));
    const settle = () => new Promise(resolve => w.setTimeout(resolve, 0));
    w.document.getElementById('origem').focus();
    w.document.getElementById('dialogo').style.display = 'flex';
    await settle();
    return { w, d: w.document, settle, close: () => w.close() };
}

it('ao abrir diálogo desativa o fundo e leva o foco para uma ação do formulário', async () => {
    const { d, close } = await fixture();
    try {
        for (const selector of ['.main-content', '#sidebar', '#bottom-nav', '#overlay']) expect(d.querySelector(selector).inert).toBe(true);
        expect(d.activeElement.id).toBe('primeiro');
        expect(d.querySelector('#dialogo').getAttribute('aria-modal')).toBe('true');
    } finally { close(); }
});

it('Tab e Shift+Tab permanecem nas ações do diálogo', async () => {
    const { w, d, close } = await fixture();
    try {
        d.querySelector('#ultimo').focus();
        d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
        expect(d.activeElement.id).toBe('primeiro');
        d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
        expect(d.activeElement.id).toBe('ultimo');
    } finally { close(); }
});

it('fechar o diálogo libera o fundo e devolve o foco ao botão que o abriu', async () => {
    const { d, settle, close } = await fixture();
    try {
        d.querySelector('#dialogo').style.display = 'none'; await settle();
        expect(d.querySelector('.main-content').inert).toBe(false);
        expect(d.querySelector('#bottom-nav').inert).toBe(false);
        expect(d.activeElement.id).toBe('origem');
    } finally { close(); }
});
