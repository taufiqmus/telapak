// Tampilan 3D: ruangan, meja, bola, bat, karakter, efek. Tidak tahu apa-apa soal aturan permainan.
// Tingkat grafis bisa diganti saat main (setQuality): renderer tetap sama, yang berubah resolusi, bayangan,
// tone mapping, peta lingkungan, tekstur, detail penonton, dan pasca-proses.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {TL, TW, TY, NET_TOP, BR, EYE_Y, EYE_Z, LOOK_Y, LOOK_Z, FOV, clamp, backhand} from './physics.js';

export const COLOR = {h: 0x2f7de1, g: 0xdc2626};

// pr: batas pixel ratio. shadow: ukuran peta bayangan (0 = tanpa). real: tone mapping + peta lingkungan + tekstur + penonton berbentuk orang.
// post: ambient occlusion (GTAO), bloom halus, MSAA. Model pose juga memakai GPU, jadi tingkat tinggi bisa menurunkan FPS pose.
export const GRAFIS = {
  rendah: {pr: 1, shadow: 0, real: false, post: false},
  sedang: {pr: 1.5, shadow: 0, real: false, post: false},
  tinggi: {pr: 1.5, shadow: 1024, real: true, post: false},
  ultra: {pr: 2, shadow: 2048, real: true, post: true}
};

// ---------- tekstur prosedural (kanvas), dibuat sekali saat pertama dibutuhkan ----------
function canvasTex(w, h, draw, repeat = [1, 1], color = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const speckle = (g, w, h, n, a, light = 255) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light},${light},${light},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };
function makeTextures() {
  return {
    // lantai lapangan karet (merah bata, sedikit berbintik)
    court: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#8a2a23'; g.fillRect(0, 0, w, h); speckle(g, w, h, 9000, .07); speckle(g, w, h, 6000, .08, 0); }, [3, 4]),
    // lantai kayu di luar lapangan
    wood: canvasTex(512, 512, (g, w, h) => {
      const rows = 8, rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -Math.random() * 200;
        while (x < w) { const len = 140 + Math.random() * 180, l = 38 + Math.random() * 10;
          g.fillStyle = `hsl(14,${32 + Math.random() * 8}%,${l * .55}%)`; g.fillRect(x, r * rh, len, rh);
          for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(0,0,0,${.05 + Math.random() * .06})`; g.beginPath(); const y = r * rh + Math.random() * rh; g.moveTo(x, y); g.bezierCurveTo(x + len / 3, y + 3, x + len * 2 / 3, y - 3, x + len, y); g.stroke(); }
          g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + len - 1, r * rh, 2, rh); x += len; }
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, r * rh, w, 2);
      }
    }, [6, 6]),
    // permukaan meja: cat biru doff
    table: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#0b4a9e'; g.fillRect(0, 0, w, h); speckle(g, w, h, 12000, .035); speckle(g, w, h, 8000, .05, 0); }, [2, 3]),
    // jaring net: kisi putih, sisanya tembus pandang
    net: canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#f4f6fa'; g.lineWidth = 3; for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, [40, 4]),
    // papan pembatas dengan tulisan
    board: canvasTex(1024, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#16407e'); gr.addColorStop(1, '#0e2c5a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f7f9fc'; g.font = '700 64px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textBaseline = 'middle';
      g.fillText('TELAPAK', 40, h / 2 + 4); g.fillStyle = '#ff9a3c'; g.fillText('OPEN 2026', 330, h / 2 + 4);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 34px Barlow, sans-serif'; g.fillText('tenis meja tanpa bat', 660, h / 2 + 4);
    }, [2, 1]),
    // dinding aula: panel gelap dengan sambungan halus
    wall: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#26354f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); speckle(g, w, h, 2500, .04); }, [8, 3])
  };
}

export function createScene(cv) {
  const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true, powerPreference: 'high-performance'});
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, .05, 60);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({color: c, roughness: .8, ...o});
  const box = (w, h, d, c, x, y, z, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); scene.add(m); return m; };
  const looks = []; // material yang tampil beda di tingkat realistis: {m, lo, hi}
  const look = (m, hi) => { const lo = {}; for (const k in hi) lo[k] = m[k]; looks.push({m, lo, hi}); return m; };

  // cahaya: dasar (selalu) + lampu utama di atas meja yang membuat bayangan (tingkat tinggi)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 6, 3); scene.add(sun);
  const sun2 = sun.clone(); sun2.position.set(-2, 6, -3); scene.add(sun2); // sisi tamu ikut terang
  const key = new THREE.DirectionalLight(0xfff4e0, 0); key.position.set(.8, 7, 1.5); key.target.position.set(0, TY, 0); scene.add(key, key.target);
  Object.assign(key.shadow.camera, {left: -3.2, right: 3.2, top: 4.2, bottom: -4.2, near: 2, far: 12});
  key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -.0004; key.shadow.normalBias = .015;

  // ruangan: lantai, matras, dinding, pembatas, lampu
  const floor = box(16, .02, 16, 0x5a1a1c, 0, -.01, 0);
  const court = box(6, .01, 9, 0x8e2a24, 0, .005, 0);
  const room = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 16), new THREE.MeshStandardMaterial({color: 0x2c3d5a, side: THREE.BackSide, roughness: 1}));
  room.position.y = 3; scene.add(room);
  const boards = [];
  for (const x of [-3, 3]) boards.push(box(.05, .7, 9, 0x12305f, x, .35, 0));
  for (const z of [-4.5, 4.5]) boards.push(box(6, .7, .05, 0x12305f, 0, .35, z));
  const lamps = [];
  for (const z of [-3, 0, 3]) lamps.push(box(2.5, .05, .3, 0xfff7d6, 0, 5.95, z, {emissive: 0xfff7d6, emissiveIntensity: 1}));
  // penonton di tribun samping: balok (cepat) atau orang sederhana (tingkat realistis)
  const crowd = [], blocks = new THREE.Group(), people = new THREE.Group(); scene.add(blocks, people);
  const SHIRT = [0xf59e0b, 0x22c55e, 0x3b82f6, 0xe11d48, 0xa855f7, 0xf1f5f9, 0x0f766e, 0x1e293b], SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const bodyGeo = new THREE.CapsuleGeometry(.15, .26, 4, 10), headGeo = new THREE.SphereGeometry(.105, 14, 10), hairGeo = new THREE.SphereGeometry(.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const x of [-5.2, 5.2]) for (let i = 0; i < 14; i++) for (let row = 0; row < 2; row++) {
    const k = i * 3 + row, px = x + Math.sign(x) * row * .6, pz = -4 + i * .62, py = .55 + row * .35;
    const b = new THREE.Mesh(new THREE.BoxGeometry(.35, .55, .3), mat(SHIRT[k % 6])); b.position.set(px, py, pz); blocks.add(b);
    const p = new THREE.Group(); p.position.set(px, py - .1, pz); p.rotation.y = -Math.sign(x) * Math.PI / 2 + (Math.random() - .5) * .4;
    const body = new THREE.Mesh(bodyGeo, mat(SHIRT[(k * 5 + 1) % SHIRT.length], {roughness: .9})); body.position.y = .12;
    const head = new THREE.Mesh(headGeo, mat(SKIN[k % SKIN.length], {roughness: .6})); head.position.y = .48;
    const hair = new THREE.Mesh(hairGeo, mat([0x1a1410, 0x3b2314, 0x6b4a2b, 0x111111][k % 4], {roughness: .95})); hair.position.y = .5;
    p.add(body, head, hair); people.add(p);
    b.userData.y0 = b.position.y; p.userData.y0 = p.position.y; crowd.push(b, p);
  }
  for (const x of [-5.2, 5.2]) box(1.6, .3, 9, 0x1e293b, x + Math.sign(x) * .3, .15, 0);

  // meja, garis, net, kaki
  const top = box(TW, .03, TL, 0x0b4a9e, 0, TY - .015, 0);
  for (const x of [-TW / 2 + .01, TW / 2 - .01]) box(.02, .002, TL, 0xffffff, x, TY + .001, 0);
  for (const z of [-TL / 2 + .01, TL / 2 - .01]) box(TW, .002, .02, 0xffffff, 0, TY + .001, z);
  box(.01, .002, TL, 0xffffff, 0, TY + .001, 0);
  for (const x of [-TW / 2 + .1, TW / 2 - .1]) for (const z of [-TL / 2 + .2, TL / 2 - .2]) box(.06, TY - .03, .06, 0x1f2937, x, (TY - .03) / 2, z, {metalness: .6, roughness: .45});
  const net = box(TW + .3, .1525, .004, 0xf1f5f9, 0, TY + .076, 0, {transparent: true, opacity: .55});
  box(TW + .3, .014, .01, 0xffffff, 0, NET_TOP, 0);
  for (const x of [-(TW / 2 + .15), TW / 2 + .15]) box(.025, .18, .025, 0x94a3b8, x, TY + .09, 0, {metalness: .7, roughness: .35});

  // bola + bayangan palsu (tingkat tanpa bayangan) + jejak
  const ballMat = mat(0xffa94d, {emissive: 0xff7a00, emissiveIntensity: .35});
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 32, 20), ballMat); scene.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BR, 16), new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: .4}));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const TRAIL = 14, trail = [], hist = [];
  for (let i = 0; i < TRAIL; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(BR * (1 - i / TRAIL) * .8, 8, 6), new THREE.MeshBasicMaterial({transparent: true, opacity: .45 * (1 - i / TRAIL), depthWrite: false}));
    scene.add(m); trail.push(m);
  }
  // penanda titik jatuh di meja lawan
  const marker = new THREE.Mesh(new THREE.RingGeometry(.05, .075, 28), new THREE.MeshBasicMaterial({transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false}));
  marker.rotation.x = -Math.PI / 2; scene.add(marker);

  // partikel pukulan
  const parts = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.012, 6, 4), new THREE.MeshBasicMaterial({transparent: true}));
    m.visible = false; scene.add(m); parts.push({m, v: new THREE.Vector3(), life: 0});
  }
  const noShadow = new Set([shadow, marker, room, ...trail, ...parts.map(q => q.m), ...lamps]);

  // bat: bilah merah (karet) + sisi hitam + gagang kayu
  function makeBat() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .018, 40), [mat(0x6b4a2b, {roughness: .7}), mat(0xdc2626, {roughness: .55}), mat(0x111111, {roughness: .5})]);
    blade.rotation.x = Math.PI / 2; g.add(blade); // pusat bilah = pusat telapak, jadi derau sudut tidak menggeser bilah
    const h = new THREE.Mesh(new THREE.BoxGeometry(.035, .13, .024), mat(0xd6a76a, {roughness: .6})); h.position.y = -.2; g.add(h);
    g.userData.blade = blade; scene.add(g); return g;
  }
  const bats = {h: makeBat(), g: makeBat()};

  // karakter bersendi. Panjang tulang tetap: lengan dan kaki memakai IK dua tulang, jadi tidak pernah memanjang.
  // Bila bat di luar jangkauan, badan yang melangkah. Badan juga jongkok, condong, dan memutar pinggang-bahu mengikuti bat.
  // Sumbu lokal karakter: +z = ke depan (ke net), +x = kiri pemain, jadi bahu kanan di x negatif.
  const KULIT = 0xf1c27d, UA = .29, FA = .31, TH = .45, SH = .45; // lengan atas, lengan bawah sampai gagang, paha, betis (m)
  const V3 = () => new THREE.Vector3();
  const capsule = (r, len, c, o) => new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.01, len - 2 * r), 4, 10), mat(c, o));
  function makeLimbs(g, a, b, r1, r2, c1, c2) { const m = {a: capsule(r1, a, c1), b: capsule(r2, b, c2)}; g.add(m.a, m.b); return m; }
  function makeChar(shirt) {
    const g = new THREE.Group(), root = new THREE.Group(), spine = new THREE.Group(), head = new THREE.Group();
    g.add(root); root.add(spine);
    const pelvis = capsule(.12, .34, 0x222a44); pelvis.rotation.z = Math.PI / 2; root.add(pelvis); // celana
    const torso = capsule(.18, .48, shirt, {roughness: .85}); torso.position.y = .27; torso.scale.z = .62; spine.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .1, 10), mat(KULIT)); neck.position.y = .53; spine.add(neck);
    head.position.y = .66; spine.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(.115, 20, 14), mat(KULIT, {roughness: .6})));
    const band = new THREE.Mesh(new THREE.TorusGeometry(.113, .018, 8, 24), mat(0xffffff)); band.position.y = .05; band.rotation.x = Math.PI / 2; head.add(band); // ikat kepala
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), mat(KULIT)); nose.position.set(0, -.01, .11); head.add(nose); // arah pandang terlihat
    const sh = {R: new THREE.Object3D(), L: new THREE.Object3D()}; sh.R.position.set(-.2, .46, 0); sh.L.position.set(.2, .46, 0); spine.add(sh.R, sh.L);
    const arms = {R: makeLimbs(g, UA, FA, .045, .04, shirt, KULIT), L: makeLimbs(g, UA, FA, .045, .04, shirt, KULIT)}; // lengan atas berlengan baju
    const palms = {R: new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), mat(KULIT)), L: new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), mat(KULIT))}; g.add(palms.R, palms.L);
    const legs = {R: makeLimbs(g, TH, SH, .07, .055, 0x222a44, KULIT), L: makeLimbs(g, TH, SH, .07, .055, 0x222a44, KULIT)};
    const shoes = {R: new THREE.Mesh(new THREE.BoxGeometry(.11, .07, .26), mat(0xf7f9fc, {roughness: .6})), L: new THREE.Mesh(new THREE.BoxGeometry(.11, .07, .26), mat(0xf7f9fc, {roughness: .6}))}; g.add(shoes.R, shoes.L);
    scene.add(g);
    return {g, root, spine, head, pelvis, sh, arms, palms, legs, shoes, st: null};
  }
  const chars = {h: makeChar(COLOR.h), g: makeChar(COLOR.g)};
  const fpArm = {}; // lengan orang pertama: lengan bawah tetap panjangnya, lengan atas sebagian besar di luar layar
  for (const k of ['h', 'g']) { const g = new THREE.Group(); fpArm[k] = {g, ...makeLimbs(g, UA, FA, .05, .045, COLOR[k], KULIT), palm: new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), mat(KULIT))}; g.add(fpArm[k].palm); scene.add(g); }

  const up = new THREE.Vector3(0, 1, 0), tA = V3(), tD = V3(), tN = V3();
  // IK dua tulang: dari sendi A ke target T, sendi tengah J ditekuk ke arah pole. E = ujung (= T bila terjangkau).
  function ik(A, T, a, b, pole, J, E) {
    const L = tD.subVectors(T, A).length() || 1e-6, d = Math.min(L, (a + b) * .999);
    tD.divideScalar(L);
    const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
    tN.copy(pole).addScaledVector(tD, -pole.dot(tD)); if (tN.lengthSq() < 1e-8) tN.set(0, -1, 0); tN.normalize();
    J.copy(A).addScaledVector(tD, a * ca).addScaledVector(tN, a * sa);
    E.copy(A).addScaledVector(tD, d);
  }
  function bone(m, from, to) { m.position.addVectors(from, to).multiplyScalar(.5); m.quaternion.setFromUnitVectors(up, tA.subVectors(to, from).normalize()); }
  const P = {sh: V3(), el: V3(), en: V3(), hip: V3(), kn: V3(), an: V3(), pole: V3(), tgt: V3(), look: V3()};
  const ease = (dt, k) => 1 - Math.exp(-k * dt);

  // Satu frame gerak karakter sisi k. hand = titik gagang (target tangan), isBh = backhand, ball = titik yang ditatap.
  function poseChar(k, hand, hs, isBh, e, ball, play, dt) {
    const c = chars[k], s = k === 'h' ? 1 : -1, base = k === 'h' ? Math.PI : 0;
    const st = c.st || (c.st = {x: hand.x, z: s * (TL / 2 + .8), vx: 0, vz: 0, ph: 0, lean: .3, yaw: 0, hip: .84});
    // 1. kaki: badan mengejar titik di belakang bat (pegas teredam kritis = langkah dengan sedikit lambat, seperti footwork)
    const tx = hand.x - s * hs * (isBh ? -.08 : .3), tz = s * clamp(s * hand.z + .5, TL / 2 + .28, TL / 2 + 1.3), w = 8;
    st.vx += (w * w * (tx - st.x) - 2 * w * st.vx) * dt; st.vz += (w * w * (tz - st.z) - 2 * w * st.vz) * dt;
    st.x += st.vx * dt; st.z += st.vz * dt;
    // 2. badan: jongkok untuk bola rendah, condong saat menjangkau, putar pinggang-bahu ke arah bat
    const rx = (hand.x - st.x) * s, fz = -(hand.z - st.z) * s; // bat relatif badan: kanan pemain, ke depan
    const low = clamp((1 - hand.y) / .4), far = clamp((fz - .3) / .5), bob = play ? .012 * Math.sin(performance.now() / 110) : 0;
    st.hip += (.84 - .1 * low + Math.min(0, e.y) * .6 + bob - st.hip) * ease(dt, 10);
    st.lean += (.2 + .4 * far + .25 * low - st.lean) * ease(dt, 10);
    st.yaw += (clamp(-Math.atan2(rx, Math.max(.1, fz)) * .75, -1, 1) - st.yaw) * ease(dt, 18); // + = putar ke kiri pemain
    c.root.position.set(st.x, 0, st.z); c.root.rotation.y = base + st.yaw * .4;
    c.pelvis.position.y = st.hip; c.spine.position.y = st.hip;
    c.spine.rotation.set(st.lean, st.yaw * .6, clamp(rx * .35, -.22, .22) * low, 'YXZ');
    c.root.updateMatrixWorld(true);
    // 3. lengan pemukul: bat di luar jangkauan = badan digeser sampai tangan sampai, jadi lengan tidak meregang
    const hn = hs === 1 ? 'R' : 'L', fn = hs === 1 ? 'L' : 'R';
    c.sh[hn].getWorldPosition(P.sh);
    const dx = hand.x - P.sh.x, dy = hand.y - P.sh.y, dz = hand.z - P.sh.z, hz = Math.hypot(dx, dz) || 1e-6, max = (UA + FA) * .97;
    if (Math.hypot(hz, dy) > max) {
      const m = hz - Math.sqrt(Math.max(0, max * max - dy * dy));
      st.x += dx / hz * m; st.z += dz / hz * m; c.root.position.set(st.x, 0, st.z); c.root.updateMatrixWorld(true); c.sh[hn].getWorldPosition(P.sh);
    }
    P.pole.set(s * hs * (isBh ? .8 : .7), isBh ? -.6 : -1, s * (isBh ? -.5 : .3)); // siku turun-keluar; backhand: siku ke depan-keluar
    ik(P.sh, hand, UA, FA, P.pole, P.el, P.en);
    bone(c.arms[hn].a, P.sh, P.el); bone(c.arms[hn].b, P.el, P.en); c.palms[hn].position.copy(P.en);
    // 4. lengan bebas: ditekuk di depan perut, ikut putaran badan sebagai penyeimbang
    c.sh[fn].getWorldPosition(P.sh);
    c.spine.localToWorld(P.tgt.set(hs * .17, .14, .3));
    P.pole.set(-s * hs * .6, -1, s * .4);
    ik(P.sh, P.tgt, UA, FA * .85, P.pole, P.el, P.en);
    bone(c.arms[fn].a, P.sh, P.el); bone(c.arms[fn].b, P.el, P.en); c.palms[fn].position.copy(P.en);
    // 5. kaki: kuda-kuda lebar, kaki sisi pemukul sedikit di belakang; melangkah bergantian saat badan bergerak
    const sp = Math.hypot(st.vx, st.vz), ux = sp > 1e-3 ? st.vx / sp : 0, uz = sp > 1e-3 ? st.vz / sp : 0;
    st.ph += Math.min(sp, 3) * dt * 13;
    const stride = Math.min(.14, sp * .2), lift = .06 * clamp(sp / .5);
    for (const [n, side] of [['R', 1], ['L', -1]]) {
      const q = st.ph + (side === 1 ? 0 : Math.PI);
      c.root.localToWorld(P.hip.set(-side * .1, st.hip - .04, 0));
      P.an.set(st.x + s * side * .23 + ux * stride * Math.cos(q), .07 + lift * Math.max(0, Math.sin(q)), st.z + s * (side === hs ? .1 : -.06) + uz * stride * Math.cos(q));
      P.pole.set(s * side * .3, 0, -s);
      ik(P.hip, P.an, TH, SH, P.pole, P.kn, P.en);
      bone(c.legs[n].a, P.hip, P.kn); bone(c.legs[n].b, P.kn, P.en);
      c.shoes[n].position.set(P.en.x, P.en.y - .035, P.en.z - s * .05); c.shoes[n].rotation.y = base;
    }
    // 6. kepala menatap bola
    c.head.lookAt(P.look.copy(ball));
  }
  const grip = b => new THREE.Vector3(b.x - .21 * Math.sin(b.r), b.y - .21 * Math.cos(b.r) * Math.cos(b.p), b.z + .21 * Math.cos(b.r) * Math.sin(b.p)); // titik genggam di gagang

  // ---------- tingkat grafis ----------
  let cfg = GRAFIS.sedang, tex = null, envTex = null, composer = null, gtao = null, quality = '';
  scene.traverse(o => { if (o.isMesh && !noShadow.has(o)) { o.castShadow = true; o.receiveShadow = true; } });
  room.receiveShadow = true;
  function realLooks() {
    if (!tex) {
      tex = makeTextures();
      look(floor.material, {map: tex.wood, color: new THREE.Color(0xffffff), roughness: .55});
      look(court.material, {map: tex.court, color: new THREE.Color(0xffffff), roughness: .85});
      look(top.material, {map: tex.table, color: new THREE.Color(0xffffff), roughness: .42});
      look(net.material, {map: tex.net, color: new THREE.Color(0xffffff), opacity: 1, alphaTest: .35, side: THREE.DoubleSide});
      look(room.material, {map: tex.wall, color: new THREE.Color(0xffffff)});
      for (const b of boards) look(b.material, {map: tex.board, color: new THREE.Color(0xffffff), roughness: .5});
      look(ballMat, {roughness: .38, emissiveIntensity: .1});
      for (const l of lamps) look(l.material, {emissiveIntensity: 3.5});
    }
  }
  async function setQuality(q) {
    if (!GRAFIS[q] || q === quality) return;
    quality = q; cfg = GRAFIS[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.pr));
    // bayangan nyata dari lampu utama
    renderer.shadowMap.enabled = !!cfg.shadow;
    key.castShadow = !!cfg.shadow;
    if (cfg.shadow && key.shadow.mapSize.x !== cfg.shadow) { key.shadow.mapSize.set(cfg.shadow, cfg.shadow); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
    // tampilan realistis: tone mapping, cahaya aula, tekstur, peta lingkungan, penonton berbentuk orang
    if (cfg.real) realLooks();
    for (const L of looks) Object.assign(L.m, cfg.real ? L.hi : L.lo);
    renderer.toneMapping = cfg.real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.05;
    hemi.intensity = cfg.real ? .45 : 1.1; sun.intensity = sun2.intensity = cfg.real ? .55 : 1.4; key.intensity = cfg.real ? 2.8 : 0;
    blocks.visible = !cfg.real; people.visible = cfg.real;
    try { // modul tambahan dari CDN; gagal (mis. luring) = tampil tanpa peta lingkungan atau pasca-proses, bisa dicoba lagi
      if (cfg.real && !envTex) {
        const {RoomEnvironment} = await import('three/addons/environments/RoomEnvironment.js');
        const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
      }
    } catch (e) { console.warn('Peta lingkungan gagal dimuat', e); quality = ''; }
    scene.environment = cfg.real ? envTex : null;
    scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) { m.envMapIntensity = .45; m.needsUpdate = true; } });
    // pasca-proses (ultra): MSAA + ambient occlusion + bloom halus, hanya untuk satu tampilan penuh
    if (cfg.post && !composer) try {
      const [{EffectComposer}, {RenderPass}, {GTAOPass}, {UnrealBloomPass}, {OutputPass}] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/GTAOPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      const sz = renderer.getSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, {type: THREE.HalfFloatType, samples: 4});
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, cam));
      gtao = new GTAOPass(scene, cam, sz.x, sz.y); gtao.updateGtaoMaterial({radius: .35, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 16}); gtao.blendIntensity = .9;
      composer.addPass(gtao);
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), .28, .5, .92));
      composer.addPass(new OutputPass());
    } catch (e) { console.warn('Pasca-proses gagal dimuat', e); composer = null; quality = ''; }
    resized = false;
  }
  let resized = false;

  let shake = 0, cheer = 0;
  const bh = {h: false, g: false}; // forehand/backhand per sisi; disimpan di sini supaya tayangan ulang juga benar
  const api = {
    setQuality,
    get quality() { return quality; },
    burst(p, color, n = 16, speed = 1.6) {
      let k = 0;
      for (const q of parts) {
        if (q.life > 0) continue;
        q.m.position.set(p.x, p.y, p.z); q.m.material.color.setHex(color); q.m.visible = true; q.life = .35 + Math.random() * .25;
        q.v.set(Math.random() - .5, Math.random() * .8, Math.random() - .5).normalize().multiplyScalar(speed * (.4 + Math.random()));
        if (++k >= n) break;
      }
    },
    kick(a) { shake = Math.max(shake, a); },
    cheer(a) { cheer = Math.max(cheer, a); },
    clearTrail() { hist.length = 0; },
    // F: {D: bola dan fase, bats: {h, g}, views: [{side: 'h'|'g'|'tv', x, y, w, h}], hands: {h, g}, eyes: {h, g}: geseran kepala {x, y} m, inGame, dt}
    draw(F) {
      const {D, dt} = F, W = cv.clientWidth, H = cv.clientHeight, sz = renderer.getSize(new THREE.Vector2());
      if (sz.x !== W || sz.y !== H || !resized) {
        renderer.setSize(W, H, false); resized = true;
        if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
      }
      for (const k of ['h', 'g']) {
        const b = F.bats[k], m = bats[k]; m.position.set(b.x, b.y, b.z); m.rotation.z = -b.r; m.rotation.x = -b.p;
        bh[k] = backhand(k, b.x, F.hands[k], bh[k]);
        m.userData.blade.rotation.x = (k === 'g') !== bh[k] ? Math.PI / 2 : -Math.PI / 2; // karet merah ke net saat forehand, hitam saat backhand
      }

      const live = D.ph === 'serve' || D.ph === 'play';
      ball.visible = live; ball.position.set(D.bx, D.by, D.bz);
      ballMat.emissive.setHex(D.w > .15 ? 0xff3d00 : D.w < -.15 ? 0x0066ff : 0xff7a00);
      const onTable = Math.abs(D.bx) < TW / 2 && Math.abs(D.bz) < TL / 2;
      shadow.visible = live && !cfg.shadow; shadow.position.set(D.bx, onTable ? TY + .003 : .012, D.bz);
      shadow.material.opacity = .4 * clamp(1 - (D.by - (onTable ? TY : 0)) / 1.5);

      if (D.ph === 'play') { hist.unshift([D.bx, D.by, D.bz]); hist.length = Math.min(hist.length, TRAIL * 2); } else hist.length = 0;
      const tc = D.w > .15 ? 0xff6a3d : D.w < -.15 ? 0x58a6ff : 0xffd08a;
      trail.forEach((m, i) => { const p = hist[i * 2 + 2]; m.visible = !!p && !F.reduced; if (p) { m.position.set(...p); m.material.color.setHex(tc); } });

      marker.visible = D.ph === 'play' && D.bn === 0 && !!D.last;
      if (marker.visible) { marker.position.set(D.tx, TY + .004, D.tz); marker.material.color.setHex(COLOR[D.last]); marker.scale.setScalar(1 + .15 * Math.sin(performance.now() / 90)); }

      for (const q of parts) {
        if (q.life <= 0) continue;
        q.life -= dt; q.v.y -= 6 * dt; q.m.position.addScaledVector(q.v, dt);
        q.m.material.opacity = clamp(q.life / .3); if (q.life <= 0) q.m.visible = false;
      }
      cheer = Math.max(0, cheer - dt);
      const tNow = performance.now() / 1000;
      crowd.forEach((m, i) => { m.position.y = m.userData.y0 + (cheer > 0 ? Math.abs(Math.sin(tNow * 9 + (i >> 1))) * .12 * Math.min(1, cheer) : 0); });
      shake *= Math.exp(-14 * dt);

      const pdt = Math.min(dt, .05); // jeda panjang tidak membuat pegas badan melompat
      for (const k of ['h', 'g']) {
        const s = k === 'h' ? 1 : -1, b = F.bats[k], e = F.eyes[k], ex = s * e.x, gp = grip(b);
        const hs = F.hands[k] === 'L' ? -1 : 1; // backhand = lengan menyilang badan
        P.look.set(live ? D.bx : 0, live ? D.by : TY + .2, live ? D.bz : -s * .5);
        poseChar(k, gp, hs, bh[k], e, P.look, D.ph === 'play', pdt);
        // orang pertama: panjang lengan tetap; bat jauh = bahu ikut maju ke arah bat (badan condong), lengan tidak meregang
        const fa = fpArm[k]; P.sh.set(ex + s * hs * .3, 1.15 + e.y, s * (EYE_Z - .05));
        const far = P.sh.distanceTo(gp) - (UA + FA) * .97;
        if (far > 0) P.sh.addScaledVector(tA.subVectors(gp, P.sh).normalize(), far);
        ik(P.sh, gp, UA, FA, P.pole.set(s * hs * .7, -1, s * .3), P.el, P.en);
        fa.a.visible = false; // gaya VR: hanya lengan bawah + telapak; pangkal lengan atas akan melayang di layar saat bat jauh
        bone(fa.b, P.el, P.en); fa.palm.position.copy(P.en);
      }

      const post = cfg.post && composer && F.views.length === 1; // pasca-proses hanya di Ultra
      renderer.setScissorTest(!post);
      for (const v of F.views) {
        const x = v.x * W, y = v.y * H, w = v.w * W, h = v.h * H;
        if (!post) { renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); }
        cam.aspect = w / h; cam.updateProjectionMatrix();
        const tv = v.side === 'tv', s = v.side === 'h' ? 1 : -1;
        if (tv) { cam.position.set(3.3, 2.1, .6); cam.lookAt(0, .85, 0); }
        else {
          const e = F.eyes[v.side], ex = s * e.x; // kamera orang pertama ikut kepala pemain (digeser, tidak diputar: pemetaan tangan tetap berlaku)
          cam.position.set(ex + (Math.random() - .5) * shake, EYE_Y + e.y + (Math.random() - .5) * shake, s * EYE_Z);
          cam.lookAt(ex, LOOK_Y + e.y, s * LOOK_Z);
        }
        for (const k of ['h', 'g']) {
          const mine = !tv && k === v.side;
          chars[k].g.visible = F.inGame && !mine;
          fpArm[k].g.visible = F.inGame && mine;
          bats[k].visible = F.inGame;
        }
        if (post) { renderer.setViewport(0, 0, W, H); composer.render(dt); } else renderer.render(scene, cam);
      }
    }
  };
  setQuality('sedang');
  return api;
}
