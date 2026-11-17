// Built hair, the way VRoid Studio makes it: a scalp cap plus locks, each lock a tapered ribbon that is draped over the
// actual head, face, neck and shoulders of this character, then painted with the strand-and-shine hair texture.
// A hairstyle is five independent choices: front (bangs), back, side locks, an extension (ponytail, twin tails, buns,
// braid) and an extra (ahoge). Everything is plain static geometry on the head bone, so it bakes into a .vrm as is.
import * as THREE from 'three';
import { hairTexture, shadeOf } from '/paint.js';
import { toonGradient } from '/creator/geom.js';

export const HAIR_PARTS = {
  front: { none: 'None', straight: 'Straight bangs', swept: 'Side-swept', parted: 'Centre part', wispy: 'Wispy', curtain: 'Long curtain' },
  back: { short: 'Short', bob: 'Bob', medium: 'Shoulder length', long: 'Long', xlong: 'Very long', none: 'Cap only' },
  side: { none: 'None', short: 'Short locks', long: 'Long locks', tresses: 'Long tresses' },
  ext: { none: 'None', ponyHigh: 'High ponytail', ponyLow: 'Low ponytail', twin: 'Twin tails', buns: 'Twin buns', bun: 'Top bun', sidePony: 'Side ponytail', braid: 'Braid' },
  extra: { none: 'None', ahoge: 'Ahoge', antenna: 'Antenna pair' },
};
export const HAIR_SLOTS = [['front', 'Front'], ['back', 'Back'], ['side', 'Side'], ['ext', 'Extensions'], ['extra', 'Extra']];
export const DEFAULT_HAIR_PARTS = { front: 'straight', back: 'bob', side: 'short', ext: 'none', extra: 'none' };
/** Built hairstyles to start from: [key, name, parts]. */
export const HAIR_PRESETS = [
  ['bobBangs', 'Bob with bangs', { front: 'straight', back: 'bob', side: 'short', ext: 'none', extra: 'none' }],
  ['longStraight', 'Long straight', { front: 'straight', back: 'long', side: 'long', ext: 'none', extra: 'none' }],
  ['twinTails', 'Twin tails', { front: 'parted', back: 'bob', side: 'long', ext: 'twin', extra: 'none' }],
  ['ponytail', 'High ponytail', { front: 'swept', back: 'short', side: 'short', ext: 'ponyHigh', extra: 'none' }],
  ['buns', 'Twin buns', { front: 'wispy', back: 'short', side: 'short', ext: 'buns', extra: 'none' }],
  ['princess', 'Very long, curtain', { front: 'curtain', back: 'xlong', side: 'tresses', ext: 'none', extra: 'ahoge' }],
  ['braid', 'Braid', { front: 'parted', back: 'medium', side: 'short', ext: 'braid', extra: 'none' }],
  ['boyShort', 'Short (boy)', { front: 'swept', back: 'short', side: 'short', ext: 'none', extra: 'ahoge' }],
];
const L_TEX = 0.9;          // metres of hair the texture spans from the crown down

const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Build the hair. ctx: { vrm, body (the stitched skin mesh), recipe }. Returns a Group already attached to the head bone. */
export function buildHair({ vrm, body, recipe }) {
  const parts = { ...DEFAULT_HAIR_PARTS, ...(recipe.hairParts || {}) }, color = recipe.hairColor || '#4a2f22', accent = recipe.accent || '#e0566d';
  const raw = (n) => vrm.humanoid.getRawBoneNode(n), W = (o) => o.getWorldPosition(V());
  vrm.scene.updateMatrixWorld(true);
  const head = raw('head'), Hb = W(head), la = raw('leftUpperArm'), ra = raw('rightUpperArm'), fz = la && ra && W(la).x < W(ra).x ? -1 : 1;
  const eye = raw('leftEye') ? W(raw('leftEye')) : Hb.clone().add(V(0, 0.06, 0));

  // ---------------------------------------------------------------- a still copy of the skin near the head, for measuring
  const g0 = body.geometry, P0 = g0.attributes.position, I0 = g0.index.array, mw = body.matrixWorld, lo = Hb.y - 0.75, keep = [], pts = [];
  const tmp = V(); for (let i = 0; i < P0.count; i++) { tmp.fromBufferAttribute(P0, i).applyMatrix4(mw); pts.push(tmp.x, tmp.y, tmp.z); }
  const armX = la ? Math.abs(W(la).x - Hb.x) + 0.015 : 0.2, okV = (v) => pts[v * 3 + 1] > lo && Math.abs(pts[v * 3] - Hb.x) < armX;      // head, neck and torso only: the arms would push hair out sideways
  for (let t = 0; t < I0.length; t += 3) if (okV(I0[t]) && okV(I0[t + 1]) && okV(I0[t + 2])) keep.push(I0[t], I0[t + 1], I0[t + 2]);
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); mg.setIndex(keep);
  const skin = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); skin.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), hit = (from, to) => { const d = to.clone().sub(from); const len = d.length(); ray.set(from, d.divideScalar(len)); ray.far = len + 0.05; return ray.intersectObject(skin, false)[0] || null; };

  // head centre and size
  const yE = eye.y + 0.045, ext = (dir) =>      // forehead height: above the ears, so they do not count as head width
   { const h = hit(V(Hb.x, yE, Hb.z).addScaledVector(dir, 0.5), V(Hb.x, yE, Hb.z)); return h ? h.point : null; };
  const pF = ext(V(0, 0, fz)), pB = ext(V(0, 0, -fz)), pL = ext(V(1, 0, 0)), pR = ext(V(-1, 0, 0));
  const cx = pL && pR ? (pL.x + pR.x) / 2 : Hb.x, cz = pF && pB ? (pF.z + pB.z) / 2 : Hb.z;
  const topHit = hit(V(cx, Hb.y + 0.6, cz), V(cx, Hb.y - 0.2, cz)), top = topHit ? topHit.point.y : Hb.y + 0.2;
  const Rh = Math.max(0.06, pL && pR ? Math.abs(pL.x - pR.x) / 2 : 0.08), C = V(cx, top - Rh * 1.02, cz);
  const dirOf = (th, ph) => V(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th) * fz);
  /** a point on the skin seen from the head centre, and its outward normal */
  const scalp = (th, ph) => { const d = dirOf(th, ph), h = hit(C.clone().addScaledVector(d, 0.6), C);
    if (!h) return { p: C.clone().addScaledVector(d, Rh), n: d }; const n = h.face ? h.face.normal.clone().transformDirection(skin.matrixWorld) : d; if (n.dot(d) < 0) n.negate(); return { p: h.point, n: n.lerp(d, 0.5).normalize() }; };
  // how far the skin is from the head's vertical axis, at a height and an angle (cached on a 5 mm by 5.6 degree grid)
  const field = new Map(), NT = 64;
  const radial = (y, th) => { const yi = Math.round(y * 200), ti = ((Math.round(th / (Math.PI * 2) * NT) % NT) + NT) % NT, k = yi * 100 + ti;
    if (!field.has(k)) { const yy = yi / 200, a = ti / NT * Math.PI * 2, d = V(Math.sin(a), 0, Math.cos(a) * fz), h = hit(V(cx, yy, cz).addScaledVector(d, 0.7), V(cx, yy, cz)); field.set(k, h ? Math.hypot(h.point.x - cx, h.point.z - cz) : 0); }
    return field.get(k); };
  const angleOf = (p) => Math.atan2(p.x - cx, (p.z - cz) * fz);
  /** keep a point at least `gap` outside the skin */
  const earBand = (y) => y < eye.y + 0.035 && y > eye.y - 0.075;      // the ears stick out here: hair lies over them, not around them
  const clear = (p, gap) => { const th = angleOf(p), r = Math.hypot(p.x - cx, p.z - cz); let R = Math.max(radial(p.y, th), radial(p.y + 0.006, th), radial(p.y - 0.006, th));
    if (earBand(p.y) && Math.abs(Math.sin(th)) > 0.6) R = Math.min(R, Rh * 1.04);
    if (p.y < top + 0.005 && r < R + gap) { const k = (R + gap) / Math.max(1e-4, r); p.x = cx + (p.x - cx) * k; p.z = cz + (p.z - cz) * k; }
    if (p.y > C.y) { const d = p.distanceTo(C), need = Rh * 0.98 + gap; if (d < need) p.sub(C).setLength(need).add(C); }      // over the crown
    return p; };

  // ---------------------------------------------------------------- geometry builders (all into one buffer)
  const pos = [], uv = [], idx = [], arcOf = (ph) => ph * Rh;
  const pushRibbon = (path, widths, thick, v0, seed) => {
    const N = path.length, SEG = 8, base = pos.length / 3, r = rnd(seed), u0 = r() * 0.9;
    let along = 0;
    for (let i = 0; i < N; i++) {
      const p = path[i], t = (i < N - 1 ? path[i + 1].clone().sub(p) : p.clone().sub(path[i - 1])).normalize();
      if (i) along += p.distanceTo(path[i - 1]);
      const radialDir = V(p.x - cx, 0, p.z - cz); if (radialDir.lengthSq() < 1e-8) radialDir.copy(p.clone().sub(C)); radialDir.normalize();
      const o = radialDir.addScaledVector(t, -radialDir.dot(t)).normalize(), s = V().crossVectors(t, o).normalize(), w = widths[i], h = thick[i];
      for (let j = 0; j <= SEG; j++) { const a = j / SEG * Math.PI * 2, q = p.clone().addScaledVector(s, Math.cos(a) * w / 2).addScaledVector(o, Math.sin(a) * h / 2 + (Math.sin(a) > 0 ? 0 : 0));
        pos.push(q.x, q.y, q.z); uv.push(u0 + (j / SEG) * Math.max(0.02, w * 1.4), (v0 + along) / L_TEX); }
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < SEG; j++) { const a = base + i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  };
  /** drape one lock from a root on the scalp. o: { th, ph, len, w, endY, sweep, out, lift, gap, vol, seed, dir } */
  const lock = (o) => {
    const r = rnd(o.seed || 1), N = 30, root = scalp(o.th, o.ph), path = [], gap0 = o.gap ?? 0.006;
    let p = root.p.clone().addScaledVector(root.n, gap0 * 0.4), next = scalp(o.th, o.ph + 0.08).p, dir = o.dir ? o.dir.clone() : next.sub(root.p).normalize();
    const ds = o.len / N, side = V(Math.cos(o.th), 0, -Math.sin(o.th) * fz);      // around the head, toward the character's left at the front
    path.push(p.clone());
    for (let i = 1; i <= N; i++) {
      const t = i / N, below = Math.min(1, Math.max(0, (C.y - p.y) / (Rh * 0.8)));
      const grav = V(0, -1, 0).multiplyScalar(0.25 + 0.75 * below + (o.lift ? -o.lift * (1 - t) : 0));
      const tuckIn = o.tuck ? -o.tuck * 0.16 * Math.max(0, (t - 0.55) / 0.45) : 0;
      dir.multiplyScalar(0.72).add(grav.multiplyScalar(0.28)).addScaledVector(side, (o.sweep || 0) * 0.08 * Math.min(1, t * 2.5)).addScaledVector(V(p.x - cx, 0, p.z - cz).normalize(), (o.out || 0) * 0.05 - (p.y < Hb.y ? 0.06 : p.y < C.y ? 0.025 : 0) + tuckIn).normalize();      // below the head, hair settles onto the back and shoulders
      p = p.clone().addScaledVector(dir, ds); clear(p, gap0 + (o.vol ?? 0.006) * Math.min(1, t * 3) + i * 0.00002);
      const hugK = o.hug ? 0.35 * Math.min(1, Math.max(0, (C.y + 0.035 - p.y) / 0.07)) : 0;      // eases in from just above the eyes, so there is no crease
      if (hugK > 0) {          // below the eyes the hair follows the head, jaw and neck at a set thickness instead of hanging straight
        const th = angleOf(p), r = Math.hypot(p.x - cx, p.z - cz), R = earBand(p.y) && Math.abs(Math.sin(th)) > 0.6 ? Math.min(radial(p.y, th), Rh * 1.04) : radial(p.y, th);
        if (R > 0) { const want = R + o.hug, k = (r + (want - r) * hugK) / Math.max(1e-4, r); p.x = cx + (p.x - cx) * k; p.z = cz + (p.z - cz) * k; } }
      path.push(p); if (o.endY !== undefined && p.y < o.endY + (r() - 0.5) * 0.012 && t > 0.25) break;
    }
    const M = path.length, w0 = o.w, widths = path.map((_, i) => { const t = i / (M - 1); return w0 * (0.88 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * Math.pow(1 - t, o.tip ?? 0.7) + 0.0004; });
    pushRibbon(path, widths, widths.map((w) => Math.max(0.0012, w * 0.2)), arcOf(o.ph), o.seed || 1);
  };
  /** a lock along an explicit path (ponytails, ahoge) */
  const freeLock = (path, w0, v0, seed, tip = 0.8) => { const M = path.length; const ws = path.map((_, i) => { const t = i / (M - 1); return w0 * (0.9 + 0.25 * Math.sin(Math.PI * t)) * Math.pow(1 - t, tip) + 0.0004; }); pushRibbon(path, ws, ws.map((w) => Math.max(0.0012, w * 0.22)), v0, seed); };
  const fall = (start, dir0, len, { curve = V(), outGap = 0.012, steps = 28, seed = 1, wiggle = 0.004 } = {}) => {      // a free strand that falls under gravity and stays off the body
    const r = rnd(seed), path = [start.clone()]; let p = start.clone(), d = dir0.clone().normalize(); const ds = len / steps;
    for (let i = 1; i <= steps; i++) { d.multiplyScalar(0.8).add(V(0, -0.2, 0)).add(curve.clone().multiplyScalar(0.1)).add(V((r() - 0.5) * wiggle, 0, (r() - 0.5) * wiggle)).normalize();
      p = p.clone().addScaledVector(d, ds); clear(p, outGap); path.push(p); }
    return path; };

  // ---------------------------------------------------------------- the scalp cap
  const hairline = (th) => { const a = Math.abs(((th + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) / Math.PI;      // 0 front .. 1 back
    return THREE.MathUtils.degToRad(58 + 30 * Math.min(1, a / 0.55) ** 1.4 + 24 * Math.max(0, (a - 0.55) / 0.45)); };
  { const NT2 = 72, NP = 22, base = pos.length / 3;
    for (let i = 0; i <= NT2; i++) { const th = (i / NT2) * Math.PI * 2, hl = hairline(th);
      for (let j = 0; j <= NP; j++) { const ph = 0.03 + (hl - 0.03) * (j / NP), s = scalp(th, ph), q = s.p.clone().addScaledVector(s.n, 0.0035 * (1 - (j / NP) ** 3) + 0.0008); pos.push(q.x, q.y, q.z); uv.push(i / NT2, arcOf(ph) / L_TEX); } }
    for (let i = 0; i < NT2; i++) for (let j = 0; j < NP; j++) { const a = base + i * (NP + 1) + j, b = a + NP + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); } }

  // ---------------------------------------------------------------- back
  const backEnd = { short: Hb.y - 0.02, bob: eye.y - 0.11, medium: Hb.y - 0.2, long: Hb.y - 0.42, xlong: Hb.y - 0.66 }[parts.back];
  if (backEnd !== undefined) { const span = THREE.MathUtils.degToRad(parts.back === 'short' ? 230 : 250);
    const bob = parts.back === 'bob' || parts.back === 'short', L2 = bob ? [[0, 22, 0.1, 0.2], [1, 18, 0.095, 0.3]] : [[0, 30, 0.075, 0.2], [1, 26, 0.07, 0.3]];
    for (const [layer, n, w, ph0] of L2) for (let k = 0; k < n; k++) {         // an inner and an outer layer, offset, so no gaps show
      const th = Math.PI - span / 2 + span * (k + 0.5 + layer * 0.5) / n, ph = ph0 + 0.1 * Math.abs(Math.sin(th));
      const vary = ((k * 7 + layer * 3) % 5 - 2) * (bob ? 0.0025 : 0.006), tuck = { short: 0.6, bob: 1, medium: 0.5, long: 0.15, xlong: 0.05 }[parts.back];
      lock({ th, ph, len: (top - backEnd) * 1.7 + 0.1, endY: backEnd + vary + (layer ? 0.008 : 0) + (Math.abs(Math.sin(th)) > 0.75 ? 0.01 : 0), w, tip: bob ? 0.16 : 0.32, tuck, hug: bob ? 0.016 + layer * 0.004 : 0, gap: 0.003 + layer * 0.0035, vol: parts.back === 'short' ? 0.0015 : 0.003, seed: 100 + k + layer * 50 }); } }
  // ---------------------------------------------------------------- front (bangs)
  const brow = eye.y + 0.028;
  const bang = (k, n, spread, f) => { const th = THREE.MathUtils.degToRad(-spread + (2 * spread) * (k + 0.5) / n); return { th, ph: 0.28 + 0.1 * Math.abs(th), ...f(th, k), seed: 300 + k }; };
  const F = parts.front;
  if (F === 'straight') for (let k = 0; k < 9; k++) lock(bang(k, 9, 60, (th) => ({ len: 0.2, endY: brow - 0.008 * Math.abs(th) + [0, -0.006, 0.004, -0.01, 0.002][k % 5], w: 0.042, tip: 0.38, tuck: 0.4, gap: 0.005 + (k % 2) * 0.003, vol: 0.003 })));
  if (F === 'swept') for (let k = 0; k < 9; k++) lock(bang(k, 9, 60, (th) => ({ len: 0.22, endY: brow - 0.035 + 0.04 * (th + 1.05) / 2.1, sweep: 1.4, w: 0.042, tip: 0.4, tuck: 0.3, gap: 0.006 + (k % 2) * 0.003, vol: 0.004 })));
  if (F === 'parted') for (let k = 0; k < 10; k++) lock(bang(k, 10, 64, (th) => ({ len: 0.24, endY: brow - 0.06 * Math.abs(th) - 0.005, sweep: Math.sign(th) * 1.8, w: 0.04, tip: 0.4, tuck: 0.3, gap: 0.006 + (k % 2) * 0.003, vol: 0.005 })));
  if (F === 'wispy') for (let k = 0; k < 8; k++) lock(bang(k, 8, 55, (th) => ({ len: 0.2, endY: eye.y - 0.004 + 0.012 * (k % 3), w: 0.022, tip: 0.9, gap: 0.006 + (k % 2) * 0.003, vol: 0.003 })));
  if (F === 'curtain') for (let k = 0; k < 12; k++) lock(bang(k, 12, 66, (th) => ({ len: 0.34, endY: eye.y - 0.1, sweep: Math.sign(th) * 2.2, w: 0.035, gap: 0.006 + (k % 2) * 0.003, vol: 0.006 })));
  // ---------------------------------------------------------------- side locks (in front of the ears)
  const S = parts.side;
  if (S !== 'none') for (const sg of [1, -1]) {
    const list = S === 'short' ? [[78, 0.022, eye.y - 0.085]] : S === 'long' ? [[76, 0.026, Hb.y - 0.13], [86, 0.022, Hb.y - 0.09]] : [[72, 0.03, Hb.y - 0.26], [82, 0.026, Hb.y - 0.22]];
    list.forEach(([deg, w, endY], k) => lock({ th: sg * THREE.MathUtils.degToRad(deg), ph: 0.55 + k * 0.08, len: 0.5, endY, w: w * 1.3, tip: 0.3, gap: 0.008 + k * 0.003, vol: 0.004, hug: 0.012 + k * 0.004, seed: 500 + k + (sg > 0 ? 10 : 0) }));
  }
  // ---------------------------------------------------------------- extensions
  const extras = [];      // separate meshes in the accent colour (hair ties)
  const tieAt = (p, d, r = 0.012) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 8, 20), new THREE.MeshToonMaterial({ color: accent, gradientMap: toonGradient() })); t.position.copy(p); t.lookAt(p.clone().add(d)); t.name = 'HairTie'; extras.push(t); };
  const tail = (th, ph, out, len, n, seed) => {          // a gathered tail: locks leave one point and fall
    const s = scalp(th, ph), A = s.p.clone().addScaledVector(s.n, 0.012), d0 = s.n.clone().multiplyScalar(0.8).add(V(0, out, 0)).normalize(), r = rnd(seed);
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, off = V(Math.cos(a) * 0.008, Math.sin(a) * 0.008, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d0));
      freeLock(fall(A.clone().add(off), d0.clone().add(V((r() - 0.5) * 0.3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.3)), len * (0.85 + r() * 0.25), { seed: seed + k, outGap: 0.014 }), 0.03, arcOf(ph), seed + k); }
    tieAt(A.clone().addScaledVector(d0, 0.004), d0); };
  const bunAt = (th, ph, R0) => { const s = scalp(th, ph), c = s.p.clone().addScaledVector(s.n, R0 * 0.8), g = new THREE.SphereGeometry(R0, 28, 18), p = g.attributes.position, u = g.attributes.uv, base = pos.length / 3;
    for (let i = 0; i < p.count; i++) { const q = V().fromBufferAttribute(p, i), k = 1 + 0.06 * Math.sin(u.getX(i) * Math.PI * 18 + u.getY(i) * 9); q.multiplyScalar(k).add(c); pos.push(q.x, q.y, q.z); uv.push(u.getX(i) * 0.5, 0.12 + u.getY(i) * 0.18); }
    for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.array[i]); };
  const E = parts.ext, deg = THREE.MathUtils.degToRad;
  if (E === 'ponyHigh') tail(Math.PI, deg(38), 0.35, Hb.y - 0.2 > 0 ? 0.42 : 0.42, 16, 700);
  if (E === 'ponyLow') tail(Math.PI, deg(100), -0.2, 0.36, 14, 720);
  if (E === 'twin') for (const sg of [1, -1]) tail(sg * deg(122), deg(52), 0.25, 0.42, 12, sg > 0 ? 740 : 760);
  if (E === 'sidePony') tail(deg(100), deg(68), 0.2, 0.34, 13, 780);
  if (E === 'buns') for (const sg of [1, -1]) bunAt(sg * deg(140), deg(38), 0.042);
  if (E === 'bun') bunAt(Math.PI, deg(30), 0.05);
  if (E === 'braid') { const s = scalp(Math.PI, deg(112)), start = s.p.clone().addScaledVector(s.n, 0.01), path = fall(start, V(0, -1, -fz * 0.15), 0.42, { outGap: 0.018, wiggle: 0 });
    path.forEach((c, i) => { if (i % 2) return; const t = i / (path.length - 1), r0 = 0.022 * (1 - t * 0.55), g = new THREE.SphereGeometry(r0, 12, 8); g.scale(1, 1.5, 0.7); g.rotateZ((i / 2) % 2 ? 0.5 : -0.5); const p = g.attributes.position, u = g.attributes.uv, base = pos.length / 3;
      for (let k = 0; k < p.count; k++) { const q = V().fromBufferAttribute(p, k).add(c); pos.push(q.x, q.y, q.z); uv.push(u.getX(k) * 0.2, (arcOf(deg(112)) + t * 0.42) / L_TEX + u.getY(k) * 0.03); }
      for (let k = 0; k < g.index.count; k++) idx.push(base + g.index.array[k]); });
    tieAt(path[path.length - 1].clone().add(V(0, 0.01, 0)), V(0, 1, 0), 0.01); }
  // ---------------------------------------------------------------- extra: ahoge
  const X = parts.extra;
  const ahoge = (th, lean, seed) => { const s = scalp(th, 0.12), b = s.p.clone().addScaledVector(s.n, 0.004), up = s.n.clone(), fwd = V(0, 0, fz), path = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; path.push(b.clone().addScaledVector(up, 0.07 * Math.sin(t * 1.6)).addScaledVector(fwd, (0.03 - 0.05 * t * t) * lean).add(V(0, -0.02 * t * t, 0))); }
    freeLock(path, 0.016, 0.02, seed, 1.1); };
  if (X === 'ahoge') ahoge(0, 1, 900);
  if (X === 'antenna') { ahoge(-0.35, 1, 910); ahoge(0.35, 1, 920); }

  // ---------------------------------------------------------------- one mesh, painted
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const ringV = (Rh * 0.85) / L_TEX, ringH = 0.022 / L_TEX, tex = hairTexture(color, ringV, ringH), shade = hairTexture('#' + shadeOf(color).getHexString(), ringV, ringH);
  const mat = new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide, gradientMap: toonGradient() }); mat.userData.inkBase = new THREE.Color(color); mat.userData.shadeMap = shade;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'Hair_built'; mesh.frustumCulled = false; mesh.userData.outlineWidth = 0.001;
  const group = new THREE.Group(); group.name = 'Hair'; group.add(mesh, ...extras);
  vrm.scene.add(group); vrm.scene.updateMatrixWorld(true); head.attach(group);
  mg.dispose();
  return group;
}
