// Room duel dua laptop lewat PeerJS (WebRTC). PeerJS dimuat sebagai skrip global `Peer` di index.html.
// Awalan id baru: halaman versi lama (awalan 'pongpose-') tidak bisa nyasar ke room versi ini.
const PREFIX = 'telapak2-';

export const PEER_ERR = {
  'peer-unavailable': 'Kode room tidak ditemukan. Cek lagi angkanya, dan pastikan kedua laptop membuka versi terbaru.',
  'network': 'Tidak bisa menghubungi server room. Cek internet, atau coba hotspot HP.',
  'server-error': 'Server room sedang bermasalah. Coba lagi sebentar.',
  'browser-incompatible': 'Browser ini tidak mendukung duel dua laptop. Pakai Chrome.'
};
const errText = e => PEER_ERR[e.type] || 'Koneksi gagal (' + e.type + '). Coba lagi.';

function peerOpts(broker) {
  const b = (broker || '').trim();
  if (!b) return {};
  const [host, port] = b.split(':');
  return {host, port: +port || 9000, path: '/', secure: location.protocol === 'https:'};
}

let peer = null;
export function closePeer() { if (peer) peer.destroy(); peer = null; }
const connected = c => c && c.open;

// h: {onCode(code), onConn(conn), onError(text)}; kode kebetulan dipakai room lain: ganti kode
export function openRoom(broker, h, tries = 4) {
  const code = String(Math.floor(1000 + Math.random() * 9000)), p = peer = new Peer(PREFIX + code, peerOpts(broker));
  let conn = null;
  p.on('open', () => h.onCode(code));
  p.on('error', e => {
    if (p !== peer) return;
    if (e.type === 'unavailable-id' && tries > 0) { p.destroy(); openRoom(broker, h, tries - 1); }
    else if (!connected(conn)) h.onError(errText(e)); // duel yang sudah tersambung tidak butuh server room
  });
  p.on('connection', c => c.on('open', () => {
    if (connected(conn)) return c.close();
    conn = c; h.onConn(c);
  }));
}

// h: {onConn(conn), onError(text)}
export function joinRoom(broker, code, h) {
  const p = peer = new Peer(peerOpts(broker));
  let conn = null;
  p.on('error', e => { if (p === peer && !connected(conn)) h.onError(errText(e)); });
  p.on('open', () => {
    const c = conn = p.connect(PREFIX + code, {reliable: false});
    const timer = setTimeout(() => { if (p === peer && !c.open) h.onError('Tidak bisa tersambung ke lawan. Sambungkan kedua laptop ke hotspot HP yang sama, lalu coba lagi.'); }, 15000);
    c.on('open', () => { clearTimeout(timer); h.onConn(c); });
  });
}
