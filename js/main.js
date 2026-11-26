// Perekat: layar menu, mode permainan, input, loop utama, duel jaringan.
import {newState, startRound, step, tryHit, applyHit, canHit, batOf, fly, handToBat, ndcToHand, clamp, backhand, NET_TOP, PROTO} from './physics.js';
import {Tracker, loadPose, readPose, setPeople, poseStat} from './pose.js';
import {Cpu, LAWAN, quick, MESIN} from './cpu.js';
import {createScene, COLOR} from './scene.js';
import {openRoom, joinRoom, closePeer} from './net.js';
import * as snd from './audio.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), vid = $('vid'), dots = $('dots').getContext('2d');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const view = createScene(cv);
const prog = store.load();

// ---------- keadaan ----------
let S = newState();
let role = null; // null | 'cpu' | 'host' | 'guest' | 'duo'
let conn = null, screenNow = 'menu', myReady = false, oppReady = false, rxT = 0, rxN = 0, txN = 0, rtt = 80;
let cpu = null, karierIdx = null, calMsg = '', hitstop = 0, frozenFor = 0;
let trackers = [new Tracker()];
const mouse = {x: 0, y: .5, z: .5, r: 0, p: 0};
const mine = {h: {x: 0, y: .5, z: .5, r: 0, p: 0}, g: {x: 0, y: .5, z: .5, r: 0, p: 0}}; // nilai tangan yang dihaluskan per sisi
const sp = {h: {s: 0, vy: 0}, g: {s: 0, vy: 0}}; // kecepatan ayun bat (m/s) dan komponen tegaknya, dihaluskan
const prevBat = {h: null, g: null};
const oppShown = {x: 0, y: 1, z: -1.5, r: 0, p: 0}; // bat lawan jaringan, dihaluskan supaya tidak patah-patah
// tamu: bola prediksi lokal + pukulan yang menunggu konfirmasi host
const GB = {bx: 0, by: 1, bz: 0, vx: 0, vy: 0, vz: 0, w: 0};
let pend = null, hitId = 0, lastHitId = -1, prevS = null, lastEnd = null;
// tayangan ulang
const rec = []; let replay = null;
// tutorial
let tut = null;

const ownSide = () => role === 'guest' ? 'g' : 'h';
const net = () => role === 'host' || role === 'guest';
const ZERO = {x: 0, y: 0};
const headOn = () => $('headpov').checked && poseStat.ready && !mouseCtl(); // sudut pandang ikut kepala
const myHand = () => mouseCtl() ? ($('hand').value === 'L' ? 'L' : 'R') : trackers[0].hand; // tangan pemukul pemain laptop ini
const mouseCtl = () => $('ctrl').value === 'mouse' && role !== 'duo';
const status = t => $('st').textContent = t;
const myName = d => $('name').value.trim() || d;

// ---------- layar ----------
const PANELS = ['menu', 'wait', 'pause', 'result', 'karier', 'stats'];
function go(to) {
  screenNow = to; document.body.dataset.screen = to;
  for (const id of PANELS) $(id).hidden = id !== to;
  $('hud').hidden = !['main', 'pause', 'result'].includes(to);
  if (to === 'menu') { $('menu').append($('set')); menuHighlight(); }
  if (to === 'pause') $('setHere').append($('set'));
  if (document.activeElement) document.activeElement.blur(); // supaya Spasi tidak menekan tombol yang sudah hilang
}
function menuHighlight() { // pemain baru diarahkan ke tutorial
  const baru = !prog.stats.tutorial;
  $('tut').classList.toggle('utama', baru); $('cpu').classList.toggle('utama', !baru);
}
const lockButtons = v => { for (const id of ['host', 'join', 'cpu', 'tut', 'lat', 'kar', 'duo']) $(id).disabled = v; };

function fail(text) { // kembali ke menu dengan pesan; tombol bisa dipakai lagi
  setText('tip', '');
  if (conn) conn.close();
  closePeer();
  conn = null; role = null; cpu = null; karierIdx = null; tut = null; replay = null; myReady = oppReady = false; pend = null;
  S = newState(); trackers = [trackers[0]]; setPeople(1);
  lockButtons(false); go('menu'); status(text);
}

async function loadCam() {
  if (mouseCtl()) return true;
  status('Memuat kamera dan model…');
  try {
    await loadPose(vid, $('acc').value);
    $('acc').disabled = true; // model sudah dimuat; ganti = muat ulang halaman
    return true;
  } catch (e) {
    status(e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Klik ikon kamera di bilah alamat, izinkan, lalu coba lagi. Atau pilih kontrol Mouse.'
      : e.name === 'NotFoundError' ? 'Kamera tidak ditemukan. Sambungkan kamera, atau pilih kontrol Mouse.'
      : e.name === 'NotReadableError' ? 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.'
      : 'Kamera atau model gagal dimuat: ' + e.message);
    return false;
  }
}
async function begin() { lockButtons(true); snd.audioInit(); if (await loadCam()) { status(''); return true; } lockButtons(false); return false; }

// ---------- mulai mode ----------
function startLocal(mode, prof, opp) {
  role = 'cpu'; cpu = new Cpu(prof); S = newState(); S.mode = mode; S.nh = myName('Kamu'); S.ng = opp;
}
async function playLocal() { go('main'); await calibrate(); if (role) startRound(S, +$('win').value, +$('spd').value); }

$('cpu').onclick = async () => { if (!await begin()) return; startLocal('match', quick(+$('lvl').value), 'Komputer'); await playLocal(); };
$('lat').onclick = async () => { if (!await begin()) return; startLocal('latihan', MESIN, 'Mesin bola'); await playLocal(); };
$('tut').onclick = async () => {
  if (!await begin()) return; startLocal('latihan', MESIN, 'Mesin bola');
  tut = {i: 0, base: null}; await playLocal(); if (tut) tutEnter();
};
$('kar').onclick = () => { renderKarier(); go('karier'); };
$('karBack').onclick = $('statBack').onclick = () => go('menu');
$('stat').onclick = () => { renderStats(); go('stats'); };

async function startKarier(i) {
  go('menu'); if (!await begin()) return;
  karierIdx = i; startLocal('match', LAWAN[i], LAWAN[i].nama); await playLocal();
}
function renderKarier() {
  const L = $('kList'); L.textContent = '';
  LAWAN.forEach((o, i) => {
    const b = document.createElement('button'), done = i < prog.karier, open = i <= prog.karier;
    b.className = 'lawan' + (i === prog.karier ? ' utama' : ''); b.disabled = !open;
    b.innerHTML = `<b></b><small></small>`;
    b.firstChild.textContent = (done ? '✓ ' : open ? '' : '🔒 ') + o.nama;
    b.lastChild.textContent = open ? o.gaya : `Kalahkan ${LAWAN[i - 1].nama} dulu`;
    b.onclick = () => startKarier(i); L.append(b);
  });
}
function renderStats() {
  const s = prog.stats, D = $('stDl'); D.textContent = '';
  for (const [k, v] of [['Pertandingan', s.main], ['Menang', s.menang], ['Pukulan kena', s.pukulan], ['Smash', s.smash], ['Topspin', s.topspin],
    ['Reli terpanjang', s.reli], ['Bola masuk (latihan)', s.latihan], ['Lama main', Math.round(s.detik / 60) + ' menit']]) {
    const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; D.append(dt, dd);
  }
  const U = $('achL'); U.textContent = '';
  for (const a of store.ACH) {
    const li = document.createElement('li'); li.className = prog.ach[a.id] ? 'buka' : '';
    li.innerHTML = '<b></b> <span></span>'; li.firstChild.textContent = (prog.ach[a.id] ? '★ ' : '☆ ') + a.nama; li.lastChild.textContent = a.ket;
    U.append(li);
  }
}

$('duo').onclick = async () => {
  if ($('ctrl').value === 'mouse') { status('Mode berdua butuh kamera. Ganti kontrol ke Kamera di atas.'); return; }
  if (!await begin()) return;
  await setPeople(2);
  role = 'duo'; trackers = [trackers[0], new Tracker()]; S = newState(); S.nh = myName('Kiri'); S.ng = 'Kanan';
  go('main'); await calibrate(); if (role === 'duo') startRound(S, +$('win').value, +$('spd').value);
};

// ---------- duel jaringan ----------
const send = (m, n = 1) => { if (conn && conn.open) for (let i = 0; i < n; i++) conn.send(m); }; // kanal tidak andal: pesan penting dikirim beberapa kali

function bindConn(c) {
  conn = c; rxT = performance.now(); rxN = 0;
  c.on('data', d => {
    if (c !== conn) return;
    rxT = performance.now();
    if (d.t === 'p' && role === 'host') {
      if (d.n <= rxN) return; rxN = d.n; // paket bisa datang tidak berurutan
      S.gx = clamp(d.x, -2, 2); S.gy = clamp(d.y, .2, 2); S.gz = clamp(d.z, -1.9, -1); S.gr = clamp(d.r, -1.3, 1.3); S.gp = clamp(d.p, -1.2, 1.2); S.gh = d.h === 'L' ? 'L' : 'R';
      S.gex = clamp(+d.ex || 0, -.45, .45); S.gey = clamp(+d.ey || 0, -.35, .25);
    } else if (d.t === 's' && role === 'guest') {
      if (d.n > rxN) { rxN = d.n; Object.assign(S, d.s); guestSync(); }
    } else if (d.t === 'hit' && role === 'host') hostHit(d);
    else if (d.t === 'ping' && role === 'host') send({t: 'pong', c: d.c});
    else if (d.t === 'pong' && role === 'guest') rtt += (performance.now() - d.c - rtt) * .3;
    else if (d.t === 'ready' && role === 'host' && !oppReady) {
      if (d.v !== PROTO) { send({t: 'bye'}, 3); return fail('Versi game lawan berbeda. Muat ulang halaman di kedua laptop.'); }
      S.ng = String(d.name).slice(0, 14); oppReady = true; bothReady();
    }
    else if (d.t === 'bye' && role === 'guest') fail('Versi game lawan berbeda. Muat ulang halaman di kedua laptop.');
    else if (role === 'host' && d.t === 'again') again();
    else if (role === 'host' && d.t === 'pause') S.paused = !!d.v;
  });
  c.on('close', () => { if (c === conn) { conn = null; fail(role === 'guest' && !rxN ? 'Room sudah penuh. Minta kode room lain.' : 'Lawan terputus. Buat room baru atau gabung lagi.'); } });
}
function bothReady() { if (role === 'host' && myReady && oppReady) startRound(S, +$('win').value, +$('spd').value); }

$('host').onclick = async () => {
  if (!await begin()) return;
  role = 'host'; S = newState(); S.nh = myName('Pemain 1'); S.ng = 'Pemain 2'; status('Membuat room…');
  openRoom($('broker').value, {
    onCode: code => { status('Room ' + code); $('kode').textContent = code; go('wait'); },
    onConn: async c => { bindConn(c); go('main'); await calibrate(); myReady = true; bothReady(); },
    onError: fail
  });
};
$('join').onclick = async () => {
  const code = $('code').value.trim();
  if (!/^\d{4}$/.test(code)) { status('Isi kode room 4 digit.'); return $('code').focus(); }
  if (!await begin()) return;
  role = 'guest'; S = newState(); status('Menyambung ke room ' + code + '…');
  joinRoom($('broker').value, code, {
    onConn: async c => {
      bindConn(c); status('Terhubung.'); go('main'); await calibrate();
      while (conn === c && S.ph === 'wait') { send({t: 'ready', name: myName('Pemain 2'), v: PROTO}); await sleep(500); } // diulang sampai host mulai
    },
    onError: fail
  });
};

// Tamu: posisi bola diprediksi lokal, lalu dikoreksi pelan-pelan ke keadaan host yang dimajukan setengah RTT.
function guestSync() {
  if (pend && S.hits < pend.hits && performance.now() - pend.at < 600) return; // pukulan kita belum sampai ke host: pakai prediksi
  if (pend && S.hits < pend.hits) fx.hits = S.hits; // ditolak host: efeknya jangan menelan pukulan berikutnya
  pend = null;
  const T = {bx: S.bx, by: S.by, bz: S.bz, vx: S.vx, vy: S.vy, vz: S.vz, w: S.w};
  if (S.ph === 'play') fly(T, Math.min(rtt / 2, 150) / 1000 / S.ts);
  const far = Math.hypot(GB.bx - T.bx, GB.by - T.by, GB.bz - T.bz) > .4;
  for (const k in T) GB[k] = S.ph !== 'play' || far || k[0] === 'v' || k === 'w' ? T[k] : GB[k] + (T[k] - GB[k]) * .3;
}
function guestTick(dt, own, eye) {
  if ((S.ph === 'play' || pend) && !S.paused) fly(GB, dt / S.ts); // servis yang sudah kita pukul ikut terbang sebelum host mengonfirmasi
  if (pend || S.paused) return;
  // tamu menilai pukulannya sendiri terhadap bola yang ia lihat, lalu memberi tahu host (pemukul diuntungkan)
  const T = {...S, ...GB, gx: own.x, gy: own.y, gz: own.z, gr: own.r, gp: own.p, gex: eye.x, gey: eye.y, near: {h: null, g: null}};
  if (!tryHit(T, 'g', {swing: () => ({...sp.g})})) return;
  const m = {t: 'hit', id: ++hitId, bx: GB.bx, by: GB.by, bz: GB.bz, bat: own, sw: {...sp.g}};
  send(m, 3);
  for (const k in GB) GB[k] = T[k];
  pend = {hits: S.hits + 1, at: performance.now()};
  onMyHit(T, T.smashes > S.smashes); fxHit(T, 'g'); fx.hits = S.hits + 1;
}
// Host: terima pukulan tamu bila masuk akal. Poin yang baru saja berakhir karena tamu "gagal" boleh dibatalkan.
function hostHit(d) {
  if (d.id <= lastHitId) return; lastHitId = d.id;
  if (S.ph === 'point' && lastEnd && performance.now() - lastEnd.at < 300) { Object.assign(S, lastEnd.s); lastEnd = null; }
  if (!canHit(S, 'g') || Math.hypot(S.bx - d.bx, S.by - d.by, S.bz - d.bz) > .8) return;
  S.bx = d.bx; S.by = d.by; S.bz = d.bz;
  const b = {x: clamp(d.bat.x, -2, 2), y: clamp(d.bat.y, .2, 2), z: clamp(d.bat.z, -1.9, -1), r: clamp(d.bat.r, -1.3, 1.3), p: clamp(d.bat.p, -1.2, 1.2)};
  Object.assign(S, {gx: b.x, gy: b.y, gz: b.z, gr: b.r, gp: b.p});
  applyHit(S, 'g', b, {s: clamp(+d.sw.s || 0, 0, 6), vy: clamp(+d.sw.vy || 0, -6, 6)});
}

// ---------- kalibrasi, jeda ----------
// Hitung mundur dulu: saat tombol diklik, tangan masih di mouse sehingga bukan posisi netral.
async function calibrate() {
  if (!poseStat.ready || calMsg || mouseCtl()) return;
  const ts = trackers, two = ts.length > 1;
  ts.forEach(t => t.calStart());
  for (let i = 3; i > 0; i--) { calMsg = (two ? 'Kalian berdua, angkat tangan pemukul: ' : 'Angkat tangan pemukul ke posisi siap: ') + i; await sleep(1000); }
  ts.forEach(t => t.calCollect());
  while (ts.some(t => t.calBuf.length < 15) && role) {
    const miss = ts.filter(t => !t.palm);
    calMsg = !miss.length ? 'Tahan…' : two ? `Tangan pemain ${ts[0].palm ? 'kanan' : 'kiri'} belum terlihat.` : 'Tangan belum terlihat. Mundur sedikit, lalu angkat tangan.';
    ts.forEach(t => { t.pick = !t.palm; });
    await sleep(100);
  }
  ts.forEach(t => t.calDone()); calMsg = '';
}
function setPause(v) { if (role === 'guest') send({t: 'pause', v}, 3); else S.paused = v; }
async function recalibrate() {
  if (!role || calMsg || mouseCtl() || screenNow === 'wait' || screenNow === 'menu') return;
  if (screenNow === 'pause') go('main');
  setPause(true); await calibrate(); setPause(false);
}
function openPause() { if (screenNow === 'main' && S.ph !== 'wait' && !calMsg) { setPause(true); go('pause'); } }
function resume() { if (screenNow === 'pause') { setPause(false); go('main'); } }
function again() {
  if (S.ph !== 'over') return;
  if (role === 'guest') send({t: 'again'}, 3); else { S.miss = null; startRound(S, +$('win').value, S.ts); go('main'); }
}
function nextKarier() { if (karierIdx === null || karierIdx + 1 >= LAWAN.length) return; const i = karierIdx + 1; fail(''); startKarier(i); }
const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
$('pauseBtn').onclick = openPause; $('resume').onclick = resume; $('again').onclick = again; $('next').onclick = nextKarier;
$('cal').onclick = $('cal2').onclick = recalibrate; $('hand').onchange = recalibrate; $('full').onclick = fullscreen;
$('quit').onclick = $('quit2').onclick = $('cancel').onclick = () => fail('');
$('sound').onchange = () => snd.setSound($('sound').checked);
$('spd').onchange = () => { if (role && role !== 'guest') S.ts = +$('spd').value; };
$('lvl').onchange = () => { if (cpu && cpu.p.id === 'cepat') cpu.p = quick(+$('lvl').value); };
$('ctrl').onchange = () => { $('pip').style.display = mouseCtl() || !poseStat.ready ? 'none' : 'block'; localStorage.setItem('telapak-ctrl', $('ctrl').value); };
$('ctrl').value = localStorage.getItem('telapak-ctrl') || 'kamera';
addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,select,button,summary')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); if (replay) replay = null; else if (screenNow === 'result') again(); else resume(); }
  else if (k === 'p') screenNow === 'pause' ? resume() : openPause();
  else if (k === 'k') recalibrate();
  else if (k === 'f') fullscreen();
});

// ---------- mouse / sentuh ----------
addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(), h = ndcToHand((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2, r.width / r.height);
  mouse.x = clamp(h.x, -1.3, 1.3); mouse.y = clamp(h.y, -.1, 1.3);
});
addEventListener('wheel', e => { if (screenNow === 'main') mouse.z = clamp(mouse.z - Math.sign(e.deltaY) * .1); }, {passive: true});
cv.addEventListener('pointerdown', () => { if (replay) replay = null; });

// ---------- umpan balik ----------
const fx = {hits: 0, bounces: 0, smashes: 0, pts: 0, my: -1, op: -1};
function onMyHit(T, smash) { // statistik pukulan pemain laptop ini
  const d = {pukulan: 1}; if (T.w > .4) d.topspin = 1; if (smash) d.smash = 1;
  progress(d);
}
function fxHit(D, side) {
  const smash = D.smashes > fx.smashes;
  view.burst({x: D.bx, y: D.by, z: D.bz}, smash ? 0xffffff : COLOR[side], smash ? 30 : 14, smash ? 2.6 : 1.5);
  if (smash) { snd.sSmash(); if (!reduced.matches) view.kick(.08); view.cheer(1.2); }
  else snd.sHit(clamp(Math.hypot(D.vx, D.vz) / 8));
  fx.smashes = D.smashes;
}
let toastQ = Promise.resolve();
function progress(delta) {
  const baru = store.add(prog, delta); store.save(prog);
  for (const a of baru) toastQ = toastQ.then(async () => { const e = $('toast'); e.textContent = '★ ' + a.nama + ': ' + a.ket; e.hidden = false; snd.sChime(); await sleep(3000); e.hidden = true; });
}

// ---------- tutorial ----------
const TUT = [
  {t: 'Gerakkan bat ke kiri dan kanan. Bat mengikuti tanganmu.', ok: c => c.moved > 1.5},
  {t: 'Mesin melempar bola. Taruh bat di depan bola untuk memukulnya.', ok: c => c.hits >= 1},
  {t: 'Bagus! Sekarang kembalikan 3 bola ke meja seberang.', ok: c => c.in >= 3},
  {t: 'Ayun bat dari bawah ke atas saat memukul: topspin. Jejak bola jadi merah.', ok: c => c.top >= 1},
  {t: 'Ayun cepat ke arah net: pukulan keras dan dalam.', ok: c => c.hard >= 1}
];
function tutEnter() { tut.c = {moved: 0, hits: 0, in: 0, top: 0, hard: 0, sl: S.sl}; setText('tip', `Tutorial ${tut.i + 1}/${TUT.length}: ${TUT[tut.i].t}`); }
function tutTick(dt, own) {
  const c = tut.c, b = prevBat.h; if (b) c.moved += Math.abs(own.x - b.x);
  c.in = S.sl - c.sl;
  if (!TUT[tut.i].ok(c)) return;
  snd.sChime();
  if (++tut.i < TUT.length) return tutEnter();
  tut = null; setText('tip', 'Tutorial selesai! Lanjut latihan bebas, atau Jeda lalu Keluar untuk bertanding.');
  setTimeout(() => { if (!tut) setText('tip', ''); }, 6000);
  progress({tutorial: true});
}
function tutHit() { if (!tut) return; tut.c.hits++; if (S.w > .4) tut.c.top++; if (sp.h.s >= 2) tut.c.hard++; }

// ---------- HUD ----------
const setText = (id, t) => { const e = $(id); if (e.textContent !== String(t)) e.textContent = t; };
function flip(id, v, key) {
  if (fx[key] === v) return;
  fx[key] = v; setText(id, v);
  const e = $(id); e.classList.remove('flip'); void e.offsetWidth; e.classList.add('flip');
}
const WHY = {net: 'bola nyangkut di net', out: 'bola keluar meja', own: 'bola memantul di meja sendiri'};
function missText(m) {
  if (!m || m.d > 5) return 'bola tidak terjangkau. Bawa bat ke jalur bola';
  return Math.abs(m.dx) > Math.abs(m.dy) ? (m.dx > 0 ? 'bat terlalu kiri' : 'bat terlalu kanan') : (m.dy > 0 ? 'bat terlalu rendah' : 'bat terlalu tinggi');
}
function hud() {
  const me = ownSide(), guest = role === 'guest', lat = S.mode === 'latihan', duo = role === 'duo';
  if (role && (!guest || conn)) {
    if (S.ph === 'over' && screenNow === 'main') showResult();
    else if (S.ph !== 'over' && screenNow === 'result') go('main');
  }
  const my = guest ? S.sr : S.sl, op = guest ? S.sl : S.sr;
  flip('cL', my, 'my'); flip('cR', op, 'op');
  setText('nmL', (guest ? S.ng : S.nh) || 'Kamu'); setText('nmR', (guest ? S.nh : S.ng) || 'Lawan');
  const serving = S.ph === 'serve' || S.ph === 'play';
  $('nmL').classList.toggle('srv', serving && S.srv === me && !lat); $('nmR').classList.toggle('srv', serving && S.srv !== me && !lat);
  const deuce = Math.min(S.sl, S.sr) >= S.win - 1;
  setText('goal', lat ? 'Latihan: kiri = bola masuk, kanan = gagal' : deuce ? 'Deuce: menang dengan selisih 2' : `Sampai ${S.win} poin`);
  setText('rally', S.rally >= 2 && S.ph !== 'over' ? `Reli ${S.rally}` : '');
  $('pip').classList.toggle('kanan', trackers[0].hand === 'L' && !duo);

  let msg = '';
  if (replay) msg = 'Tayangan ulang';
  else if (screenNow === 'main') {
    if (calMsg) msg = calMsg;
    else if (S.paused) msg = 'Jeda';
    else if (conn && performance.now() - rxT > 2000) msg = 'Menunggu lawan…';
    else if (S.ph === 'wait') msg = 'Menunggu lawan siap…';
    else if (S.ph === 'serve') msg = lat ? '' : duo ? (S.srv === 'h' ? 'Servis: pemain kiri' : 'Servis: pemain kanan') : S.srv === me ? 'Servis: pukul bola' : 'Lawan servis';
    else if (S.ph === 'point') {
      const why = S.why === 'miss' ? (S.miss && S.miss.side === me && !duo ? missText(S.miss) : '') : WHY[S.why];
      if (lat) msg = S.pw === 'h' ? 'Masuk!' : 'Gagal: ' + why;
      else if (duo) msg = (S.pw === 'h' ? 'Poin pemain kiri' : 'Poin pemain kanan') + (S.why !== 'miss' ? ': ' + why : '');
      else msg = S.pw === me ? 'Poin untukmu!' : 'Poin lawan' + (why ? ': ' + why : '');
    }
  }
  setText('msg', msg);

  // suara, efek, dan statistik dipicu oleh penghitung di keadaan, jadi tamu ikut mendapatkannya
  if (S.hits !== fx.hits && !(pend && S.hits < fx.hits)) { // tamu: pukulan prediksi sudah diberi efek, tunggu konfirmasi host
    if (S.hits > fx.hits) fxHit(S, S.last); fx.hits = S.hits; }
  if (S.bounces !== fx.bounces) { fx.bounces = S.bounces; snd.sBounce(); }
  const pts = S.sl + S.sr;
  if (pts > fx.pts) {
    const win = S.pw === me;
    snd.sPoint(win || duo); if (S.rally >= 6) { snd.sCrowd(S.rally >= 12); view.cheer(1.5); }
    if (!duo) {
      if (S.miss && S.miss.side === me && S.miss.d <= 5) store.logShot({hit: 0, d: +S.miss.d.toFixed(3), dx: +S.miss.dx.toFixed(3), dy: +S.miss.dy.toFixed(3), bh: +backhand(me, batOf(S, me).x, myHand()), p: +batOf(S, me).p.toFixed(2)});
      progress(lat ? (win ? {latihan: 1, reli: S.rally} : {reli: S.rally}) : {reli: S.rally});
    }
  }
  fx.pts = pts;
}
function showResult() {
  const guest = role === 'guest', my = guest ? S.sr : S.sl, op = guest ? S.sl : S.sr, win = my > op;
  const duo = role === 'duo';
  setText('resT', duo ? (win ? S.nh : S.ng) + ' menang!' : ((win ? (guest ? S.ng : S.nh) : (guest ? S.nh : S.ng)) || (win ? 'Kamu' : 'Lawan')) + ' menang!');
  setText('resS', `${my} : ${op}`); setText('resR', `${S.best} pukulan`);
  setText('resD', `${Math.floor(S.dur / 60)} menit ${Math.floor(S.dur % 60)} detik`);
  let next = '';
  if (karierIdx !== null && win) {
    if (karierIdx === prog.karier) prog.karier = Math.min(karierIdx + 1, LAWAN.length);
    next = karierIdx + 1 < LAWAN.length ? `Lawan berikutnya terbuka: ${LAWAN[karierIdx + 1].nama}.` : 'Semua lawan karier sudah kamu kalahkan!';
  }
  setText('resNext', next); $('next').hidden = !(karierIdx !== null && win && karierIdx + 1 < LAWAN.length);
  const d = {main: 1, detik: S.dur};
  if (duo) d.berdua = 1;
  else { if (win) d.menang = 1; if (win && op === 0) d.bersih = 1; if (net()) d.duel = 1; if (karierIdx === LAWAN.length - 1 && win) d.juara = true; }
  progress(d);
  if (win || duo) { snd.sCrowd(true); view.cheer(3); }
  go('result');
}

// ---------- loop ----------
// e: geseran kepala pemain. Bat ikut bergeser bersama mata, jadi yang terlihat menutupi bola tetap dinilai kena.
const toWorld = (side, m, aspect, e) => { const s = side === 'h' ? 1 : -1, b = handToBat(m.x, m.y, m.z, aspect); return {x: s * (b.x + e.x), y: b.y + e.y, z: s * b.z, r: s * m.r, p: s * m.p}; };
function measureSwing(dt) { // kecepatan ayun untuk kekuatan pukulan dan spin
  for (const p of ['h', 'g']) {
    const b = batOf(S, p), q = prevBat[p];
    if (q && dt > 0) { sp[p].s += (Math.hypot(b.x - q.x, b.y - q.y, b.z - q.z) / dt - sp[p].s) * .3; sp[p].vy += ((b.y - q.y) / dt - sp[p].vy) * .3; }
    prevBat[p] = b;
  }
}
function setBat(side, b) { if (side === 'h') Object.assign(S, {hx: b.x, hy: b.y, hz: b.z, hr: b.r, hp: b.p}); else Object.assign(S, {gx: b.x, gy: b.y, gz: b.z, gr: b.r, gp: b.p}); }
const snapBall = () => ({bx: S.bx, by: S.by, bz: S.bz, vx: S.vx, vz: S.vz, w: S.w, ph: S.ph, bn: S.bn, tx: S.tx, tz: S.tz, last: S.last, hits: S.hits, smashes: S.smashes});

let prev = performance.now(), nDraw = 0, tFps = performance.now(), lastPose = 0;
function tick(now) {
  requestAnimationFrame(tick); // dijadwalkan dulu: error di satu frame tidak boleh membekukan game
  const dt = Math.min((now - prev) / 1000, .033); prev = now;
  const duo = role === 'duo', W = cv.clientWidth, H = cv.clientHeight, aspect = duo ? W / 2 / H : W / H;
  readPose(vid, trackers, {hand: $('hand').value, hand2: [$('hand').value, $('hand').value], smooth: +$('smooth').value, pitch: $('pitch').checked, head: headOn()});

  // nilai tangan tiap sisi lokal, dikejar tiap frame layar
  const kf = 1 - Math.exp(-60 * dt);
  const src = duo ? {h: trackers[0].fil, g: trackers[1].fil} : {[ownSide()]: mouseCtl() ? mouse : trackers[0].fil};
  const head = !headOn() ? {} : duo ? {h: trackers[0].head, g: trackers[1].head} : {[ownSide()]: trackers[0].head};
  const own = {}, eye = {};
  for (const side in src) { eye[side] = head[side] || ZERO; for (const k in mine[side]) mine[side][k] += (src[side][k] - mine[side][k]) * kf; own[side] = toWorld(side, mine[side], aspect, eye[side]); }

  const stale = conn && now - rxT > 2000; // lawan pindah tab atau jaringan macet: tahan permainan
  if (conn && now - rxT > 30000) fail('Lawan tidak merespons. Buat room baru atau gabung lagi.');
  const local = role === 'cpu' || role === 'duo' || (role === 'host' && conn);
  if (local && !S.paused && !stale && !calMsg && !replay) {
    for (const side in own) { setBat(side, own[side]); S[side + 'ex'] = eye[side].x; S[side + 'ey'] = eye[side].y; }
    if (duo) { S.hh = trackers[0].hand; S.gh = trackers[1].hand; } else S.hh = myHand(); // komputer: tangan kanan dari newState
    if (cpu) cpu.think(S, dt);
    if (tut) tutTick(dt, own.h); // sebelum measureSwing: tutTick membaca posisi bat frame sebelumnya
    measureSwing(dt);
    const before = S.ph, hits = S.hits;
    if (role === 'host') prevS = structuredClone(S);
    hitstop = Math.max(0, hitstop - dt);
    step(S, hitstop > 0 ? dt * .15 : dt, {
      swing: side => cpu && side === 'g' ? cpu.swing(S) : {...sp[side]},
      remote: side => role === 'host' && side === 'g',
      onHit: (side, r, smash) => {
        if (side === ownSide() || duo) { if (!duo) { onMyHit(S, smash); store.logShot({hit: 1, d: +r.d.toFixed(3), along: +r.along.toFixed(3), bh: +backhand(side, batOf(S, side).x, myHand()), p: +batOf(S, side).p.toFixed(2)}); } if (side === 'h') tutHit(); }
      }
    });
    if (S.hits !== hits) hitstop = reduced.matches || net() ? 0 : S.smashes > fx.smashes ? .12 : .045; // duel: tanpa hitstop, prediksi bola tamu tidak mengenalnya
    if (before === 'play') rec.push({D: snapBall(), bats: {h: batOf(S, 'h'), g: batOf(S, 'g')}, dt});
    while (rec.length > 200) rec.shift();
    if (before === 'play' && S.ph === 'point') {
      if (role === 'host' && S.miss && S.miss.side === 'g') lastEnd = {at: now, s: prevS};
      const smashEnd = rec.some(f => f.D.smashes > (rec[0].D.smashes)), long = S.rally >= 6;
      if ((long || smashEnd) && role !== 'host' && !tut && $('replay').checked) replay = {frames: rec.slice(-150), t: 0, i: 0};
      rec.length = 0;
    } else if (S.ph !== 'play') rec.length = 0;
  } else if (role === 'guest' && conn && conn.open) {
    measureSwingGuest(own.g, dt);
    guestTick(dt, own.g, eye.g);
    send({t: 'p', n: ++txN, ...own.g, h: myHand(), ex: eye.g.x, ey: eye.g.y});
    if (now - lastPose > 1000) { lastPose = now; send({t: 'ping', c: now}); }
  }
  if (role === 'host' && conn && conn.open) send({t: 's', n: ++txN, s: S});

  // gambar
  let D, bats;
  if (replay) {
    replay.t += dt * .6; // gerak lambat
    while (replay.i < replay.frames.length - 1 && replay.t > replay.frames[replay.i].dt) { replay.t -= replay.frames[replay.i].dt; replay.i++; }
    const f = replay.frames[replay.i]; D = {...f.D, ph: 'play'}; bats = f.bats;
    if (replay.i >= replay.frames.length - 1) { replay = null; view.clearTrail(); }
  } else {
    D = role === 'guest' ? {...S, ...GB} : S;
    bats = {h: batOf(S, 'h'), g: batOf(S, 'g')};
    if (net()) { const o = other(ownSide()), t = bats[o]; for (const k in oppShown) oppShown[k] += (t[k] - oppShown[k]) * kf * .5; bats[o] = {...oppShown}; }
    for (const side in own) bats[side] = own[side]; // bat sendiri selalu dari input lokal, tanpa menunggu jaringan
  }
  const views = replay ? [{side: 'tv', x: 0, y: 0, w: 1, h: 1}] : duo ? [{side: 'h', x: 0, y: 0, w: .5, h: 1}, {side: 'g', x: .5, y: 0, w: .5, h: 1}] : [{side: ownSide(), x: 0, y: 0, w: 1, h: 1}];
  view.draw({D, bats, views, hands: duo ? {h: S.hh, g: S.gh} : {h: S.hh, g: S.gh, [ownSide()]: myHand()},
    eyes: replay ? {h: ZERO, g: ZERO} : {h: {x: S.hex, y: S.hey}, g: {x: S.gex, y: S.gey}, ...eye}, inGame: !!role && screenNow !== 'wait', dt, reduced: reduced.matches});
  hud();
  drawPip();

  nDraw++;
  if (now - tFps >= 1000) {
    const k = 1000 / (now - tFps);
    $('fps').textContent = poseStat.ready && !mouseCtl() ? `Pose ${Math.round(poseStat.frames * k)} FPS${poseStat.delegate === 'CPU' ? ' (CPU)' : ''}, layar ${Math.round(nDraw * k)} FPS` : role ? `Layar ${Math.round(nDraw * k)} FPS` : '';
    poseStat.frames = nDraw = 0; tFps = now;
  }
}
const other = p => p === 'h' ? 'g' : 'h';
let prevOwnG = null;
function measureSwingGuest(b, dt) {
  if (prevOwnG && dt > 0) { sp.g.s += (Math.hypot(b.x - prevOwnG.x, b.y - prevOwnG.y, b.z - prevOwnG.z) / dt - sp.g.s) * .3; sp.g.vy += ((b.y - prevOwnG.y) / dt - sp.g.vy) * .3; }
  prevOwnG = b;
}
function drawPip() {
  const show = poseStat.ready && !mouseCtl() && !!role;
  $('pip').style.display = show ? 'block' : 'none';
  if (!show) return;
  dots.clearRect(0, 0, 160, 120);
  trackers.forEach((t, i) => {
    if (!t.palm) return;
    dots.fillStyle = i ? '#f87171' : '#34d399';
    for (const p of t.palm.pts) { dots.beginPath(); dots.arc((1 - p.x) * 160, p.y * 120, 3, 0, 7); dots.fill(); }
    dots.fillStyle = '#facc15'; dots.beginPath(); dots.arc((1 - t.palm.c.x) * 160, t.palm.c.y * 120, 6, 0, 7); dots.fill();
  });
  if (role === 'duo') { dots.strokeStyle = '#fff8'; dots.beginPath(); dots.moveTo(80, 0); dots.lineTo(80, 120); dots.stroke(); }
}

// Ekspor catatan near-miss untuk menyetel hitbox: ketik telapakLog() di konsol.
window.telapakLog = () => { const L = store.readLog(); console.table(L.slice(-20)); return JSON.stringify(L); };
if (new URLSearchParams(location.search).has('debug')) window.__telapak = {get S() { return S; }, get replay() { return replay; }, prog}; // untuk uji otomatis
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* tanpa offline pun game tetap jalan */ });
menuHighlight();
requestAnimationFrame(tick);
