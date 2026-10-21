/* Ticker dos cards-resumo da tela Reservas em retrato mobile/tablet. */

const seletorRetrato = '(max-width: 1200px) and (orientation: portrait)';
let tickerReservas = null;
let cardsOriginais = [];
let observadoresCards = [];

function emRetrato() { return window.matchMedia(seletorRetrato).matches; }
function tickerPermitido() { return emRetrato() || Boolean(document.fullscreenElement); }

function limparObservadores() {
    observadoresCards.forEach(obs => obs.disconnect());
    observadoresCards = [];
}

function avaliarOverflow() {
    if (!tickerReservas) return;
    const track = tickerReservas.querySelector('.cards-ticker-track');
    const emTelaCheia = Boolean(document.fullscreenElement);
    // Em fullscreen retrato, manter o movimento mesmo quando a sequência
    // inteira cabe na largura expandida do navegador.
    const precisaTicker = tickerPermitido() && track &&
        (emTelaCheia || track.scrollWidth / 2 > tickerReservas.clientWidth + 2);
    tickerReservas.classList.toggle('cards-ticker-ativo', Boolean(precisaTicker));
}

function sincronizarClones() {
    if (!tickerReservas) return;
    const track = tickerReservas.querySelector('.cards-ticker-track');
    if (!track) return;
    const clones = cardsOriginais.map(card => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        return clone;
    });
    track.replaceChildren(...cardsOriginais, ...clones);
    avaliarOverflow();
}

function prepararTicker() {
    const faixa = document.querySelector('#tela-reservas .cards-header');
    if (!faixa) return;
    limparObservadores();
    tickerReservas = faixa;
    let track = faixa.querySelector('.cards-ticker-track');
    if (!track) {
        cardsOriginais = [...faixa.children];
        track = document.createElement('div');
        track.className = 'cards-ticker-track';
        faixa.replaceChildren(track);
    } else {
        cardsOriginais = [...track.children].slice(0, Math.ceil(track.children.length / 2));
    }
    sincronizarClones();
    cardsOriginais.forEach(card => {
        const observer = new MutationObserver(() => {
            clearTimeout(card._tickerSyncTimer);
            card._tickerSyncTimer = setTimeout(sincronizarClones, 30);
        });
        observer.observe(card, { attributes: true, childList: true, characterData: true, subtree: true });
        observadoresCards.push(observer);
    });
    tickerReservas.addEventListener('touchstart', () => tickerReservas.classList.add('cards-ticker-pausado'), { passive: true });
    tickerReservas.addEventListener('touchend', () => setTimeout(() => tickerReservas?.classList.remove('cards-ticker-pausado'), 1800), { passive: true });
    window.addEventListener('resize', avaliarOverflow, { passive: true });
    document.addEventListener('fullscreenchange', () => {
        document.documentElement.classList.toggle('app-fullscreen', Boolean(document.fullscreenElement));
        avaliarOverflow();
    });
    avaliarOverflow();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepararTicker);
else prepararTicker();
