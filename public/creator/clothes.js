// Tops, bottoms and shoes. Built from the body's own shape functions (offset outward) so they fit every body.
import * as THREE from 'three';
import { V, lerp, smooth, col, Builder, tube as tubeSmooth, blob, superXY, frameFor } from './geom.js';
// garments always use crisp colour edges (no colour smearing between collar, cuffs, hems, stripes and the body)
const tube = (b, rings, opts = {}) => tubeSmooth(b, rings, { sharp: true, ...opts });

/** Partial tube (an arc of the cross-section only), for panels such as apron fronts and bibs. */
export function arcTube(b, rings, a0, a1, { seg = 14, hint = V(0, 0, 1), color, colorFn, thickness = 0.0025 } = {}) {
  // two separate layers (outside and inside, slightly apart) so both sides shade and outline correctly
  for (const side of [1, -1]) {
    const start = b.count, n = seg + 1;
    rings.forEach((r, j) => {
      const prev = rings[Math.max(0, j - 1)].c, next = rings[Math.min(rings.length - 1, j + 1)].c;
      const { N, B } = frameFor(next.clone().sub(prev), r.hint || hint);
      for (let i = 0; i <= seg; i++) {
        const a = lerp(a0, a1, i / seg), [x, z] = superXY(a, r.r[0], r.r[1], r.n || 2);
        const out = B.clone().multiplyScalar(x).addScaledVector(N, z);
        const pos = r.c.clone().add(out).addScaledVector(out.clone().normalize(), side > 0 ? 0 : -thickness);
        b.vert(pos, colorFn ? colorFn(pos, a, r, j) : r.color || color, r.w);
      }
    });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a = start + j * n + i, bb = a + 1, c = a + n + 1, d = a + n;
      if (side > 0) b.quad(a, d, c, bb); else b.quad(a, bb, c, d);
    }
  }
}

/** Where each top's hem sits, and how far down the arm each sleeve reaches (0 shoulder .. 1 wrist). */
function hemY(body, st) {
  const sc = body.sc;
  return { hoodie: body.yHip - 0.05 * sc, tshirt: body.yHip - 0.03 * sc, tank: body.yHip - 0.02 * sc, jacket: body.yHip - 0.06 * sc, sweater: body.yHip - 0.04 * sc,
    jersey: body.yHip - 0.04 * sc, dress: body.yHip + 0.06 * sc, robe: body.yHip + 0.06 * sc, tunic: body.yHip - 0.13 * sc, blazer: body.yHip - 0.07 * sc, apron: body.yHip - 0.03 * sc }[st] ?? body.yHip;
}
const SLEEVE = { hoodie: 0.985, tshirt: 0.38, tank: 0, jacket: 0.985, sweater: 0.985, jersey: 0.42, dress: 0.2, robe: 0.95, tunic: 0.55, blazer: 0.985, apron: 0.38 };
/** Garment edges where skin shows below them (used for soft contact shading). */
export function garmentEdges(body, recipe) {
  const sc = body.sc, top = recipe.top || {}, bot = recipe.bottom || {}, shoes = recipe.shoes || {}, e = { y: [], armT: null, legT: null };
  const hasTop = top.style && top.style !== 'none', tuck = bot.style === 'overalls' && ['tshirt', 'tank', 'sweater', 'jersey'].includes(top.style);
  if (hasTop && !tuck) e.y.push(top.style === 'dress' ? body.yKnee + 0.03 * sc : top.style === 'robe' ? body.yAnkle + 0.03 * sc : hemY(body, top.style));
  if (hasTop && SLEEVE[top.style] > 0 && SLEEVE[top.style] < 0.98) e.armT = SLEEVE[top.style];
  if (bot.style === 'shorts') e.legT = 0.42;
  if (bot.style === 'skirt') e.y.push(body.yKnee + 0.07 * sc);
  if (bot.style === 'longskirt') e.y.push(body.yAnkle + 0.05 * sc);
  if (shoes.style === 'boots') e.shoeY = body.yKnee - 0.07 * sc; else if (shoes.style === 'hightops') e.shoeY = body.yAnkle + 0.085 * sc; else if (shoes.style && shoes.style !== 'none') e.shoeY = 0.07 * sc;
  return e;
}

export function buildClothes(ctx) {
  const { recipe, body } = ctx, out = {};
  const sc = body.sc, o = (body.v2 ? 0.0145 : 0.011) * sc;     // v2: thicker fabric layers
  // v2: rolled hems and cuffs give garment edges visible thickness
  const roll = (b, rings, j, color, hint = V(0, 0, 1), th = 0.0058) => { if (body.v2) rollRing(b, rings, j, hint, color, th * sc); };
  const top = recipe.top || {}, bot = recipe.bottom || {}, shoes = recipe.shoes || {};
  const C1 = col(top.color || '#30508a'), C2 = col(top.color2 || top.color || '#27426f');
  const B1 = col(bot.color || '#1f2026'), B2 = col(bot.color2 || shade(bot.color || '#1f2026', -0.25));
  const front = (a) => Math.sin(a) > 0;          // tube angle: sin>0 is the front (N = +Z) for torso rings
  // layering: which garment sits on the outside. Tops tuck into overalls; otherwise tops hang over bottoms.
  const tuck = bot.style === 'overalls' && ['tshirt', 'tank', 'sweater', 'jersey'].includes(top.style);
  const topO = tuck ? o * 0.8 : o * 1.35, botO = tuck ? o * 1.7 : o * 0.75;
  const hemOf = (st) => hemY(body, st);
  // where a skirt may start to flare out: just below the hem of the top hanging over it
  const freeY = top.style && top.style !== 'none' && !['dress', 'robe'].includes(top.style) ? Math.min(body.yHip - 0.03 * sc, hemOf(top.style) - 0.035 * sc) : body.yHip - 0.03 * sc;
  // ---------------------------------------------------------------- bottoms (built first: tops sit over them)
  if (bot.style && bot.style !== 'none') {
    const b = new Builder(); out.bottom = b;
    const waist = body.yHip + 0.06 * sc;
    if (['pants', 'joggers', 'shorts', 'overalls'].includes(bot.style)) {
      tube(b, body.torsoRings(body.yHip - 0.115 * sc, waist, { offset: botO, steps: 8, n: 2.15 })   /* same cross-section as tops, so they never poke out at the corners */, { seg: 40, capStart: true, capEnd: false, colorFn: (p, a, r, j) => (j >= 7 && bot.style === 'joggers' ? B2 : B1) });
      const tEnd = bot.style === 'shorts' ? 0.42 : 0.985;
      for (const side of ['left', 'right']) {
        const rings = body.legRings(side, 0, tEnd, { offset: botO, steps: 16, flare: bot.style === 'shorts' ? 0.012 * sc : bot.style === 'pants' ? 0.006 * sc : 0 });
        if (bot.style === 'joggers') { const last = rings[rings.length - 1]; last.r = [last.r[0] - 0.006 * sc, last.r[1] - 0.006 * sc]; }
        tube(b, rings, { seg: 24, capStart: false, capEnd: false, colorFn: (p, a, r, j) => (bot.style === 'joggers' && j >= rings.length - 2 ? B2 : B1) });
        if (bot.style === 'shorts' || !['boots', 'hightops'].includes(shoes.style)) roll(b, rings, rings.length - 1, bot.style === 'joggers' ? B2 : B1);
      }
      if (bot.style === 'overalls') {     // bib + straps, always outside the top
        const bibTop = body.yChest + 0.03 * sc, bibO = Math.max(botO, topO) + o * 0.7;
        const bib = body.torsoRings(waist - 0.01 * sc, bibTop, { offset: bibO, steps: 8 });
        arcTube(b, bib, Math.PI * 0.3, Math.PI * 0.7, { color: B1, seg: 16 });
        const back = body.torsoRings(waist - 0.01 * sc, waist + 0.05 * sc, { offset: bibO, steps: 2 });
        arcTube(b, back, Math.PI * 1.32, Math.PI * 1.68, { color: B1, seg: 12 });
        for (const s2 of [1, -1]) {
          // strap path sampled on the outside of the torso: front of the bib, over the shoulder, down the back
          const x = s2 * body.r.chest[0] * 0.42, pts = [];
          const outZ = (y, sign) => body.torsoZ(y, sign, x) + sign * (bibO * 1.2 + 0.005 * sc);   // follows the sculpted chest and back
          for (const y of [bibTop - 0.01 * sc, lerp(bibTop, body.ySh, 0.5), body.ySh - 0.012 * sc]) pts.push(V(x, y, outZ(y, 1)));
          pts.push(V(x * 1.05, body.ySh + 0.026 * sc + topO, 0.004 * sc));
          for (const y of [body.ySh - 0.012 * sc, lerp(body.ySh, waist, 0.5), waist + 0.04 * sc]) pts.push(V(x * (y < body.yChest ? 0.9 : 1), y, outZ(y, -1)));
          const rings = [];
          for (let k = 0; k <= 22; k++) { const c = catmullLocal(pts, k / 22); rings.push({ c, r: [0.015 * sc, 0.0045 * sc], w: body.torsoWeights(c.y, c.x), hint: V(0, c.y > body.ySh - 0.02 * sc ? 1 : 0.2, c.z >= 0 ? 1 : -1).normalize() }); }
          tube(b, rings, { seg: 8, color: B1 });
          blob(b, V(x, bibTop - 0.012 * sc, outZ(bibTop - 0.012 * sc, 1) + 0.004 * sc), [0.009 * sc, 0.009 * sc, 0.004 * sc], { nu: 10, nv: 6, color: col('#e8c45a'), weights: body.W({ chest: 1 }) });
        }
      }
    } else {   // skirts
      const long = bot.style === 'longskirt';
      const yEnd = long ? body.yAnkle + 0.05 * sc : body.yKnee + 0.07 * sc;
      const sk = skirtRings(body, waist, yEnd, long ? 0.12 * sc : 0.07 * sc, botO, freeY);
      tube(b, sk, { seg: 40, capStart: false, capEnd: false, colorFn: (p, a, r, j) => (j <= 3 ? B2 : B1) });
      roll(b, sk, sk.length - 1, B1, V(0, 0, 1), 0.0065);
    }
  }
  // ---------------------------------------------------------------- tops
  if (top.style && top.style !== 'none') {
    const b = new Builder(); out.top = b;
    const s = top.style;
    const hemY = hemOf(s);
    const neckY = s === 'tank' ? body.ySh - 0.005 * sc : body.yNeck + 0.004;
    const hem = tuck ? body.yHip + 0.03 * sc : hemY;
    const flare = { hoodie: 0.012, jacket: 0.016, tunic: 0.04, blazer: 0.012 }[s] || 0.004;
    const sleeve = SLEEVE[s];
    const torso = body.torsoRings(hem, neckY, { offset: topO * (s === 'jacket' || s === 'blazer' ? 1.15 : 1), flare: tuck ? 0 : flare * sc, steps: 24, n: 2.15 });
    const N = torso.length - 1;
    tube(b, torso, { seg: 44, capStart: false, capEnd: false, colorFn: (p, a, r, j) => {
      const x = p.x, frontStrip = front(a) && Math.abs(x) < body.r.chest[0] * 0.2 + 0.004;
      if ((s === 'hoodie' || s === 'sweater' || s === 'jersey') && j <= 1 && !tuck) return C2;                    // hem rib
      if (s === 'hoodie' && front(a) && j >= 3 && j <= 7 && Math.abs(Math.cos(a)) < 0.5) return mix(C1, C2, 0.55);   // pocket (edges follow the mesh, so they stay straight)
      if ((s === 'jacket') && frontStrip) return C2;                                                       // open front shows the shirt
      if (s === 'blazer' && front(a) && Math.abs(x) < Math.min(body.r.chest[0] * 0.3, (p.y - body.yChest + 0.03 * sc) * 0.38) && p.y > body.yChest - 0.03 * sc) return C2; // V lapel
      if (s === 'jersey' && Math.abs(Math.cos(a)) > 0.93) return C2;                                        // side stripes
      return C1;
    } });
    if (!tuck && !['dress', 'robe'].includes(s)) roll(b, torso, 0, (s === 'hoodie' || s === 'sweater' || s === 'jersey') ? C2 : C1, V(0, 0, 1), 0.0068);
    // rolled collar rib around the neckline: a clean, solid edge where the garment meets the neck
    if (s !== 'tank' && s !== 'sweater') {
      const top = torso[N], loop = [], M = 40;
      for (let k = 0; k <= M; k++) {
        const a = (k / M) * Math.PI * 2, [x, z] = superXY(a, top.r[0], top.r[1], top.n || 2);
        loop.push({ c: V(top.c.x + x, top.y + 0.001 * sc, top.c.z + z), r: [0.0062 * sc, 0.0048 * sc], w: top.w, hint: V(0, 1, 0) });
      }
      tube(b, loop, { seg: 10, capStart: false, capEnd: false, color: C2 });
    }
    // belt / sash as its own band, so its edges are straight all the way round
    if (s === 'tunic' || s === 'robe' || s === 'dress') {
      const yb = body.yHip + 0.065 * sc;
      // follow the garment's own (flared) surface at that height, just outside it
      const at = (y) => { const k = torso.findIndex((r) => r.y >= y); const r1 = torso[Math.max(1, k)], r0 = torso[Math.max(0, k - 1)], t = (y - r0.y) / ((r1.y - r0.y) || 1);
        return { c: r0.c.clone().lerp(r1.c, t), r: [lerp(r0.r[0], r1.r[0], t) + o * 0.45, lerp(r0.r[1], r1.r[1], t) + o * 0.45], n: 2.15, w: body.torsoWeights(y), off: r0.off }; };   // same sculpted shape as the garment
      if (body.real) {   // realistic bodies curve more at the waist: use the garment's own rings so the sash hugs it
        const k = torso.reduce((bi, r, i) => (Math.abs(r.y - yb) < Math.abs(torso[bi].y - yb) ? i : bi), 1), kk = Math.min(torso.length - 2, Math.max(1, k));
        const mid = torso[kk], part = (q, t) => ({ ...mid, c: mid.c.clone().lerp(q.c, t), r: [lerp(mid.r[0], q.r[0], t) + o * 0.45, lerp(mid.r[1], q.r[1], t) + o * 0.45] });
        tube(b, [part(torso[kk - 1], 0.4), part(mid, 0), part(torso[kk + 1], 0.4)], { seg: 44, capStart: false, capEnd: false, color: C2 });
      } else tube(b, [at(yb - 0.013 * sc), at(yb), at(yb + 0.013 * sc)], { seg: 44, capStart: false, capEnd: false, color: C2 });
    }
    if (sleeve > 0) for (const side of ['left', 'right']) {
      const rings = body.armRings(side, -0.05, sleeve, { offset: topO * (s === 'jacket' || s === 'blazer' ? 1.1 : 0.85), steps: 16, flare: (s === 'robe' ? 0.06 : s === 'tshirt' || s === 'jersey' ? 0.008 : 0) * sc });
      roll(b, rings, rings.length - 1, (s === 'hoodie' || s === 'sweater' || s === 'robe' || s === 'jersey') ? C2 : C1, V(0, 1, 0), 0.0055);
      tube(b, rings, { seg: 22, hint: V(0, 1, 0), capStart: false, capEnd: false, colorFn: (p, a, r, j) => {
        if ((s === 'hoodie' || s === 'sweater') && j >= rings.length - 2) return C2;
        if (s === 'jersey' && j >= rings.length - 3 && j < rings.length - 1) return C2;
        if (s === 'robe' && j >= rings.length - 2) return C2;
        return C1;
      } });
    }
    if (s === 'tank') for (const side of [1, -1]) {      // straps
      const x = side * body.shX * 0.55, pts = [V(x, body.ySh - 0.03 * sc, body.r.shoulder[1] + o), V(x, body.ySh + 0.012 * sc, 0), V(x, body.ySh - 0.03 * sc, -body.r.shoulder[1] - o)];
      tube(b, pts.map((c) => ({ c, r: [0.016 * sc, 0.006 * sc], w: body.torsoWeights(c.y, c.x), hint: V(0, 1, 0) })), { seg: 6, color: C1 });
    }
    if (s === 'sweater') {   // turtleneck
      const rr = body.r.neck + o * 1.6, rings = [];
      for (let i = 0; i <= 3; i++) { const y = lerp(body.ySh, body.yHead + 0.01 * sc, i / 3); rings.push({ c: V(0, y, -0.004 * sc), r: [rr * (1 + 0.06 * Math.sin(i)), rr], w: body.W({ chest: 1 - i / 3, neck: i / 3 }) }); }
      tube(b, rings, { seg: 20, capStart: false, capEnd: false, color: C2 });
    }
    if (s === 'hoodie') {    // hood + drawstrings
      const { rx, ry, rz } = body.head;
      blob(b, V(0, body.yNeck + ry * 0.35, -rz * 0.62), [rx * 0.9, ry * 0.62, rz * 0.5], { nu: 22, nv: 14, color: C1, weights: body.W({ chest: 0.55, neck: 0.45 }),
        deform: (p, d) => { if (d.z > 0) { p.z *= 0.25; p.x *= 1.05; } if (d.y < -0.2) p.y *= 0.7; return p; } });
      for (const sd of [1, -1]) {
        const x = sd * body.r.neck * 0.9, zf = (y, xx) => body.torsoZ(y, 1, xx) + topO * 1.25 + 0.004 * sc;
        tube(b, [V(x, body.yNeck - 0.005, zf(body.ySh, x) * 0.8), V(x * 1.05, body.yChest + 0.02 * sc, zf(body.yChest + 0.02 * sc, x * 1.05)), V(x * 1.1, body.yChest - 0.05 * sc, zf(body.yChest - 0.05 * sc, x * 1.1) + 0.003 * sc)].map((c) => ({ c, r: [0.0042 * sc, 0.0042 * sc], w: body.W({ chest: 1 }) })), { seg: 6, color: col('#e9ebf2') });
      }
    }
    if (s === 'jacket' || s === 'blazer') {   // collar flaps
      for (const sd of [1, -1]) {
        const p0 = V(sd * body.r.neck * 1.1, body.yNeck + 0.006, body.r.neck * 0.6), p1 = V(sd * body.r.chest[0] * 0.42, body.yChest + 0.03 * sc, body.torsoZ(body.yChest + 0.03 * sc, 1, sd * body.r.chest[0] * 0.42) + o * 2.0);
        tube(b, [p0, p0.clone().lerp(p1, 0.5), p1].map((c, i) => ({ c, r: [0.022 * sc * (1 - i * 0.3), 0.004 * sc], w: body.W({ chest: 1 }), hint: V(sd * 0.3, 0, 1) })), { seg: 6, color: s === 'blazer' ? C1 : C2 });
      }
      if (s === 'blazer') for (let i = 0; i < 2; i++) blob(b, V(body.r.waist[0] * 0.12, lerp(body.yHip + 0.03 * sc, body.yChest - 0.04 * sc, i), body.torsoZ(lerp(body.yHip + 0.03 * sc, body.yChest - 0.04 * sc, i), 1, body.r.waist[0] * 0.12) + o * 2.4), [0.007 * sc, 0.007 * sc, 0.004 * sc], { nu: 8, nv: 6, color: col('#2b2c33'), weights: body.torsoWeights(body.yHip + 0.04 * sc) });
    }
    if (s === 'dress' || s === 'robe') {
      const long = s === 'robe';
      const dk = skirtRings(body, body.yHip + 0.065 * sc, long ? body.yAnkle + 0.03 * sc : body.yKnee + 0.03 * sc, long ? 0.13 * sc : 0.1 * sc, o * 1.2);
      tube(b, dk, { seg: 34, capStart: false, capEnd: false, colorFn: (p, a, r, j) => (j >= 19 ? C2 : C1) });
      roll(b, dk, dk.length - 1, C2, V(0, 0, 1), 0.0065);
    }
    if (s === 'tunic') {  // belt buckle
      blob(b, V(0, body.yHip + 0.065 * sc, body.torsoZ(body.yHip + 0.065 * sc, 1) + o * 3.4 + 0.004), [0.018 * sc, 0.014 * sc, 0.005 * sc], { nu: 10, nv: 8, color: col('#e8c45a'), weights: body.torsoWeights(body.yHip + 0.065 * sc) });
    }
    if (s === 'apron') {
      const ap = body.torsoRings(body.yHip - 0.12 * sc, body.yChest + 0.04 * sc, { offset: o * 2.2, steps: 8, flare: 0.03 * sc });
      arcTube(b, ap, Math.PI * 0.22, Math.PI * 0.78, { color: C1 });
      // tie string around the waist
      tube(b, body.torsoRings(body.yHip + 0.06 * sc, body.yHip + 0.075 * sc, { offset: o * 2.3, steps: 1 }), { seg: 28, capStart: false, capEnd: false, color: C2 });
      // shirt underneath uses colour 2
    }
  }
  // ---------------------------------------------------------------- shoes
  if (shoes.style && shoes.style !== 'none') {
    const b = new Builder(); out.shoes = b;
    const S1 = col(shoes.color || '#30323a'), S2 = col(shoes.color2 || '#e6e6ea');
    for (const side of ['left', 'right']) buildShoe(b, body, side, shoes.style, S1, S2, o);
  }
  return out;
}

function skirtRings(body, yTop, yBot, flare, o, yFree = body.yHip - 0.03 * body.sc) {
  const rings = [], N = 26, sc = body.sc;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = lerp(yTop, yBot, t);
    // near the waist the skirt is a garment layer on the sculpted body (same rule as tops and trousers, so tops
    // still hang over it); below the hips it eases into a free-falling shape that clears the widest point
    const yt = Math.max(y, body.yHip - 0.035 * sc), tr = body.torsoRings(yt, yt, { offset: o * 0.5, steps: 1, n: 2.15 })[0];   // (never follows the pelvis taper below the hips)
    const e = smooth(yFree, yFree - 0.13 * sc, y);   // starts easing out only below the hem of the top
    const [rx0, rz0] = body.torsoAt(Math.max(y, body.yHip - 0.06 * sc));
    const mo = 1 + body.torsoMaxOff(Math.max(y, body.yHip - 0.06 * sc));
    const legSpan = Math.abs(body.hipX) + body.r.leg[0] + o * 1.5;
    const freeX = Math.max(Math.max(rx0, body.r.hip[0]) * mo + o, legSpan + 0.01 * sc, tr.r[0] * mo);
    const freeZ = Math.max(Math.max(rz0, body.r.hip[1]) * mo + o, body.r.leg[0] + o * 2, tr.r[1] * mo);
    const tf = Math.max(0, Math.min(1, (yFree - y) / (yFree - yBot || 1)));   // the flare also starts below the hem
    const rx = lerp(tr.r[0], freeX, e) + flare * tf ** 1.2, rz = lerp(tr.r[1], freeZ, e) + flare * 0.85 * tf ** 1.2;
    const legW = smooth(0.1, 1, t) * 0.45, base = tr.off;
    rings.push({ c: V(0, y, tr.c.z * (1 - e)), r: [rx, rz], n: lerp(tr.n, 2.1, e), w: body.W({ hips: 1 - legW, leftUpperLeg: legW / 2, rightUpperLeg: legW / 2 }),
      off: base && e < 1 ? (ang) => base(ang) * (1 - e) : undefined });
  }
  return rings;
}

function buildShoe(b, body, side, style, S1, S2, o) {
  const s = side === 'left' ? 1 : -1, sc = body.sc, an = body.bones[`${side}Foot`].userData.world;
  const L = body.footLen * (style === 'slippers' ? 1.15 : 1.06), w = body.footW * (style === 'slippers' ? 1.45 : 1.2);
  if (style === 'sandals') {
    const sole = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; sole.push({ c: V(an.x, 0.006 * sc, lerp(-0.04 * sc, L * 0.84, t)), r: [w * (0.85 + 0.25 * Math.sin(Math.PI * t)), 0.007 * sc], n: 3, w: body.W({ [`${side}Foot`]: 1 - smooth(0.5, 0.7, t), [`${side}Toes`]: smooth(0.5, 0.7, t) }), hint: V(0, 1, 0) }); }
    tube(b, sole, { seg: 14, hint: V(0, 1, 0), color: S2 });
    for (const z of [0.2, 0.55]) tube(b, [-1, 0, 1].map((k) => ({ c: V(an.x + k * w * 0.85, 0.02 * sc + (1 - Math.abs(k)) * 0.03 * sc, z * L), r: [0.006 * sc, 0.004 * sc], w: body.W({ [`${side}Foot`]: 1 }), hint: V(0, 0, 1) })), { seg: 6, color: S1 });
    return;
  }
  const rings = [];
  const tall = style === 'boots' ? body.yKnee - 0.07 * sc : style === 'hightops' ? body.yAnkle + 0.085 * sc : 0;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, z = lerp(-0.045 * sc, L * 0.86, t);
    const h = lerp(0.075 * sc, 0.035 * sc, smooth(0.25, 1, t)) * (style === 'slippers' ? 1.25 : 1);
    rings.push({ c: V(an.x + s * 0.004 * sc * t, h * 0.5, z), r: [w * (0.8 + 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * (t > 0.95 ? 0.7 : 1), h * 0.58], n: 2.6, t,
      w: body.W({ [`${side}Foot`]: 1 - smooth(0.45, 0.7, t), [`${side}Toes`]: smooth(0.45, 0.7, t) }), hint: V(0, 1, 0) });
  }
  tube(b, rings, { seg: 18, hint: V(0, 1, 0), colorFn: (p, a, r) => {
    if (style === 'slippers') return Math.sin(a) < -0.5 ? S2 : S1;
    if (p.y < 0.013 * sc) return S2;                             // sole
    if ((style === 'sneakers' || style === 'hightops') && r.t > 0.82) return S2;   // toe cap
    if ((style === 'sneakers' || style === 'hightops') && Math.abs(Math.cos(a)) > 0.9 && r.t > 0.2 && r.t < 0.7) return S2; // side stripe
    return S1;
  } });
  if (tall) {
    const shaft = [];
    for (let i = 0; i <= 5; i++) {
      const y = lerp(0.04 * sc, tall, i / 5);
      const rr = (y > body.yKnee ? body.r.leg[1] : lerp(body.r.leg[2], body.r.leg[1], smooth(body.yAnkle, body.yKnee, y))) + o * 1.4 + (style === 'boots' && i === 5 ? 0.006 * sc : 0);
      const kn = smooth(body.yKnee - 0.08 * sc, body.yKnee, y);
      shaft.push({ c: V(an.x, y, 0.004 * sc), r: [rr, rr], off: body.v2 ? body.legOff(side, y) : undefined, w: body.W({ [`${side}Foot`]: 1 - smooth(body.yAnkle - 0.01, body.yAnkle + 0.03 * sc, y), [`${side}LowerLeg`]: smooth(body.yAnkle - 0.01, body.yAnkle + 0.03 * sc, y) * (1 - kn), [`${side}UpperLeg`]: kn }) });
    }
    tube(b, shaft, { seg: 18, capStart: false, capEnd: false, colorFn: (p, a, r, j) => (j === 5 ? S2 : S1) });
    if (body.v2) rollRing(b, shaft, shaft.length - 1, V(0, 0, 1), S2, 0.0075 * sc);
  }
  if (style === 'slippers') for (const k of [1, -1]) {      // little bunny ears on the toes
    const base = V(an.x + k * w * 0.4, 0.07 * sc, L * 0.55);
    tube(b, [0, 0.5, 1].map((t) => ({ c: base.clone().add(V(k * 0.01 * sc * t, 0.05 * sc * t, -0.02 * sc * t)), r: [0.014 * sc * (1 - t * 0.6) + 0.002, 0.005 * sc], w: body.W({ [`${side}Toes`]: 1 }), hint: V(0, 0, 1) })), { seg: 8, color: S2 });
  }
  if (style === 'sneakers' || style === 'hightops') for (let i = 0; i < 3; i++) blob(b, V(an.x, 0.062 * sc - i * 0.006 * sc, lerp(0.0, 0.07, i / 2) * sc + 0.01 * sc), [0.016 * sc, 0.003 * sc, 0.004 * sc], { nu: 8, nv: 4, color: S2, weights: body.W({ [`${side}Foot`]: 1 }) });
}

export function shade(hex, amt) { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt))); return '#' + c.getHexString(); }
function mix(a, b, t) { return a.clone().lerp(b, t); }
function catmullLocal(pts, t) {
  const n = pts.length - 1, f = Math.min(0.9999, Math.max(0, t)) * n, i = Math.floor(f), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n, i + 1)], p3 = pts[Math.min(n, i + 2)];
  const q = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return V(q(p0.x, p1.x, p2.x, p3.x), q(p0.y, p1.y, p2.y, p3.y), q(p0.z, p1.z, p2.z, p3.z));
}

/** A rolled edge (hem, cuff, collar) along ring j of a garment, matching exactly how tube() places that ring. */
function rollRing(b, rings, j, hint, color, th) {
  const r = rings[j], prev = rings[Math.max(0, j - 1)].c, next = rings[Math.min(rings.length - 1, j + 1)].c;
  const { N, B, T } = frameFor(next.clone().sub(prev), r.hint || hint), M = 44, loop = [];
  for (let k = 0; k <= M; k++) {
    const a = (k / M) * Math.PI * 2, [x, z] = superXY(a, r.r[0], r.r[1], r.n || 2), off = r.off ? r.off(a) : 0;
    loop.push({ c: r.c.clone().addScaledVector(B, x * (1 + off)).addScaledVector(N, z * (1 + off)), r: [th, th * 0.85], w: r.w, hint: T });
  }
  tube(b, loop, { seg: 8, capStart: false, capEnd: false, color });
}
