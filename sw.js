// Zmień tę wersję przy każdym deployu żeby wymusić odświeżenie cache
const CACHE_VERSION = 'v17';
const CACHE_NAME = `serwis-auta-${CACHE_VERSION}`;
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './db.js',
    './export.js',
    './scanner.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Install: pobierz wszystkie pliki do nowego cache
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting()) // aktywuj od razu, nie czekaj
    );
});

// Activate: usuń stary cache i przejmij kontrolę nad wszystkimi kartami
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim()) // przejmij otwarte karty od razu
    );
});

// Fetch: network-first dla CDN, cache-first dla lokalnych plików
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // POST i inne metody poza GET — nie cache'uj (np. wywołania Cloud Functions)
    if (e.request.method !== 'GET') return;

    // CDN (SheetJS) — najpierw sieć, fallback na cache
    if (url.origin !== location.origin) {
        e.respondWith(
            fetch(e.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    return response;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Lokalne pliki — cache-first
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
