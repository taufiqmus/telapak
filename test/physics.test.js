import test from 'node:test';
import assert from 'node:assert/strict';
import {newState, nextServe, startRound, step, applyHit, tryHit, won, fly, backhand, palmPitch, launch, reach, calRange, seg, toss, tossDetect, TY, BR, HIT, TW, NET_TOP} from '../js/physics.js';

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
  for (const srv of ['h', 'g']) for (const vy of [-3, 0, 3]) for (const p of [-.6, 0, .6]) {
    const S = newState(); S.sl = srv === 'h' ? 0 : 2; nextServe(S); assert.equal(S.srv, srv);
    S.t = 0; applyHit(S, srv, {x: 0, y: S.by, z: S.bz, r: 0, p}, {s: 1, vy}); run(S);
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
  const S = newState(); Object.assign(S, {ph: 'play', bn: 1, bx: 0, by: 1, bz: 1.5, last: 'g', hx: 0, hy: 1, hz: 1.5});
  assert.equal(tryHit(S, 'h', swing), true);
  const M = newState(); Object.assign(M, {ph: 'play', bn: 1, bx: 0, by: 1, bz: 1.5, last: 'g', hx: .5, hy: 1, hz: 1.5});
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
  const S = newState(); Object.assign(S, {ph: 'play', bn: 1, bx: 0, by: 1, bz: -1.5, last: 'h', gx: .4, gy: 1, gz: -1.5});
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

test('palmPitch: condong jari ke kamera, tidak terpengaruh roll dan sisi telapak', () => {
  const pt = (x, y, z) => ({x, y, z});
  const W = pt(0, 0, 0), hand = (a, roll, back = false) => { // jari sepanjang 8 cm, condong a rad ke kamera, diputar roll di bidang gambar
    const len = .08, up = len * Math.cos(a), toCam = len * Math.sin(a), sx = Math.sin(roll), sy = Math.cos(roll), w = back ? -.02 : .02;
    const tip = (o) => pt(up * sx + o * sy, -(up * sy) + o * sx, -toCam);
    return [tip(w), tip(-w)]; // telunjuk, kelingking (tukar sisi saat punggung tangan)
  };
  const at = (a, roll, back) => { const [i, k] = hand(a, roll, back); return palmPitch(W, i, k); };
  assert.ok(Math.abs(at(0, 0)) < 1e-9);
  assert.ok(Math.abs(at(.4, 0) - .4) < 1e-9);
  assert.ok(at(-.4, 0) < 0);
  assert.ok(Math.abs(at(.4, 1.05) - .4) < 1e-9);
  assert.ok(Math.abs(at(.4, -1.05, true) - .4) < 1e-9);
});

test('bilah menutup menambah topspin, membuka menambah backspin', () => {
  const spin = p => { const S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1, bz: 1}); launch(S, 'h', {x: 0, y: 1, z: 1, r: 0, p}, {s: 1.5, vy: 0}); return S.w; };
  assert.ok(spin(.6) > .3); assert.equal(spin(0), 0); assert.ok(spin(-.6) < -.3);
});

test('reach: kepala dan bat bergeser bersama = penilaian kena tidak berubah', () => {
  const base = newState(); Object.assign(base, {bx: .1, by: 1.05, bz: 1.2, hx: 0, hy: 1, hz: 1.3});
  const r0 = reach(base, 'h');
  for (const [ox, oy] of [[.3, 0], [-.25, .15], [0, -.2]]) {
    const S = {...base, bx: base.bx + ox, by: base.by + oy, hx: ox, hy: 1 + oy, hex: ox, hey: oy};
    const r = reach(S, 'h'); assert.ok(Math.abs(r.d - r0.d) < 1e-9 && Math.abs(r.dx - r0.dx) < 1e-9);
    const G = {...base, bx: -base.bx - ox, by: base.by + oy, bz: -base.bz, gx: -ox, gy: 1 + oy, gz: -base.hz, gex: ox, gey: oy}; // tamu: kanannya di -x
    assert.ok(Math.abs(reach(G, 'g').d - r0.d) < 1e-9);
  }
});

test('kalibrasi lengkap: rentang pribadi, netral di tengah, sumbu sempit ditolak', () => {
  const n = {x: .55, y: .5, z: 0}, p = (x, y, z) => ({x, y, z});
  const s = {kanan: p(.85, .5, 0), kiri: p(.2, .5, 0), atas: p(.55, .2, 0), bawah: p(.55, .75, 0), depan: p(.55, .5, -.25), belakang: p(.55, .5, .1)};
  const R = calRange(n, s);
  assert.equal(seg(n.x, R.x), .5); assert.equal(seg(n.z, R.z), .5);
  assert.equal(seg(.55 + .3 * .85, R.x), 1); assert.equal(seg(.2, R.x), 0); // ujung yang dijangkau = penuh (sudah lewat batas 85%)
  assert.ok(Math.abs(seg(.55 - .35 * .85 / 2, R.x) - .25) < 1e-9);
  assert.equal(seg(-.25 * .85, R.z), 0); // depan = ujung bawah nilai mentah
  const sempit = calRange(n, {...s, kanan: p(.57, .5, 0), belakang: p(.55, .5, .01)});
  assert.equal(sempit.x, null); assert.equal(sempit.z, null); assert.ok(sempit.y);
});

// kunci yang dikirim host ke prediksi bola tamu (guestSync di main.js)
const guestKeys = S => ({bx: S.bx, by: S.by, bz: S.bz, vx: S.vx, vy: S.vy, vz: S.vz, w: S.w, ws: S.ws, cord: S.cord});

// ---------- dinamika: galat kontak, net cord, let, lob, drop, bola tepi, sidespin ----------
const play = (side = 'h', over = {}) => { const k = side === 'h' ? 1 : -1, S = newState(); Object.assign(S, {ph: 'play', bx: 0, by: 1.05, bz: k * 1.2, last: null}, over); return S; };
const hitAndRun = (S, side, swing, q) => { applyHit(S, side, {x: 0, y: S.by, z: S.bz, r: 0, p: 0}, swing, q); run(S); return S.why; };

test('galat kontak: bola di bawah bat ke net, di atas keluar panjang, di samping melebar; berbantuan tetap masuk', () => {
  const sw = {s: 1.5, vy: 0}, edge = .95 * HIT;
  for (const side of ['h', 'g']) {
    assert.ok(['net', 'own'].includes(hitAndRun(play(side, {err: 1, errG: 1}), side, sw, {dx: 0, dy: -edge, along: .12}))); // terlalu rendah: ke net atau jatuh di meja sendiri
    assert.equal(hitAndRun(play(side, {err: 1, errG: 1}), side, sw, {dx: 0, dy: edge, along: .12}), 'out');
    assert.equal(hitAndRun(play(side, {err: 1, errG: 1}), side, sw, {dx: edge, dy: 0, along: .12}), 'wide');
    assert.equal(hitAndRun(play(side), side, sw, {dx: 0, dy: -edge, along: .12}), 'miss'); // err 0: tetap masuk
    assert.equal(hitAndRun(play(side, {err: 1, errG: 1}), side, sw, {dx: .02, dy: -.03, along: .1}), 'miss'); // sweet spot: masuk
  }
});

test('galat deterministik: masukan sama = lintasan sama (duel tidak berbeda antar laptop)', () => {
  const a = play('h', {err: .6}), b = play('h', {err: .6}), q = {dx: .15, dy: -.12, along: .3};
  applyHit(a, 'h', {x: .1, y: 1, z: 1.2, r: .3, p: .2}, {s: 2, vy: 1, vx: .5}, q);
  applyHit(b, 'h', {x: .1, y: 1, z: 1.2, r: .3, p: .2}, {s: 2, vy: 1, vx: .5}, q);
  assert.deepEqual([a.vx, a.vy, a.vz, a.w, a.ws], [b.vx, b.vy, b.vz, b.w, b.ws]);
});

test('servis menyerempet net lalu masuk = let, skor tetap; serempet lalu balik = net', () => {
  const S = newState(); startRound(S, 7, 1);
  Object.assign(S, {ph: 'play', last: 'h', rally: 1, sv: true, sb: 1, bx: 0, by: NET_TOP + .01, bz: .05, vx: 0, vy: -.2, vz: -3, w: 0});
  run(S); assert.equal(S.why, 'let'); assert.equal(S.sl + S.sr, 0); assert.equal(S.lets, 1); assert.equal(S.cords, 1);
  const R = newState(); Object.assign(R, {ph: 'play', last: 'h', rally: 3, bx: 0, by: NET_TOP - .005, bz: .02, vx: 0, vy: .24, vz: -.4, w: 0}); // serempetan tebal: balik
  run(R); assert.equal(R.cords, 1); assert.equal(R.why, 'net'); assert.equal(R.pw, 'g');
});

test('lob tinggi dan masuk, drop pendek lalu memantul dua kali di meja lawan', () => {
  const L = play('h'); let top = 0;
  applyHit(L, 'h', {x: 0, y: .9, z: 1.8, r: 0, p: 0}, {s: 1, vy: 1.5}); assert.equal(L.shot, 'lob');
  for (let i = 0; i < 2000 && L.ph === 'play'; i++) { step(L, 1 / 120, blocked); top = Math.max(top, L.by); }
  assert.ok(top > 2, 'puncak lob ' + top.toFixed(2)); assert.equal(L.why, 'miss'); assert.equal(L.pw, 'h');
  const D = play('h', {bz: 1.1}); let first = null;
  applyHit(D, 'h', {x: 0, y: 1, z: 1.1, r: 0, p: 0}, {s: .2, vy: 0}); assert.equal(D.shot, 'drop');
  for (let i = 0; i < 2000 && D.ph === 'play'; i++) { step(D, 1 / 120, blocked); if (first === null && D.bn === 1) first = D.bz; }
  assert.ok(first < 0 && first > -.6, 'pantulan pertama ' + first); assert.equal(D.why, 'miss'); assert.equal(D.pw, 'h');
});

test('bola tepi: sah, memantul rendah', () => {
  const S = newState(); Object.assign(S, {ph: 'play', last: 'h', rally: 3, bx: TW / 2 - .006, by: TY + BR + .05, bz: -1, vx: 0, vy: -1, vz: -1, w: 0});
  for (let i = 0; i < 40 && S.edges === 0; i++) step(S, 1 / 240, blocked);
  assert.equal(S.edges, 1); assert.equal(S.bn, 1); assert.ok(S.vy < .5);
});

test('sidespin: bola membelok tapi tetap mendarat, prediksi tamu ikut', () => {
  for (const vx of [-4, 4]) for (const side of ['h', 'g']) {
    const S = play(side); applyHit(S, side, {x: 0, y: 1.05, z: S.bz, r: 0, p: 0}, {s: 1.5, vy: 0, vx}); assert.ok(Math.abs(S.ws) > .3);
    const B = {...S}; run(S); assert.equal(S.why, 'miss', `vx=${vx} ${side}`);
  }
  const S = play('h'); applyHit(S, 'h', {x: 0, y: 1.05, z: 1.2, r: 0, p: 0}, {s: 1.5, vy: 0, vx: 4});
  const B = guestKeys(S);
  for (let i = 0; i < 120 && S.bn === 0 && S.ph === 'play'; i++) { step(S, 1 / 120, blocked); fly(B, 1 / 120); }
  assert.ok(Math.abs(S.bx - B.bx) < 1e-9 && Math.abs(S.bz - B.bz) < 1e-9);
});

test('fly sama dengan simulasi melewati serempetan net', () => {
  const S = newState(); Object.assign(S, {ph: 'play', last: 'h', rally: 3, bx: 0, by: NET_TOP + .06, bz: .3, vx: .2, vy: .2, vz: -3, w: .2});
  const B = guestKeys(S);
  for (let i = 0; i < 200 && S.bn === 0 && S.ph === 'play'; i++) { step(S, 1 / 120, blocked); fly(B, 1 / 120); }
  assert.equal(S.cords, 1); assert.ok(Math.abs(S.bz - B.bz) < 1e-9 && Math.abs(S.by - B.by) < 1e-9);
});

// ---------- servis asli: lempar, pantul di meja sendiri dulu, tanpa volley ----------
test('servis berbantuan selalu sah: pantul di meja sendiri, lalu di meja lawan', () => {
  let n = 0;
  for (const srv of ['h', 'g']) for (const s of [0, 1, 2.5, 4]) for (const vy of [-3, 0, 3]) for (const p of [-.6, 0, .6]) for (const r of [-1, 0, 1]) for (const vx of [-3, 3]) for (const [by, bx] of [[.95, 0], [.8, .2], [1.27, -.2]]) {
    const S = newState(); S.sl = srv === 'h' ? 0 : 2; nextServe(S); Object.assign(S, {toss: true, vy: -1, by});
    const k = srv === 'h' ? 1 : -1;
    applyHit(S, srv, {x: bx, y: S.by, z: S.bz, r, p}, {s, vy, vx});
    let own = 0;
    for (let i = 0; i < 3000 && S.ph === 'play'; i++) { const b = S.bounces; step(S, 1 / 240, blocked); if (S.bounces > b && Math.sign(S.bz) === k) own++; }
    assert.equal(S.why, 'miss', `${srv} s=${s} vy=${vy} p=${p} r=${r} vx=${vx} by=${by} bx=${bx}: ${S.why}`); assert.equal(S.pw, srv); assert.equal(own, 1);
    n++;
  }
  assert.ok(n > 1200);
});

test('servis langsung ke meja lawan = servis tidak sah', () => {
  const S = newState(); Object.assign(S, {ph: 'play', last: 'h', rally: 1, sv: true, sb: 0, bx: 0, by: 1.1, bz: .3, vx: 0, vy: 0, vz: -3, w: 0});
  run(S); assert.equal(S.why, 'serve'); assert.equal(S.pw, 'g');
});

test('lemparan servis: dipukul saat turun; tidak terpukul = lempar ulang (berbantuan) atau poin hilang (realistis)', () => {
  const nobody = {swing: () => ({s: 1, vy: 0}), remote: () => true};
  const A = newState(); startRound(A, 7, 1); A.err = .6;
  for (let i = 0; i < 400; i++) step(A, 1 / 120, nobody);
  assert.equal(A.ph, 'serve'); assert.equal(A.sl + A.sr, 0);
  const away = {swing: () => ({s: 1, vy: 0})}; // bat jauh dari bola, servis dinilai lokal
  const B = newState(); startRound(B, 7, 1); Object.assign(B, {err: 1, hx: 2});
  for (let i = 0; i < 400 && B.ph === 'serve'; i++) step(B, 1 / 120, away);
  assert.equal(B.why, 'toss'); assert.equal(B.pw, 'g');
  const G = newState(); startRound(G, 7, 1); G.err = 1; // servis tamu: host tidak memberi poin lemparan
  for (let i = 0; i < 400; i++) step(G, 1 / 120, nobody);
  assert.equal(G.ph, 'serve'); assert.equal(G.sl + G.sr, 0);
  const C = newState(); startRound(C, 7, 1); let rising = false;
  const hitter = {swing: () => ({s: 1.5, vy: 0}), onHit: () => { rising = C.vy > 0 && C.ph === 'serve'; }};
  for (let i = 0; i < 400 && C.ph === 'serve'; i++) { Object.assign(C, {hx: C.bx, hy: C.by, hz: C.bz}); step(C, 1 / 120, hitter); }
  assert.equal(C.ph, 'play'); assert.equal(C.sv, true); assert.equal(rising, false);
});

test('tanpa volley: bola belum memantul di meja sendiri tidak bisa dipukul', () => {
  const S = newState(); Object.assign(S, {ph: 'play', bn: 0, bx: 0, by: 1, bz: 1.2, last: 'g', hx: 0, hy: 1, hz: 1.2});
  assert.equal(tryHit(S, 'h', {swing: () => ({s: 1, vy: 0})}), false);
  S.bn = 1; assert.equal(tryHit(S, 'h', {swing: () => ({s: 1, vy: 0})}), true);
});

// ---------- realisme: tingkat galat dan spin yang datang ----------
test('tingkat galat: penuh 0%, normal sesekali, realistis 20-30% dengan keluar panjang terbanyak', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const rate = err => {
    seed = 7; const out = {};
    for (let i = 0; i < 1500; i++) {
      const S = newState(); Object.assign(S, {ph: 'play', rally: 3, bx: (rnd() - .5) * .8, by: .9 + rnd() * .35, bz: 1.1 + rnd() * .4, w: gauss() * .35, err});
      const q = {dx: gauss() * .45 * HIT, dy: gauss() * .45 * HIT, along: -.2};
      applyHit(S, 'h', {x: S.bx - q.dx, y: S.by - q.dy, z: 1.45, r: gauss() * .5, p: 0}, {s: Math.abs(1.6 + gauss() * 1.1), vy: gauss() * 1.2, vx: gauss()}, q);
      for (let k = 0; k < 3000 && S.ph === 'play'; k++) step(S, 1 / 240, blocked);
      out[S.why] = (out[S.why] || 0) + 1;
    }
    return {fail: 1 - (out.miss || 0) / 1500, out};
  };
  assert.equal(rate(0).fail, 0);
  const n = rate(.6), r = rate(1);
  assert.ok(n.fail > .05 && n.fail < .2, 'normal ' + n.fail);
  assert.ok(r.fail > .2 && r.fail < .32, 'realistis ' + r.fail);
  assert.ok(r.out.out > (r.out.net || 0) && r.out.out > (r.out.own || 0));
});

test('spin datang: dibiarkan = gagal, dilawan dengan arah ayunan = masuk', () => {
  const go = (w, vy) => { const S = play('h', {err: 1, w}); applyHit(S, 'h', {x: 0, y: S.by, z: S.bz, r: 0, p: 0}, {s: 1.5, vy}, {dx: 0, dy: 0, along: .1}); const c = S.cause; run(S); return [S.why, c]; };
  assert.deepEqual(go(.7, 1.5), ['out', 'topspin']); // topspin dibalas ayunan ke atas: melambung keluar
  assert.equal(go(.7, -2)[0], 'miss'); // diredam ayunan datar ke bawah: masuk
  assert.ok(['net', 'own'].includes(go(-.7, -1)[0])); // backspin dibalas ayunan turun: ke net
  assert.equal(go(-.7, 2)[0], 'miss'); // diangkat: masuk
});

// ---------- lemparan servis dengan tangan bebas ----------
test('tossDetect: diam lalu naik cepat = lempar; diam, naik pelan, getar, atau bergerak terus = bukan', () => {
  const seq = f => Array.from({length: 40}, (_, i) => ({t: i / 60, y: f(i / 60)}));
  assert.equal(tossDetect(seq(() => 1)), 0);
  assert.equal(tossDetect(seq(t => 1 + .4 * Math.max(0, t - .45))), 0);
  assert.equal(tossDetect(seq(t => 1 + .02 * Math.sin(t * 60))), 0);
  assert.equal(tossDetect(seq(t => .8 + 1.2 * t)), 0); // bergerak terus tanpa jeda diam
  const v = tossDetect(seq(t => 1 + 1.6 * Math.max(0, t - .52)));
  assert.ok(v > 1.8 && v < 2.6, 'kecepatan ' + v);
});

test('lemparan tangan: menahan bola menunda servis otomatis; terlalu rendah salah hanya di realistis', () => {
  const nobody = {swing: () => ({s: 1, vy: 0})};
  const H = newState(); startRound(H, 7, 1); Object.assign(H, {hold: true, hx: 2});
  for (let i = 0; i < 300; i++) step(H, 1 / 120, nobody);
  assert.equal(H.toss, false); assert.equal(H.ph, 'serve');
  const R = newState(); startRound(R, 7, 1); Object.assign(R, {err: 1, hx: 2, t: 0}); toss(R, 1.4, true);
  for (let i = 0; i < 300 && R.ph === 'serve'; i++) step(R, 1 / 120, nobody);
  assert.equal(R.why, 'lowtoss'); assert.equal(R.pw, 'g');
  const N = newState(); startRound(N, 7, 1); Object.assign(N, {err: .6, t: 0}); toss(N, 1.4, true);
  assert.ok(N.vy >= 1.9 && !N.lowToss); // berbantuan: dinaikkan agar sah
});
