// Tampilan 3D: ruangan, meja, bola, bat, karakter, efek. Tidak tahu apa-apa soal aturan permainan.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {TL, TW, TY, NET_TOP, BR, EYE_Y, EYE_Z, LOOK_Y, LOOK_Z, FOV, clamp} from './physics.js';

export const COLOR = {h: 0x2f7de1, g: 0xdc2626};

export function createScene(cv) {
  const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // model pose juga butuh GPU
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, .05, 60);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({color: c, roughness: .8, ...o});
  const box = (w, h, d, c, x, y, z, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); scene.add(m); return m; };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 6, 3); scene.add(sun);
  const sun2 = sun.clone(); sun2.position.set(-2, 6, -3); scene.add(sun2); // sisi tamu ikut terang

  // ruangan: lantai, matras, dinding, pembatas, lampu
  box(16, .02, 16, 0x5a1a1c, 0, -.01, 0);
  box(6, .01, 9, 0x8e2a24, 0, .005, 0);
  const room = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 16), new THREE.MeshStandardMaterial({color: 0x2c3d5a, side: THREE.BackSide, roughness: 1}));
  room.position.y = 3; scene.add(room);
  for (const x of [-3, 3]) box(.05, .7, 9, 0x12305f, x, .35, 0);
  for (const z of [-4.5, 4.5]) box(6, .7, .05, 0x12305f, 0, .35, z);
  for (const z of [-3, 0, 3]) box(2.5, .05, .3, 0xfff7d6, 0, 5.95, z, {emissive: 0xfff7d6, emissiveIntensity: 1});
  // penonton di tribun samping: balok berwarna, cukup untuk memberi rasa ramai
  const crowd = [];
  for (const x of [-5.2, 5.2]) for (let i = 0; i < 14; i++) for (let row = 0; row < 2; row++) {
    const c = [0xf59e0b, 0x22c55e, 0x3b82f6, 0xe11d48, 0xa855f7, 0xf1f5f9][(i * 3 + row) % 6];
    const m = box(.35, .55, .3, c, x + Math.sign(x) * row * .6, .55 + row * .35, -4 + i * .62);
    m.userData.y0 = m.position.y; crowd.push(m);
  }
  for (const x of [-5.2, 5.2]) box(1.6, .3, 9, 0x1e293b, x + Math.sign(x) * .3, .15, 0);

  // meja, garis, net, kaki
  box(TW, .03, TL, 0x0b4a9e, 0, TY - .015, 0);
  for (const x of [-TW / 2 + .01, TW / 2 - .01]) box(.02, .002, TL, 0xffffff, x, TY + .001, 0);
  for (const z of [-TL / 2 + .01, TL / 2 - .01]) box(TW, .002, .02, 0xffffff, 0, TY + .001, z);
  box(.01, .002, TL, 0xffffff, 0, TY + .001, 0);
  for (const x of [-TW / 2 + .1, TW / 2 - .1]) for (const z of [-TL / 2 + .2, TL / 2 - .2]) box(.06, TY - .03, .06, 0x1f2937, x, (TY - .03) / 2, z);
  box(TW + .3, .1525, .004, 0xf1f5f9, 0, TY + .076, 0, {transparent: true, opacity: .55});
  box(TW + .3, .014, .01, 0xffffff, 0, NET_TOP, 0);
  for (const x of [-(TW / 2 + .15), TW / 2 + .15]) box(.025, .18, .025, 0x94a3b8, x, TY + .09, 0);

  // bola + bayangan + jejak
  const ballMat = mat(0xffa94d, {emissive: 0xff7a00, emissiveIntensity: .35});
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 24, 16), ballMat); scene.add(ball);
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

  // bat: bilah merah (karet) + sisi hitam + gagang
  function makeBat() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .018, 28), [mat(0x3a2a1a), mat(0xdc2626), mat(0x111111)]);
    blade.rotation.x = Math.PI / 2; g.add(blade); // pusat bilah = pusat telapak, jadi derau sudut tidak menggeser bilah
    const h = new THREE.Mesh(new THREE.BoxGeometry(.035, .13, .02), mat(0xd6a76a)); h.position.y = -.2; g.add(h);
    scene.add(g); return g;
  }
  const bats = {h: makeBat(), g: makeBat()};

  // karakter lowpoly: badan + satu lengan yang direntangkan ke bat
  function makeChar(shirt) {
    const g = new THREE.Group(), skin = 0xf1c27d;
    const part = (geo, c, x, y) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, 0); g.add(m); return m; };
    part(new THREE.BoxGeometry(.14, .8, .16), 0x222a44, -.1, .4); part(new THREE.BoxGeometry(.14, .8, .16), 0x222a44, .1, .4);
    part(new THREE.BoxGeometry(.4, .55, .22), shirt, 0, 1.08);
    part(new THREE.SphereGeometry(.12, 16, 12), skin, 0, 1.5);
    part(new THREE.BoxGeometry(.26, .05, .26), 0xffffff, 0, 1.6); // ikat kepala
    part(new THREE.BoxGeometry(.08, .5, .08), skin, -.25, 1.1);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1, 8), mat(skin)); scene.add(arm);
    scene.add(g); return {g, arm};
  }
  const chars = {h: makeChar(COLOR.h), g: makeChar(COLOR.g)};
  chars.h.g.rotation.y = Math.PI; // menghadap meja
  const fpArm = {h: null, g: null};
  for (const k of ['h', 'g']) { fpArm[k] = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1, 8), mat(0xf1c27d)); scene.add(fpArm[k]); }

  const up = new THREE.Vector3(0, 1, 0);
  function setArm(arm, from, to) {
    const d = new THREE.Vector3().subVectors(to, from), len = d.length();
    arm.position.copy(from).addScaledVector(d, .5); arm.scale.y = len;
    arm.quaternion.setFromUnitVectors(up, d.normalize());
  }
  const grip = b => new THREE.Vector3(b.x - .25 * Math.sin(b.r), b.y - .25 * Math.cos(b.r) * Math.cos(b.p), b.z + .25 * Math.cos(b.r) * Math.sin(b.p)); // ujung gagang

  let shake = 0, cheer = 0;
  const api = {
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
    // F: {D: bola dan fase, bats: {h, g}, views: [{side: 'h'|'g'|'tv', x, y, w, h}], hands: {h, g}, inGame, dt}
    draw(F) {
      const {D, dt} = F, W = cv.clientWidth, H = cv.clientHeight, sz = renderer.getSize(new THREE.Vector2());
      if (sz.x !== W || sz.y !== H) renderer.setSize(W, H, false);
      for (const k of ['h', 'g']) { const b = F.bats[k], m = bats[k]; m.position.set(b.x, b.y, b.z); m.rotation.z = -b.r; m.rotation.x = -b.p; }

      const live = D.ph === 'serve' || D.ph === 'play';
      ball.visible = live; ball.position.set(D.bx, D.by, D.bz);
      ballMat.emissive.setHex(D.w > .15 ? 0xff3d00 : D.w < -.15 ? 0x0066ff : 0xff7a00);
      const onTable = Math.abs(D.bx) < TW / 2 && Math.abs(D.bz) < TL / 2;
      shadow.visible = live; shadow.position.set(D.bx, onTable ? TY + .003 : .012, D.bz);
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
      crowd.forEach((m, i) => { m.position.y = m.userData.y0 + (cheer > 0 ? Math.abs(Math.sin(tNow * 9 + i)) * .12 * Math.min(1, cheer) : 0); });
      shake *= Math.exp(-14 * dt);

      for (const k of ['h', 'g']) {
        const s = k === 'h' ? 1 : -1, b = F.bats[k], c = chars[k], ow = new THREE.Vector3(b.x * .3, 0, s * (TL / 2 + 1));
        c.g.position.copy(ow);
        setArm(c.arm, new THREE.Vector3(ow.x - s * .26, 1.3, ow.z), grip(b));
        setArm(fpArm[k], new THREE.Vector3(s * (F.hands[k] === 'R' ? .3 : -.3), 1.15, s * (EYE_Z - .05)), grip(b));
      }

      renderer.setScissorTest(true);
      for (const v of F.views) {
        const x = v.x * W, y = v.y * H, w = v.w * W, h = v.h * H;
        renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
        cam.aspect = w / h; cam.updateProjectionMatrix();
        const tv = v.side === 'tv', s = v.side === 'h' ? 1 : -1;
        if (tv) { cam.position.set(3.3, 2.1, .6); cam.lookAt(0, .85, 0); }
        else {
          cam.position.set((Math.random() - .5) * shake, EYE_Y + (Math.random() - .5) * shake, s * EYE_Z); // kamera orang pertama, diam kecuali getar smash
          cam.lookAt(0, LOOK_Y, s * LOOK_Z);
        }
        for (const k of ['h', 'g']) {
          const mine = !tv && k === v.side;
          chars[k].g.visible = chars[k].arm.visible = F.inGame && !mine;
          fpArm[k].visible = F.inGame && mine;
          bats[k].visible = F.inGame;
        }
        renderer.render(scene, cam);
      }
    }
  };
  return api;
}
