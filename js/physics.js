// Fisika dan aturan permainan. Murni: tanpa DOM dan tanpa THREE, supaya bisa diuji dengan `node --test`.
// Satuan meter. Meja panjang di sumbu z, net di z=0. Sisi 'h' (host/pemain) di z>0, sisi 'g' (tamu/komputer) di z<0.
export const TL = 2.74, TW = 1.525, TY = .76, NET_TOP = TY + .1525, BR = .05, G = 9.8, HIT = .26;
export const EYE_Y = 1.55, EYE_Z = 2.6, LOOK_Y = .85, LOOK_Z = -.3, FOV = 65; // kamera pemain, diam; dipakai juga oleh pemetaan tangan
export const SPIN_G = 5; // percepatan tegak tambahan per satuan spin: topspin (+1) menukik, backspin (-1) melayang
export const SMASH_SPEED = 3.2; // m/s ayunan bat; di atas ini bola tinggi dipukul smash
export const PROTO = 4; // versi protokol duel; naikkan bila isi paket berubah

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
    nh: '', ng: '', hh: 'R', gh: 'R', hex: 0, hey: 0, gex: 0, gey: 0, tx: 0, tz: 0, near: {h: null, g: null}
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
  S.ph = 'serve'; S.t = S.mode === 'latihan' ? .9 : 1.5; S.last = null; S.bn = 0; S.rally = 0; S.w = 0;
  S.bx = 0; S.by = .95; S.bz = S.srv === 'h' ? 1.3 : -1.3; S.vx = S.vy = S.vz = 0;
  S.near = {h: null, g: null};
}

export function startRound(S, win, ts) {
  S.sl = S.sr = 0; S.win = win; S.ts = ts; S.best = S.dur = 0; S.paused = false; S.miss = null; S.why = '';
  nextServe(S);
}

// Pukulan berbantuan: cari waktu terbang t agar bola mendarat di titik target meja lawan dan melewati net.
// Spin dimodelkan sebagai gravitasi efektif G + SPIN_G*w, dan pemecah ini memakai nilai yang sama, jadi bola tetap mendarat di target.
export function launch(S, side, bat, swing) {
  const dir = side === 'h' ? -1 : 1, s = clamp(swing.s / 3), pn = clamp((bat.p || 0) / .6, -1, 1);
  const smash = S.ph === 'play' && swing.s >= SMASH_SPEED && S.by > NET_TOP + .12;
  const w = smash ? .3 : clamp(clamp((swing.vy || 0) / 2.5, -1, 1) + .35 * pn, -1, 1) * (S.ph === 'serve' ? .5 : 1); // ayun ke atas atau bilah menutup = topspin; bilah membuka = backspin
  const zt = dir * (smash ? 1.15 : clamp(.45 + .7 * s - .15 * pn, .3, 1.25)); // bilah menutup = lebih pendek dan datar, membuka = lob lebih dalam
  const xt = clamp(.5 * bat.x + .35 * clamp(bat.r / 1.05, -1, 1) - (S.bx - bat.x) * 1.5, -.62, .62);
  const g = grav(w);
  let t = smash ? .28 : (S.ph === 'serve' ? .42 : .6 - .25 * s) * (1 - .3 * pn), vx, vy, vz; // servis: lintasan rendah
  for (; t <= 2.6; t += .05) {
    vx = (xt - S.bx) / t; vz = (zt - S.bz) / t; vy = (TY + BR - S.by + .5 * g * t * t) / t;
    const tn = -S.bz / vz;
    if (tn > 0 && S.by + vy * tn - .5 * g * tn * tn > NET_TOP + BR + .04) break;
  }
  S.vx = vx; S.vy = vy; S.vz = vz; S.w = w; S.tx = xt; S.tz = zt;
  return smash;
}

// Pukulan diterima: dipakai oleh tryHit lokal dan oleh host saat menerima pukulan tamu.
export function applyHit(S, side, bat, swing) {
  const smash = launch(S, side, bat, swing);
  S.last = side; S.bn = 0; S.ph = 'play'; S.hits++; S.rally++; S.best = Math.max(S.best, S.rally);
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
  if (S.ph === 'serve') return S.srv === side && S.t <= 0;
  if (S.ph !== 'play') return false;
  if (S.mode === 'latihan' && side === 'g') return false; // mesin bola hanya melempar
  return side === 'h' ? S.bz >= .4 : S.bz <= -.4; // bola harus di setengah meja sendiri
}

// opt.swing(side) -> {s: kecepatan ayun m/s, vy: kecepatan tegak bat m/s}; opt.remote(side) = true bila pukulan sisi itu dinilai di laptop lain
export function tryHit(S, side, opt) {
  if (!canHit(S, side)) return false;
  const r = reach(S, side);
  if (r.along < -.2 || r.along > .45) return false; // kedalaman dari satu kamera kasar, jadi toleransinya longgar
  // near-miss dicatat juga untuk sisi jarak jauh, supaya petunjuk meleset tamu tetap benar
  if (S.ph === 'play') { const n = S.near[side]; if (!n || r.d < n.d) S.near[side] = {d: r.d, dx: r.dx, dy: r.dy}; }
  if (r.d > HIT || (opt.remote && opt.remote(side))) return false;
  const smash = applyHit(S, side, batOf(S, side), opt.swing(side));
  if (opt.onHit) opt.onHit(side, r, smash);
  return true;
}

// why: 'net' (nyangkut net) | 'own' (memantul di meja sendiri) | 'out' (keluar tanpa memantul) | 'miss' (penerima gagal mengembalikan)
export function endPoint(S, loser, why) {
  S.pw = other(loser);
  if (S.pw === 'h') S.sl++; else S.sr++;
  S.why = why; S.miss = why === 'miss' ? {side: loser, ...(S.near[loser] || {d: 9, dx: 0, dy: 0})} : null;
  S.ph = 'point'; S.t = S.mode === 'latihan' ? .8 : 1.3; S.vx = S.vy = S.vz = 0;
}

function bounce(B) {
  B.by = TY + BR; B.vy = -B.vy * .88 * (1 - .12 * B.w); B.vx *= .98; B.vz *= .98 * (1 + .12 * B.w); B.w *= .5; // topspin: pantulan rendah dan melesat
}
const onTable = B => B.vy < 0 && B.by <= TY + BR && B.by > TY - .05 && Math.abs(B.bx) <= TW / 2 && Math.abs(B.bz) <= TL / 2;

function sub(S, dt, opt) {
  const pz = S.bz;
  S.vy -= grav(S.w) * dt; S.bx += S.vx * dt; S.by += S.vy * dt; S.bz += S.vz * dt;
  if ((pz > 0) !== (S.bz > 0) && S.by < NET_TOP + BR && Math.abs(S.bx) < TW / 2 + .15) return endPoint(S, S.last, 'net');
  if (onTable(S)) {
    const side = S.bz > 0 ? 'h' : 'g';
    if (side === S.last) return endPoint(S, S.last, 'own');
    if (++S.bn >= 2) return endPoint(S, side, 'miss');
    S.bounces++; bounce(S);
  }
  if (S.by <= BR || Math.abs(S.bz) > 4 || Math.abs(S.bx) > 3) {
    return S.bn >= 1 ? endPoint(S, other(S.last), 'miss') : endPoint(S, S.last, 'out'); // lewat meja tanpa mantul = salah pukul
  }
  if (!tryHit(S, 'h', opt)) tryHit(S, 'g', opt);
}

export function step(S, dt, opt) {
  if (S.ph !== 'over') S.dur += dt;
  if (S.ph === 'serve') {
    S.t -= dt;
    if (S.t <= 0) tryHit(S, S.srv, opt); // jeda dulu, supaya servis tidak terpukul sendiri
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
    B.vy -= grav(B.w) * h; B.bx += B.vx * h; B.by += B.vy * h; B.bz += B.vz * h;
    if (onTable(B)) bounce(B);
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
