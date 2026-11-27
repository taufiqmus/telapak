// Fisika dan aturan permainan. Murni: tanpa DOM dan tanpa THREE, supaya bisa diuji dengan `node --test`.
// Satuan meter. Meja panjang di sumbu z, net di z=0. Sisi 'h' (host/pemain) di z>0, sisi 'g' (tamu/komputer) di z<0.
export const TL = 2.74, TW = 1.525, TY = .76, NET_TOP = TY + .1525, BR = .02, G = 9.8, BIG = 1.5, HIT = .26; // ITTF: bola 40 mm; bola dan bat digambar BIG kali ukuran asli agar mudah dilihat. HIT tetap longgar (lebih dari bilah + bola yang tergambar) karena posisi tangan dari kamera bergetar beberapa cm; HIT kecil membuat pukulan sering meleset dan melenceng
export const EYE_Y = 1.55, EYE_Z = 2.6, LOOK_Y = .85, LOOK_Z = -.3, FOV = 65; // kamera pemain, diam; dipakai juga oleh pemetaan tangan
export const SPIN_G = 5; // percepatan tegak tambahan per satuan spin: topspin (+1) menukik, backspin (-1) melayang
export const SMASH_SPEED = 3.2; // m/s ayunan bat; di atas ini bola tinggi dipukul smash
export const PROTO = 7;
export const SIDE_G = 2.5; // m/s² belokan bola per satuan sidespin
export const TOSS_Y = .95, TOSS_V = 2.6, SERVE_Z = 1.45; // lemparan servis: dari tinggi tangan, naik sekitar 35 cm, di belakang garis ujung
export const EDGE = .015; // m: mendarat sedekat ini ke tepi meja = bola tepi (sah, memantul rendah) // versi protokol duel; naikkan bila isi paket berubah

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const other = p => p === 'h' ? 'g' : 'h';
const grav = w => G + SPIN_G * w;

export function newState() {
  return {
    hx: 0, hy: 1, hz: 1.5, hr: 0, hp: 0, gx: 0, gy: 1, gz: -1.5, gr: 0, gp: 0,
    bx: 0, by: 1.1, bz: 1.1, vx: 0, vy: 0, vz: 0, w: 0,
    sl: 0, sr: 0, ph: 'wait', t: 0, srv: 'h', last: null, bn: 0, pw: 'h', why: '', miss: null,
    win: 7, ts: 1, mode: 'match', paused: false, hits: 0, bounces: 0, smashes: 0, rally: 0, best: 0, dur: 0,
    nh: '', ng: '', hh: 'R', gh: 'R', hex: 0, hey: 0, gex: 0, gey: 0,
    tx: 0, tz: 0, near: {h: null, g: null},
    err: 0, errG: 0, arcade: false, cause: '', ws: 0, cord: false, toss: false, hold: false, lowToss: false, sv: false, sb: 0, cords: 0, edges: 0, lets: 0, shot: '' // err: 0 = pukulan berbantuan penuh, 1 = realistis; arcade: aturan versi awal
  };
}

export const batOf = (S, p) => p === 'h' ? {x: S.hx, y: S.hy, z: S.hz, r: S.hr, p: S.hp} : {x: S.gx, y: S.gy, z: S.gz, r: S.gr, p: S.gp};
// Pitch bilah dari telapak sendiri (world landmarks MediaPipe: meter, y ke bawah, z menjauhi kamera):
// sudut jari (tengah telunjuk-kelingking) condong ke kamera = ke net. + = menutup.
// Tidak berubah oleh roll atau oleh sisi telapak yang menghadap kamera, dan tidak ikut berubah saat lengan menjangkau ke depan.
export function palmPitch(wr, ix, pk) {
  const mx = (ix.x + pk.x) / 2 - wr.x, my = (ix.y + pk.y) / 2 - wr.y, mz = (ix.z + pk.z) / 2 - wr.z;
  return Math.atan2(-mz, Math.hypot(mx, my));
}
// Kalibrasi lengkap: rentang gerak pribadi. Tiap sumbu [ujung bawah, netral, ujung atas] dalam nilai mentah tracker
// (x layar dicerminkan, y gambar ke bawah, z meter relatif bahu, makin negatif makin ke depan).
// Ujung dipersempit 15% ke arah netral supaya tepi meja tercapai tanpa meregang penuh. Sumbu yang terlalu sempit = null (pakai bawaan).
export const CAL_MIN = {x: .06, y: .06, z: .04};
export function calRange(n, s) {
  const ax = (k, lo, hi) => {
    const a = n[k] + (lo - n[k]) * .85, b = n[k] + (hi - n[k]) * .85;
    return n[k] - a >= CAL_MIN[k] * .85 && b - n[k] >= CAL_MIN[k] * .85 ? [a, n[k], b] : null;
  };
  return {x: ax('x', s.kiri.x, s.kanan.x), y: ax('y', s.atas.y, s.bawah.y), z: ax('z', s.depan.z, s.belakang.z)};
}
// Nilai mentah -> 0..1 sepotong-sepotong: ujung bawah 0, netral 0,5, ujung atas 1.
export const seg = (v, [lo, mid, hi]) => v < mid ? clamp(.5 - .5 * (mid - v) / (mid - lo)) : clamp(.5 + .5 * (v - mid) / (hi - mid));
// Backhand: bat di sisi badan yang berlawanan dengan tangan pemukul, dilihat dari pemain itu sendiri.
// prev = hasil frame sebelumnya; ambang ganda (histeresis) supaya bat tidak berkedip saat di tengah badan.
export function backhand(side, x, hand, prev = false) {
  const px = (side === 'h' ? 1 : -1) * (hand === 'L' ? -1 : 1) * x; // + = sisi tangan pemukul (m)
  return prev ? px < .01 : px < -.11;
}
export const won = S => Math.max(S.sl, S.sr) >= S.win && Math.abs(S.sl - S.sr) >= 2; // selisih minimal 2

export function nextServe(S) {
  const tot = S.sl + S.sr, deuce = Math.min(S.sl, S.sr) >= S.win - 1;
  S.srv = S.mode === 'latihan' ? 'g' : (deuce ? tot : tot >> 1) % 2 === 0 ? 'h' : 'g'; // ganti server tiap 2 poin, tiap poin saat deuce
  S.ph = 'serve'; S.t = S.mode === 'latihan' ? .9 : 1.5; S.last = null; S.bn = 0; S.rally = 0; S.w = 0; S.ws = 0; S.cord = false; S.shot = '';
  S.toss = false; S.hold = false; S.lowToss = false; S.sv = false; S.sb = 0;
  S.bx = 0; S.by = TOSS_Y; S.bz = S.srv === 'h' ? SERVE_Z : -SERVE_Z; S.vx = S.vy = S.vz = 0; // servis dari belakang garis ujung meja
  S.near = {h: null, g: null};
}

export function startRound(S, win, ts) {
  S.sl = S.sr = 0; S.win = win; S.ts = ts; S.best = S.dur = 0; S.paused = false; S.miss = null; S.why = '';
  nextServe(S);
}

// Lemparan servis. hand = dilempar tangan pemain (bukan otomatis). Aturan: bola naik minimal 16 cm.
// Lemparan tangan di bawah itu hanya salah di setelan realistis; di setelan lain kecepatannya dinaikkan agar tetap bisa dipukul.
export const TOSS_MIN = .16;
export function toss(S, vy, hand = false) {
  const strict = (S.srv === 'h' ? S.err : S.errG) >= 1;
  S.vy = hand ? clamp(vy, strict ? 1.2 : 1.9, 3.6) : vy;
  S.toss = true; S.hold = false; S.lowToss = hand && S.vy * S.vy / (2 * G) < TOSS_MIN;
}
// Gerak melempar dari riwayat tinggi tangan bebas [{t (s), y (m)}], terbaru di akhir.
// Lempar = tangan sempat diam (rentang < 6 cm selama 0,25 s) lalu naik cepat (> 0,9 m/s rata-rata dalam ~0,1 s).
// Hasil: kecepatan lempar (m/s) atau 0. Hanya kecepatan naik yang dipakai, jadi tangan boleh keluar gambar sesudahnya.
export function tossDetect(H) {
  if (H.length < 4) return 0;
  const now = H[H.length - 1], base = H.filter(p => now.t - p.t <= .12);
  const a = base[0];
  if (!a || now.t - a.t < .05) return 0;
  const v = (now.y - a.y) / (now.t - a.t);
  if (v < .9) return 0;
  const still = H.filter(p => a.t - p.t > 0 && a.t - p.t <= .3);
  if (still.length < 3 || a.t - still[0].t < .2) return 0;
  const ys = still.map(p => p.y);
  if (Math.max(...ys) - Math.min(...ys) > .06) return 0;
  return v * 1.4; // bola lepas lebih cepat dari rata-rata gerak tangan
}

// Pukulan berbantuan: cari waktu terbang t agar bola mendarat di titik target meja lawan dan melewati net.
// Spin dimodelkan sebagai gravitasi efektif G + SPIN_G*w, dan pemecah ini memakai nilai yang sama, jadi bola tetap mendarat di target.
// Jenis pukulan sengaja: lob = bat jauh di belakang + ayun ke atas (bola tinggi dan dalam);
// drop = sentuhan sangat pelan dengan bat dekat meja (bola pendek, backspin, memantul dua kali bila tidak dikejar).
export function shotType(S, bat, swing, smash) {
  if (smash) return 'smash';
  if (S.ph !== 'play') return '';
  const bz = Math.abs(bat.z);
  if (bz >= 1.7 && (swing.vy || 0) > .5) return 'lob';
  if (bz <= 1.25 && swing.s < .5) return 'drop';
  return '';
}
// Servis sah: memantul dulu di meja sendiri, lalu melewati net dan memantul di meja lawan.
// Pantulan membuat rumus tertutup rumit, jadi kandidat (titik pantul pertama x waktu terbang) disimulasikan dengan move()
// yang sama dengan permainan, lalu dipilih yang sah dan paling dekat ke target. Deterministik.
function serveSolve(S, side, w, ws, x2, z2) {
  const own = side === 'h' ? 1 : -1, g = grav(w), ax = SIDE_G * ws;
  let best = null;
  for (const f of [.3, .4, .5, .6, .7, .8]) for (let t1 = .1; t1 <= .62; t1 += .04) {
    const z1 = own * f * TL / 2, x1 = S.bx + (x2 - S.bx) * .35;
    const v = {vx: (x1 - S.bx - .5 * ax * t1 * t1) / t1, vy: (TY + BR - S.by + .5 * g * t1 * t1) / t1, vz: (z1 - S.bz) / t1};
    const B = {bx: S.bx, by: S.by, bz: S.bz, ...v, w, ws, cord: false};
    let n = 0, land = null;
    for (let i = 0; i < 720 && !land; i++) {
      const ev = move(B, 1 / 240);
      if (ev === 'net' || ev === 'cord' || B.by < TY - .1) break;
      if (ev === 'bounce' || ev === 'edge') { if (++n === 1 ? Math.sign(B.bz) !== own : true) land = n === 1 ? 'bad' : {x: B.bx, z: B.bz}; }
    }
    if (!land || land === 'bad' || Math.sign(land.z) === own || Math.abs(land.x) > TW / 2 - .06 || Math.abs(land.z) > TL / 2 - .06) continue;
    const cost = Math.abs(land.z - z2) + .5 * Math.abs(land.x - x2);
    if (!best || cost < best.cost) best = {cost, v};
  }
  return best && {...best.v, ws};
}
// q: kualitas kontak dari reach() {dx, dy, along}; tanpa q = kontak sempurna.
export function launch(S, side, bat, swing, q) {
  const dir = side === 'h' ? -1 : 1, s = clamp(swing.s / 3), pn = clamp((bat.p || 0) / .6, -1, 1), ps = side === 'h' ? 1 : -1;
  const smash = S.ph === 'play' && swing.s >= SMASH_SPEED && S.by > NET_TOP + .12, shot = shotType(S, bat, swing, smash);
  const w = shot === 'smash' ? .3 : shot === 'lob' ? .1 : shot === 'drop' ? -.9
    : clamp(clamp((swing.vy || 0) / 2.5, -1, 1) + .35 * pn, -1, 1) * (S.ph === 'serve' ? .5 : 1); // ayun ke atas atau bilah menutup = topspin; bilah membuka = backspin
  const ws = clamp((swing.vx || 0) / 3, -1, 1) * (S.ph === 'serve' ? .3 : .6); // ayunan menyamping = sidespin: bola membelok ke arah ayunan
  // e > 0: ayunan sangat keras dan arah ekstrem boleh melewati garis meja (bantuan penuh menjaga semuanya di dalam)
  const e = side === 'h' ? S.err : S.errG, wIn = S.ph === 'play' ? S.w : 0, sr = swing.s / 3;
  const depth = .45 + .7 * Math.min(sr, 1) + .5 * clamp(sr - 1.3, 0, .8 * e) - .15 * pn; // memanjang hanya untuk ayunan > 3,9 m/s
  const zt = dir * (shot === 'smash' ? 1.15 : shot === 'lob' ? 1.05 : shot === 'drop' ? .32 : clamp(depth, .3, 1.25 + .5 * e)); // bilah menutup = lebih pendek dan datar, membuka = lebih dalam
  const aim = .5 * bat.x + .35 * clamp(bat.r / 1.05, -1, 1) - (S.bx - bat.x) * 1.5;
  const xt = clamp(aim, -.62 - .3 * e, .62 + .3 * e);
  const g = grav(w), ax = SIDE_G * ws;
  let t = shot === 'smash' ? .28 : shot === 'lob' ? 1.15 : shot === 'drop' ? .7 : (S.ph === 'serve' ? .42 : .6 - .25 * s) * (1 - .3 * pn), vx, vy, vz; // servis: lintasan rendah
  const z2 = dir * clamp(.5 + .65 * s - .15 * pn, .4, 1.2), sv = S.ph === 'serve' && !S.arcade && (serveSolve(S, side, w, ws, xt, z2) || serveSolve(S, side, w, ws, xt * .4, z2) || serveSolve(S, side, w, 0, 0, z2)); // sudut tak terjangkau: geser ke tengah, lalu buang sidespin
  if (sv) ({vx, vy, vz} = sv);
  else for (; t <= 2.6; t += .05) {
    vx = (xt - S.bx - .5 * ax * t * t) / t; vz = (zt - S.bz) / t; vy = (TY + BR - S.by + .5 * g * t * t) / t;
    const tn = -S.bz / vz;
    if (tn > 0 && S.by + vy * tn - .5 * g * tn * tn > NET_TOP + BR + .04) break;
  }
  // Galat pukulan: ditentukan kualitas kontak dan spin yang datang, bukan acak, jadi bisa dipelajari dan sama di kedua laptop duel.
  // Bola di bawah tengah bat (bat menutup bola) = rendah, ke net. Bola di atas = melambung, panjang. Di samping = melebar.
  // Ayunan keras memperbesar kontak yang buruk. Ayunan keras pada bola yang tidak tinggi: bilah menutup = net, membuka = panjang.
  // Spin yang datang: topspin yang tidak dilawan memantul naik dan panjang, backspin turun ke net. Dilawan dengan bilah
  // (menutup untuk topspin, membuka untuk backspin) atau arah ayunan (ke atas mengangkat backspin, datar/turun meredam topspin).
  // Timing tidak dipakai: pukulan terjadi otomatis di frame pertama bola terjangkau, jadi 'along' hampir selalu sama.
  let cause = Math.abs(aim) > .7 && e ? 'sudut' : depth > 1.32 && e && !shot ? 'keras' : '';
  if (e && q && shot !== 'drop') {
    const sweet = .5 * HIT, off = v => Math.sign(v) * Math.max(0, Math.abs(v) - sweet) / (HIT - sweet); // 0 di sweet spot, +-1 di tepi bat
    const ox = clamp(off(q.dx), -1, 1), oy = clamp(off(q.dy), -1, 1), pw = .7 + .3 * Math.min(sr, 1.5);
    const cnt = .8 * pn - .8 * clamp((swing.vy || 0) / 2.5, -1, 1); // + melawan topspin, - melawan backspin
    const mis = Math.sign(wIn) * Math.max(0, Math.abs(wIn) - .3 - Math.max(0, Math.sign(wIn) * cnt)); // sisa spin yang tidak dilawan; spin ringan teredam pukulan biasa
    let dvy = 1.3 * oy * pw + 1.2 * mis, kz = 1 + .12 * oy * pw + .1 * mis;
    const hard = swing.s >= SMASH_SPEED + 1 && !smash; // ayunan keras sekali pada bola yang tidak tinggi
    if (hard) { dvy += pn > .2 || pn < -.2 ? -.9 * pn : 0; kz += .06 + (pn < -.2 ? -.1 * pn : 0); }
    vy += e * dvy; vz *= 1 + e * (kz - 1); vx += e * 2.6 * ox * pw * ps;
    const parts = [[Math.abs(1.3 * oy * pw), oy < 0 ? 'atas' : 'bawah'], [Math.abs(1.5 * ox * pw), 'samping'], [Math.abs(1.2 * mis), mis > 0 ? 'topspin' : 'backspin'], [hard ? .9 : 0, 'keras']];
    const big = parts.reduce((a, b) => b[0] > a[0] ? b : a, [.25, cause]);
    cause = big[1];
  }
  S.cause = cause;
  S.vx = vx; S.vy = vy; S.vz = vz; S.w = w; S.ws = sv ? sv.ws : ws; S.tx = xt; S.tz = sv ? z2 : zt; S.shot = shot;
  return smash;
}

// Pukulan diterima: dipakai oleh tryHit lokal dan oleh host saat menerima pukulan tamu.
export function applyHit(S, side, bat, swing, q) {
  S.sv = S.ph === 'serve' && !S.arcade; S.sb = 0; // servis: pantulan pertama harus di meja sendiri (arkade: langsung ke meja lawan)
  const smash = launch(S, side, bat, swing, q);
  S.cord = false; S.last = side; S.bn = 0; S.ph = 'play'; S.hits++; S.rally++; S.best = Math.max(S.best, S.rally);
  if (smash) S.smashes++;
  S.near = {h: null, g: null};
  return smash;
}

// Jarak bola ke bat, dibandingkan di garis pandang pemain: yang terlihat berimpit = kena.
export function reach(S, side) {
  const b = batOf(S, side), s = side === 'h' ? 1 : -1;
  const along = (S.bz - b.z) * s; // > 0: bola sudah melewati bat ke arah pemain
  const ex = s * (side === 'h' ? S.hex : S.gex), ey = EYE_Y + (side === 'h' ? S.hey : S.gey); // mata ikut kepala pemain
  const k = (S.bz - s * EYE_Z) / (b.z - s * EYE_Z);
  const dx = S.bx - ex - (b.x - ex) * k, dy = S.by - ey - (b.y - ey) * k;
  return {along, d: Math.hypot(dx, dy), dx: dx * s, dy}; // dx dalam arah layar pemain itu: + = bola di kanan bat
}

export function canHit(S, side) {
  if (S.last === side) return false;
  if (S.ph === 'serve') return S.srv === side && (S.arcade ? S.t <= 0 : S.toss && S.vy < 0); // servis dipukul saat bola lemparan turun (arkade: bola diam)
  if (S.ph !== 'play') return false;
  if (S.mode === 'latihan' && side === 'g') return false; // mesin bola hanya melempar
  return (S.bn >= 1 || S.arcade) && (side === 'h' ? S.bz >= .4 : S.bz <= -.4); // bola harus sudah memantul di meja sendiri (tanpa volley; arkade boleh)
}

// opt.swing(side) -> {s: kecepatan ayun m/s, vy: kecepatan tegak bat m/s}; opt.remote(side) = true bila pukulan sisi itu dinilai di laptop lain
export function tryHit(S, side, opt) {
  if (!canHit(S, side)) return false;
  const r = reach(S, side);
  if (r.along < -.2 || r.along > .45) return false; // kedalaman dari satu kamera kasar, jadi toleransinya longgar
  // near-miss dicatat juga untuk sisi jarak jauh, supaya petunjuk meleset tamu tetap benar
  if (S.ph === 'play') { const n = S.near[side]; if (!n || r.d < n.d) S.near[side] = {d: r.d, dx: r.dx, dy: r.dy}; }
  if (r.d > HIT || (opt.remote && opt.remote(side))) return false;
  const smash = applyHit(S, side, batOf(S, side), opt.swing(side), r);
  if (opt.onHit) opt.onHit(side, r, smash);
  return true;
}

// why: 'serve' (servis tidak memantul dulu di meja sendiri) | 'toss' (lemparan servis tidak terpukul) | 'lowtoss' (lemparan < 16 cm) | 'net' (nyangkut net) | 'own' (memantul di meja sendiri) | 'out' (keluar panjang tanpa memantul) | 'wide' (keluar ke samping)
//      | 'miss' (penerima gagal mengembalikan) | 'let' (servis menyentuh net lalu masuk: diulang tanpa poin)
export function endPoint(S, loser, why) {
  S.pw = other(loser);
  if (S.pw === 'h') S.sl++; else S.sr++;
  S.why = why; S.miss = why === 'miss' ? {side: loser, ...(S.near[loser] || {d: 9, dx: 0, dy: 0})} : null;
  S.ph = 'point'; S.t = S.mode === 'latihan' ? .8 : 1.3; S.vx = S.vy = S.vz = 0;
}

function letServe(S) {
  S.why = 'let'; S.miss = null; S.lets++;
  S.ph = 'point'; S.t = 1; S.vx = S.vy = S.vz = 0;
}

function bounce(B, edge) {
  B.by = TY + BR; B.vy = -B.vy * (edge ? .2 : .88 * (1 - .12 * B.w)); // topspin: pantulan rendah dan melesat; tepi meja: hampir tidak memantul
  B.vx = B.vx * .98 + .6 * (B.ws || 0); B.vz *= (edge ? 1.05 : .98) * (1 + .12 * B.w); B.w *= .5; B.ws = (B.ws || 0) * .5; // sidespin menendang ke samping
}
const onTable = B => B.vy < 0 && B.by <= TY + BR && B.by > TY - .05 && Math.abs(B.bx) <= TW / 2 && Math.abs(B.bz) <= TL / 2;

// Satu langkah gerak bola, dipakai simulasi (sub) dan prediksi tamu (fly) supaya keduanya sama persis.
// Hasil: 'net' (masuk jaring) | 'cord' (menyerempet pita net, lanjut lebih pelan) | 'bounce' | 'edge' (tepi meja) | ''
function move(B, dt) {
  const pz = B.bz;
  B.vy -= grav(B.w) * dt; B.vx += SIDE_G * (B.ws || 0) * dt;
  B.bx += B.vx * dt; B.by += B.vy * dt; B.bz += B.vz * dt;
  if ((pz > 0) !== (B.bz > 0) && Math.abs(B.bx) < TW / 2 + .15) {
    const h = B.by - NET_TOP;
    if (h < -.3 * BR || B.cord) return 'net'; // sentuhan net kedua: bola jatuh di jaring
    if (h < BR) { // pita net: serempetan tipis = lanjut pelan, serempetan tebal = memantul balik ke sisi pemukul
      const f = (h + .3 * BR) / (1.3 * BR);
      B.vz *= -.25 + .95 * f; B.vx *= .7; B.vy = Math.abs(B.vy) * .2 + .5 + .6 * (1 - f);
      B.cord = true; return 'cord';
    }
  }
  if (onTable(B)) { const edge = Math.abs(B.bx) > TW / 2 - EDGE || Math.abs(B.bz) > TL / 2 - EDGE; bounce(B, edge); return edge ? 'edge' : 'bounce'; }
  return '';
}

function sub(S, dt, opt) {
  const ev = move(S, dt);
  if (ev === 'net') return endPoint(S, S.last, 'net');
  if (ev === 'cord') S.cords++;
  if (ev === 'bounce' || ev === 'edge') {
    const side = S.bz > 0 ? 'h' : 'g';
    if (S.sv && !S.sb) { // pantulan pertama servis harus di meja sendiri
      if (side !== S.last) return endPoint(S, S.last, 'serve');
      S.sb = 1; S.bounces++; return;
    }
    if (side === S.last) return endPoint(S, S.last, S.cord ? 'net' : 'own'); // serempet net lalu jatuh kembali = kalah di net
    if (S.cord && S.sv && S.bn === 0) return letServe(S);
    if (++S.bn >= 2) return endPoint(S, side, 'miss');
    S.bounces++; if (ev === 'edge') S.edges++;
  }
  if (S.by <= BR || Math.abs(S.bz) > 4 || Math.abs(S.bx) > 3) {
    if (S.bn >= 1) return endPoint(S, other(S.last), 'miss');
    return endPoint(S, S.last, Math.abs(S.bx) - TW / 2 > Math.abs(S.bz) - TL / 2 ? 'wide' : 'out'); // lewat meja tanpa mantul = salah pukul
  }
  if (!tryHit(S, 'h', opt)) tryHit(S, 'g', opt);
}

export function step(S, dt, opt) {
  if (S.ph !== 'over') S.dur += dt;
  if (S.ph === 'serve') {
    S.t -= dt;
    if (S.arcade) { if (S.t <= 0) tryHit(S, S.srv, opt); return; } // arkade: bola diam, dipukul begitu bat menyentuhnya
    if (!S.toss) { if (S.t <= 0 && (!S.hold || S.t < -5)) toss(S, TOSS_V); return; } // jeda dulu, lalu dilempar; tangan pemain ditunggu paling lama 5 s
    const h = dt / S.ts, vy0 = S.vy; S.vy -= G * h; S.by += S.vy * h;
    if (S.lowToss && vy0 >= 0 && S.vy < 0) return endPoint(S, S.srv, 'lowtoss'); // lemparan tangan terlalu rendah (realistis)
    if (S.vy < 0) tryHit(S, S.srv, opt);
    const far = opt.remote && opt.remote(S.srv); // servis tamu dinilai di laptop tamu: beri waktu pukulannya sampai, jangan beri poin
    if (S.ph === 'serve' && S.by < (far ? TY - .35 : TY + .02)) { // lemparan jatuh tanpa terpukul
      if (!far && (S.err >= 1 && S.srv === 'h' || S.errG >= 1 && S.srv === 'g')) return endPoint(S, S.srv, 'toss'); // realistis: poin hilang
      S.toss = false; S.by = TOSS_Y; S.vy = 0; S.t = .6; // berbantuan: lempar ulang
    }
  } else if (S.ph === 'play') {
    for (let i = 0; i < 4 && S.ph === 'play'; i++) sub(S, dt / 4 / S.ts, opt); // pelan = waktu bola dilambatkan, bentuk lintasan tetap
  } else if (S.ph === 'point') {
    S.t -= dt;
    if (S.t <= 0) {
      if (S.mode !== 'latihan' && won(S)) S.ph = 'over';
      else nextServe(S);
    }
  }
}

// Gerak bola tanpa aturan skor dan tanpa pukulan: prediksi tampilan di laptop tamu.
export function fly(B, dt) {
  for (let i = 0; i < 4; i++) {
    const h = dt / 4;
    if (move(B, h) === 'net') { B.vz = 0; B.vx = 0; } // prediksi saja: bola berhenti di jaring, host yang memutuskan poinnya
  }
}

// Titik telapak di gambar -> titik layar (NDC) -> sinar dari mata -> bidang z bat (sisi 'h').
// Kedalaman menggeser bat sepanjang sinar, jadi derau z tidak menggoyang posisi bat di layar.
export function handToBat(mx, my, mz, aspect) {
  const tan = Math.tan(FOV * Math.PI / 360), n = Math.hypot(EYE_Y - LOOK_Y, EYE_Z - LOOK_Z);
  const fy = -(EYE_Y - LOOK_Y) / n, fz = -(EYE_Z - LOOK_Z) / n;
  const nx = mx * .85 * tan * Math.min(aspect, 16 / 9), ny = lerp(-.95, .35, my) * tan;
  const z = 1.9 - .9 * mz, k = (z - EYE_Z) / (fz + fy * ny); // sumbu atas kamera = (0, -fz, fy)
  return {x: nx * k, y: EYE_Y + (fy - fz * ny) * k, z};
}
// Kebalikan untuk mouse/sentuh: titik layar (NDC) -> nilai tangan, supaya bat tepat di bawah kursor.
export const ndcToHand = (nx, ny, aspect) => ({x: nx * aspect / (.85 * Math.min(aspect, 16 / 9)), y: (ny + .95) / 1.3});
