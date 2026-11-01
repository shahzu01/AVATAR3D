// Heads, ears, tails, noses and fur colouring for every species, plus the face "decal" surface the drawn face lives on.
import * as THREE from 'three';
import { V, clamp, lerp, smooth, col, Builder, blob, tube, catmull } from './geom.js';
import { kitHead, kitNose } from './kit.js';

/** Analytic head shape: point (relative to head centre) for a unit direction. */
export function makeHeadShape(body, sp, recipe) {
  const kit = kitHead(recipe.species);
  if (kit) {                              // sculpted head from the Blender head kit
    const k = body.head.rx / sp.head[0], mz = recipe.face?.muzzle ?? 0.5;
    const shape = (dir) => dir.clone().multiplyScalar(kit.radius(dir, mz) * k);
    const animal = sp.style === 'animal';
    shape.muzzleWeight = (dir) => (animal ? kit.muzzle(dir) : 0);
    shape.cheekWeight = (dir) => (animal ? kit.cheek(dir) : 0);
    shape.kit = true;
    return shape;
  }
  return analyticHeadShape(body, sp, recipe);
}

/** Built-in procedural head (used when the head kit isn't available). */
function analyticHeadShape(body, sp, recipe) {
  const { rx, ry, rz } = body.head;
  const animal = sp.style === 'animal';
  const muzzleAmt = sp.muzzle * (0.4 + 1.2 * (recipe.face?.muzzle ?? 0.5));
  const m = V(0, -0.36, 1).normalize();
  const width = 0.5 - 0.17 * sp.snout;
  const shape = (dir) => {
    const p = V(dir.x * rx, dir.y * ry, dir.z * rz);
    if (!animal) {                       // human jaw and chin
      if (dir.y < 0) { const k = (-dir.y) ** 1.3; p.x *= 1 - 0.3 * k; p.z *= 1 - 0.08 * k; p.y *= 1 + 0.1 * k * Math.max(0, dir.z); }
      if (dir.y > 0.3) p.y *= 0.97;
      p.z *= 1 - 0.06 * Math.max(0, -dir.z);
    } else {
      if (dir.y < 0.25 && dir.z > -0.4) { const ch = smooth(0.35, 0.85, Math.abs(dir.x)) * smooth(-0.85, -0.05, dir.y) * (1 - smooth(0.05, 0.25, dir.y)); p.x *= 1 + 0.07 * ch; }
      if (dir.y > 0.2) p.y *= 0.96;
      const d = Math.acos(clamp(dir.dot(m), -1, 1));
      const bump = muzzleAmt * Math.exp(-((d / width) ** 2)) * 0.32;
      p.addScaledVector(dir, bump * rz);
      // flatten the muzzle tip a little so the nose sits well
      if (bump > 0.02) p.z -= bump * rz * 0.12 * smooth(0.0, 0.4, dir.z);
    }
    return p;
  };
  shape.muzzleWeight = (dir) => { const d = Math.acos(clamp(dir.dot(m), -1, 1)); return animal ? Math.exp(-((d / (width * 1.15)) ** 2)) * Math.min(1, muzzleAmt * 2.2) : 0; };
  return shape;
}

/** Fur / skin colouring rules shared by head, body and limbs. */
export function makeColoring(recipe, sp, body) {
  const c = recipe.colors, main = col(c.skin), light = col(c.fur2 || c.skin), dark = col(c.fur3 || c.skin), inner = col(c.inner || c.fur2 || c.skin);
  const animal = sp.style === 'animal', pat = animal ? recipe.pattern || 'none' : 'none';
  const species = recipe.species;
  const tux = pat === 'tuxedo';
  const base = tux ? dark : main;
  const stripe = (p) => { const s = Math.sin(p.y * 60 + Math.sin(p.x * 25) * 1.4 + Math.atan2(p.x, p.z) * 1.5); return s > 0.72; };
  const spot = (p) => Math.sin(p.x * 70) * Math.sin(p.y * 64 + 1.3) * Math.sin(p.z * 72 + 0.7) > 0.32;
  const bodyColor = (p, part) => {
    if (!animal) return main;
    const front = p.z > 0;
    // soft-edged belly patch (a smooth blend instead of an on/off test, so its edge is clean rather than jagged)
    const bw = body.r.chest[0] * (tux ? 0.62 : 0.5), bsc = body.sc;
    const bellyK = front ? smooth(bw + 0.012 * bsc, bw - 0.012 * bsc, Math.abs(p.x)) * smooth(body.yHip - 0.07 * bsc, body.yHip - 0.03 * bsc, p.y) * smooth(body.ySh - 0.0 * bsc, body.ySh - 0.04 * bsc, p.y) * smooth(-0.01, 0.03, p.z) : 0;
    const bellyZone = bellyK > 0.5;
    // pale throat for species with a pale muzzle, so chin, throat and chest read as one seamless area down to the collar
    const throat = part === 'neck' && front && species !== 'panda' && Math.abs(p.x) < body.r.neck * 0.85;
    if ((part === 'torso' || part === 'neck') && (throat || (tux && part === 'neck' && front))) return light;
    if (part === 'torso' && bellyK > 0.001) return base.clone().lerp(light, bellyK);
    // species marks
    if (species === 'panda' && (part === 'arm' || part === 'hand' || part === 'finger' || part === 'leg' || part === 'foot' || (part === 'torso' && p.y > body.yChest + 0.01 && !bellyZone))) return dark;
    if (species === 'fox' && ((part === 'leg' && p.y < body.yKnee) || part === 'foot' || part === 'hand' || part === 'finger')) return dark;
    if (pat === 'socks' && ((part === 'leg' && p.y < body.yKnee - 0.04 * body.sc) || part === 'foot' || part === 'hand' || part === 'finger')) return light;
    if (tux && (part === 'foot' || part === 'hand' || part === 'finger')) return light;
    if (pat === 'points' && (part === 'foot' || part === 'hand' || part === 'finger' || (part === 'leg' && p.y < body.yKnee) || (part === 'arm' && Math.abs(p.x) > Math.abs(body.leftWrist.x) - 0.08 * body.sc))) return dark;
    if (pat === 'stripes' && part !== 'hand' && part !== 'finger' && stripe(p)) return dark;
    if (pat === 'spots' && spot(p)) return dark;
    return base;
  };
  const headColor = (p, dir, mw, cw) => {
    if (!animal) return main;
    let cc = (tux ? dark : main).clone();
    if (pat === 'stripes' && dir.y > 0.35 && Math.abs(Math.sin(dir.x * 9)) > 0.82 && dir.z > -0.5) cc = dark.clone();
    if (pat === 'spots' && spot(p)) cc = dark.clone();
    if (pat === 'points') cc.lerp(dark, 0.55 * smooth(0.45, 0.85, mw));                // Siamese: softly darker muzzle
    if (['fox', 'wolf', 'tiger', 'raccoon', 'cat'].includes(species)) {               // pale cheeks, softly blended
      const ch = cw ?? smooth(-0.05, -0.2, dir.y) * smooth(0.0, 0.15, dir.z) * smooth(0.18, 0.35, Math.abs(dir.x)) * smooth(-0.95, -0.8, dir.y);
      cc.lerp(light, ch);
    }
    if (pat === 'tuxedo') cc.lerp(light, smooth(0.1, 0.3, dir.z) * smooth(0.15, 0.0, dir.y) * smooth(0.5, 0.4, Math.abs(dir.x)));
    if (species !== 'panda' && pat !== 'points') {
      cc.lerp(light, smooth(0.22, 0.62, mw));                                                 // muzzle (soft edge)
      cc.lerp(light, smooth(-0.55, -0.8, dir.y) * smooth(-0.45, -0.1, dir.z));               // pale under the chin, flowing into the throat
    }
    return cc;
  };
  return { main, light, dark, inner, base, bodyColor, headColor };
}

export function buildHead(bld, body, shape, colors, res = null) {
  const { headC } = body, hw = body.W({ head: 1 });
  blob(bld, headC, [1, 1, 1], {
    nu: res?.nu ?? (shape.kit ? 128 : 76), nv: res?.nv ?? (shape.kit ? 84 : 52), weights: (p) => (p.y < body.yHead + 0.02 ? body.W({ head: smooth(body.yNeck, body.yHead + 0.03, p.y), neck: 1 - smooth(body.yNeck, body.yHead + 0.03, p.y) }) : hw),
    deform: (_p, dir) => shape(dir),
    colorFn: (p) => { const dir = p.clone().sub(headC).normalize(); return colors.headColor(p, dir, shape.muzzleWeight(dir), shape.cheekWeight?.(dir)); },
  });
}

/** Surface point (world) for a direction from the head centre. */
export const headPoint = (body, shape, dir) => shape(dir.clone().normalize()).add(body.headC);

// ------------------------------------------------------------------ ears
export const EAR_CFG = {
      cat: { pos: [0.6, 0.72], len: 0.62, w: 0.42, prof: 'tri', lean: 0.38 }, fox: { pos: [0.56, 0.74], len: 0.9, w: 0.5, prof: 'tri', lean: 0.32 },
      wolf: { pos: [0.55, 0.75], len: 0.8, w: 0.42, prof: 'tri', lean: 0.28 }, raccoon: { pos: [0.6, 0.72], len: 0.55, w: 0.36, prof: 'roundtri', lean: 0.4 },
      round: { pos: [0.68, 0.66], len: 0.36, w: 0.42, prof: 'round', lean: 0.55 }, mouse: { pos: [0.72, 0.62], len: 0.56, w: 0.62, prof: 'round', lean: 0.7 },
      bunny: { pos: [0.34, 0.92], len: 1.65, w: 0.34, prof: 'long', lean: 0.12 },
    };
/** Directions (from the head centre) where top-of-head ears attach, and their angular half-width; used to cut holes in hats. */
export function earHoles(type, size = 0.5) {
  const c = EAR_CFG[type]; if (!c) return [];
  const k = 0.7 + 0.6 * size;
  return [1, -1].map((s) => ({ dir: V(s * c.pos[0], c.pos[1], -0.08).normalize(), r: Math.min(0.55, 0.16 + c.w * 0.42 * k) }));
}
export function buildEars(bld, body, shape, type, colors, size = 0.5, addSpring) {
  if (type === 'none') return;
  const { rx, ry } = body.head, k = 0.7 + 0.6 * size;
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    if (type === 'human' || type === 'elf') {
      const base = headPoint(body, shape, V(s, -0.02, -0.08));
      if (type === 'human') {
        blob(bld, base.clone().add(V(s * 0.004, 0, -0.004)), [0.014 * k * body.sc, ry * 0.3 * k, ry * 0.2 * k], { nu: 14, nv: 10, color: colors.main, weights: body.W({ head: 1 }), deform: (p, d) => { if (d.x * s < 0) p.x *= 0.3; return p; } });
      } else {
        const pts = [base.clone().add(V(-s * 0.01, -0.01, 0.005)), base.clone().add(V(s * rx * 0.25 * k, ry * 0.08, -rx * 0.12 * k)), base.clone().add(V(s * rx * 0.55 * k, ry * 0.28 * k, -rx * 0.3 * k))];
        const rings = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; rings.push({ c: catmull(pts, t), r: [ry * 0.2 * (1 - t) ** 0.8 + 0.002, 0.008 * body.sc], w: body.W({ head: 1 }), hint: V(s, 0, 0) }); }
        tube(bld, rings, { seg: 12, hint: V(s, 0, 0), color: colors.main });
      }
      continue;
    }
    const cfg = EAR_CFG[type] || { pos: [0.6, 0.72], len: 0.6, w: 0.4, prof: 'tri', lean: 0.4 };
    const dir = V(s * cfg.pos[0], cfg.pos[1], -0.08).normalize();
    const base = headPoint(body, shape, dir).addScaledVector(dir, -0.012 * body.sc);
    const axis = V(s * cfg.lean, 1, -0.12).normalize();
    const L = cfg.len * ry * k, Wd = cfg.w * rx * k * (type === 'mouse' ? 0.9 : 1);
    let boneNames = null;
    if (type === 'bunny' && addSpring) {
      boneNames = [0, 1, 2].map((i) => `ear${side}_${i}`);
      addSpring(boneNames, 'head', [0, 1, 2, 3].map((i) => base.clone().addScaledVector(axis, (L * i) / 3)), { stiffness: 2.2, gravity: 0.25, drag: 0.35 });
    }
    const rings = [], N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let w;
      if (cfg.prof === 'tri') w = Wd * (1 - t) ** 0.85 * (t < 0.12 ? 0.92 + t * 0.6 : 1);
      else if (cfg.prof === 'roundtri') w = Wd * Math.sqrt(Math.max(0, 1 - t ** 1.6));
      else if (cfg.prof === 'round') w = Wd * Math.sqrt(Math.max(0, 1 - (t * 1.02) ** 2));
      else w = Wd * (0.75 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (1 - smooth(0.85, 1, t) * 0.85);
      const c = base.clone().addScaledVector(axis, L * t);
      const wts = boneNames ? body.W(t < 0.33 ? { head: 1 - t * 3, [boneNames[0]]: t * 3 } : t < 0.66 ? { [boneNames[0]]: 1 - (t - 0.33) * 3, [boneNames[1]]: (t - 0.33) * 3 } : { [boneNames[1]]: 1 - (t - 0.66) * 3, [boneNames[2]]: (t - 0.66) * 3 }) : body.W({ head: 1 });
      rings.push({ c, r: [Math.max(w, 0.003), 0.012 * body.sc * (1 - 0.5 * t) + 0.003], w: wts, j: i });
    }
    const tipDark = recordTip(colors, type);
    tube(bld, rings, { seg: 16, hint: V(0, 0.15, 1), colorFn: (p, a, r) => {
      if (tipDark && r.j >= N - 3) return colors.dark;
      return Math.sin(a) > 0.2 && Math.abs(Math.cos(a)) < 0.72 && r.j < N - 1 ? colors.inner : colors.earOuter || colors.main;
    } });
  }
}
function recordTip(colors, type) { return colors.earTips && ['fox', 'wolf', 'cat', 'raccoon'].includes(type); }

// ------------------------------------------------------------------ nose (3D, animal or button)
export function buildNose(bld, body, shape, type, colors) {
  if (type !== 'animal' && type !== 'button') return;
  const { rx, ry } = body.head;
  const dir = type === 'animal' ? V(0, -0.16, 1) : V(0, -0.22, 1);
  const p = headPoint(body, shape, dir);
  const sz = type === 'animal' ? rx * 0.16 : rx * 0.06;
  const nk = type === 'animal' && kitNose();
  if (nk) {                               // sculpted nose from the head kit: rounded triangle with nostrils
    blob(bld, p.add(V(0, 0, -sz * 0.3)), [sz, sz, sz], { nu: 40, nv: 26, color: colors.nose, weights: body.W({ head: 1 }), deform: (_q, d) => d.clone().multiplyScalar(nk(d) * sz) });
    return;
  }
  blob(bld, p.add(V(0, 0, -sz * 0.25)), [sz, sz * (type === 'animal' ? 0.62 : 0.8), sz * 0.6], { nu: 18, nv: 12, color: type === 'animal' ? colors.nose : colors.main, weights: body.W({ head: 1 }),
    deform: (q, d) => { if (type === 'animal' && d.y < 0) q.x *= 1 - 0.35 * (-d.y); return q; } });
  void ry;
}

// ------------------------------------------------------------------ tails
export function buildTail(bld, body, type, colors, size = 0.5, addSpring) {
  if (type === 'none') return;
  const sc = body.sc, k = 0.7 + 0.6 * size, d = body.r.hip[1];
  const root = V(0, body.yHip - 0.03 * sc, -d * 0.85);
  if (type === 'stub' || type === 'pom') {
    const r = (type === 'pom' ? 0.055 : 0.04) * sc * k;
    blob(bld, root.clone().add(V(0, 0, -r * 0.7)), [r, r, r], { nu: 16, nv: 12, color: type === 'pom' ? colors.light : colors.main, weights: body.W({ hips: 1 }),
      deform: type === 'pom' ? (p, dd) => p.multiplyScalar(1 + 0.08 * Math.sin(dd.x * 13) * Math.sin(dd.y * 11)) : null });
    return;
  }
  const L = { thin: 0.62, bushy: 0.55, ringed: 0.52, striped: 0.6, dragon: 0.62 }[type] * sc * k;
  const pts = type === 'thin' || type === 'striped'
    ? [root, root.clone().add(V(0, -0.06 * L, -0.3 * L)), root.clone().add(V(0.04 * L, 0.15 * L, -0.62 * L)), root.clone().add(V(0.02 * L, 0.5 * L, -0.78 * L)), root.clone().add(V(-0.06 * L, 0.72 * L, -0.66 * L))]
    : type === 'dragon' ? [root, root.clone().add(V(0, -0.12 * L, -0.35 * L)), root.clone().add(V(0.05 * L, -0.25 * L, -0.7 * L)), root.clone().add(V(0.12 * L, -0.3 * L, -1.0 * L))]
      : [root, root.clone().add(V(0, -0.05 * L, -0.28 * L)), root.clone().add(V(0.02 * L, 0.18 * L, -0.6 * L)), root.clone().add(V(0.0, 0.5 * L, -0.72 * L))];
  const n = 4, names = Array.from({ length: n }, (_, i) => `tail_${i}`);
  addSpring?.(names, 'hips', Array.from({ length: n + 1 }, (_, i) => catmull(pts, i / n)), { stiffness: type === 'dragon' ? 3 : 1.6, gravity: type === 'dragon' ? 0.4 : 0.12, drag: 0.4 });
  const prof = (t) => {
    if (type === 'bushy') return 0.05 * sc * k * (0.7 + 1.6 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) ** 0.8) * (1 - 0.7 * smooth(0.85, 1, t));
    if (type === 'ringed') return 0.045 * sc * k * (0.9 + 0.9 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1))) * (1 - 0.6 * smooth(0.88, 1, t));
    if (type === 'dragon') return 0.06 * sc * k * (1 - t) ** 1.1 + 0.002;
    return 0.022 * sc * k * (1 - 0.45 * t) * (1 - 0.6 * smooth(0.9, 1, t));
  };
  const rings = [], N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = catmull(pts, t), r = prof(t);
    const f = t * n, b0 = Math.min(n - 1, Math.floor(f)), u = f - b0;
    const w = body.W(i === 0 ? { hips: 1 } : { [names[b0]]: 1 - smooth(0.6, 1, u) * (b0 < n - 1 ? 0.5 : 0), ...(b0 < n - 1 ? { [names[b0 + 1]]: smooth(0.6, 1, u) * 0.5 } : {}) });
    rings.push({ c, r: [r, r], w, t });
  }
  tube(bld, rings, { seg: 16, hint: V(0, 1, 0), colorFn: (p, a, r) => {
    if ((type === 'bushy') && r.t > 0.8) return colors.tailTip || colors.light;
    if (type === 'ringed' && Math.sin(r.t * 30) > 0.25) return colors.dark;
    if (type === 'striped' && Math.sin(r.t * 34) > 0.55) return colors.dark;
    if (type === 'dragon' && Math.sin(a) < -0.4) return colors.light;
    return colors.main;
  } });
}

// ------------------------------------------------------------------ face decal (front of the head; the drawn face is its texture)
export function buildFaceDecal(body, headGeometry, canvasRegion) {
  const { rx, ry } = body.head, c = body.headC;
  const region = canvasRegion || { x0: -1.08 * rx, x1: 1.08 * rx, y0: c.y - 1.02 * ry, y1: c.y + 0.85 * ry };
  const mesh = new THREE.Mesh(headGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), NX = 56, NY = 52, grid = [];
  const bld = new Builder(), wHead = body.W({ head: 1 });
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY;
    const x = lerp(region.x0, region.x1, u), y = lerp(region.y1, region.y0, v);
    rc.set(V(x, y, c.z + 2), V(0, 0, -1));
    const hit = rc.intersectObject(mesh, false)[0];
    if (!hit || !hit.face) { grid.push(-1); continue; }
    const n = hit.face.normal.clone();
    if (n.z < 0.08) { grid.push(-1); continue; }
    grid.push(bld.vert(hit.point.clone().addScaledVector(n, 0.0011 * body.sc + 0.0004), col('#ffffff'), wHead, [u, 1 - v]));
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = grid[j * (NX + 1) + i], b = grid[j * (NX + 1) + i + 1], cc = grid[(j + 1) * (NX + 1) + i + 1], d = grid[(j + 1) * (NX + 1) + i];
    if (a >= 0 && b >= 0 && cc >= 0) bld.tri(a, cc, b);
    if (a >= 0 && cc >= 0 && d >= 0) bld.tri(a, d, cc);
  }
  mesh.material.dispose();
  return { builder: bld, region };
}
