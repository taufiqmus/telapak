// Suara disintesis, tanpa file.
let ac = null, noiseBuf = null, on = true;
export const setSound = v => { on = v; };
export function audioInit() {
  ac = ac || new AudioContext(); ac.resume();
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
}
const ok = () => ac && on;

function tone(f, dur, vol, type = 'sine', at = 0, drop = .6) {
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * drop, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
function noise(freq, q, dur, vol, at = 0, attack = .002) {
  const t = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(ac.destination); s.start(t, Math.random()); s.stop(t + dur + .05);
}

// bola plastik di karet: klik pendek berfrekuensi tinggi + nada kayu
export function sHit(power = .5) { if (!ok()) return; noise(2600, 1.2, .05, .5 + .3 * power); tone(1100 + 300 * power, .06, .25, 'triangle'); }
export function sSmash() { if (!ok()) return; noise(1800, .8, .12, .9); tone(180, .18, .5, 'sine', 0, .4); }
export function sBounce() { if (!ok()) return; noise(3400, 2, .035, .35); tone(780, .04, .15); }
export function sPoint(win) { if (!ok()) return; tone(win ? 660 : 300, .16, .2, 'triangle'); tone(win ? 990 : 220, .22, .2, 'triangle', .14); }
export function sCrowd(big = false) { // tepuk tangan: banyak semburan derau pendek acak
  if (!ok()) return;
  const n = big ? 70 : 30, len = big ? 2.2 : 1.2;
  for (let i = 0; i < n; i++) noise(1200 + Math.random() * 2500, 1.5, .03 + Math.random() * .04, .08 + Math.random() * .1, Math.random() * len * (1 - .3 * Math.random()));
}
export function sChime() { if (!ok()) return; [784, 988, 1319].forEach((f, i) => tone(f, .3, .15, 'sine', i * .09, .98)); }
export function sTick() { if (!ok()) return; tone(1500, .03, .08, 'square'); }
