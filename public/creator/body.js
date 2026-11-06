// Body: proportions from sliders, skeleton (VRM humanoid names), body surface and shared shape functions
// that clothing uses so every outfit fits every body.
import * as THREE from 'three';
import { V, clamp, lerp, smooth, tube, frameFor } from './geom.js';
import { kitBody } from './kit.js';

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];

export class Body {
  constructor(recipe, species) {
    const b = recipe.body, k = (x) => (x ?? 0.5) - 0.5;
    this.recipe = recipe; this.sp = species;
    // proportions 'v2' (proof of concept, opt-in per character): more compact and fuller - shorter torso,
    // slightly shorter legs, wider shoulders, fuller limbs, clearer hands and feet. 'classic' is unchanged.
    const v2 = this.v2 = recipe.proportions === 'v2' || recipe.proportions === 'real';
    const real = this.real = recipe.proportions === 'real';
    const P0 = real   // realistic proportions (about 7 heads tall), cartoon look kept
      ? { layout: 1.12, head: 0.88, legShare: 0.07, shoulders: 1.1, hips: 0.97, waist: 1.0, depth: 1.0, arm: 0.94, thigh: 1.03, calf: 1.0, ankle: 0.74, neck: 1.18, hand: 1.0, foot: 0.98, footW: 0.92 }
      : v2
      ? { layout: 0.875, head: 1.05, legShare: 0.037, shoulders: 1.22, hips: 0.95, depth: 1.1, arm: 1.2, thigh: 1.12, calf: 1.15, ankle: 1.1, neck: 1.1, hand: 1.35, foot: 1.12, footW: 1.15 }
      : { layout: 1, head: 1, legShare: 0, shoulders: 1, hips: 1, depth: 1, arm: 1, thigh: 1, calf: 1, ankle: 1, neck: 1, hand: 1, foot: 1, footW: 1 };
    // Male / Female starting anatomy (works for every species; none = the original shape) and body type presets.
    // Each layer only nudges real geometry parameters; the sliders stay on top and can take any character anywhere.
    const pres = this.presentation = recipe.presentation === 'male' || recipe.presentation === 'female' ? recipe.presentation : null;
    const G = pres === 'male' ? { layout: 1.02, shoulders: 1.17, hips: 0.9, waist: 1.06, chestW: 1.1, depth: 1.08, arm: 1.12, thigh: 1.03, calf: 1.08, neck: 1.18, hand: 1.12, foot: 1.1, footW: 1.1 }
      : pres === 'female' ? { layout: 0.97, shoulders: 0.9, hips: 0.98, waist: 0.8, chestW: 0.94, depth: 1.0, arm: 0.86, thigh: 1.0, calf: 0.95, ankle: 0.92, neck: 0.84, hand: 0.88, foot: 0.88, footW: 0.88 } : {};
    const BT = this.bodyTypeP = {
      compact: { layout: 0.94, head: 1.04, legShare: -0.02, arm: 1.05, thigh: 1.05, calf: 1.04, depth: 1.05, waist: 1.05, kb: 0.2 },
      athletic: { layout: 1.02, legShare: 0.01, shoulders: 1.1, waist: 0.92, hips: 0.98, arm: 1.1, thigh: 1.08, calf: 1.08, depth: 1.04, kb: -0.2 },
      broad: { shoulders: 1.15, waist: 1.18, hips: 1.12, chestW: 1.12, depth: 1.15, arm: 1.18, thigh: 1.18, calf: 1.15, ankle: 1.08, neck: 1.15, hand: 1.1, foot: 1.08, footW: 1.1, kb: 0.6 },
    }[recipe.bodyType] || {};
    const P = this.P = { waist: 1, chestW: 1, ...P0 };
    if (real && pres === 'male') P.waist *= 1.08;
    if (real && pres === 'female') { P.waist *= 0.9; P.hips *= 1.1; P.thigh *= 1.05; }   // hourglass: narrower waist, fuller hips and thighs   // men keep a straighter waist (the V comes from the shoulders)
    for (const src of [G, BT]) for (const [key, val] of Object.entries(src)) { if (key === 'kb') continue; P[key] = key === 'legShare' ? (P[key] || 0) + val : (P[key] ?? 1) * val; }
    const Hraw = clamp(b.height ?? 1.55, 0.9, 2.0);
    const sc = this.sc = Hraw / 1.55;                 // thickness scale follows the height slider
    const H = this.H = Hraw * P.layout;               // v2 lays the body out shorter, so it reads compact and full
    const build = this.buildF = 0.85 + 0.3 * (b.build ?? 0.5);
    // head (species shape multiplies a base radius)
    const hs = clamp(b.head ?? 1, 0.7, 1.6);
    const r = 0.152 * hs * Math.pow(sc, 0.55) * P.head;
    this.head = { rx: r * species.head[0], ry: r * species.head[1], rz: r * species.head[2] };
    const headCY = H - this.head.ry * 1.0;
    this.headC = V(0, headCY, 0.0);
    const neckLen = (0.03 + 0.012 * species.neck) * sc * (real ? 1.05 : 1);
    this.yHead = headCY - this.head.ry * 0.78;
    this.yNeck = this.yHead - neckLen;
    this.ySh = this.yNeck - 0.012 * sc;
    const legShare = clamp(0.47 + P.legShare + 0.12 * k(b.legLength) - 0.08 * (hs - 1), 0.32, 0.62);
    this.yHip = this.ySh * legShare;
    this.ySpine = lerp(this.yHip, this.ySh, 0.25);
    this.yChest = lerp(this.yHip, this.ySh, 0.58);
    this.yUpLeg = this.yHip - 0.035 * sc;
    this.yAnkle = 0.06 * sc;
    this.yKnee = lerp(this.yUpLeg, this.yAnkle, 0.5) + 0.01 * sc;
    this.shX = (0.118 + 0.05 * k(b.shoulders)) * sc * build * P.shoulders;
    this.hipX = (0.08 + 0.03 * k(b.hips)) * sc * build * P.hips;
    const armLen = this.ySh * 0.44 + 0.05 * sc;
    this.upperArmLen = armLen * 0.43; this.lowerArmLen = armLen * 0.39; this.handLen = armLen * 0.18 * (species.paws ? 1.05 : 1) * P.hand;
    // cross-section radii
    const f = build;
    this.r = {
      hip: [(this.hipX * 1.55 + 0.006), 0.1 * sc * f],
      waist: [(0.112 + 0.04 * k(b.waist)) * sc * f * P.waist, 0.094 * sc * f * P.depth * Math.sqrt(P.waist)],
      chest: [(0.13 + 0.04 * k(b.chest)) * sc * f * P.chestW, (0.097 + 0.03 * k(b.chest)) * sc * f * P.depth],
      shoulder: [this.shX * 0.98, 0.078 * sc * f * P.depth],
      neck: (0.042 + 0.012 * species.neck) * sc * (0.85 + 0.3 * f - 0.15) * P.neck,
      arm: [0.05, 0.043, 0.036].map((x) => x * sc * (0.75 + 0.5 * (b.arms ?? 0.5)) * f * P.arm),
      leg: [0.08 * P.thigh, 0.06 * P.calf, 0.047 * P.ankle].map((x) => x * sc * (0.75 + 0.5 * (b.legs ?? 0.5)) * f),
    };
    this.r.hip[1] *= P.depth;
    this.footLen = 0.17 * sc * P.foot; this.footW = 0.05 * sc * f * P.footW;
    // sculpted body shapes from the Blender body kit (falls back to plain tubes without it)
    this.kit = kitBody(species.style === 'animal' ? 'animal' : 'human');
    this.kb = clamp(((b.build ?? 0.5) - 0.5) * 2 + (BT.kb || 0), -0.5, 1.4);
    this.kc = clamp(((b.chest ?? 0.5) - 0.5) * 2, -0.5, 1);
    // sculpted channel weights: female = waist, hips and a modest bust sized by the chest slider; male = broad chest, lats, fuller arms
    this.kw = { build: this.kb, chest: pres === 'female' ? this.kc * 0.4 : this.kc, fem: pres === 'female' ? 0.7 : 0, masc: pres === 'male' ? 0.85 : 0,
      bust: pres === 'female' ? clamp(0.5 + 1.5 * (b.chest ?? 0.5), 0, 1.8) : 0 };
  }

  // ---------------------------------------------------------------- body kit lookups
  /** Torso height y -> kit height (warped so hips, waist, chest and shoulders line up with the sculpt). */
  torsoU(y) {
    const sc = this.sc, keys = [[this.yHip - 0.085 * sc, 0], [this.yHip, 0.12], [lerp(this.yHip, this.ySh, 0.33), 0.4], [this.yChest + 0.02 * sc, 0.65], [this.ySh, 0.95], [this.yNeck + 0.004, 1]];
    if (y <= keys[0][0]) return 0;
    for (let i = 0; i < keys.length - 1; i++) if (y <= keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], (y - keys[i][0]) / (keys[i + 1][0] - keys[i][0] || 1));
    return 1;
  }
  /** Per-angle surface offset for a ring (used by tube's r.off). axes(w) maps a world direction to the part's [X, Z]. */
  ringOff(part, h, T, hint, cloth, axes, gain = 1) {
    const map = this.kit?.[part]; if (!map || gain <= 0) return undefined;
    const { N, B } = frameFor(T, hint), f = cloth ? map.cloth : map.skin;
    const kw = part === 'arm' && this.kw.masc ? { ...this.kw, masc: this.kw.masc * 0.45 }      // male arms fuller, not bulky
      : part === 'leg' && this.kw.fem ? { ...this.kw, fem: this.kw.fem * 0.55 } : this.kw;           // female thighs fuller, not wide
    return (a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const [X, Z] = axes(B.x * c + N.x * s, B.y * c + N.y * s, B.z * c + N.z * s);
      return f(h, Math.atan2(X, Z), kw) * gain;
    };
  }
  /** Ring offset function for a garment ring around a leg at height y (boots etc.), following the sculpted calf. */
  legOff(side, y) {
    const s = side === 'left' ? 1 : -1, top = this.yHip - 0.012 * this.sc, bot = this.yAnkle - (this.kit ? 0.022 * this.sc : 0.005), t = clamp((top - y) / (top - bot), 0, 1);
    return this.ringOff('leg', t, V(0, 1, 0), V(0, 0, 1), true, (x, _y, z) => [s * x, z], smooth(0.05, 0.2, t));   // (rings built bottom-up, like boot shafts)
  }
  /** Sculpted torso offset at height y in a horizontal direction (dx, dz); cloth fills hollows. */
  torsoOff(y, dx, dz, cloth = true) { const m = this.kit?.torso; return m ? m[cloth ? 'cloth' : 'skin'](this.torsoU(y), Math.atan2(dx, dz), this.kw) : 0; }
  /** Largest torso offset all the way round at height y (for skirts and other loose garments). */
  torsoMaxOff(y) { if (!this.kit) return 0; let m = 0; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; m = Math.max(m, this.torsoOff(y, Math.sin(a), Math.cos(a))); } return m; }
  /** Front (sign=1) or back (sign=-1) surface z of the torso at height y and side position x, including the sculpt. */
  torsoZ(y, sign = 1, x = 0, cloth = true) {
    const [rx, rz, cz] = this.torsoAt(y), k = Math.min(0.95, Math.abs(x) / rx);
    return cz + sign * rz * Math.sqrt(1 - k * k) * (1 + this.torsoOff(y, x / rx, sign * Math.sqrt(1 - k * k), cloth));
  }

  // ---------------------------------------------------------------- skeleton
  buildSkeleton() {
    const bones = {}, list = [];
    const add = (name, parent, pos) => {     // pos in world space; stored relative to parent
      const bn = new THREE.Bone(); bn.name = name; bn.userData.world = pos.clone();
      if (parent) { bn.position.copy(pos.clone().sub(bones[parent].userData.world)); bones[parent].add(bn); } else bn.position.copy(pos);
      bones[name] = bn; list.push(bn); return bn;
    };
    add('hips', null, V(0, this.yHip, 0));
    add('spine', 'hips', V(0, this.ySpine, 0));
    add('chest', 'spine', V(0, this.yChest, 0));
    add('neck', 'chest', V(0, this.yNeck, 0));
    add('head', 'neck', V(0, this.yHead, 0));
    for (const [side, s] of [['left', 1], ['right', -1]]) {
      add(`${side}Shoulder`, 'chest', V(s * 0.025 * this.sc, this.ySh - 0.012 * this.sc, 0));
      const ua = V(s * this.shX, this.ySh - 0.022 * this.sc, -0.005 * this.sc);
      add(`${side}UpperArm`, `${side}Shoulder`, ua);
      const el = ua.clone().add(V(s * this.upperArmLen, 0, 0)); add(`${side}LowerArm`, `${side}UpperArm`, el);
      const wr = el.clone().add(V(s * this.lowerArmLen, 0, 0)); add(`${side}Hand`, `${side}LowerArm`, wr);
      this[`${side}Wrist`] = wr;
      const paw = this.sp.paws, palm = this.handLen * (paw ? 0.56 : 0.52), fl = this.handLen * (paw ? 0.36 : 0.48), spread = this.handLen * (paw ? 0.3 : 0.27);
      this.handSpread = spread;
      FINGERS.forEach((fn, i) => {
        const z = spread * (0.75 - i * 0.5), len = fl * [0.95, 1.0, 0.95, 0.78][i];
        let p = wr.clone().add(V(s * palm, -0.004 * this.sc, z));
        add(`${side}${fn}Proximal`, `${side}Hand`, p);
        p = p.clone().add(V(s * len * 0.42, 0, 0)); add(`${side}${fn}Intermediate`, `${side}${fn}Proximal`, p);
        p = p.clone().add(V(s * len * 0.32, 0, 0)); add(`${side}${fn}Distal`, `${side}${fn}Intermediate`, p);
        this[`${side}${fn}Tip`] = p.clone().add(V(s * len * 0.26, 0, 0));
      });
      const t0 = wr.clone().add(V(s * this.handLen * 0.14, -0.008 * this.sc, spread * 0.8));
      add(`${side}ThumbMetacarpal`, `${side}Hand`, t0);
      const td = V(s * 0.62, 0, 0.78).normalize();
      const t1 = t0.clone().addScaledVector(td, this.handLen * 0.22); add(`${side}ThumbProximal`, `${side}ThumbMetacarpal`, t1);
      const t2 = t1.clone().addScaledVector(td, this.handLen * 0.2); add(`${side}ThumbDistal`, `${side}ThumbProximal`, t2);
      this[`${side}ThumbTip`] = t2.clone().addScaledVector(td, this.handLen * 0.17);
      const ul = V(s * this.hipX, this.yUpLeg, 0); add(`${side}UpperLeg`, 'hips', ul);
      const kn = V(s * this.hipX * 0.92, this.yKnee, 0.008 * this.sc); add(`${side}LowerLeg`, `${side}UpperLeg`, kn);
      const an = V(s * this.hipX * 0.88, this.yAnkle, 0); add(`${side}Foot`, `${side}LowerLeg`, an);
      add(`${side}Toes`, `${side}Foot`, V(s * this.hipX * 0.88, 0.02 * this.sc, this.footLen * 0.55));
    }
    this.bones = bones; this.boneList = list;
    return { bones, list };
  }
  addBone(name, parent, worldPos) {    // extra (non-humanoid) bones for hair, tails, ears
    const bones = this.bones, bn = new THREE.Bone(); bn.name = name; bn.userData.world = worldPos.clone();
    bn.position.copy(worldPos.clone().sub(bones[parent].userData.world)); bones[parent].add(bn);
    bones[name] = bn; this.boneList.push(bn); return bn;
  }
  idx(name) { return this.boneList.indexOf(this.bones[name]); }
  W(map) { const o = {}; for (const [n, w] of Object.entries(map)) { const i = this.idx(n); if (i >= 0 && w > 0) o[i] = (o[i] || 0) + w; } return o; }

  // ---------------------------------------------------------------- shared shape functions
  /** Torso cross-section at height y: [rx, rz, centerZ]. */
  torsoAt(y) {
    const r = this.r, sc = this.sc, keys = [
      // the pelvis tapers into the tops of the thighs, so the legs grow out of it with no shelf or bottom edge
      [this.yHip - 0.1 * sc, [this.hipX * 1.05, r.leg[0] * 0.95]],
      [this.yHip - 0.05 * sc, [this.hipX + r.leg[0] * 0.85, Math.max(r.hip[1] * 0.92, r.leg[0] * 1.15)]],
      [this.yHip, r.hip], [lerp(this.yHip, this.ySh, 0.33), r.waist], [this.yChest + 0.02 * this.sc, r.chest],
      [this.ySh - 0.01 * this.sc, r.shoulder], [this.ySh + 0.012 * this.sc, [r.shoulder[0] * 0.55, r.shoulder[1] * 0.85]],
      [this.yNeck + 0.004, [r.neck * 1.3, r.neck * 1.2]],
    ];
    if (y <= keys[0][0]) return [...keys[0][1], 0];
    for (let i = 0; i < keys.length - 1; i++) {
      const [y0, a] = keys[i], [y1, c] = keys[i + 1];
      if (y <= y1) { const t = smooth(0, 1, (y - y0) / (y1 - y0)); return [lerp(a[0], c[0], t), lerp(a[1], c[1], t), 0.004 * this.sc * Math.sin(t * Math.PI)]; }
    }
    return [...keys[keys.length - 1][1], 0];
  }
  torsoWeights(y, x = 0) {
    const t1 = smooth(this.yHip, this.ySpine + 0.03 * this.sc, y), t2 = smooth(this.ySpine, this.yChest, y), t3 = smooth(this.ySh, this.yNeck + 0.01 * this.sc, y);
    const shoulder = smooth(this.shX * 0.45, this.shX * 0.9, Math.abs(x)) * smooth(this.yChest, this.ySh, y) * 0.5;
    const side = x >= 0 ? 'left' : 'right';
    return this.W({ hips: 1 - t1, spine: t1 * (1 - t2), chest: t2 * (1 - t3) * (1 - shoulder), [`${side}Shoulder`]: t2 * (1 - t3) * shoulder, neck: t3 });
  }
  /** Torso rings between yBottom and yTop; offset grows the surface (clothing), flare widens the hem. */
  torsoRings(yBottom, yTop, { offset = 0, flare = 0, steps = 14, colorFn, color, n = 2.3, weights } = {}) {
    const rings = [];
    for (let i = 0; i <= steps; i++) {
      const y = lerp(yBottom, yTop, i / steps);
      let [rx, rz, cz] = this.torsoAt(y);
      // around the hips the torso must contain both thighs (so shirts and jackets never show the legs poking out)
      // (a long, gentle curve from the waist, so there's no shelf at the top of the hips)
      const k = smooth(this.yHip + 0.16 * this.sc, this.yHip - 0.02 * this.sc, y) * (1 - smooth(this.yHip - 0.035 * this.sc, this.yHip - 0.1 * this.sc, y));
      if (k > 0) { rx = Math.max(rx, lerp(rx, (this.hipX + this.r.leg[0]) * 1.06, k)); rz = Math.max(rz, lerp(rz, this.r.leg[0] * 1.25, k)); }
      const fl = flare * (1 - i / steps) ** 2;
      rings.push({ c: V(0, y, cz), r: [rx + offset + fl, rz + offset + fl * 0.8], n, w: weights ? weights(y) : this.torsoWeights(y), color, y,
        off: this.ringOff('torso', this.torsoU(y), V(0, 1, 0), V(0, 0, 1), offset > 0, (x, _y, z) => [x, z]) });
    }
    return rings;
  }
  /** Arm rings from t0..t1 along the arm (0 = inside the shoulder, 1 = wrist). */
  armRings(side, t0, t1, { offset = 0, steps = 12, flare = 0 } = {}) {
    const s = side === 'left' ? 1 : -1, ua = this.bones[`${side}UpperArm`].userData.world;
    const start = ua.x - s * 0.03 * this.sc, total = this.upperArmLen + this.lowerArmLen + 0.03 * this.sc;
    const rings = [], [r0, r1, r2] = this.r.arm;
    for (let i = 0; i <= steps; i++) {
      const t = lerp(t0, t1, i / steps), x = start + s * t * total;
      const d = Math.abs(x - ua.x) / (this.upperArmLen + this.lowerArmLen);
      let rad = d < 0.53 ? lerp(r0 * 1.02, r1, smooth(0, 0.53, d)) : lerp(r1, r2, smooth(0.53, 1, d));
      if (this.real) {   // natural arm: soft biceps, slim elbow, forearm swelling just below the elbow, slender wrist
        if (d < 0.53) { const u = d / 0.53; rad = lerp(r0 * 1.02, r1 * 0.9, Math.pow(u, 1.4)) * (1 + 0.05 * Math.exp(-(((u - 0.45) / 0.22) ** 2))); }
        else { const u = (d - 0.53) / 0.47; rad = lerp(r1 * 0.92, r2 * 0.86, Math.pow(Math.min(1, u), 1.15)) * (1 + 0.13 * Math.exp(-(((u - 0.22) / 0.2) ** 2))); }
      }
      if (this.kit) rad *= 1 + 0.22 * (1 - smooth(0.0, 0.12, t));   // rounder shoulder root, so the arm grows out of the torso instead of plugging into it
      const e = smooth(0.42, 0.62, d), h = smooth(0.92, 1.02, d);
      const shoulderW = 1 - smooth(-0.04, 0.1, (x - ua.x) * s);
      const fl = flare * smooth(t1 - 0.25, t1, t) ;
      rings.push({ c: V(x, ua.y - 0.002, ua.z), r: [rad + offset + fl, rad * 0.92 + offset + fl], n: 2, t,
        off: this.ringOff('arm', t, V(s, 0, 0), V(0, 1, 0), offset > 0, (_x, y, z) => [y, z]),
        w: this.W({ [`${side}Shoulder`]: shoulderW * 0.6, [`${side}UpperArm`]: (1 - e) * (1 - shoulderW * 0.6), [`${side}LowerArm`]: e * (1 - h), [`${side}Hand`]: h }) });
    }
    return rings;
  }
  legRings(side, t0, t1, { offset = 0, steps = 14, flare = 0 } = {}) {
    const s = side === 'left' ? 1 : -1;
    const top = this.yHip - 0.012 * this.sc, bot = this.yAnkle - (this.kit ? 0.022 * this.sc : 0.005), [r0, r1, r2] = this.r.leg;   // starts inside the pelvis, ends inside the foot   // starts just inside the pelvis
    const rings = [];
    for (let i = 0; i <= steps; i++) {
      const t = lerp(t0, t1, i / steps), y = lerp(top, bot, t);
      const kn = smooth(this.yKnee + 0.06 * this.sc, this.yKnee - 0.04 * this.sc, y);
      let rad = y > this.yKnee ? lerp(r1, r0, smooth(this.yKnee, this.yUpLeg, y)) : lerp(r2, r1, smooth(this.yAnkle, this.yKnee, y));
      if (this.real) {   // natural leg: full thigh tapering to a slimmer knee, rounded calf, slender ankle
        if (y > this.yKnee) { const u = clamp((y - this.yKnee) / (this.yUpLeg - this.yKnee), 0, 1); rad = lerp(r1 * 0.86, r0, Math.pow(u, 0.75)); }
        else { const u = clamp((this.yKnee - y) / (this.yKnee - this.yAnkle), 0, 1); rad = lerp(r1 * 0.9, r2, Math.pow(u, 1.25)) * (1 + 0.16 * Math.exp(-(((u - 0.28) / 0.17) ** 2))); }
      }
      const hipW = smooth(this.yUpLeg - 0.02 * this.sc, this.yHip + 0.01 * this.sc, y) * 0.55;
      const xx = s * lerp(this.hipX * 0.88, this.hipX * 1.02, smooth(this.yAnkle, this.yUpLeg, y));
      const fl = flare * smooth(t1 - 0.3, t1, t);
      rings.push({ c: V(xx, y, 0.004 * this.sc), r: [rad + offset + fl, rad * 0.97 + offset + fl], n: 2, t, hint: V(0, 0, 1),
        off: this.ringOff('leg', t, V(0, -1, 0), V(0, 0, 1), offset > 0, (x, _y, z) => [s * x, z], smooth(0.05, 0.2, t)),   // fades out where the thigh enters the pelvis
        w: this.W({ hips: hipW, [`${side}UpperLeg`]: (1 - kn) * (1 - hipW), [`${side}LowerLeg`]: kn }) });
    }
    return rings;
  }
  bodyPoint(side, which) { return this[`${side}${which}`]; }

  // ---------------------------------------------------------------- skin / fur surface
  build(bld, colors) {
    const sp = this.sp, sc = this.sc;
    const cf = colors.bodyColor;                  // fn(pos, part) -> THREE.Color
    // torso
    tube(bld, this.torsoRings(this.yHip - 0.1 * sc, this.yNeck + 0.004, { steps: 30, n: 2.15 }), { seg: 48, colorFn: (p) => cf(p, 'torso'), capEnd: false });
    // neck
    const neckRings = [];
    for (let i = 0; i <= 4; i++) {
      const y = lerp(this.ySh - 0.01 * sc, this.yHead + this.head.ry * 0.35, i / 4);
      neckRings.push({ c: V(0, y, -0.004 * sc), r: [this.r.neck * 1.02, this.r.neck], w: this.W({ chest: 1 - smooth(this.ySh, this.yNeck + 0.01 * sc, y), neck: smooth(this.ySh, this.yNeck + 0.01 * sc, y) * (1 - smooth(this.yNeck, this.yHead + 0.01, y)), head: smooth(this.yNeck, this.yHead + 0.01, y) }) });
    }
    tube(bld, neckRings, { seg: 24, colorFn: (p) => cf(p, 'neck'), capStart: false, capEnd: false });
    for (const side of ['left', 'right']) {
      tube(bld, this.armRings(side, 0, 1, { steps: 20 }), { seg: 22, hint: V(0, 1, 0), colorFn: (p) => cf(p, 'arm') });
      tube(bld, this.legRings(side, 0, 1, { steps: 22 }), { seg: 24, capStart: false, colorFn: (p) => cf(p, 'leg') });
      this.buildHand(bld, side, cf);
      if (!colors.hideFeet) this.buildFoot(bld, side, cf, sp.paws);
    }
  }
  buildHand(bld, side, cf) {
    const s = side === 'left' ? 1 : -1, wr = this[`${side}Wrist`], sc = this.sc, L = this.handLen, paw = this.sp.paws;
    const fat = paw ? 1.35 : 1, spread = this.handSpread || L * 0.36;
    // palm: flattened rounded box as a short tube along X
    const pr = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, x = wr.x + s * (t * L * 0.56 - 0.01 * sc);
      const w = lerp(this.r.arm[2] * 1.05, spread * 0.78 + 0.006 * sc * fat, smooth(0, 0.45, t)) * (1 - 0.1 * smooth(0.85, 1, t));
      pr.push({ c: V(x, wr.y - 0.004 * sc, 0.002), r: [w, (0.02 * sc) * fat * (1 - 0.15 * t)], n: 2.8, w: this.W({ [`${side}Hand`]: 1 }), hint: V(0, 1, 0),
        off: this.ringOff('palm', t, V(s, 0, 0), V(0, 1, 0), false, (_x, y, z) => [y, z]) });
    }
    // rotate cross-section: tube's N is the hint (up), B spans the palm width (z)
    tube(bld, pr, { seg: 16, hint: V(0, 1, 0), colorFn: (p) => cf(p, 'hand') });
    const fingerR = (paw ? 0.0118 : 0.0084) * sc * (paw ? 1.15 : 1) * this.P.hand;
    for (const fn of FINGERS) {
      const p0 = this.bones[`${side}${fn}Proximal`].userData.world, p1 = this.bones[`${side}${fn}Intermediate`].userData.world, p2 = this.bones[`${side}${fn}Distal`].userData.world, tip = this[`${side}${fn}Tip`];
      const rr = fingerR * (fn === 'Little' ? 0.85 : 1);
      const rings = [
        { c: p0.clone().add(V(-s * 0.012 * sc, 0, 0)), r: [rr, rr * 0.9], w: this.W({ [`${side}Hand`]: 0.6, [`${side}${fn}Proximal`]: 0.4 }) },
        { c: p0.clone().lerp(p1, 0.5), r: [rr, rr * 0.9], w: this.W({ [`${side}${fn}Proximal`]: 1 }) },
        { c: p1.clone(), r: [rr * 0.95, rr * 0.88], w: this.W({ [`${side}${fn}Proximal`]: 0.5, [`${side}${fn}Intermediate`]: 0.5 }) },
        { c: p1.clone().lerp(p2, 0.5), r: [rr * 0.93, rr * 0.86], w: this.W({ [`${side}${fn}Intermediate`]: 1 }) },
        { c: p2.clone(), r: [rr * 0.9, rr * 0.84], w: this.W({ [`${side}${fn}Intermediate`]: 0.5, [`${side}${fn}Distal`]: 0.5 }) },
        { c: p2.clone().lerp(tip, 0.6), r: [rr * 0.86, rr * 0.8], w: this.W({ [`${side}${fn}Distal`]: 1 }) },
        { c: tip.clone(), r: [rr * 0.55, rr * 0.5], w: this.W({ [`${side}${fn}Distal`]: 1 }) },
      ];
      tube(bld, rings, { seg: 10, hint: V(0, 1, 0), colorFn: (p) => cf(p, 'finger') });
    }
    const t0 = this.bones[`${side}ThumbMetacarpal`].userData.world, t1 = this.bones[`${side}ThumbProximal`].userData.world, t2 = this.bones[`${side}ThumbDistal`].userData.world, tt = this[`${side}ThumbTip`];
    const tr = fingerR * 1.15;
    tube(bld, [
      { c: t0.clone().add(V(-s * 0.008 * sc, 0, -0.01 * sc)), r: [tr * 1.3, tr], w: this.W({ [`${side}Hand`]: 0.7, [`${side}ThumbMetacarpal`]: 0.3 }) },
      { c: t0.clone().lerp(t1, 0.5), r: [tr * 1.15, tr], w: this.W({ [`${side}ThumbMetacarpal`]: 1 }) },
      { c: t1.clone(), r: [tr, tr * 0.9], w: this.W({ [`${side}ThumbMetacarpal`]: 0.5, [`${side}ThumbProximal`]: 0.5 }) },
      { c: t1.clone().lerp(t2, 0.5), r: [tr * 0.95, tr * 0.88], w: this.W({ [`${side}ThumbProximal`]: 1 }) },
      { c: t2.clone(), r: [tr * 0.9, tr * 0.85], w: this.W({ [`${side}ThumbProximal`]: 0.5, [`${side}ThumbDistal`]: 0.5 }) },
      { c: t2.clone().lerp(tt, 0.6), r: [tr * 0.85, tr * 0.8], w: this.W({ [`${side}ThumbDistal`]: 1 }) },
      { c: tt.clone(), r: [tr * 0.5, tr * 0.45], w: this.W({ [`${side}ThumbDistal`]: 1 }) },
    ], { seg: 10, hint: V(0, 1, 0), colorFn: (p) => cf(p, 'finger') });
  }
  /** Bare foot or paw (used when no shoes are chosen). */
  buildFoot(bld, side, cf, paw) {
    const s = side === 'left' ? 1 : -1, sc = this.sc, an = this.bones[`${side}Foot`].userData.world;
    const rings = [];
    const L = this.footLen * (paw ? 0.95 : 1), w = this.footW * (paw ? 1.25 : 1);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, z = lerp(-0.035 * sc, L * 0.82, t);
      // the back of the foot is tall and wide enough to hold the ankle, so leg and foot join without a ring
      const h = (this.kit ? lerp(0.074 * sc, 0.024 * sc, smooth(0.12, 1, t)) : lerp(0.055 * sc, 0.024 * sc, smooth(0.2, 1, t))) * (paw ? 1.2 : 1);
      let wr = w * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (t > 0.95 ? 0.6 : 1);
      if (this.kit) wr = Math.max(wr, this.r.leg[2] * 1.06 * (1 - smooth(0.22, 0.5, t)));
      rings.push({ c: V(an.x + s * 0.004 * sc * t, h * 0.55, z), r: [wr, h * 0.6], n: 2.5,
        w: this.W({ [`${side}Foot`]: 1 - smooth(0.45, 0.7, t), [`${side}Toes`]: smooth(0.45, 0.7, t) }), hint: V(0, 1, 0),
        off: this.ringOff('foot', t, V(0, 0, 1), V(0, 1, 0), false, (x, y) => [s * x, y]) });
    }
    tube(bld, rings, { seg: 16, hint: V(0, 1, 0), colorFn: (p) => cf(p, 'foot') });
  }
}
