// Simulasi pertandingan tanpa layar: bot pemain vs komputer, deterministik dengan seed. Dipakai tes dan penyetelan.
import {newState, startRound, step, clamp} from '../js/physics.js';
import {Cpu, intercept, aimBat} from '../js/cpu.js';

export const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

// Bot pemain sisi 'h': skill 0..1 menentukan reaksi, galat tebakan, dan kecepatan.
export class Bot {
  constructor(skill, rng) { this.k = skill; this.r = rng; this.seen = -1; this.tgt = null; this.at = 0; this.t = 0; this.v = {x: 0, y: 0, z: 0}; this.corner = 1; this.sw = null; }
  think(S, dt) {
    const r = this.r, k = this.k; this.t += dt;
    if (S.ph === 'serve' && S.srv === 'h') { if (S.toss && S.vy < 0) Object.assign(S, {hx: S.bx, hy: S.by, hz: S.bz}); return; }
    if (S.hits !== this.seen) { this.seen = S.hits; this.tgt = null; this.at = this.t; this.corner = (this.r() < .6 ? -Math.sign(this.corner || 1) : Math.sign(this.r() - .5)) * (.2 + .3 * this.r()); this.sw = null; } // sudut bergantian, lebar acak
    let tgt = {x: .1, y: 1.02, z: 1.45};
    if (S.ph === 'play' && S.last === 'g') {
      if (!this.tgt && this.t - this.at > .28 - .12 * k) {
        const I = intercept(S, 'h');
        if (I) { const sd = (.07 - .045 * k) * (1 + .2 * I.v + .8 * Math.abs(I.w)), b = aimBat(I, clamp(I.z, 1.28, 1.62), 'h'); this.tgt = {x: b.x + gauss(r) * sd, y: clamp(b.y + gauss(r) * sd * .6, .8, 1.4), z: b.z}; }
      }
      if (this.tgt) tgt = this.tgt; else tgt = {x: S.hx, y: S.hy, z: S.hz};
      S.hr = 1.05 * clamp((this.corner - .5 * S.hx) / .35, -1, 1);
    }
    const pos = {x: S.hx, y: S.hy, z: S.hz}, vmax = 1.8 + 1.4 * k, acc = 6 + 6 * k;
    for (const a of ['x', 'y', 'z']) { const want = clamp((tgt[a] - pos[a]) * 7, -vmax, vmax); this.v[a] += clamp(want - this.v[a], -acc * dt, acc * dt); pos[a] += this.v[a] * dt; }
    S.hx = clamp(pos.x, -1, 1); S.hy = clamp(pos.y, .8, 1.4); S.hz = clamp(pos.z, 1, 1.9);
  }
  swing() { const r = this.r; return {s: 1.2 + r() * 1.4, vy: (r() - .5) * 2, vx: (r() - .5)}; }
}

// Main n poin; hasil: poin komputer, poin pemain, dan alasan poin.
export function match(prof, {points = 200, skill = .6, err = .6, seed = 1} = {}) {
  const rng = seeded(seed), cpu = new Cpu(prof, seeded(seed + 99)), bot = new Bot(skill, rng);
  const S = newState(); startRound(S, 9999, 1); S.err = err; S.errG = err;
  const opt = {swing: side => side === 'g' ? cpu.swing(S) : bot.swing(S)};
  const why = {};
  let n = 0;
  for (let i = 0; i < 2e6 && n < points; i++) {
    const before = S.ph;
    bot.think(S, 1 / 60); cpu.think(S, 1 / 60); step(S, 1 / 60, opt);
    if (before !== 'point' && S.ph === 'point' && S.why !== 'let') { n++; const key = (S.pw === 'g' ? 'cpu+' : 'cpu-') + S.why; why[key] = (why[key] || 0) + 1; }
  }
  return {cpu: S.sr, bot: S.sl, share: S.sr / (S.sr + S.sl), why};
}
