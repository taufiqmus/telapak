// Lawan komputer. Gaya bermain = data: kecepatan gerak (mv, m/s), galat bidik (err), kecenderungan spin, rentang kekuatan, peluang smash.
import {clamp, NET_TOP} from './physics.js';

export const LAWAN = [
  {id: 'rina', nama: 'Rina', gaya: 'Si tembok: sabar, jarang menyerang', mv: 1.5, err: 2.2, spin: .1, power: [.4, 1.2], smash: 0},
  {id: 'bayu', nama: 'Bayu', gaya: 'Si pemutar: topspin dan backspin', mv: 2, err: 1.6, spin: .9, power: [.8, 1.8], smash: .1},
  {id: 'sari', nama: 'Sari', gaya: 'Si penyerang: keras dan dalam', mv: 2.6, err: 1.2, spin: .4, power: [1.6, 3], smash: .6},
  {id: 'dimas', nama: 'Dimas', gaya: 'Si cepat: menjangkau semua bola', mv: 3.4, err: .9, spin: .5, power: [1, 2.6], smash: .3},
  {id: 'juara', nama: 'Pak Juara', gaya: 'Juara kampung: semua bisa', mv: 4.2, err: .6, spin: .7, power: [1.2, 3], smash: .5}
];
// Tanding cepat: level dari menu (Mudah 1.2, Sedang 2.2, Sulit 4) seperti versi pertama, galat = 3.2 - 0.6 * level.
export const quick = lvl => ({id: 'cepat', nama: 'Komputer', mv: lvl, err: 3.2 - lvl * .6, spin: .4, power: [.6, 2], smash: lvl > 3 ? .3 : .1});
export const MESIN = {id: 'mesin', nama: 'Mesin bola', mv: 0, err: 0, spin: .6, power: [.6, 2.4], smash: 0};

const rnd = (a, b) => a + Math.random() * (b - a);

export class Cpu {
  constructor(prof) { this.p = prof; this.off = [0, 0]; this.seen = -1; this.feedX = 0; }
  // Menggerakkan bat sisi 'g' sebelum langkah fisika.
  think(S, dt) {
    const p = this.p;
    if (S.hits !== this.seen) { // tiap pukulan baru: galat acak baru, makin mudah makin meleset
      this.seen = S.hits;
      this.off = [(Math.random() - .5) * .3 * p.err, (Math.random() - .5) * .2 * p.err];
    }
    if (S.ph === 'serve' && S.srv === 'g') {
      if (!S.toss || S.vy > 0) { this.feedX = null; return; } // tunggu bola lemparan mulai turun
      // bola lemparan turun: bat ke bola; mesin menggeser bat agar arah lemparannya bervariasi
      if (this.feedX === null) this.feedX = p.mv ? 0 : rnd(-.14, .14);
      S.gx = S.bx + this.feedX; S.gy = S.by; S.gz = S.bz; S.gr = 0; S.gp = 0;
      return;
    }
    if (!p.mv) return;
    const chase = S.ph === 'play' && S.last === 'h' && S.bz < .2; // komputer mengejar bola dengan kecepatan terbatas + galat acak
    const tx = chase ? S.bx + this.off[0] : S.bx * .4, ty = chase ? Math.max(S.by + this.off[1], .8) : 1.05;
    const tz = chase ? clamp(S.bz, -1.9, -1) : -1.5, mv = p.mv * dt;
    S.gx = clamp(S.gx + clamp(tx - S.gx, -mv, mv), -.85, .85);
    S.gy = clamp(S.gy + clamp(ty - S.gy, -mv, mv), .8, 1.4);
    S.gz = clamp(S.gz + clamp(tz - S.gz, -mv, mv), -1.9, -1);
  }
  swing(S) {
    const p = this.p;
    if (S.ph === 'play' && S.by > NET_TOP + .15 && Math.random() < p.smash) return {s: 4, vy: 0};
    return {s: rnd(p.power[0], p.power[1]), vy: rnd(-1, 1) * p.spin * 2.5};
  }
}
