// Kael Studio character creator: geometry toolkit.
// Everything is built in the rest pose (T-pose), meters, Y up, character facing +Z (its left hand at +X),
// skinned to a skeleton whose bones all have identity rest rotations (same convention as VRM normalized bones).
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
export const col = (hex) => new THREE.Color(hex);

/** Mesh under construction. Every vertex carries position, color and up to 4 bone weights. */
export class Builder {
  constructor() { this.p = []; this.c = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.nidx = []; this.twin = new Map(); }
  get count() { return this.p.length / 3; }
  vert(pos, color, weights, uv = null) {
    this.p.push(pos.x, pos.y, pos.z);
    this.c.push(color.r, color.g, color.b);
    this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    const w = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = w.reduce((s, [, v]) => s + v, 0) || 1;
    for (let i = 0; i < 4; i++) { this.si.push(w[i] ? w[i][0] : 0); this.sw.push(w[i] ? w[i][1] / tot : 0); }
    return this.count - 1;
  }
  /** Copy of vertex v with another colour; it borrows v's smooth normal, so colour edges stay crisp without shading seams. */
  dup(v, color) {
    this.p.push(this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]);
    this.c.push(color.r, color.g, color.b);
    this.uv.push(this.uv[v * 2], this.uv[v * 2 + 1]);
    for (let i = 0; i < 4; i++) { this.si.push(this.si[v * 4 + i]); this.sw.push(this.sw[v * 4 + i]); }
    this.twin.set(this.count - 1, v);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    // normals come from the smooth surface (including hidden "normal-only" faces); colour copies borrow them
    g.setIndex(this.nidx.length ? this.idx.concat(this.nidx) : this.idx);
    g.computeVertexNormals();
    if (this.twin.size) { const n = g.attributes.normal; for (const [v, src] of this.twin) n.setXYZ(v, n.getX(src), n.getY(src), n.getZ(src)); }
    if (this.nidx.length) g.setIndex(this.idx);
    return g;
  }
}

/**
 * Grid surface: (nu+1) x (nv+1) vertices from f(u, v) -> { pos, color, weights, uv? }.
 * closeU joins the last column to the first (for tubes/spheres).
 */
export function surface(b, nu, nv, f, { closeU = true, flip = false } = {}) {
  const cols = closeU ? nu : nu + 1;
  const base = b.count;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const r = f(i / nu, j / nv);
    b.vert(r.pos, r.color, r.weights, r.uv);
  }
  const at = (i, j) => base + j * cols + (i % cols);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (!closeU && i >= cols - 1) continue;
    if (flip) b.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
    else b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  }
  return { base, cols, at };
}

/** Superellipse point (n=2 ellipse, larger n squarer). */
export function superXY(a, rx, rz, n = 2.4) {
  const c = Math.cos(a), s = Math.sin(a);
  return [rx * Math.sign(c) * Math.abs(c) ** (2 / n), rz * Math.sign(s) * Math.abs(s) ** (2 / n)];
}

/** Orthonormal frame for a path tangent (stable for vertical and horizontal chains). */
export function frameFor(t, hint = V(0, 0, 1)) {
  const T = t.clone().normalize();
  let N = hint.clone().sub(T.clone().multiplyScalar(hint.dot(T)));
  if (N.lengthSq() < 1e-6) N = V(1, 0, 0).sub(T.clone().multiplyScalar(T.x));
  N.normalize();
  const B = new THREE.Vector3().crossVectors(T, N).normalize();
  return { T, N, B };
}

/**
 * Tube along a path. rings: array of { c: center, r: [rx (along B), rz (along N)], n?: superellipse exponent,
 *   w: weights, color?: THREE.Color or fn(angle, ring) }
 * hint: preferred "N" direction for the cross-section (front direction for limbs/torso).
 */
export function tube(b, rings, { seg = 20, hint = V(0, 0, 1), capStart = true, capEnd = true, color, colorFn, sharp = false } = {}) {
  const frames = rings.map((r, i) => {
    const prev = rings[Math.max(0, i - 1)].c, next = rings[Math.min(rings.length - 1, i + 1)].c;
    return frameFor(next.clone().sub(prev), r.hint || hint);
  });
  const start = b.count;
  rings.forEach((r, j) => {
    const { N, B } = frames[j];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const [x, z] = superXY(a, r.r[0], r.r[1], r.n || 2);
      const off = r.off ? r.off(a) : 0;
      const pos = r.c.clone().addScaledVector(B, x * (1 + off)).addScaledVector(N, z * (1 + off));
      const c = colorFn ? colorFn(pos, a, r, j) : r.color || color;
      b.vert(pos, c, r.w, [i / seg, j / (rings.length - 1)]);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a = start + j * seg + i, bb = start + j * seg + ((i + 1) % seg), c = start + (j + 1) * seg + ((i + 1) % seg), d = start + (j + 1) * seg + i;
    if (!sharp || !colorFn) { b.quad(a, d, c, bb); continue; }
    // sharp colours: each face gets one solid colour (from its centre), so collars, cuffs, hems and stripes have clean edges
    b.nidx.push(a, d, c, a, c, bb);
    const P = (v) => V(b.p[v * 3], b.p[v * 3 + 1], b.p[v * 3 + 2]);
    const mid = P(a).add(P(bb)).add(P(c)).add(P(d)).multiplyScalar(0.25);
    const fc = colorFn(mid, ((i + 0.5) / seg) * Math.PI * 2, rings[j], j);
    b.quad(b.dup(a, fc), b.dup(d, fc), b.dup(c, fc), b.dup(bb, fc));
  }
  const cap = (j, flip) => {
    const r = rings[j]; const ci = b.vert(r.c.clone().addScaledVector(frames[j].T, flip ? Math.min(r.r[0], r.r[1]) * 0.6 : -Math.min(r.r[0], r.r[1]) * 0.6), colorFn ? colorFn(r.c, 0, r, j) : r.color || color, r.w);
    for (let i = 0; i < seg; i++) { const a = start + j * seg + i, bb = start + j * seg + ((i + 1) % seg); if (flip) b.tri(ci, bb, a); else b.tri(ci, a, bb); }   // outward-facing caps
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
}

/** Deformed sphere: radiusFn(dir) -> radius; dir is a unit vector. */
export function blob(b, center, radii, { nu = 32, nv = 20, deform, color, colorFn, weights, uvFn } = {}) {
  return surface(b, nu, nv, (u, v) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    const dir = V(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
    let pos = V(dir.x * radii[0], dir.y * radii[1], dir.z * radii[2]);
    if (deform) pos = deform(pos, dir, u, v) || pos;
    pos.add(center);
    return { pos, color: colorFn ? colorFn(pos, dir) : color, weights: typeof weights === 'function' ? weights(pos) : weights, uv: uvFn ? uvFn(pos, dir) : [u, v] };
  }, { flip: true });
}

/** Catmull-Rom point on an array of Vector3. */
export function catmull(pts, t) {
  const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  return V(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3));
}

/** Tapered strand along a curve (hair clumps, tails, horns). widthFn(t) -> [rx, rz]; weightsFn(t, pos) -> weights. */
export function strand(b, pts, { steps = 10, seg = 10, widthFn, weightsFn, color, colorFn, hint = V(0, 0, 1), n = 2, tip = true }) {
  const rings = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, c = catmull(pts, t);
    const [rx, rz] = widthFn(t);
    rings.push({ c, r: [Math.max(rx, 0.0008), Math.max(rz, 0.0008)], n, w: weightsFn(t, c), color: colorFn ? colorFn(t) : color });
  }
  tube(b, rings, { seg, hint, capStart: true, capEnd: true });
  void tip;
}

// ------------------------------------------------------------------ materials
let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  // soft three-tone ramp: a gentle shadow band without the harsh line of a pure step
  const v = [150, 168, 205, 236, 248, 255];
  const data = new Uint8Array(v.flatMap((x) => [x, x, x, 255]));
  gradient = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.LinearFilter; gradient.needsUpdate = true;
  return gradient;
}
export function toonMaterial(opts = {}) {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), ...opts });
}
/** Inverted-hull outline for a skinned mesh: same skin, pushed out along the normal, back faces only. */
export function outlineMaterial(width = 0.0035, color = '#16141c') {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.width = { value: width };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineWidth = m.userData.width;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * outlineWidth;');
    // objectNormal must be skinned too
    if (!sh.vertexShader.includes('#include <skinnormal_vertex>')) sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', '#include <beginnormal_vertex>\n#include <skinbase_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>');
  };
  m.customProgramCacheKey = () => 'kael-outline';
  return m;
}
