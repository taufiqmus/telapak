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

  // karakter: badan kapsul + satu lengan yang direntangkan ke bat
  function makeChar(shirt) {
    const g = new THREE.Group(), skin = 0xf1c27d;
    const part = (geo, c, x, y, o) => { const m = new THREE.Mesh(geo, mat(c, o)); m.position.set(x, y, 0); g.add(m); return m; };
    part(new THREE.CapsuleGeometry(.07, .66, 4, 10), 0x222a44, -.1, .42); part(new THREE.CapsuleGeometry(.07, .66, 4, 10), 0x222a44, .1, .42);
    for (const x of [-.1, .1]) { const s = part(new THREE.BoxGeometry(.11, .06, .22), 0xf7f9fc, x, .03, {roughness: .6}); s.position.z = .04; } // sepatu
    const torso = part(new THREE.CapsuleGeometry(.19, .32, 6, 14), shirt, 0, 1.08, {roughness: .85}); torso.scale.z = .62;
    part(new THREE.CylinderGeometry(.05, .06, .08, 10), skin, 0, 1.36);
    part(new THREE.SphereGeometry(.12, 20, 14), skin, 0, 1.5, {roughness: .6});
    part(new THREE.TorusGeometry(.118, .018, 8, 24), 0xffffff, 0, 1.56).rotation.x = Math.PI / 2; // ikat kepala
    const idle = part(new THREE.CapsuleGeometry(.04, .42, 4, 8), skin, -.25, 1.1); // lengan bebas, digeser ke sisi non-pemukul tiap frame
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.04, .045, 1, 10), mat(skin)); scene.add(arm);
    scene.add(g); return {g, arm, idle};
  }
  const chars = {h: makeChar(COLOR.h), g: makeChar(COLOR.g)};
  chars.h.g.rotation.y = Math.PI; // menghadap meja
  const fpArm = {h: null, g: null};
  for (const k of ['h', 'g']) { fpArm[k] = new THREE.Mesh(new THREE.CylinderGeometry(.045, .05, 1, 10), mat(0xf1c27d)); scene.add(fpArm[k]); }

  const up = new THREE.Vector3(0, 1, 0);
  function setArm(arm, from, to) {
    const d = new THREE.Vector3().subVectors(to, from), len = d.length();
    arm.position.copy(from).addScaledVector(d, .5); arm.scale.y = len;
    arm.quaternion.setFromUnitVectors(up, d.normalize());
  }
  const grip = b => new THREE.Vector3(b.x - .25 * Math.sin(b.r), b.y - .25 * Math.cos(b.r) * Math.cos(b.p), b.z + .25 * Math.cos(b.r) * Math.sin(b.p)); // ujung gagang

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

      for (const k of ['h', 'g']) {
        const s = k === 'h' ? 1 : -1, b = F.bats[k], c = chars[k], e = F.eyes[k], ex = s * e.x;
        const ow = new THREE.Vector3(ex + (b.x - ex) * .3, Math.min(0, e.y), s * (TL / 2 + 1)); // badan ikut kepala: condong dan jongkok
        c.g.position.copy(ow);
        const hs = F.hands[k] === 'L' ? -1 : 1; // lengan pemukul dari bahu tangan pemukul; backhand = lengan menyilang badan
        c.idle.position.x = hs * .25;
        setArm(c.arm, new THREE.Vector3(ow.x + s * hs * .26, 1.3 + ow.y, ow.z), grip(b));
        setArm(fpArm[k], new THREE.Vector3(ex + s * (F.hands[k] === 'R' ? .3 : -.3), 1.15 + e.y, s * (EYE_Z - .05)), grip(b));
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
          chars[k].g.visible = chars[k].arm.visible = F.inGame && !mine;
          fpArm[k].visible = F.inGame && mine;
          bats[k].visible = F.inGame;
        }
        if (post) { renderer.setViewport(0, 0, W, H); composer.render(dt); } else renderer.render(scene, cam);
      }
    }
  };
  setQuality('sedang');
  return api;
}
