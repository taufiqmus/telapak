import test from 'node:test';
import assert from 'node:assert/strict';
import {LAWAN, quick} from '../js/cpu.js';
import {match} from './sim.js';

// Komputer harus bisa dikalahkan dan makin sulit sepanjang karier, dan ikut membuat kesalahan sendiri.
test('komputer: makin sulit sepanjang karier, tetap bisa dikalahkan, dan membuat kesalahan', () => {
  const share = LAWAN.map(p => match(p, {points: 160, skill: .6, err: .6, seed: 3}));
  const s = share.map(m => m.share);
  assert.ok(s[0] < s[2] && s[2] < s[4], 'urutan ' + s.map(v => v.toFixed(2)).join(' '));
  assert.ok(s[0] < .35, 'lawan pertama terlalu kuat ' + s[0]);
  assert.ok(s[4] < .85, 'juara tidak terkalahkan ' + s[4]);
  const own = share.reduce((t, m) => t + (m.why['cpu-out'] || 0) + (m.why['cpu-net'] || 0) + (m.why['cpu-wide'] || 0), 0);
  assert.ok(own > 20, 'komputer hampir tidak pernah salah pukul: ' + own);
});

test('tanding cepat: level sulit lebih kuat dari mudah', () => {
  const a = match(quick(1.2), {points: 150, seed: 5}).share, b = match(quick(4), {points: 150, seed: 5}).share;
  assert.ok(a < b - .2, `mudah ${a.toFixed(2)} sulit ${b.toFixed(2)}`);
});
