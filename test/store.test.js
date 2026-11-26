import test from 'node:test';
import assert from 'node:assert/strict';
import {load, save, add} from '../js/store.js';

const mem = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v))}; };

test('statistik tersimpan, reli maksimum, pencapaian terbuka sekali', () => {
  const ls = mem(), d = load(ls);
  assert.deepEqual(add(d, {pukulan: 1, reli: 4}).map(a => a.id), ['pukul1']);
  assert.deepEqual(add(d, {pukulan: 1, reli: 3}), []);
  assert.equal(d.stats.reli, 4);
  assert.deepEqual(add(d, {reli: 12, menang: 1, bersih: 1}).map(a => a.id), ['reli10', 'menang1', 'bersih']);
  save(d, ls); const e = load(ls);
  assert.equal(e.stats.pukulan, 2); assert.ok(e.ach.reli10);
});

test('data rusak tidak membuat game mogok', () => {
  const ls = mem(); ls.setItem('telapak-v1', '{rusak'); assert.equal(load(ls).stats.main, 0);
});
