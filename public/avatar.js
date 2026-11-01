// Kael Studio avatar renderer (OBS Browser Source / preview).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview');
const DEBUG = params.has('debug');
const $msg = document.getElementById('msg'), $dbg = document.getElementById('debug');
if (DEBUG) $dbg.style.display = 'block';
const say = (t) => { $msg.textContent = t || ''; };

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.05, 50);
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1.2, 2.2, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0xa35cff, 0.8); rim.position.set(1.5, 1.8, -2.5); scene.add(rim);
const amb = new THREE.HemisphereLight(0xffffff, 0x444455, 0.9); scene.add(amb);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); frameCamera(); });

// ------------------------------------------------------------------ state
const rig = new THREE.Group(); scene.add(rig);     // per-avatar position / rotation / scale
let tune = { blink: true, gaze: 1, mouth: 1, expressions: 1 };
let headTop = 1.75;
let vrm = null, settings = {}, exprMap = new Map(), headRest = new THREE.Vector3(0, 1.45, 0), modelHeight = 1.7, loadedName = null;
const track = { frame: null, recv: 0, vmc: null, vmcRecv: 0 };
const active = [];        // triggered expressions { names:{expr:w}, start, dur, intensity }
const gestures = [];      // { name, start, dur }
const items = [];         // thrown items
let headImpulse = new THREE.Vector3(), headKick = new THREE.Vector3();   // reaction to hits (euler radians + velocity)
const clock = new THREE.Clock();
const Q = (a) => (a ? new THREE.Quaternion(a[0], a[1], a[2], a[3]) : new THREE.Quaternion());
const qI = new THREE.Quaternion();

// ------------------------------------------------------------------ expressions
// Name resolution: exact expression in the model (case-insensitive) > Kael library clip (Expr_*) > VRM preset alias > recipe.
const ALIAS = { joy: 'happy', happy: 'happy', fun: 'relaxed', relaxed: 'relaxed', sorrow: 'sad', sad: 'sad', angry: 'angry', surprised: 'surprised', wow: 'surprised', blink: 'blink' };
const RECIPES = {   // for models without Kael's library: built from ARKit/preset shapes when present
  Laughing: { happy: 1, aa: 0.4 }, Embarrassed: { happy: 0.4 }, Smug: { relaxed: 0.8 }, Wink_L: { blinkLeft: 1, happy: 0.3 },
};
function buildExprMap() {
  exprMap = new Map();
  for (const e of vrm.expressionManager?.expressions || []) exprMap.set(e.expressionName.toLowerCase(), e.expressionName);
}
const hasExpr = (n) => exprMap.has(n.toLowerCase());
function resolveTrigger(name) {
  const n = name.toLowerCase();
  if (exprMap.has('expr_' + n)) return { [exprMap.get('expr_' + n)]: 1 };          // Kael library preset (Expr_Laughing, ...)
  if (exprMap.has(n)) return { [exprMap.get(n)]: 1 };
  if (ALIAS[n] && exprMap.has(ALIAS[n])) return { [exprMap.get(ALIAS[n])]: 1 };
  const r = Object.entries(RECIPES).find(([k]) => k.toLowerCase() === n);
  if (r) { const o = {}; for (const [k, w] of Object.entries(r[1])) if (exprMap.has(k.toLowerCase())) o[exprMap.get(k.toLowerCase())] = w; return o; }
  return null;
}
function trigger(name, intensity = 1, dur = 2.5) {
  const names = resolveTrigger(name);
  if (!names) { console.warn('unknown expression', name); return; }
  active.push({ names, start: clock.elapsedTime, dur, intensity });
}
// ARKit (Perfect Sync) -> VRM presets, used only when the model lacks ARKit shapes
function arkitFallback(bs) {
  const g = (k) => bs[k] || 0, out = {};
  out.blinkLeft = g('eyeBlinkLeft'); out.blinkRight = g('eyeBlinkRight');
  const jaw = g('jawOpen'), funnel = Math.max(g('mouthFunnel'), g('mouthPucker')), smile = (g('mouthSmileLeft') + g('mouthSmileRight')) / 2;
  out.aa = jaw * (1 - funnel); out.oh = jaw * funnel; out.ou = funnel * (1 - jaw);
  out.ih = (g('mouthStretchLeft') + g('mouthStretchRight')) / 2 * (1 - jaw); out.ee = smile * jaw * 0.6;
  out.happy = smile * 0.7; out.surprised = Math.max(0, g('browInnerUp') * 0.6 + jaw * 0.3 - smile);
  out.angry = (g('browDownLeft') + g('browDownRight')) / 2 * 0.8; out.sad = g('browInnerUp') * Math.max(0, (g('mouthFrownLeft') + g('mouthFrownRight')) / 2);
  return out;
}

// ------------------------------------------------------------------ loading
async function loadAvatar(url, name = url, kind = 'vrm') {
  if (!url || url === loadedName) return;
  loadedName = url; say(`Loading ${name}…`);
  try {
    let v;
    if (kind === 'created') {                 // character made in the Kael Studio creator: built from its recipe
      const [recipe, { buildCharacter }] = await Promise.all([fetch(url).then((r) => { if (!r.ok) throw new Error('character file missing'); return r.json(); }), import('/creator/build.js')]);
      if (loadedName !== url) return;
      v = buildCharacter(recipe);
      isVRM0 = false;
    } else {
      const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
      const gltf = await loader.loadAsync(url);
      if (!gltf.userData.vrm) throw new Error('not a VRM avatar');
      v = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons?.(gltf.scene);
      isVRM0 = v.meta?.metaVersion === '0';
      VRMUtils.rotateVRM0(v);
    }
    v.scene.traverse((o) => { o.frustumCulled = false; });
    if (vrm) { rig.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); }
    vrm = v; rig.add(vrm.scene);
    if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
    buildExprMap();
    measure(); say('');
    window.__avatarReady = { name, expressions: exprMap.size, perfectSync: hasExpr('eyeBlinkLeft') && hasExpr('jawOpen') };
  } catch (e) { say(`Could not load ${name}: ${e.message}`); console.error(e); loadedName = null; }
}
function measure() {                 // camera framing is based on the avatar at its natural size and position
  if (!vrm) return;
  const keep = [rig.position.clone(), rig.rotation.clone(), rig.scale.clone()];
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); rig.scale.setScalar(1);
  rig.updateMatrixWorld(true);
  vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(headRest);
  const box = new THREE.Box3().setFromObject(vrm.scene); modelHeight = box.max.y - Math.min(0, box.min.y);
  headTop = Math.min(box.max.y, headRest.y + 0.9);
  rig.position.copy(keep[0]); rig.rotation.copy(keep[1]); rig.scale.copy(keep[2]); rig.updateMatrixWorld(true);
  frameCamera();
}
function applyTransform(tr = {}) {
  const sc = tr.scale || 1;              // scale around the head so the face stays in the chosen framing
  rig.position.set(tr.x || 0, (tr.y || 0) + headRest.y * (1 - sc), 0);
  rig.rotation.set(0, THREE.MathUtils.degToRad(tr.rotY || 0), 0);
  rig.scale.setScalar(sc);
  vrm?.resetSprings?.();
}

// ------------------------------------------------------------------ camera / look
function frameCamera() {
  const o = settings.cameraOffset || { x: 0, y: 0, zoom: 1 };
  const hs = Math.max(0.2, headTop - headRest.y);          // head size above the head bone (big for chibi / mascot heads)
  const presets = { head: [(headTop + headRest.y) / 2 - 0.02, Math.max(0.85, (hs + 0.12) * 2.3)], bust: [(headTop + headRest.y - 0.36) / 2, Math.max(1.55, (hs + 0.38) * 2.55)],
    half: [(headTop + headRest.y - 0.85) / 2, Math.max(2.5, (hs + 0.9) * 2.4)], full: [modelHeight * 0.52, Math.max(4.6, modelHeight * 2.9)] };
  const [ty, dist] = presets[settings.camera] || presets.bust;
  const d = dist / (o.zoom || 1);
  camera.position.set(o.x || 0, ty + (o.y || 0), d);
  camera.lookAt(o.x || 0, ty + (o.y || 0), 0);
}
function applySettings(s) {
  settings = s;
  const bg = { transparent: null, green: '#00ff00', blue: '#0000ff', color: s.backgroundColor }[s.background];
  if (bg && !PREVIEW) { renderer.setClearColor(new THREE.Color(bg), 1); } else renderer.setClearColor(0x000000, PREVIEW ? 0 : 0);
  key.color.set(s.lightColor || '#ffffff'); key.intensity = 1.6 * (s.lightIntensity ?? 1);
  amb.intensity = 0.9 * (s.lightIntensity ?? 1);
  rim.color.set(s.rimColor || '#a35cff'); rim.intensity = 1.2 * (s.rimIntensity ?? 0.6);
  tune = { blink: true, gaze: 1, mouth: 1, expressions: 1, ...(s.active?.tracking || {}) };
  applyTransform(s.active?.transform);
  if (s.active) loadAvatar(s.active.url, s.active.name, s.active.kind).then(() => applyTransform(s.active?.transform));
  else say('No avatar selected. Open the Avatar Library to import one.');
}

// ------------------------------------------------------------------ thrown items (viewer interaction)
const EMOJI = { heart: '❤️', star: '⭐', tomato: '🍅', bonk: '🔨', gift: '🎁', pizza: '🍕', flower: '🌸', ball: '⚽' };
const REACT = { heart: 'joy', star: 'joy', gift: 'joy', pizza: 'joy', flower: 'joy', tomato: 'surprised', bonk: 'angry', ball: 'surprised' };
const texCache = {};
function emojiTexture(ch) {
  if (texCache[ch]) return texCache[ch];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (texCache[ch] = t);
}
function throwItem(kind = 'heart', count = 1) {
  if (!vrm) return;
  for (let i = 0; i < Math.min(count, 20); i++) {
    const mat = new THREE.SpriteMaterial({ map: emojiTexture(EMOJI[kind] || EMOJI.heart), transparent: true, depthTest: false });
    const s = new THREE.Sprite(mat); s.scale.setScalar(kind === 'bonk' ? 0.22 : 0.14); s.renderOrder = 10;
    const head = new THREE.Vector3(); vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(head); head.y += 0.06;
    const side = Math.random() < 0.5 ? -1 : 1;
    const start = new THREE.Vector3(side * (0.9 + Math.random() * 0.4), head.y - 0.5 + Math.random() * 0.3, 0.6 + Math.random() * 0.3);
    const T = 0.75 + Math.random() * 0.2, g = -4.0;
    const vel = head.clone().sub(start).divideScalar(T); vel.y -= 0.5 * g * T;       // ballistic arc that lands on the head
    scene.add(s); s.position.copy(start);
    items.push({ s, vel, g, t: 0, T, kind, hit: false, delay: i * 0.12, side, spin: (Math.random() - 0.5) * 8 });
  }
}
function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.delay > 0) { it.delay -= dt; it.s.visible = false; continue; }
    it.s.visible = true; it.t += dt;
    it.vel.y += it.g * dt; it.s.position.addScaledVector(it.vel, dt);
    it.s.material.rotation += it.spin * dt;
    if (!it.hit && it.t >= it.T) {
      it.hit = true;
      const strength = it.kind === 'bonk' ? 0.5 : it.kind === 'heart' || it.kind === 'flower' ? 0.06 : 0.18;    // radians
      headKick.x += (it.kind === 'bonk' ? 0.8 : 0.25) * strength;                         // knocked down a little
      headKick.y += -it.side * strength * 0.6; headKick.z += -it.side * strength * 0.7;   // turned away from the impact side
      headKick.clampScalar(-0.6, 0.6);
      trigger(REACT[it.kind] || 'surprised', 1, it.kind === 'bonk' ? 1.6 : 1.2);
      it.vel.set(-it.side * 0.6, 1.2, 0.4); it.spin *= -2;
    }
    if (it.hit) it.s.material.opacity = Math.max(0, 1 - (it.t - it.T) / 0.9);
    if (it.t > it.T + 1.0) { scene.remove(it.s); it.s.material.dispose(); items.splice(i, 1); }
  }
}

// ------------------------------------------------------------------ pose helpers
const B = (n) => vrm?.humanoid.getNormalizedBoneNode(n);
function setBone(name, q, w = 1) { const b = B(name); if (!b) return; if (w >= 1) b.quaternion.copy(q); else b.quaternion.copy(qI).slerp(q, w); }
function blendBone(name, q, w) { const b = B(name); if (b) b.quaternion.slerp(conv(q), w); }
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const aa = (axis, a) => new THREE.Quaternion().setFromAxisAngle(AX[axis], a);
const eul = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
// VRM 0.x files face -Z internally; three-vrm turns the root 180 deg, so bone-local rotations need the same turn applied
let isVRM0 = false;
const conv = (q) => (isVRM0 ? new THREE.Quaternion(-q.x, q.y, -q.z, q.w) : q);
const smoothB = (name, target, rate, dt) => { const b = B(name); if (b) smooth(b.quaternion, target, rate, dt); };
const smooth = (cur, target, rate, dt) => cur.slerp(conv(target), 1 - Math.exp(-rate * dt));
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const SEG_V0 = { Thumb: ['Metacarpal', 'Proximal', 'Distal'], other: ['Proximal', 'Intermediate', 'Distal'] };
function fingerBoneName(side, finger, j) {
  const s = side === 'left' ? 'left' : 'right';
  if (finger === 'Thumb') {
    for (const seg of [['Metacarpal', 'Proximal', 'Distal'], ['Proximal', 'Intermediate', 'Distal']]) { const n = `${s}Thumb${seg[j]}`; if (B(n)) return n; }
    return null;
  }
  return `${s}${finger}${SEG_V0.other[j]}`;
}
// idle pose: arms relaxed down, small breathing
function idleTargets(t) {
  const breathe = settings.idleMotion !== false ? Math.sin(t * 1.6) * 0.012 : 0;
  const sway = settings.idleMotion !== false ? Math.sin(t * 0.45) * 0.02 : 0;
  return {
    spine: eul(breathe, sway * 0.5, sway * 0.3), chest: eul(breathe * 1.5, 0, 0),
    leftUpperArm: aa('z', -1.22).multiply(aa('x', 0.12)), rightUpperArm: aa('z', 1.22).multiply(aa('x', 0.12)),
    leftLowerArm: aa('y', 0.25), rightLowerArm: aa('y', -0.25),
    leftHand: qI.clone(), rightHand: qI.clone(),
    head: eul(Math.sin(t * 0.7) * 0.015, Math.sin(t * 0.33) * 0.03, 0), neck: qI.clone(),
  };
}
// gestures (procedural, override arms/head while active)
function gestureTargets(g, t) {
  const p = (t - g.start) / g.dur, env = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) ** 0.5;
  const o = {};
  if (g.name === 'wave') {
    o.rightUpperArm = aa('y', 0.35).multiply(aa('z', -0.5)); o.rightLowerArm = aa('z', -1.3 + Math.sin(t * 9) * 0.32); o.rightHand = aa('z', Math.sin(t * 9 + 0.6) * 0.25);
  } else if (g.name === 'nod') {
    o.head = eul(Math.sin(p * Math.PI * 4) * 0.22, 0, 0);
  } else if (g.name === 'dance') {
    const b = Math.sin(t * 6);
    o.spine = eul(0, b * 0.15, b * 0.12); o.head = eul(Math.abs(b) * 0.12, -b * 0.15, -b * 0.1);
    o.leftUpperArm = aa('z', -0.6 + b * 0.4); o.rightUpperArm = aa('z', 0.6 + b * 0.4);
    o.leftLowerArm = aa('y', 1.2); o.rightLowerArm = aa('y', -1.2);
  }
  return { o, env };
}

// ------------------------------------------------------------------ main update
const lastGaze = { yaw: 0, pitch: 0 };
let autoBlink = { next: 2, phase: -1 };
function update(dt, t) {
  if (!vrm) return;
  const now = performance.now();
  const f = track.frame, age = (now - track.recv) / 1000;
  const vmcFresh = track.vmc && (now - track.vmcRecv) < 500;
  // tracking weights fade out smoothly when tracking is lost (0.4 s grace, 0.6 s fade)
  const fw = (c) => (c ? Math.max(0, Math.min(1, 1 - (age - 0.4) / 0.6)) : 0);
  const faceW = vmcFresh ? 1 : fw(f?.face);
  const idle = idleTargets(t);
  const face = vmcFresh ? track.vmc : f?.face;
  // --- head / neck / spine
  const headQ = face?.head ? Q(face.head) : qI;
  const kick = eul(headKick.x, headKick.y, headKick.z);
  const neckT = qI.clone().slerp(headQ, 0.4), headT = qI.clone().slerp(headQ, 0.6);
  smoothB('neck', idle.neck.clone().slerp(neckT, faceW), 20, dt);
  smoothB('head', idle.head.clone().slerp(headT, faceW).multiply(kick), 20, dt);
  const pose = f?.pose, poseW = fw(pose);
  const spineT = idle.spine.clone().slerp(pose?.spine ? Q(pose.spine) : qI.clone().slerp(headQ, 0.18).multiply(idle.spine), Math.max(poseW, faceW * 0.6));
  smoothB('spine', spineT, 10, dt);
  smoothB('chest', idle.chest, 10, dt);
  // --- arms (pose tracking where visible, otherwise relaxed)
  for (const s of ['left', 'right']) {
    const w = poseW * (pose?.conf?.[s] ? 1 : 0);
    for (const seg of ['UpperArm', 'LowerArm', 'Hand']) {
      const tracked = pose?.[`${s}${seg}`];
      const target = tracked ? idle[`${s}${seg}`].clone().slerp(Q(tracked), w) : idle[`${s}${seg}`];
      smoothB(`${s}${seg}`, target, 14, dt);
    }
    // fingers: curl angles (radians) per joint
    const hand = f?.hands?.[s], hw = fw(hand);
    for (const finger of FINGER_NAMES) {
      for (let j = 0; j < 3; j++) {
        const bn = fingerBoneName(s, finger, j); if (!bn || !B(bn)) continue;
        const relaxed = finger === 'Thumb' ? 0.15 : 0.18 + j * 0.08;
        const a = (hand ? hand.fingers[finger][j] : relaxed) * hw + relaxed * (1 - hw);
        const q = finger === 'Thumb' ? aa('y', (s === 'left' ? 1 : -1) * a * 0.8) : aa('z', (s === 'left' ? -1 : 1) * a);
        smoothB(bn, q, 18, dt);
      }
    }
  }
  // --- gestures override
  for (let i = gestures.length - 1; i >= 0; i--) {
    const g = gestures[i];
    if (t - g.start > g.dur) { gestures.splice(i, 1); continue; }
    const { o, env } = gestureTargets(g, t);
    for (const [bn, q] of Object.entries(o)) blendBone(bn, q, env);
  }
  // --- head kick decay (spring back)
  headKick.multiplyScalar(Math.exp(-6 * dt));
  // --- expressions
  const em = vrm.expressionManager;
  if (em) {
    const vals = {};
    const MOUTH = /^(jaw|mouth|aa|ih|ou|ee|oh)/i, BLINK = /blink/i;
    const add = (k, v, kind) => {
      if (BLINK.test(k) && !tune.blink && kind !== 'trigger') return;
      if (MOUTH.test(k)) v *= tune.mouth; else if (kind !== 'trigger') v *= tune.expressions;
      if (v > 0) vals[k] = Math.min(1, (vals[k] || 0) + v);
    };
    const bs = face?.bs;
    if (bs && faceW > 0) {
      const perfectSync = hasExpr('jawOpen');
      if (perfectSync) for (const [k, v] of Object.entries(bs)) { if (k.startsWith('eyeLook')) continue; if (exprMap.has(k.toLowerCase())) add(exprMap.get(k.toLowerCase()), v * faceW); }
      else for (const [k, v] of Object.entries(arkitFallback(bs))) if (exprMap.has(k.toLowerCase())) add(exprMap.get(k.toLowerCase()), v * faceW);
    }
    // voice fallback (mic level -> mouth) when the face is not tracked
    if (f?.voice && faceW < 0.5) add(exprMap.get('jawopen') || exprMap.get('aa') || 'aa', Math.min(1, f.voice) * (1 - faceW));
    // auto-blink when the face is not tracked
    if (faceW < 0.5) {
      if (autoBlink.phase < 0 && t > autoBlink.next) autoBlink.phase = 0;
      if (autoBlink.phase >= 0) {
        autoBlink.phase += dt / 0.18; const b = Math.sin(Math.PI * Math.min(1, autoBlink.phase));
        add(exprMap.get('blink') || 'blink', b * (1 - faceW));
        if (autoBlink.phase >= 1) { autoBlink.phase = -1; autoBlink.next = t + 2.5 + Math.random() * 3.5; }
      }
    }
    // triggered expressions (fade in 0.25 s, hold, fade out 0.4 s)
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i], el = t - a.start;
      if (el > a.dur) { active.splice(i, 1); continue; }
      const env = Math.min(1, el / 0.25, (a.dur - el) / 0.4) * a.intensity;
      for (const [k, w] of Object.entries(a.names)) add(k, w * env, 'trigger');
    }
    for (const e of em.expressions) em.setValue(e.expressionName, vals[e.expressionName] || 0);
  }
  // --- gaze (eye bones via lookAt)
  if (vrm.lookAt) {
    const g0 = face?.gaze || { yaw: 0, pitch: 0 }, g = { yaw: g0.yaw * tune.gaze, pitch: g0.pitch * tune.gaze };
    lastGaze.yaw += ((g.yaw * faceW) - lastGaze.yaw) * Math.min(1, dt * 18);
    lastGaze.pitch += ((g.pitch * faceW) - lastGaze.pitch) * Math.min(1, dt * 18);
    vrm.lookAt.yaw = lastGaze.yaw; vrm.lookAt.pitch = lastGaze.pitch;
  }
  if (DEBUG) $dbg.textContent = `face ${faceW.toFixed(2)}  pose ${poseW.toFixed(2)}  hands L${f?.hands?.left ? 1 : 0} R${f?.hands?.right ? 1 : 0}\n` +
    `vmc ${vmcFresh ? 'on' : 'off'}  expr ${active.length}  items ${items.length}  fps ${(1 / dt).toFixed(0)}`;
}

function loop() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  update(dt, t);
  updateItems(dt);
  vrm?.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

// ------------------------------------------------------------------ connection
function handle(msg) {
  if (msg.type === 'frame') { if (msg.source === 'vmc') { track.vmc = msg.face; track.vmcRecv = performance.now(); } else { track.frame = msg; track.recv = performance.now(); } }
  else if (msg.type === 'settings') applySettings(msg.settings);
  else if (msg.type === 'trigger') trigger(msg.name, msg.intensity ?? 1, msg.duration ?? 2.5);
  else if (msg.type === 'throw') throwItem(msg.item, msg.count || 1);
  else if (msg.type === 'gesture') gestures.push({ name: msg.name, start: clock.elapsedTime, dur: { wave: 2.6, nod: 1.2, dance: 4.5 }[msg.name] || 2 });
}
window.__handle = handle;     // for testing
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=avatar`);
  ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => setTimeout(connect, 1500);
}
connect();
