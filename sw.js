/* =========================================================================================
   OSTERIA DI LUCCA - SW.JS v1.0
   RESPONSABILIDADE: Service Worker — cache de arquivos estáticos para uso offline
   ✅ v1.0: Estratégia network-first. Nunca intercepta chamadas ao Firebase/Firestore —
            só arquivos estáticos do próprio site (HTML/CSS/JS/ícones).
   ✅ v1.1: fetch() usa { cache: 'no-store' } — sem isso, o SW podia reforçar uma cópia
            desatualizada do cache HTTP do próprio navegador (bug encontrado ao testar
            uma mudança em dashboard.js que não aparecia mesmo após deploy).
   ========================================================================================= */

const CACHE_NAME = 'osteria-di-lucca-v2';

// Arquivos essenciais pré-cacheados na instalação — o resto é cacheado
// dinamicamente conforme o usuário navega (ver estratégia no fetch abaixo).
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                APP_SHELL.map((url) =>
                    fetch(url, { cache: 'no-store' }).then((resposta) => cache.put(url, resposta))
                )
            )
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nomes) =>
            Promise.all(
                nomes
                    .filter((nome) => nome !== CACHE_NAME)
                    .map((nome) => caches.delete(nome))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // ✅ Nunca intercepta requisições de outra origem (Firebase/Firestore, CDNs,
    // fontes do Google, etc.) — deixa o navegador tratar normalmente. Interceptar
    // o canal de comunicação em tempo real do Firestore quebraria o app.
    if (url.origin !== self.location.origin) return;

    // Só GET pode ser cacheado — outros métodos (não usados aqui, mas por
    // segurança) passam direto pra rede.
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then((resposta) => {
                const copia = resposta.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
                return resposta;
            })
            .catch(() => caches.match(event.request))
    );
});
