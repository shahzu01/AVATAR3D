// Kael Studio solver: MediaPipe results -> avatar-ready values.
// Frame conventions (shared with avatar.js): right-handed, +Y up, the performer and the avatar both face +Z (toward the
// camera). +X is the performer's / avatar's own LEFT. "Puppet" mapping by default: your left hand moves the avatar's left hand.
import { Quaternion, Vector3, Matrix4, Euler } from 'three';

const D2R = Math.PI / 180;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ filters
export class OneEuro {            // classic One Euro filter: smooth when still, responsive when moving
  constructor(minCutoff = 1.5, beta = 0.6, dCutoff = 1.0) { Object.assign(this, { minCutoff, beta, dCutoff }); this.x = null; this.dx = 0; this.t = 0; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}
export class QuatSmoother {       // One-Euro-style adaptive slerp for rotations
  constructor(minCutoff = 2.0, beta = 0.4) { this.minCutoff = minCutoff; this.beta = beta; this.q = null; this.t = 0; this.speed = 0; }
  filter(q, t) {
    if (!this.q) { this.q = q.clone(); this.t = t; return this.q.clone(); }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    if (this.q.dot(q) < 0) q = new Quaternion(-q.x, -q.y, -q.z, -q.w);
    const ang = this.q.angleTo(q) / dt;
    this.speed += OneEuro.alpha(1.0, dt) * (ang - this.speed);
    const a = OneEuro.alpha(this.minCutoff + this.beta * this.speed, dt);
    this.q.slerp(q, a);
    return this.q.clone();
  }
}
const toArr = (q) => [q.x, q.y, q.z, q.w];
const mirrorQuat = (q) => new Quaternion(q.x, -q.y, -q.z, q.w);     // reflect across the YZ plane

// ------------------------------------------------------------------ face
const LR = (n) => n.replace(/Left$/, '__R').replace(/Right$/, 'Left').replace(/__R$/, 'Right');
const DEADZONE = [[/^jawOpen$/, 0.05], [/^mouthSmile/, 0.07], [/^mouth(Funnel|Pucker)$/, 0.1], [/^mouth(Frown|Stretch|Press|Roll|Shrug|Dimple|LowerDown|UpperUp)/, 0.08], [/^brow/, 0.08], [/^cheek/, 0.08], [/^nose/, 0.1]];
export class FaceSolver {
  constructor() { this.neutral = null; this.neutralBs = {}; this.filters = {}; this.headF = new QuatSmoother(3.0, 0.5); this.smoothing = 0.5; }
  setSmoothing(s) {           // 0 = raw, 1 = very smooth
    this.smoothing = s;
    for (const f of Object.values(this.filters)) { f.minCutoff = 6 - 5 * s; }
    this.headF.minCutoff = 6 - 4.5 * s;
  }
  // grab the current pose as "neutral" (head straight, relaxed face)
  calibrate(raw) { if (raw) { this.neutral = raw.headQ.clone(); this.neutralBs = { ...raw.bs }; } }
  raw(result, opts) {
    if (!result?.faceBlendshapes?.length) return null;
    const bs = {};
    for (const c of result.faceBlendshapes[0].categories) if (c.categoryName !== '_neutral') bs[opts.swapLR ? LR(c.categoryName) : c.categoryName] = c.score;
    const m = new Matrix4().fromArray(result.facialTransformationMatrixes[0].data);
    const pos = new Vector3(), headQ = new Quaternion(), scl = new Vector3();
    m.decompose(pos, headQ, scl);
    return { bs, headQ, pos };
  }
  solve(result, t, opts = {}) {
    const raw = this.raw(result, opts);
    if (!raw) return null;
    let q = raw.headQ.clone();
    if (this.neutral) q = this.neutral.clone().invert().multiply(q);
    if (opts.mirror) q = mirrorQuat(q);
    // limit to a natural range
    const e = new Euler().setFromQuaternion(q, 'YXZ');
    e.x = Math.max(-40 * D2R, Math.min(40 * D2R, e.x)); e.y = Math.max(-60 * D2R, Math.min(60 * D2R, e.y)); e.z = Math.max(-35 * D2R, Math.min(35 * D2R, e.z));
    q.setFromEuler(e);
    q = this.headF.filter(q, t);
    // blendshapes: neutral offset removal, remaps, smoothing
    const out = {};
    for (let [k, v] of Object.entries(raw.bs)) {
      const n = this.neutralBs[k] || 0;
      if (n > 0 && n < 0.9) v = clamp01((v - n) / (1 - n));
      if (k.startsWith('eyeBlink')) v = smoothstep(0.30, 0.68, v);          // MediaPipe rarely reports a full blink
      else if (k === 'jawOpen') v = clamp01(v * 1.25);
      else if (k.startsWith('mouthSmile')) v = clamp01(v * 1.2);
      // dead zones: webcam noise makes the mouth and brows twitch at rest
      const dz = DEADZONE.find(([re]) => re.test(k));
      if (dz) v = clamp01((v - dz[1]) / (1 - dz[1]));
      const f = this.filters[k] || (this.filters[k] = new OneEuro(k.startsWith('eyeBlink') ? 8 - 4 * this.smoothing : 6 - 5 * this.smoothing, 1.2));
      out[k] = Math.round(clamp01(f.filter(v, t)) * 1000) / 1000;
    }
    // link the eyes: webcams often see one eye half-closed; blink together unless it is clearly a wink
    if (opts.linkEyes !== false) for (const [a, b] of [['eyeBlinkLeft', 'eyeBlinkRight'], ['eyeSquintLeft', 'eyeSquintRight'], ['eyeWideLeft', 'eyeWideRight']]) {
      const l = out[a] ?? 0, r = out[b] ?? 0;
      const wink = a.startsWith('eyeBlink') && Math.max(l, r) > 0.75 && Math.min(l, r) < 0.2;    // one eye clearly shut, the other clearly open
      if (!wink) { const m = Math.round((Math.max(l, r) * 0.65 + Math.min(l, r) * 0.35) * 1000) / 1000; out[a] = out[b] = m; }
    }
    if (opts.mirror) for (const k of Object.keys(out)) if (/Left$|Right$/.test(k) && k.endsWith('Left')) { const r = LR(k); [out[k], out[r]] = [out[r], out[k]]; }
    // gaze from eyeLook* (degrees). three-vrm: +yaw turns toward the avatar's left (+X), +pitch looks down.
    const L = (a) => out[a] || 0;
    const left = (L('eyeLookOutLeft') + L('eyeLookInRight')) / 2, right = (L('eyeLookInLeft') + L('eyeLookOutRight')) / 2;
    const up = (L('eyeLookUpLeft') + L('eyeLookUpRight')) / 2, down = (L('eyeLookDownLeft') + L('eyeLookDownRight')) / 2;
    const gaze = { yaw: (left - right) * 22, pitch: (down - up) * 18 };
    return { bs: out, head: toArr(q), gaze, pos: [raw.pos.x, raw.pos.y, raw.pos.z] };
  }
}

// ------------------------------------------------------------------ hands
const FINGERS = { Thumb: [1, 2, 3, 4], Index: [5, 6, 7, 8], Middle: [9, 10, 11, 12], Ring: [13, 14, 15, 16], Little: [17, 18, 19, 20] };
const v3 = (p) => new Vector3(p.x, -p.y, -p.z);           // MediaPipe world (image axes) -> ours
function basisQuat(f, s, f0, s0) {     // rotation taking rest basis (f0,s0) to current basis (f,s)
  const fx = f.clone().normalize(), sx = s.clone().sub(fx.clone().multiplyScalar(s.dot(fx))).normalize(), nx = fx.clone().cross(sx);
  const n0 = f0.clone().cross(s0);
  const M = new Matrix4().makeBasis(fx, sx, nx), M0 = new Matrix4().makeBasis(f0, s0, n0);
  return new Quaternion().setFromRotationMatrix(M.multiply(M0.transpose()));
}
export class HandSolver {
  constructor() { this.f = {}; this.q = { left: new QuatSmoother(2.5, 0.4), right: new QuatSmoother(2.5, 0.4) }; }
  solve(result, t, opts = {}) {
    const out = {};
    if (!result?.worldLandmarks?.length) return out;
    result.worldLandmarks.forEach((lm, i) => {
      const label = result.handednesses?.[i]?.[0]?.categoryName || result.handedness?.[i]?.[0]?.categoryName;
      const score = result.handednesses?.[i]?.[0]?.score ?? 1;
      if (score < 0.6) return;
      // MediaPipe handedness assumes a mirrored (selfie) image; our frames are not mirrored.
      let side = label === 'Left' ? 'right' : 'left';
      let P = lm.map(v3);
      if (opts.mirror) { side = side === 'left' ? 'right' : 'left'; P = P.map((p) => new Vector3(-p.x, p.y, p.z)); }
      const ang = (a, b, c) => { const u = P[b].clone().sub(P[a]), w = P[c].clone().sub(P[b]); return u.angleTo(w); };
      // palm frame: forward (wrist -> middle knuckle) and side (pinky -> index knuckle)
      const pf = P[9].clone().sub(P[0]).normalize();
      const ps = P[5].clone().sub(P[17]); ps.sub(pf.clone().multiplyScalar(ps.dot(pf))).normalize();
      const flexFromPalm = (a, b) => { const u = P[b].clone().sub(P[a]); u.sub(ps.clone().multiplyScalar(u.dot(ps))); return u.angleTo(pf); };   // ignores sideways spread
      const fingers = {};
      for (const [name, [a, b, c, d]] of Object.entries(FINGERS)) {
        const base = name === 'Thumb' ? ang(0, a, b) - 0.35 : flexFromPalm(a, b);
        const vals = [base, ang(a, b, c), ang(b, c, d)].map((x, j) => {
          const k = `${side}${name}${j}`, f = this.f[k] || (this.f[k] = new OneEuro(3, 0.8));
          return Math.round(Math.max(0, Math.min(1.8, f.filter(Math.max(0, x - 0.12), t))) * 1000) / 1000;
        });
        fingers[name] = vals;
      }
      // palm orientation (world): rest = fingers along +X (left) / -X (right), index side toward +Z, palm down
      const fwd = P[9].clone().sub(P[0]), sideV = P[5].clone().sub(P[17]);
      const f0 = new Vector3(side === 'left' ? 1 : -1, 0, 0), s0 = new Vector3(0, 0, 1);
      const qw = this.q[side].filter(basisQuat(fwd, sideV, f0, s0), t);
      out[side] = { fingers, palm: toArr(qw), score };
    });
    return out;
  }
}

// ------------------------------------------------------------------ pose (arms + upper body)
const PL = { lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lHip: 23, rHip: 24 };
export class PoseSolver {
  constructor() { this.s = {}; }
  sm(k, q, t) { return (this.s[k] || (this.s[k] = new QuatSmoother(2.2, 0.5))).filter(q, t); }
  solve(result, t, handPalms = {}, opts = {}) {
    const lm = result?.worldLandmarks?.[0], vis = result?.landmarks?.[0];
    if (!lm) return null;
    let P = lm.map(v3); const V = (i) => (vis?.[i]?.visibility ?? lm[i].visibility ?? 1);
    let swap = false;
    if (opts.mirror) { P = P.map((p) => new Vector3(-p.x, p.y, p.z)); swap = true; }
    const idx = (k) => { if (!swap) return PL[k]; const m = k[0] === 'l' ? 'r' + k.slice(1) : 'l' + k.slice(1); return PL[m]; };
    const p = (k) => P[idx(k)], vv = (k) => V(idx(k));
    const out = { conf: {} };
    // spine/chest: from shoulder line (yaw + roll), half strength for stability
    if (vv('lShoulder') > 0.5 && vv('rShoulder') > 0.5) {
      const sh = p('lShoulder').clone().sub(p('rShoulder'));                 // points to the performer's left (+X at rest)
      const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), sh.normalize());
      out.spine = toArr(this.sm('spine', new Quaternion().slerp(q, 0.5), t));
    }
    const spineQ = out.spine ? new Quaternion(...out.spine) : new Quaternion();
    for (const s of ['left', 'right']) {
      const k = s[0], rest = new Vector3(s === 'left' ? 1 : -1, 0, 0);
      if (vv(`${k}Shoulder`) < 0.5 || vv(`${k}Elbow`) < 0.5) continue;
      const upDir = p(`${k}Elbow`).clone().sub(p(`${k}Shoulder`)).normalize();
      const upW = new Quaternion().setFromUnitVectors(rest, upDir);
      const upperLocal = spineQ.clone().invert().multiply(upW);
      out[`${s}UpperArm`] = toArr(this.sm(`${s}U`, upperLocal, t));
      out.conf[s] = Math.min(vv(`${k}Shoulder`), vv(`${k}Elbow`));
      if (vv(`${k}Wrist`) > 0.5) {
        const loDir = p(`${k}Wrist`).clone().sub(p(`${k}Elbow`)).normalize();
        // keep the forearm twist consistent with the upper arm: swing from the upper arm's direction
        const loW = new Quaternion().setFromUnitVectors(upDir, loDir).multiply(upW);
        out[`${s}LowerArm`] = toArr(this.sm(`${s}L`, upW.clone().invert().multiply(loW), t));
        if (handPalms[s]) {
          const palmW = new Quaternion(...handPalms[s]);
          out[`${s}Hand`] = toArr(this.sm(`${s}H`, loW.clone().invert().multiply(palmW), t));
        }
      }
    }
    return out;
  }
}
