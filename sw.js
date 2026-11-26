// Service worker: game bisa dibuka lagi tanpa internet setelah sekali dimuat.
// File game sendiri: jaringan dulu (rilis baru langsung terpakai), cache hanya cadangan saat offline.
// Pustaka dan model dari CDN: alamatnya berversi dan tidak pernah berubah, jadi cache dulu.
const CACHE = 'telapak-v2'; // ganti bila daftar SHELL berubah
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'js/main.js', 'js/physics.js', 'js/pose.js', 'js/cpu.js', 'js/scene.js', 'js/net.js', 'js/audio.js', 'js/store.js'];
const CDN = ['cdn.jsdelivr.net', 'unpkg.com', 'storage.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const q = e.request, u = new URL(q.url);
  if (q.method !== 'GET') return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(q).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(q, c)); } return r; })
      .catch(() => caches.match(q, {ignoreSearch: true})));
  } else if (CDN.includes(u.hostname)) {
    e.respondWith(caches.match(q).then(hit => hit || fetch(q).then(r => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(k => k.put(q, c)); }
      return r;
    })));
  } // server room PeerJS dan lainnya: tidak disentuh
});
