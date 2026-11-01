// Accessories. Mostly rigid to the head; scarf/choker to the neck; backpack and wings to the chest.
import { V, lerp, smooth, col, Builder, surface, tube, blob } from './geom.js';
import { earHoles } from './head.js';

/** Ring (torus) around an axis. */
function ring(b, center, axis, R, r, { color, weights, nu = 32, nv = 10, sx = 1, sy = 1, arc = Math.PI * 2, a0 = 0 }) {
  const ax = axis.clone().normalize();
  const t1 = Math.abs(ax.y) < 0.9 ? V(0, 1, 0).cross(ax).normalize() : V(1, 0, 0).cross(ax).normalize();
  const t2 = ax.clone().cross(t1).normalize();
  surface(b, nu, nv, (u, v) => {
    const a = a0 + u * arc, bb = v * Math.PI * 2;
    const cdir = t1.clone().multiplyScalar(Math.cos(a) * sx).addScaledVector(t2, Math.sin(a) * sy);
    const n = cdir.clone().normalize();
    const p = center.clone().addScaledVector(cdir, R).addScaledVector(n, Math.cos(bb) * r).addScaledVector(ax, Math.sin(bb) * r);
    return { pos: p, color, weights };
  }, { closeU: arc >= Math.PI * 2 - 1e-6 });
}

export function buildAccessories(ctx) {
  const { recipe, body, shape } = ctx;
  const list = recipe.accessories || [];
  if (!list.length) return {};
  const b = new Builder(), glow = new Builder();
  const { rx, ry, rz } = body.head, c = body.headC, sc = body.sc;
  const hw = body.W({ head: 1 }), cw = body.W({ chest: 1 });
  const surf = (dir, out = 0) => shape(dir.clone().normalize()).multiplyScalar(1 + out).add(c);
  const dirOf = (az, el) => V(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const hasHair = recipe.hair?.style && !['none', 'tuft'].includes(recipe.hair.style);
  const hairOut = hasHair ? (['curly'].includes(recipe.hair.style) ? 0.2 : 0.09) : 0.015;
  // eye positions (same layout as the drawn face)
  const f = recipe.face || {}, animal = ctx.sp.style === 'animal';
  const eyeX = rx * (0.27 + 0.16 * (f.eyeSpacing ?? 0.5)), eyeY = c.y + ry * ((animal ? 0.06 : -0.1) + 0.24 * ((f.eyeHeight ?? 0.5) - 0.5));
  const eyeH = ry * 0.27 * (0.7 + 0.65 * (f.eyeSize ?? 0.5)) * (animal ? 0.95 : 1.22);
  const eyeZ = (s) => { const d = V(s * eyeX / rx, (eyeY - c.y) / ry, 0.8).normalize(); return surf(d).z; };
  const earAnchor = (s) => surf(V(s, animal ? 0.15 : -0.02, -0.05), 0.0);
  const bandOver = (out, width, color, w = hw, elFrom = 0.05) => {    // band from ear to ear over the top
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, a = lerp(-Math.PI / 2, Math.PI / 2, t); const dir = V(Math.sin(a), Math.max(elFrom, Math.cos(a)), -0.05); pts.push(surf(dir, out + 0.015)); }
    tube(b, pts.map((p) => ({ c: p, r: [width, 0.006 * sc], w, hint: p.clone().sub(c).normalize() })), { seg: 8, color });
  };
  for (const acc of list) {
    const C = col(acc.color || '#1f2026'), dark = C.clone().multiplyScalar(0.55), lite = C.clone().lerp(col('#ffffff'), 0.35);
    switch (acc.id) {
      case 'headset': case 'headphones': {
        const big = acc.id === 'headphones';
        bandOver(hairOut, 0.014 * sc * (big ? 1.2 : 1), C);
        for (const s of [1, -1]) {
          const p = earAnchor(s).add(V(s * 0.012 * sc, 0, 0));
          blob(b, p, [0.022 * sc, rx * (big ? 0.34 : 0.27), rx * (big ? 0.34 : 0.27)], { nu: 18, nv: 12, color: C, weights: hw, deform: (q, d) => { if (Math.abs(d.x) > 0.6) q.x *= 0.6; return q; } });
          blob(glow, p.clone().add(V(s * 0.019 * sc, 0, 0)), [0.004 * sc, rx * (big ? 0.24 : 0.19), rx * (big ? 0.24 : 0.19)], { nu: 16, nv: 8, color: col('#7af0ff'), weights: hw });
        }
        if (!big) {     // microphone boom
          const s0 = earAnchor(1).add(V(0.02 * sc, -0.01 * sc, 0.01 * sc)), m = V(rx * 0.35, c.y - ry * 0.5, surf(V(0.3, -0.5, 0.8)).z + 0.03 * sc);
          tube(b, [s0, s0.clone().lerp(m, 0.5).add(V(0.03 * sc, -0.02 * sc, 0)), m].map((p) => ({ c: p, r: [0.004 * sc, 0.004 * sc], w: hw })), { seg: 6, color: dark });
          blob(b, m, [0.011 * sc, 0.011 * sc, 0.011 * sc], { nu: 10, nv: 8, color: dark, weights: hw });
        }
        break;
      }
      case 'glassesRound': case 'glassesSquare': case 'sunglasses': {
        const R = eyeH * 0.82, z = Math.max(eyeZ(1), eyeZ(-1)) + 0.012 * sc;
        for (const s of [1, -1]) {
          const ctr = V(s * eyeX, eyeY, z);
          const sq = acc.id !== 'glassesRound';
          ring(b, ctr, V(0, 0, 1), R, 0.0035 * sc, { color: C, weights: hw, sx: sq ? 1.15 : 1, sy: sq ? 0.8 : 1 });
          if (acc.id === 'sunglasses') blob(b, ctr, [R * 1.15, R * 0.8, 0.002 * sc], { nu: 16, nv: 6, color: col('#15151c'), weights: hw });
          // temple arm back to the ear
          const e = earAnchor(s).add(V(0, 0.01 * sc, 0.01 * sc));
          tube(b, [ctr.clone().add(V(s * R * 1.1, 0, -0.004)), V(s * (rx * 0.98 + 0.004), eyeY, lerp(z, e.z, 0.5)), e].map((p) => ({ c: p, r: [0.0028 * sc, 0.0028 * sc], w: hw })), { seg: 6, color: C });
        }
        tube(b, [V(-eyeX + R * 0.95, eyeY + R * 0.1, z), V(0, eyeY + R * 0.28, z + 0.006 * sc), V(eyeX - R * 0.95, eyeY + R * 0.1, z)].map((p) => ({ c: p, r: [0.003 * sc, 0.003 * sc], w: hw })), { seg: 6, color: C });
        break;
      }
      case 'cap': case 'beanie': {
        const beanie = acc.id === 'beanie';
        const holes = ctx.sp.style === 'animal' || !['human', 'elf', 'none'].includes(ctx.earType) ? earHoles(ctx.earType, recipe.ears?.size) : [];
        const lift = hairOut + (beanie ? 0.06 : 0.035);
        // hat edge height (dir.y) all the way round: lower at the back, higher over the eyes
        const browTop = Math.min(0.62, Math.max(0.22, (eyeY - c.y) / ry + (eyeH / ry) * 1.25));     // just above the eyebrows
        const edgeY = (az) => { const z = Math.cos(az); return beanie ? lerp(-0.05, browTop + 0.03, smooth(-0.2, 1, z)) : lerp(-0.05, browTop, smooth(-0.3, 1, z)); };
        const crown = (az, v) => {
          const phEdge = Math.acos(Math.max(-0.95, Math.min(0.95, edgeY(az))));
          const ph = v * phEdge, dir = V(Math.sin(ph) * Math.sin(az), Math.cos(ph), Math.sin(ph) * Math.cos(az));
          let out = lift + (beanie ? 0.05 * (1 - v) ** 2 : 0.02 * (1 - v));
          for (const h of holes) { const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(h.dir)))); out = lerp(-0.08, out, smooth(h.r * 0.75, h.r, ang)); }   // ear cut-outs
          return surf(dir, out);
        };
        surface(b, 48, 18, (u, v) => ({ pos: crown(u * Math.PI * 2, v), color: beanie && v > 0.8 ? dark : C, weights: hw }), { flip: true });
        if (beanie) {
          // folded cuff and pom-pom
          const cuff = []; for (let k = 0; k <= 48; k++) { const az = (k / 48) * Math.PI * 2; cuff.push(crown(az, 1).add(V(0, 0.004 * sc, 0))); }
          tube(b, cuff.map((c) => ({ c, r: [0.016 * sc, 0.011 * sc], w: hw, hint: c.clone().sub(body.headC).setY(0).normalize() })), { seg: 10, color: dark });
          blob(b, surf(V(0, 1, -0.05), lift + 0.16), [rx * 0.2, rx * 0.2, rx * 0.2], { nu: 14, nv: 10, color: lite, weights: hw, deform: (q, d) => q.multiplyScalar(1 + 0.1 * Math.sin(d.x * 12) * Math.sin(d.y * 10)) });
        } else {
          // brim: curved peak that follows the front edge and tilts slightly down
          const L = rz * 0.88, brim = (u, v, t) => {
            const az = u * 1.05, base = crown(az, 1);
            const fwd = V(Math.sin(az) * 0.35, 0, 1).normalize();
            const len = L * Math.sqrt(Math.max(0, 1 - (u / 1.0) ** 2)) * v;
            return base.addScaledVector(fwd, len).add(V(0, -len * 0.16 + t, 0));
          };
          const th = 0.0045 * sc;
          surface(b, 20, 6, (uu, v) => ({ pos: brim(uu * 2 - 1, v, th), color: C, weights: hw }), { closeU: false, flip: true });
          surface(b, 20, 6, (uu, v) => ({ pos: brim(uu * 2 - 1, v, -th), color: dark, weights: hw }), { closeU: false });
          // rim of the brim
          const rim = []; for (let k = 0; k <= 20; k++) rim.push(brim((k / 20) * 2 - 1, 1, 0));
          tube(b, rim.map((c) => ({ c, r: [th * 1.1, th * 1.1], w: hw })), { seg: 6, color: C });
          blob(b, crown(0, 0).add(V(0, 0.004 * sc, 0)), [0.011 * sc, 0.007 * sc, 0.011 * sc], { nu: 8, nv: 6, color: dark, weights: hw });
        }
        break;
      }
      case 'crown': {
        const top = surf(V(0, 1, 0.05), hairOut), Rr = rx * 0.5;
        ring(b, top.clone().add(V(0, 0.005 * sc, 0)), V(0, 1, 0), Rr, 0.008 * sc, { color: C, weights: hw, sy: 0.9 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2, base = top.clone().add(V(Math.sin(a) * Rr, 0.008 * sc, Math.cos(a) * Rr * 0.9));
          tube(b, [base, base.clone().add(V(0, 0.05 * sc, 0))].map((p, k) => ({ c: p, r: [0.017 * sc * (1 - k * 0.9) + 0.001, 0.007 * sc * (1 - k * 0.9) + 0.001], w: hw, hint: V(Math.sin(a), 0, Math.cos(a)) })), { seg: 6, color: C });
          blob(b, base.clone().add(V(Math.sin(a) * 0.004, 0.012 * sc, Math.cos(a) * 0.004)), [0.005 * sc, 0.005 * sc, 0.005 * sc], { nu: 8, nv: 6, color: col(i % 2 ? '#e0333f' : '#3f8cff'), weights: hw });
        }
        break;
      }
      case 'horns': for (const s of [1, -1]) {
        const base = surf(dirOf(s * 0.5, 0.88), hairOut + 0.01);
        const hk = 1.35, pts = [base.clone().add(V(0, -0.01 * sc, 0)), base.clone().add(V(s * 0.04 * hk * sc, 0.065 * hk * sc, -0.01 * sc)), base.clone().add(V(s * 0.09 * hk * sc, 0.1 * hk * sc, -0.05 * hk * sc)), base.clone().add(V(s * 0.11 * hk * sc, 0.08 * hk * sc, -0.1 * hk * sc))];
        const rings = []; for (let k = 0; k <= 12; k++) { const t = k / 12; rings.push({ c: catmullLocal(pts, t), r: [0.026 * sc * (1 - t) + 0.001, 0.026 * sc * (1 - t) + 0.001], w: hw, color: C.clone().lerp(lite, t) }); }
        tube(b, rings, { seg: 10 });
      } break;
      case 'halo': ring(glow, c.clone().add(V(0, ry * 1.25 + hairOut * ry, -0.02 * sc)), V(0, 1, 0.15), rx * 0.55, 0.007 * sc, { color: col(acc.color || '#ffe27a'), weights: hw }); break;
      case 'bow': {
        const p = surf(dirOf(0.7, 0.8), hairOut + 0.04);
        for (const s of [1, -1]) blob(b, p.clone().add(V(s * 0.035 * sc, 0, 0)), [0.035 * sc, 0.024 * sc, 0.012 * sc], { nu: 14, nv: 8, color: C, weights: hw, deform: (q, d) => { q.y *= 1 - 0.5 * Math.max(0, -d.x * s); return q; } });
        blob(b, p, [0.013 * sc, 0.014 * sc, 0.014 * sc], { nu: 10, nv: 8, color: dark, weights: hw });
        break;
      }
      case 'flower': {
        const fd = dirOf(-0.8, 0.5), p = surf(fd, hairOut + 0.04), k2 = 1.7;
        const fx = fd.clone().setY(0).normalize(), fy = V(0, 1, 0), fz = fx.clone().cross(fy).normalize();
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; blob(b, p.clone().addScaledVector(fy, Math.sin(a) * 0.016 * k2 * sc).addScaledVector(fz, Math.cos(a) * 0.016 * k2 * sc), [0.013 * k2 * sc, 0.013 * k2 * sc, 0.013 * k2 * sc], { nu: 10, nv: 8, color: C, weights: hw, deform: (q) => q.addScaledVector(fx, -q.dot(fx) * 0.65) }); }
        blob(b, p.clone().addScaledVector(fx, 0.004 * sc), [0.009 * k2 * sc, 0.009 * k2 * sc, 0.009 * k2 * sc], { nu: 8, nv: 6, color: col('#ffd43f'), weights: hw });
        break;
      }
      case 'bandana': {
        const rings = [];
        for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; const dir = V(Math.sin(a), 0.42 + 0.06 * Math.cos(a), Math.cos(a)); rings.push(surf(dir, hairOut + 0.02)); }
        tube(b, rings.map((p) => ({ c: p, r: [0.018 * sc, 0.004 * sc], w: hw, hint: p.clone().sub(c).normalize() })), { seg: 6, color: C });
        const k = surf(V(0, 0.42, -1), hairOut + 0.03);
        for (const s of [1, -1]) tube(b, [k, k.clone().add(V(s * 0.03 * sc, -0.05 * sc, -0.02 * sc))].map((p, i) => ({ c: p, r: [0.012 * sc * (1 - i * 0.6), 0.004 * sc], w: hw, hint: V(0, 0, -1) })), { seg: 6, color: C });
        break;
      }
      case 'scarf': {
        if (!body.v2) {   // classic characters keep their original scarf exactly
          const rr = body.r.neck + 0.022 * sc;
          ring(b, V(0, body.ySh + 0.012 * sc, 0), V(0, 1, 0), rr, 0.02 * sc, { color: C, weights: body.W({ neck: 0.4, chest: 0.6 }), sy: 0.95 });
          const p0 = V(body.r.neck * 0.6, body.ySh, rr + 0.012 * sc);
          tube(b, [p0, p0.clone().add(V(0.012 * sc, -0.08 * sc, 0.01 * sc)), p0.clone().add(V(0.02 * sc, -0.16 * sc, 0.0))].map((p, i) => ({ c: p, r: [0.026 * sc, 0.008 * sc], w: cw, hint: V(0, 0, 1), color: i === 2 ? dark : C })), { seg: 8 });
          break;
        }
        // v2: the loop sits on top of the (thicker) collar, and the hanging end comes out of a knot at the front,
        // resting on the chest, so loop and tail read as one piece
        const yS = body.ySh + 0.012 * sc, [tx, tz] = body.torsoAt(yS), clear = 0.034 * sc;
        const rz = Math.max(body.r.neck + 0.022 * sc, tz * (1 + body.torsoOff(yS, 0, 1)) + clear), rx = Math.max((body.r.neck + 0.022 * sc) * 0.95, tx * (1 + body.torsoOff(yS, 1, 0)) + clear);
        ring(b, V(0, yS, 0), V(0, 1, 0), rz, 0.02 * sc, { color: C, weights: body.W({ neck: 0.4, chest: 0.6 }), sy: rx / rz });
        blob(b, V(body.r.neck * 0.45, yS - 0.008 * sc, rz + 0.006 * sc), [0.02 * sc, 0.017 * sc, 0.012 * sc], { nu: 12, nv: 8, color: C, weights: body.W({ neck: 0.3, chest: 0.7 }) });   // knot
        const p0 = V(body.r.neck * 0.55, yS - 0.012 * sc, rz + 0.004 * sc);
        const onChest = (q) => { q.z = Math.max(q.z, body.torsoZ(q.y, 1, q.x) + 0.032 * sc); return q; };
        tube(b, [p0, onChest(p0.clone().add(V(0.012 * sc, -0.08 * sc, 0.01 * sc))), onChest(p0.clone().add(V(0.02 * sc, -0.16 * sc, 0.0)))].map((p, i) => ({ c: p, r: [0.026 * sc, 0.008 * sc], w: cw, hint: V(0, 0, 1), color: i === 2 ? dark : C })), { seg: 8 });
        break;
      }
      case 'choker': {
        const rr = body.r.neck * 1.04;
        ring(b, V(0, lerp(body.yNeck, body.yHead, 0.3), -0.004 * sc), V(0, 1, 0), rr, 0.004 * sc, { color: C, weights: body.W({ neck: 1 }) });
        blob(b, V(0, lerp(body.yNeck, body.yHead, 0.3) - 0.012 * sc, rr + 0.003 * sc), [0.007 * sc, 0.009 * sc, 0.004 * sc], { nu: 8, nv: 6, color: col('#ff4f86'), weights: body.W({ neck: 1 }) });
        break;
      }
      case 'earrings': for (const s of [1, -1]) {
        const e = animal ? surf(dirOf(s * 0.9, 0.7), 0.02) : earAnchor(s).add(V(s * 0.006 * sc, -ry * 0.25, 0));
        ring(b, e.clone().add(V(0, -0.012 * sc, 0)), V(1, 0, 0), 0.011 * sc, 0.0022 * sc, { color: C, weights: hw, nu: 16, nv: 6 });
      } break;
      case 'backpack': {
        const z = body.torsoZ(lerp(body.yHip, body.ySh, 0.55), -1) - 0.072 * sc;   // sits on the sculpted back, over any top
        blob(b, V(0, lerp(body.yHip, body.ySh, 0.55), z), [body.r.chest[0] * 0.75, (body.ySh - body.yHip) * 0.42, 0.06 * sc], { nu: 20, nv: 14, color: C, weights: cw, deform: (q, d) => { const k = 2.8; q.x = Math.sign(q.x) * Math.abs(q.x) ** 1 ; void k; void d; return q; } });
        blob(b, V(0, lerp(body.yHip, body.ySh, 0.42), z - 0.05 * sc), [body.r.chest[0] * 0.5, (body.ySh - body.yHip) * 0.18, 0.025 * sc], { nu: 14, nv: 8, color: dark, weights: cw });
        for (const s of [1, -1]) { const x = s * body.r.chest[0] * 0.45; tube(b, [V(x, body.ySh - 0.02 * sc, body.torsoZ(body.ySh - 0.02 * sc, -1, x) - 0.024 * sc), V(x * 1.15, body.ySh + 0.024 * sc, 0), V(x * 1.1, body.yChest, body.torsoZ(body.yChest, 1, x * 1.1) + 0.024 * sc), V(x * 1.0, body.yHip + 0.06 * sc, body.torsoZ(body.yHip + 0.06 * sc, 1, x) + 0.022 * sc)].map((p) => ({ c: p, r: [0.012 * sc, 0.004 * sc], w: body.torsoWeights(p.y, p.x), hint: p.z >= 0 ? V(0, 0.3, 1) : V(0, 0.3, -1) })), { seg: 6, color: dark }); }
        break;
      }
      case 'wings': for (const s of [1, -1]) {
        const root = V(s * 0.04 * sc, body.yChest + 0.04 * sc, body.torsoZ(body.yChest + 0.04 * sc, -1, s * 0.04 * sc) - 0.016 * sc);
        for (let k = 0; k < 3; k++) {
          const tip = root.clone().add(V(s * (0.16 - k * 0.03) * sc, (0.08 - k * 0.07) * sc, -0.05 * sc));
          tube(b, [root, root.clone().lerp(tip, 0.5).add(V(0, 0.03 * sc, 0)), tip].map((p, i) => ({ c: p, r: [0.03 * sc * (1 - i * 0.45), 0.005 * sc], w: cw, hint: V(0, 0, -1), color: k === 0 ? C : lite })), { seg: 8 });
        }
      } break;
    }
  }
  return { main: b, glow };
}

function catmullLocal(pts, t) {
  const n = pts.length - 1, f = Math.min(0.9999, Math.max(0, t)) * n, i = Math.floor(f), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n, i + 1)], p3 = pts[Math.min(n, i + 2)];
  const q = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return V(q(p0.x, p1.x, p2.x, p3.x), q(p0.y, p1.y, p2.y, p3.y), q(p0.z, p1.z, p2.z, p3.z));
}
void smooth;
