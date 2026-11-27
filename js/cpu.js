// Lawan komputer yang bermain seperti manusia: bereaksi terlambat, menebak arah bola dengan galat,
// bergerak dengan percepatan terbatas, kembali ke posisi siap, salah membaca spin, dan goyah saat tertekan.
// Kontak bat-bola, kesalahan, dan aturan tetap lewat fisika yang sama dengan pemain.
//
// Profil:
//   mv: kecepatan gerak maksimum (m/s)        acc: percepatan (m/s²)        react: waktu reaksi (s)
//   noise: galat tebakan titik temu (m)      read: kemampuan membaca spin 0..1
//   bh: pengali galat dan reaksi di backhand risk: seberapa dekat ke garis meja ia membidik (0..1)
//   power: rentang kecepatan ayun (m/s)      spin: kecenderungan memberi spin     smash: peluang smash bola tinggi
//   lob, drop: peluang pukulan sengaja        press: kepekaan terhadap tekanan (reli panjang, poin penentu)
import {clamp, fly, backhand, TY, NET_TOP, EYE_Y, EYE_Z} from './physics.js';

export const LAWAN = [
  {id: 'rina', nama: 'Rina', gaya: 'Si tembok: sabar dan rapi, tapi lambat ke samping', kelemahan: 'Arahkan bola ke sudut bergantian',
    mv: 3, acc: 11, react: .2, noise: .035, read: .85, bh: 1.1, risk: .4, power: [.8, 1.6], spin: .2, smash: 0, lob: .2, drop: 0, press: .5},
  {id: 'bayu', nama: 'Bayu', gaya: 'Si pemutar: topspin dan backspin berat', kelemahan: 'Backhand-nya lemah',
    mv: 3, acc: 11.5, react: .17, noise: .042, read: .7, bh: 1.9, risk: .5, power: [.9, 2], spin: .95, smash: .1, lob: 0, drop: .1, press: 1},
  {id: 'dimas', nama: 'Dimas', gaya: 'Si cepat: menjangkau semua bola', kelemahan: 'Sering salah membaca spin',
    mv: 3, acc: 11, react: .17, noise: .035, read: .35, bh: 1.1, risk: .4, power: [1, 2.6], spin: .5, smash: .3, lob: .05, drop: .05, press: 1},
  {id: 'sari', nama: 'Sari', gaya: 'Si penyerang: keras dan mepet garis', kelemahan: 'Sering memaksa, bola bisa keluar',
    mv: 2, acc: 7.5, react: .22, noise: .04, read: .6, bh: 1.2, risk: 1, power: [1.4, 3.4], spin: .4, smash: .6, lob: 0, drop: 0, press: 1.3},
  {id: 'juara', nama: 'Pak Juara', gaya: 'Juara kampung: semua bisa', kelemahan: 'Goyah di reli panjang dan poin penentu',
    mv: 3.3, acc: 12, react: .15, noise: .03, read: .85, bh: 1.15, risk: .5, power: [1.2, 3], spin: .7, smash: .5, lob: .05, drop: .1, press: 1.4}
];
// Tanding cepat: level dari menu (Mudah 1.2, Sedang 2.2, Sulit 4).
export const quick = lvl => ({id: 'cepat', nama: 'Komputer', kelemahan: '', mv: 2.6 + .2 * lvl, acc: 10 + .5 * lvl, react: .22 - .015 * lvl,
  noise: .05 - .0045 * lvl, read: .2 + .15 * lvl, bh: 1.3, risk: .15 + .12 * lvl, power: [.8, 1.3 + .4 * lvl], spin: .4,
  smash: lvl > 3 ? .3 : .1, lob: .05, drop: .05, press: 1});
export const MESIN = {id: 'mesin', nama: 'Mesin bola', mv: 0, acc: 0, react: 0, noise: 0, read: 0, bh: 1, risk: 0, power: [.6, 2.4], spin: .6, smash: 0, lob: 0, drop: 0, press: 0};

const READY = {x: -.06, y: 1.02, z: -1.45}; // posisi siap komputer (tangan kanan: sedikit ke sisi forehand)

// Titik temu: bola disimulasikan sampai memantul di meja sisi 'side', lalu dicari saat pertama ia berada di jangkauan
// (turun di bawah 1,3 m atau sudah lewat ujung meja). null = bola tidak akan sah sampai (net, keluar).
export function intercept(S, side = 'g') {
  const k = side === 'h' ? 1 : -1, B = {bx: S.bx, by: S.by, bz: S.bz, vx: S.vx, vy: S.vy, vz: S.vz, w: S.w, ws: S.ws, cord: S.cord};
  let bounced = S.last !== side && S.bn >= 1 && Math.sign(S.bz) === k;
  for (let i = 0; i < 400; i++) {
    const vy0 = B.vy; fly(B, 1 / 120);
    if (!bounced && vy0 < 0 && B.vy > 0 && B.by < TY + .15) { if (Math.sign(B.bz) !== k) continue; bounced = true; continue; }
    if (B.by < TY - .2 || Math.abs(B.bz) > 3.2) return null;
    if (bounced && k * B.bz >= 1.05 && (B.vy < 0 && B.by < 1.3 || k * B.bz > 1.55)) return {x: B.bx, y: B.by, z: B.bz, t: (i + 1) / 120, v: Math.hypot(B.vx, B.vz), w: B.w};
  }
  return null;
}

// Kena dinilai di garis pandang pemain (reach): bat di kedalaman z harus menutupi titik bola I di layar,
// jadi posisinya diskalakan terhadap mata, bukan sekadar disamakan dengan x dan y bola.
export function aimBat(I, z, side = 'g', eye = {x: 0, y: 0}) {
  const s = side === 'h' ? 1 : -1, ex = s * eye.x, ey = EYE_Y + eye.y, k = (I.z - s * EYE_Z) / (z - s * EYE_Z);
  return {x: ex + (I.x - ex) / k, y: ey + (I.y - ey) / k, z};
}

const gauss = rng => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());

export class Cpu {
  constructor(prof, rng = Math.random) { this.p = prof; this.rng = rng; this.seen = -1; this.feedX = 0; this.v = {x: 0, y: 0, z: 0}; this.plan = null; this.t = 0; }
  // Menggerakkan bat sisi 'g' sebelum langkah fisika.
  think(S, dt) {
    const p = this.p, r = this.rng;
    this.t += dt;
    if (S.ph === 'serve' && S.srv === 'g') {
      if (S.arcade ? S.t > .05 : !S.toss || S.vy > 0) { this.feedX = null; return; } // tunggu bola lemparan mulai turun (arkade: tunggu giliran)
      // bola lemparan turun: bat ke bola; mesin menggeser bat agar arah lemparannya bervariasi
      if (this.feedX === null) this.feedX = p.mv ? 0 : (r() - .5) * .28;
      S.gx = S.bx + this.feedX; S.gy = S.by; S.gz = S.bz; S.gr = p.mv ? this.aimR(S, S.gx) : 0; S.gp = 0;
      return;
    }
    if (!p.mv) return;
    // bola baru datang dari pemain: rencanakan setelah waktu reaksi
    if (S.hits !== this.seen) {
      this.seen = S.hits;
      this.plan = S.last === 'h' || (S.ph === 'serve' && S.srv === 'h') ? {at: this.t, target: null, shot: '', readN: gauss(r) * (1 - p.read) * .5, side: Math.sign(r() - .5)} : null;
    }
    const pl = this.plan, stress = 1 + p.press * (.035 * Math.max(0, S.rally - 6) + (this.decider(S) ? .25 : 0));
    let tgt = READY;
    if (pl && S.ph === 'play' && S.last === 'h') {
      const bh = backhand('g', S.gx, S.gh, false), slow = bh ? p.bh : 1;
      if (!pl.target && this.t - pl.at >= p.react * slow * stress) {
        const I = intercept(S, 'g');
        if (I) {
          const sd = p.noise * slow * stress * (1 + .2 * I.v + .8 * Math.abs(I.w)); // bola cepat dan berputar lebih sulit ditebak
          pl.shot = I.z < -1.55 && r() < p.lob ? 'lob' : I.z > -1.3 && r() < p.drop ? 'drop' : ''; // hanya bila titik temunya cocok: lob dari jauh, drop dari dekat meja
          const z = pl.shot === 'lob' ? -1.75 : pl.shot === 'drop' ? -1.2 : clamp(I.z, -1.62, -1.28), b = aimBat(I, z, 'g');
          pl.target = {x: b.x + gauss(r) * sd, y: clamp(b.y + gauss(r) * sd * .6, .8, 1.4), z};
        }
      }
      if (pl.target) tgt = pl.target;
      else tgt = {x: S.gx, y: S.gy, z: S.gz}; // belum bereaksi: diam di tempat
      // bidik menjauhi pemain, baca spin lewat sudut bilah
      S.gr = this.aimR(S, S.gx, pl.side);
      S.gp = .6 * clamp(p.read * S.w / .8 + pl.readN, -1, 1);
    }
    this.move(S, tgt, dt); // tanpa bola datang: kembali pelan ke posisi siap
  }
  // gerak dengan kecepatan dan percepatan terbatas (badan manusia), tiap sumbu sendiri
  move(S, tgt, dt) {
    const p = this.p, pos = {x: S.gx, y: S.gy, z: S.gz};
    for (const k of ['x', 'y', 'z']) {
      const vmax = p.mv * (k === 'x' ? 1 : .7), want = clamp((tgt[k] - pos[k]) * 7, -vmax, vmax);
      this.v[k] += clamp(want - this.v[k], -p.acc * dt, p.acc * dt);
      pos[k] += this.v[k] * dt;
    }
    S.gx = clamp(pos.x, -.95, .95); S.gy = clamp(pos.y, .8, 1.4); S.gz = clamp(pos.z, -1.9, -1);
  }
  // roll bat agar bola mendarat menjauhi bat pemain; risk tinggi = lebih dekat garis
  aimR(S, gx, side = 1) {
    const p = this.p, away = Math.abs(S.hx) > .15 ? -Math.sign(S.hx) : side;
    const want = away * (.22 + .45 * p.risk);
    return 1.05 * clamp((want - .5 * gx) / .35, -1, 1);
  }
  decider(S) { return Math.max(S.sl, S.sr) >= S.win - 1; } // poin penentu: salah satu tinggal satu poin
  swing(S) {
    const p = this.p, r = this.rng, pl = this.plan || {};
    if (pl.shot === 'lob') return {s: 1, vy: 1.6, vx: 0};
    if (pl.shot === 'drop') return {s: .3, vy: 0, vx: 0};
    if (S.ph === 'play' && S.by > NET_TOP + .15 && r() < p.smash) return {s: 4, vy: 0, vx: 0};
    let vy = (r() * 2 - 1) * p.spin * 2.5;
    if (Math.abs(S.w) > .2 && r() < p.read) vy = -Math.sign(S.w) * Math.abs(vy); // membaca spin: arah ayunan ikut melawannya
    return {s: p.power[0] + r() * (p.power[1] - p.power[0]), vy, vx: (r() - .5) * p.spin * 2};
  }
}
