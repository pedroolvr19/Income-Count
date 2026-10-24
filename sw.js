/* Service worker: funciona offline (cache do app e bibliotecas locais) */
const CACHE = 'finance-manager-v2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/utils.js', './js/store.js', './js/finance.js', './js/exports.js', './js/invoice.js', './js/assistant.js', './js/app.js',
  './vendor/lucide.min.js', './vendor/chart.umd.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js', './vendor/xlsx.full.min.js', './vendor/pdf.min.js', './vendor/pdf.worker.min.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // stale-while-revalidate
  e.respondWith(caches.match(e.request).then(cached => {
    const net = fetch(e.request).then(res => {
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
