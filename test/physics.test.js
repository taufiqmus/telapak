import test from 'node:test';
import assert from 'node:assert/strict';
import {newState, nextServe, startRound, step, applyHit, tryHit, won, fly, backhand, TY, BR, HIT} from '../js/physics.js';

const blocked = {swing: () => ({s: 1, vy: 0}), remote: () => true}; // tidak ada yang bisa memukul
const run = (S, opt = blocked, max = 2000) => { for (let i = 0; i < max && S.ph === 'play'; i++) step(S, 1 / 120, opt); };

test('server berganti tiap 2 poin, tiap poin saat deuce', () => {
  const S = newState(); startRound(S, 11, 1);
  const seq = [];
  for (const [l, r] of [[0, 0], [1, 0], [1, 1], [2, 1], [10, 10], [11, 10], [11, 11]]) { S.sl = l; S.sr = r; nextServe(S); seq.push(S.srv); }
  assert.deepEqual(seq, ['h', 'h', 'g', 'g', 'h', 'g', 'h']);
});

test('menang butuh selisih 2', () => {
  const S = newState(); S.win = 7;
  for (const [l, r, w] of [[7, 5, true], [7, 6, false], [8, 6, true], [6, 0, false], [12, 10, true]]) { S.sl = l; S.sr = r; assert.equal(won(S), w, `${l}:${r}`); }
});

// Pukulan berbantuan harus selalu melewati net dan mendarat di meja lawan, untuk semua spin, kecepatan, dan sudut bat.
test('launch selalu melewati net dan mendarat di meja lawan', () => {
  let n = 0;
  for (const side of ['h', 'g']) for (const bz of [.5, 1, 1.5]) for (const by of [.85, 1.1, 1.4]) for (const bx of [-.6, 0, .6])
    for (const s of [0, 1.5, 3, 4.5]) for (const vy of [-3, 0, 3]) for (const p of [-.6, 0, .6]) for (const r of [-1, 0, 1]) {
      const k = side === 'h' ? 1 : -1, S = newState();
      Object.assign(S, {ph: 'play', bx, by, bz: k * bz, last: null});
      applyHit(S, side, {x: bx * .8, y: by, z: k * bz, r, p}, {s, vy});
      run(S);
      assert.equal(S.why, 'miss', `${side} bz=${bz} by=${by} bx=${bx} s=${s} vy=${vy} p=${p} r=${r}: ${S.why}`);
      assert.equal(S.pw, side);
      n++;
    }
  assert.ok(n > 3000);
});

test('servis rendah tetap mendarat di meja lawan', () => {
  for (const srv of ['h', 'g']) for (const vy of [-3, 0, 3]) {
    const S = newState(); S.sl = srv === 'h' ? 0 : 2; nextServe(S); assert.equal(S.srv, srv);
    S.t = 0; applyHit(S, srv, {x: 0, y: S.by, z: S.bz, r: 0, p: 0}, {s: 1, vy}); run(S);
    assert.equal(S.why, 'miss'); assert.equal(S.pw, srv);
  }
});

test('smash: bola tinggi + ayunan cepat dihitung smash dan tetap masuk', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1.3, bz: 1});
  assert.equal(applyHit(S, 'h', {x: 0, y: 1.3, z: 1, r: 0, p: 0}, {s: 4, vy: 0}), true);
  assert.equal(S.smashes, 1); run(S); assert.equal(S.why, 'miss');
});

test('bola tanpa dipukul: pantul dua kali di sisi penerima = poin untuk pemukul', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1, bz: 1});
  applyHit(S, 'h', {x: 0, y: 1, z: 1, r: 0, p: 0}, {s: 1, vy: 0}); run(S);
  assert.deepEqual([S.sl, S.sr, S.why, S.miss.side], [1, 0, 'miss', 'g']);
});

test('bola nyangkut net = poin lawan', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: TY + .12, bz: .2, vx: 0, vy: 0, vz: -5, last: 'h'});
  run(S); assert.deepEqual([S.why, S.pw], ['net', 'g']);
});

test('bola keluar tanpa memantul = salah pemukul', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1.3, bz: 1, vx: 0, vy: 1, vz: -9, last: 'h'});
  run(S); assert.deepEqual([S.why, S.pw], ['out', 'g']);
});

test('memantul di meja sendiri = poin lawan', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1, bz: 1, vx: 0, vy: -1, vz: -.5, last: 'h'});
  run(S); assert.deepEqual([S.why, S.pw], ['own', 'g']);
});

test('pukulan kena bila bat menutupi bola, meleset dicatat sebagai near-miss', () => {
  const swing = {swing: () => ({s: 1, vy: 0})};
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1, bz: 1.5, last: 'g', hx: 0, hy: 1, hz: 1.5});
  assert.equal(tryHit(S, 'h', swing), true);
  const M = newState(); Object.assign(M, {ph: 'play', bx: 0, by: 1, bz: 1.5, last: 'g', hx: .5, hy: 1, hz: 1.5});
  assert.equal(tryHit(M, 'h', swing), false);
  assert.ok(M.near.h.d > HIT && M.near.h.dx < 0, 'bola di kiri bat');
});

test('fly: prediksi tamu sama dengan simulasi host sampai pantulan pertama', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: .1, by: 1, bz: 1});
  applyHit(S, 'h', {x: .1, y: 1, z: 1, r: 0, p: 0}, {s: 2, vy: 2});
  const B = {bx: S.bx, by: S.by, bz: S.bz, vx: S.vx, vy: S.vy, vz: S.vz, w: S.w};
  for (let i = 0; i < 30; i++) { step(S, 1 / 60, blocked); fly(B, 1 / 60); }
  assert.ok(Math.hypot(S.bx - B.bx, S.by - B.by, S.bz - B.bz) < 1e-9);
  assert.ok(B.by >= TY + BR - 1e-9 || Math.abs(B.bz) > 1.37);
});

test('mode latihan: mesin selalu servis, tidak pernah selesai', () => {
  const S = newState(); S.mode = 'latihan'; startRound(S, 7, 1);
  for (let i = 0; i < 20; i++) { S.sl = i; S.ph = 'point'; S.t = 0; step(S, .01, blocked); assert.equal(S.srv, 'g'); assert.equal(S.ph, 'serve'); }
});

test('ndcToHand: bat tepat di bawah kursor', async () => {
  const {handToBat, ndcToHand, EYE_Y, EYE_Z, LOOK_Y, LOOK_Z, FOV} = await import('../js/physics.js');
  const tan = Math.tan(FOV * Math.PI / 360), n = Math.hypot(EYE_Y - LOOK_Y, EYE_Z - LOOK_Z);
  const f = [0, (LOOK_Y - EYE_Y) / n, (LOOK_Z - EYE_Z) / n], up = [0, -f[2], f[1]];
  for (const aspect of [1.2, 16 / 9, 2.4]) for (const nx of [-.8, 0, .5]) for (const ny of [-.7, 0, .4]) for (const mz of [0, .5, 1]) {
    const h = ndcToHand(nx, ny, aspect), b = handToBat(h.x, h.y, mz, aspect);
    const d = [b.x, b.y - EYE_Y, b.z - EYE_Z], fwd = d[1] * f[1] + d[2] * f[2];
    assert.ok(Math.abs(b.x / fwd / (tan * aspect) - nx) < 1e-9 && Math.abs((d[1] * up[1] + d[2] * up[2]) / fwd / tan - ny) < 1e-9);
  }
});

test('sisi jarak jauh tidak dipukul lokal, tapi near-miss-nya tetap dicatat', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1, bz: -1.5, last: 'h', gx: .4, gy: 1, gz: -1.5});
  assert.equal(tryHit(S, 'g', {swing: () => ({s: 1, vy: 0}), remote: s => s === 'g'}), false);
  assert.ok(S.near.g && S.near.g.d > 0);
  S.gx = 0; assert.equal(tryHit(S, 'g', {swing: () => ({s: 1, vy: 0}), remote: s => s === 'g'}), false);
  assert.equal(S.hits, 0);
});

test('forehand/backhand menurut tangan, sisi, dan histeresis', () => {
  assert.equal(backhand('h', .3, 'R'), false); assert.equal(backhand('h', -.3, 'R'), true);
  assert.equal(backhand('h', .3, 'L'), true); assert.equal(backhand('h', -.3, 'L'), false);
  assert.equal(backhand('g', .3, 'R'), true); assert.equal(backhand('g', -.3, 'R'), false); // tamu menghadap +z: kanannya di -x
  assert.equal(backhand('h', -.08, 'R', false), false); assert.equal(backhand('h', -.08, 'R', true), true); // di pita tengah: tetap seperti sebelumnya
});
