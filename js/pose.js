// Kamera + MediaPipe Pose -> posisi dan sudut bat per pemain.
import {PoseLandmarker, FilesetResolver} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
import {clamp, palmPitch} from './physics.js';

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = acc => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${acc}/float16/1/pose_landmarker_${acc}.task`;

// One Euro Filter: halus saat tangan pelan, responsif saat cepat (https://gery.casiez.net/1euro/)
class OneEuro {
  constructor(beta) { this.b = beta; this.x = null; this.dx = 0; this.t = 0; }
  static a(cut, dt) { return 1 / (1 + 1 / (2 * Math.PI * cut) / dt); }
  f(v, t, minCut) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max((t - this.t) / 1000, 1e-3); this.t = t;
    this.dx += ((v - this.x) / dt - this.dx) * OneEuro.a(1, dt);
    this.x += (v - this.x) * OneEuro.a(minCut + this.b * Math.abs(this.dx), dt);
    return this.x;
  }
}
const MINCUT_SCALE = {x: 1, y: 1, z: .3, r: .8, p: .5}; // z paling berisik
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const dz = (v, d) => Math.abs(v) < d ? 0 : v - Math.sign(v) * d; // zona mati: getaran kecil di sekitar netral diabaikan
// titik telapak pada pose: pergelangan, kelingking, telunjuk, jempol (kiri 15,17,19,21 / kanan 16,18,20,22)
const PALM = {L: [15, 17, 19, 21], R: [16, 18, 20, 22]};

// Satu pemain di depan kamera. Duel satu kamera memakai dua tracker.
export class Tracker {
  constructor() {
    // beta kecil untuk sumbu berisik (z, roll, pitch): turunan derau yang besar jangan sampai membuka filter
    this.filt = {x: new OneEuro(8), y: new OneEuro(8), z: new OneEuro(1.5), r: new OneEuro(.8), p: new OneEuro(.6)};
    this.hist = {z: [], r: [], p: []}; // median 3 sampel: membuang lonjakan 1 frame sebelum masuk filter
    this.fil = {x: 0, y: .5, z: .5, r: 0, p: 0}; // keluaran filter; x:-1..1 (kanan layar), y:0..1 (atas), z:0..1 (maju ke net), r:-1..1 (miring)
    this.hand = 'R'; this.pick = false; this.palm = null; this.lastSeen = 0;
    this.zBase = 0; this.rBase = 0; this.pBase = 0; this.rawP = 0; this.calBuf = null;
    this.hf = {x: new OneEuro(2), y: new OneEuro(2)}; this.hBase = null; this.headRaw = null;
    this.head = {x: 0, y: 0}; // geseran kepala dari posisi kalibrasi, meter: x ke kanan pemain, y ke atas
  }
  // Kepala: rata-rata hidung, mata, telinga. Lebar bahu (~0,38 m) jadi penggaris, jadi tidak bergantung jarak ke kamera.
  // Hanya geser kiri-kanan dan naik-turun: maju-mundur dari ukuran badan tertipu oleh badan yang berputar saat backhand.
  readHead(lm, now) {
    const ids = [0, 2, 5, 7, 8], sw = Math.abs(lm[11].x - lm[12].x);
    if (sw < .05 || lm[0].visibility < .5) { this.headRaw = null; return; }
    const c = {x: ids.reduce((t, i) => t + lm[i].x, 0) / 5, y: ids.reduce((t, i) => t + lm[i].y, 0) / 5, sw};
    this.headRaw = c;
    if (!this.hBase) return;
    const k = .38 / this.hBase.sw;
    this.head = {x: this.hf.x.f(clamp((this.hBase.x - c.x) * k, -.45, .45), now, .8), y: this.hf.y.f(clamp((this.hBase.y - c.y) * .75 * k, -.35, .25), now, .8)};
  }
  med3(k, v) { const h = this.hist[k]; h.push(v); if (h.length > 3) h.shift(); return h.length < 3 ? v : [...h].sort((a, b) => a - b)[1]; }
  lost(now) { if (now - this.lastSeen > 200) this.palm = null; } // tahan 200 ms saat deteksi putus
  calStart() { this.pick = true; }
  calCollect() { this.pick = false; this.calBuf = []; }
  calDone() {
    const B = this.calBuf; this.calBuf = null; this.pick = false;
    if (!B || !B.length) return;
    const med = k => B.map(b => b[k]).sort((a, b) => a - b)[B.length >> 1];
    this.zBase = med('z'); this.pBase = med('p');
    const H = B.filter(b => b.hx !== undefined), hm = k => H.map(b => b[k]).sort((a, b) => a - b)[H.length >> 1];
    if (H.length) { this.hBase = {x: hm('hx'), y: hm('hy'), sw: hm('sw')}; this.hf.x.x = this.hf.y.x = null; this.head = {x: 0, y: 0}; }
    this.rBase = Math.atan2(B.reduce((t, b) => t + Math.sin(b.r), 0), B.reduce((t, b) => t + Math.cos(b.r), 0));
    for (const k in this.hist) { this.hist[k].length = 0; this.filt[k].x = null; this.filt[k].dx = 0; } // mulai bersih dari netral baru
  }
  // o: {hand: 'auto'|'L'|'R', smooth: 0..1, pitch: bool, a, b: rentang x layar (dicerminkan) yang dipetakan ke lebar penuh}
  update(lm, wl, now, o) {
    if (!lm || !wl) return this.lost(now);
    this.readHead(lm, now);
    const vis = ids => ids.reduce((t, i) => t + lm[i].visibility, 0) / ids.length;
    if (o.hand !== 'auto') this.hand = o.hand;
    else if (this.pick && Math.abs(lm[15].y - lm[16].y) > .05) this.hand = lm[15].y < lm[16].y ? 'L' : 'R'; // hanya saat kalibrasi: tangan yang lebih tinggi
    const ids = PALM[this.hand]; // tangan dikunci: memilih ulang tiap frame membuat bat melompat antar tangan
    if (vis(ids) < 0.5) return this.lost(now);
    const pts = ids.map(i => lm[i]);
    // model tetap menebak tangan di luar gambar dengan visibility tinggi; batas tepi ini menangkap sebagian saja
    if (pts.some(p => p.x < .06 || p.x > .94 || p.y < .06 || p.y > .94)) return this.lost(now);
    this.lastSeen = now;
    const c = {x: pts.reduce((t, p) => t + p.x, 0) / 4, y: pts.reduce((t, p) => t + p.y, 0) / 4};
    this.palm = {pts, c};
    const zRaw = ids.reduce((t, i) => t + wl[i].z, 0) / 4 - (wl[11].z + wl[12].z) / 2; // meter, relatif bahu (pinggul sering di luar gambar); makin negatif = makin dekat kamera
    // o.head: bat ikut geseran kepala (dibuang di sini, ditambahkan lagi di dunia), jadi tangan dibaca relatif terhadap badan
    const hs = o.head && this.hBase ? .38 / this.hBase.sw : 0;
    const sx = 1 - c.x - (hs ? this.head.x / hs : 0); // layar dicerminkan
    const sy = c.y + (hs ? this.head.y / (.75 * hs) : 0);
    const mid = {x: (pts[2].x + pts[1].x) / 2, y: (pts[2].y + pts[1].y) / 2}; // tengah telunjuk-kelingking
    const rawR = Math.atan2(-(mid.x - pts[0].x), -(mid.y - pts[0].y) * .75); // .75 = 480/640 karena x dan y dinormalkan per sisi; 0 = jari menunjuk ke atas
    // pitch dari telapak sendiri, bukan lengan bawah: menjangkau ke depan tidak lagi terbaca sebagai bilah menutup, dan siku boleh di luar gambar
    this.rawP = palmPitch(wl[ids[0]], wl[ids[2]], wl[ids[1]]);
    if (this.calBuf) this.calBuf.push({z: zRaw, r: rawR, p: this.rawP, ...(this.headRaw ? {hx: this.headRaw.x, hy: this.headRaw.y, sw: this.headRaw.sw} : {})});
    const mc = 3 * Math.pow(.1, o.smooth); // 0 -> 3 Hz (responsif), 1 -> 0.3 Hz (halus)
    const raw = {x: clamp((sx - o.a) / (o.b - o.a)) * 2 - 1, y: 1 - clamp((sy - .15) / .7), z: clamp(.5 + (this.zBase - zRaw) * 1.7), // 1,7 / m: jangkauan lengan sekitar +-0,3 m
      r: clamp(dz(wrap(rawR - this.rBase), .06), -1, 1), p: !o.pitch ? 0 : clamp(dz(this.rawP - this.pBase, .06) * .8, -.6, .6)}; // bat: roll dan pitch relatif terhadap netral
    for (const k in raw) this.fil[k] = this.filt[k].f(k in this.hist ? this.med3(k, raw[k]) : raw[k], now, mc * MINCUT_SCALE[k]);
  }
}

let landmarker = null, lastVidT = -1, people = 1, files = null, model = '', skip = 0;
export const poseStat = {ready: false, frames: 0};

export async function loadPose(vid, acc) {
  if (poseStat.ready) return;
  vid.srcObject = await navigator.mediaDevices.getUserMedia({video: {width: 640, height: 480, facingMode: 'user'}});
  await vid.play();
  files = await FilesetResolver.forVisionTasks(WASM); model = acc;
  await create("GPU");
  poseStat.ready = true;
}
async function create(delegate) {
  landmarker = await PoseLandmarker.createFromOptions(files, {baseOptions: {modelAssetPath: MODEL(model), delegate}, runningMode: "VIDEO", numPoses: people});
  poseStat.delegate = delegate;
}
// GPU gagal (driver, memori, konteks WebGL hilang): pindah ke CPU sekali, game jalan terus tanpa pose sementara.
async function fallback(e) {
  console.error('Deteksi pose gagal di', poseStat.delegate, e);
  poseStat.ready = false;
  try { if (landmarker) landmarker.close(); } catch { /* sudah rusak */ }
  if (poseStat.delegate === "GPU") { await create("CPU"); poseStat.ready = true; }
}

export async function setPeople(n) {
  if (!landmarker || n === people) return;
  await landmarker.setOptions({numPoses: n}); people = n;
}

// Satu tracker: orang pertama. Dua tracker: orang diurutkan menurut tengah bahu di layar (dicerminkan), kiri = tracker 0.
// Tiap orang hanya memakai separuh gambarnya, jadi rentang x-nya dipetakan ulang ke lebar penuh.
export function readPose(vid, trackers, o) {
  if (!poseStat.ready || vid.currentTime === lastVidT) return;
  if (skip > 0) { skip--; return; } // deteksi lambat: lewati frame berikutnya supaya layar tetap mulus
  lastVidT = vid.currentTime; poseStat.frames++;
  const now = performance.now();
  let res;
  try { res = landmarker.detectForVideo(vid, now); } catch (e) { fallback(e).catch(err => console.error('Pose CPU juga gagal', err)); return; }
  const took = performance.now() - now; skip = took > 40 ? 2 : took > 22 ? 1 : 0;
  if (trackers.length === 1) return trackers[0].update(res.landmarks[0], res.worldLandmarks[0], now, {...o, a: .15, b: .85});
  const ps = res.landmarks.map((lm, i) => ({lm, wl: res.worldLandmarks[i], sx: 1 - (lm[11].x + lm[12].x) / 2})).sort((p, q) => p.sx - q.sx);
  let L = null, R = null;
  if (ps.length >= 2) [L, R] = ps; else if (ps.length === 1) ps[0].sx < .5 ? L = ps[0] : R = ps[0];
  trackers[0].update(L && L.lm, L && L.wl, now, {...o, hand: o.hand2[0], a: .05, b: .48});
  trackers[1].update(R && R.lm, R && R.wl, now, {...o, hand: o.hand2[1], a: .52, b: .95});
}
