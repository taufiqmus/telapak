// Kemajuan pemain di laptop ini (localStorage): statistik, pencapaian, karier, tutorial, catatan near-miss.
const KEY = 'telapak-v1', LOGKEY = 'telapak-log';

export const ACH = [
  {id: 'pukul1', nama: 'Pukulan pertama', ket: 'Kena bola sekali', ok: (s) => s.pukulan >= 1},
  {id: 'tutorial', nama: 'Siap tanding', ket: 'Selesaikan tutorial', ok: (s) => s.tutorial},
  {id: 'reli10', nama: 'Reli 10', ket: 'Reli 10 pukulan dalam satu poin', ok: (s) => s.reli >= 10},
  {id: 'reli25', nama: 'Tembok berjalan', ket: 'Reli 25 pukulan', ok: (s) => s.reli >= 25},
  {id: 'smash1', nama: 'Smash!', ket: 'Smash pertama', ok: (s) => s.smash >= 1},
  {id: 'smash25', nama: 'Tukang smash', ket: '25 smash', ok: (s) => s.smash >= 25},
  {id: 'topspin', nama: 'Pemutar bola', ket: '20 pukulan topspin', ok: (s) => s.topspin >= 20},
  {id: 'menang1', nama: 'Kemenangan pertama', ket: 'Menangi satu pertandingan', ok: (s) => s.menang >= 1},
  {id: 'bersih', nama: 'Tanpa ampun', ket: 'Menang tanpa kehilangan poin', ok: (s) => s.bersih >= 1},
  {id: 'latihan100', nama: 'Rajin latihan', ket: '100 bola masuk di mode latihan', ok: (s) => s.latihan >= 100},
  {id: 'karier', nama: 'Juara kampung', ket: 'Kalahkan semua lawan karier', ok: (s) => s.juara},
  {id: 'duel', nama: 'Lintas laptop', ket: 'Selesaikan duel dua laptop', ok: (s) => s.duel >= 1},
  {id: 'berdua', nama: 'Satu kamera', ket: 'Selesaikan duel berdua di satu kamera', ok: (s) => s.berdua >= 1}
];

const fresh = () => ({
  stats: {main: 0, menang: 0, pukulan: 0, smash: 0, topspin: 0, reli: 0, detik: 0, latihan: 0, bersih: 0, duel: 0, berdua: 0, tutorial: false, juara: false},
  ach: {}, karier: 0
});

export function load(ls = globalThis.localStorage) {
  try { const d = JSON.parse(ls.getItem(KEY)); if (d && d.stats) return {...fresh(), ...d, stats: {...fresh().stats, ...d.stats}}; } catch { /* data rusak: mulai baru */ }
  return fresh();
}
export function save(d, ls = globalThis.localStorage) { try { ls.setItem(KEY, JSON.stringify(d)); } catch { /* penyimpanan penuh atau diblokir: tetap bisa main */ } }

// Tambah ke statistik (angka dijumlah, 'reli' diambil maksimum, boolean di-OR), lalu kembalikan pencapaian yang baru terbuka.
export function add(d, delta) {
  for (const [k, v] of Object.entries(delta)) d.stats[k] = k === 'reli' ? Math.max(d.stats[k], v) : typeof v === 'boolean' ? d.stats[k] || v : d.stats[k] + v;
  const baru = ACH.filter(a => !d.ach[a.id] && a.ok(d.stats));
  for (const a of baru) d.ach[a.id] = Date.now();
  return baru;
}

// Catatan jarak bola-bat untuk menyetel HIT dan jendela waktu dari permainan sungguhan. Ekspor: telapakLog() di konsol.
export function logShot(e, ls = globalThis.localStorage) {
  try {
    const L = JSON.parse(ls.getItem(LOGKEY) || '[]'); L.push({...e, t: Date.now()});
    ls.setItem(LOGKEY, JSON.stringify(L.slice(-500)));
  } catch { /* abaikan */ }
}
export const readLog = (ls = globalThis.localStorage) => JSON.parse(ls.getItem(LOGKEY) || '[]');
