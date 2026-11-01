// Hairstyles: a scalp "cap" that follows the head shape plus clumps (bangs, spikes, locks, tails) built along curves.
// Long hair, ponytails and twin tails hang from spring bones so they swing.
import { V, lerp, smooth, col, Builder, surface, tube, catmull, blob } from './geom.js';

export function buildHair(ctx) {
  const { recipe, body, shape, addSpring, sp } = ctx;
  const style = recipe.hair?.style || 'none';
  const hat = (recipe.accessories || []).some((a) => ['cap', 'beanie'].includes(a.id));   // hair under a hat is flattened
  if (style === 'none') return {};
  const b = new Builder();
  const C1 = col(recipe.hair.color || '#3b2a22'), C2 = col(recipe.hair.color2 || recipe.hair.color || '#6b4226');
  const { rx, ry, rz } = body.head, c = body.headC, sc = body.sc;
  const animal = sp.style === 'animal';
  const hw = body.W({ head: 1 });
  const surf = (dir, out = 0) => { const d = dir.clone().normalize(); return shape(d).multiplyScalar(1 + out).add(c); };
  const dirOf = (az, el) => V(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));   // az 0 = front
  const tipCol = (t) => (t > 0.72 ? C1.clone().lerp(C2, smooth(0.72, 1, t)) : C1);

  /** Scalp cap: hairline heights (dir.y) for front / side / back. thick = relative thickness. */
  const cap = ({ front = 0.42, side = 0.05, back = -0.45, thick = 0.07, flareBack = 0 } = {}) => {
    surface(b, 40, 24, (u, v) => {
      const th = u * Math.PI * 2, ph = v * Math.PI * 0.86;
      const dir = V(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
      const line = dir.z >= 0 ? lerp(side, front, smooth(0, 0.95, dir.z) ** 1.3) : lerp(side, back, smooth(0, 0.9, -dir.z));
      const m = smooth(line - 0.12, line + 0.02, dir.y);
      const extra = flareBack * smooth(0.1, -0.6, dir.y) * smooth(0.2, -0.6, dir.z);
      const pos = surf(dir, (thick + extra) * m - 0.035 * (1 - m));
      return { pos, color: C1, weights: hw };
    }, { flip: true });
  };
  /** A flattened, tapered clump through points; widths in metres. weights: fn(t) or a fixed map. */
  const clump = (pts, w0, w1 = 0, { thick = 0.45, weights = hw, steps = 10, colorFn = tipCol, outward = null, n = 2 } = {}) => {
    const rings = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, p = catmull(pts, t);
      const w = lerp(w0, w1, t ** 0.9) * (k === steps ? 0.25 : 1) + 0.0012;
      const hint = outward ? outward(p, t) : p.clone().sub(c).normalize();
      rings.push({ c: p, r: [w, w * thick], hint, w: typeof weights === 'function' ? weights(t, p) : weights, color: colorFn(t), n });
    }
    tube(b, rings, { seg: 10 });
  };
  /** Bang that follows the forehead from the crown down to brow level. */
  const bang = (az, { len = 1, width = 0.3, curl = 0.25, lift = 0.06 } = {}) => {
    const pts = [];
    const el0 = 1.2, el1 = lerp(0.62, 0.22, len);
    for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(surf(dirOf(az + curl * t * Math.sign(az || 1) * 0.3, lerp(el0, el1, t)), lift + 0.02 * Math.sin(Math.PI * t))); }
    clump(pts, rx * width, rx * 0.02, { thick: 0.32 });
  };
  const spike = (az, el, len, width, bend = 0.25) => {
    if (hat && el > 0.05) return;            // would poke through the hat
    const d = dirOf(az, el), base = surf(d, 0.02), up = V(0, 1, 0);
    const out = d.clone().lerp(up, bend).normalize();
    clump([base, base.clone().addScaledVector(out, len * 0.55), base.clone().addScaledVector(out, len).addScaledVector(d, len * 0.1)], width, 0.001, { thick: 0.7, outward: () => V(0, 0, 1).applyAxisAngle(V(0, 1, 0), az) });
  };
  /** Hanging lock: follows the head then falls to yEnd. springBones: bone names to weight the lower part to. */
  const lock = (az, el, yEnd, width, { spread = 0, springNames = null, out = 0.08, thick = 0.4, wave = 0 } = {}) => {
    const d0 = dirOf(az, el), p0 = surf(d0, out);
    const pts = [p0];
    const elB = Math.min(el, -0.2), pB = surf(dirOf(az, elB), out + 0.04);
    if (el > -0.15) pts.push(surf(dirOf(az, (el + elB) / 2), out + 0.02));
    pts.push(pB);
    const away = V(Math.sin(az), 0, Math.cos(az));
    const n = 3;
    for (let i = 1; i <= n; i++) { const t = i / n; pts.push(V(pB.x + away.x * (spread * t + 0.01 * sc) + Math.sin(t * 6) * wave, lerp(pB.y, yEnd, t), pB.z + away.z * (0.02 * sc + spread * t))); }
    const yTop = pB.y;
    const weights = springNames ? (t, p) => {
      if (p.y > yTop - 0.01) return hw;
      const f = Math.min(0.999, (yTop - p.y) / Math.max(1e-3, yTop - yEnd)) * springNames.length, i = Math.floor(f), u = f - i;
      return body.W({ [springNames[i]]: 1 - u * 0.5, ...(springNames[i + 1] ? { [springNames[i + 1]]: u * 0.5 } : { [springNames[i]]: 1 }) });
    } : hw;
    clump(pts, width, width * 0.35, { thick, weights, steps: 14 });
  };
  const springChain = (name, start, yEnd, count = 3, opts = {}) => {
    const names = Array.from({ length: count }, (_, i) => `${name}_${i}`);
    const pts = Array.from({ length: count + 1 }, (_, i) => V(start.x, lerp(start.y, yEnd, i / count), start.z));
    addSpring(names, 'head', pts, { stiffness: 1.4, gravity: 0.35, drag: 0.4, radius: 0.025 * sc, ...opts });
    return names;
  };
  const backY = c.y - ry * 0.9;      // bottom of the skull at the back
  const sidesBangs = (n, width, len, spread = 0.95) => { for (let i = 0; i < n; i++) bang(lerp(-spread, spread, n === 1 ? 0.5 : i / (n - 1)), { width, len }); };

  switch (style) {
    case 'short': cap({ front: 0.5, side: -0.05, back: -0.5, thick: 0.06 }); sidesBangs(5, 0.24, 0.55); for (let i = 0; i < 6; i++) spike(Math.PI + lerp(-0.9, 0.9, i / 5), lerp(-0.1, 0.2, (i % 2)), ry * 0.25, rx * 0.12, 0.05); break;
    case 'spiky': cap({ front: 0.5, side: 0.0, back: -0.4, thick: 0.07 });
      for (let i = 0; i < 9; i++) spike(lerp(-2.6, 2.6, i / 8) + Math.PI, 0.55 + 0.25 * (i % 2), ry * (0.55 + 0.2 * (i % 3) / 2), rx * 0.2, 0.35);
      for (let i = 0; i < 5; i++) spike(lerp(-1.0, 1.0, i / 4), 0.95, ry * 0.5, rx * 0.17, 0.6);
      sidesBangs(5, 0.22, 0.75); break;
    case 'messy': cap({ front: 0.45, side: -0.05, back: -0.5, thick: 0.08 });
      for (let i = 0; i < 18; i++) { const az = (i / 18) * Math.PI * 2 + Math.sin(i * 7.1) * 0.3; spike(az, 0.25 + ((i * 37) % 10) / 14, ry * (0.18 + ((i * 13) % 7) / 30), rx * 0.13, 0.15); }
      sidesBangs(6, 0.2, 0.7); break;
    case 'bob': cap({ front: 0.48, side: -0.62, back: -0.75, thick: 0.1, flareBack: 0.05 });
      for (let i = 0; i < 9; i++) bang(lerp(-1.0, 1.0, i / 8), { width: 0.17, len: 0.85, lift: 0.08 });
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) lock(s * (1.25 + i * 0.25), 0.1, c.y - ry * 0.72, rx * 0.2, { out: 0.1 });
      break;
    case 'long': case 'hime': {
      cap({ front: style === 'hime' ? 0.5 : 0.45, side: -0.2, back: -0.55, thick: 0.08 });
      if (style === 'hime') { for (let i = 0; i < 9; i++) bang(lerp(-0.9, 0.9, i / 8), { width: 0.15, len: 0.92, curl: 0, lift: 0.07 }); }
      else { sidesBangs(4, 0.26, 0.85); }
      const yEnd = body.yChest - 0.06 * sc;
      const chains = [-1, 0, 1].map((k) => springChain(`hairB${k + 1}`, V(k * rx * 0.55, backY + 0.02 * sc, -rz * 0.85), yEnd));
      for (let i = 0; i < 9; i++) { const k = i / 8, az = Math.PI + lerp(-1.25, 1.25, k); lock(az, 0.3, yEnd + Math.sin(i * 2.3) * 0.02 * sc, rx * 0.24, { springNames: chains[k < 0.34 ? 2 : k < 0.67 ? 1 : 0], spread: 0.02 * sc, out: 0.09 }); }
      for (const s of [1, -1]) lock(s * 1.15, 0.15, style === 'hime' ? c.y - ry * 1.05 : body.ySh - 0.02 * sc, rx * 0.17, { out: 0.09 });
      break;
    }
    case 'ponytail': case 'twintails': {
      cap({ front: 0.45, side: -0.2, back: -0.55, thick: 0.07 }); sidesBangs(5, 0.22, 0.75);
      const spots = style === 'ponytail' ? [V(0, c.y + ry * 0.35, -rz * 0.95)] : [V(rx * 0.85, c.y + ry * 0.45, -rz * 0.35), V(-rx * 0.85, c.y + ry * 0.45, -rz * 0.35)];
      spots.forEach((p, k) => {
        const yEnd = style === 'ponytail' ? body.yChest - 0.03 * sc : body.yChest - 0.09 * sc;
        const names = springChain(`tail${k}`, p.clone().add(V(Math.sign(p.x) * 0.03 * sc, -0.02 * sc, -0.03 * sc)), yEnd, 3, { stiffness: 1.2 });
        blob(b, p, [rx * 0.16, rx * 0.16, rx * 0.16], { nu: 12, nv: 8, color: C2, weights: hw });
        const away = p.x === 0 ? V(0, 0, -1) : V(Math.sign(p.x), 0, -0.3).normalize();
        for (let i = 0; i < 4; i++) {
          const off = V(Math.cos(i * 1.6) * 0.012 * sc, 0, Math.sin(i * 1.6) * 0.012 * sc);
          const pts = [p.clone().add(off), p.clone().addScaledVector(away, 0.07 * sc).add(V(0, 0.02 * sc, 0)).add(off), V(p.x + away.x * 0.1 * sc, lerp(p.y, yEnd, 0.5), p.z + away.z * 0.09 * sc).add(off), V(p.x + away.x * 0.06 * sc, yEnd, p.z + away.z * 0.05 * sc).add(off)];
          const yTop = p.y;
          clump(pts, rx * 0.2, rx * 0.04, { thick: 0.7, steps: 12, weights: (t, q) => { if (q.y > yTop - 0.02) return hw; const f = Math.min(0.999, (yTop - q.y) / (yTop - yEnd)) * 3, j = Math.floor(f); return body.W({ [names[j]]: 1 }); } });
        }
      });
      break;
    }
    case 'buns': cap({ front: 0.45, side: -0.15, back: -0.5, thick: 0.07 }); sidesBangs(5, 0.22, 0.75);
      if (!hat) for (const s of [1, -1]) { const p = surf(dirOf(s * 0.75, 0.95), 0.12); blob(b, p, [rx * 0.33, rx * 0.33, rx * 0.33], { nu: 18, nv: 12, color: C1, weights: hw, deform: (q, d) => q.multiplyScalar(1 + 0.05 * Math.sin(d.x * 14 + d.y * 9)) }); }
      break;
    case 'curly': cap({ front: 0.4, side: -0.35, back: -0.6, thick: 0.18 });
      for (let i = 0; i < 26; i++) { const az = (i / 26) * Math.PI * 2, el = 0.15 + ((i * 7) % 5) / 6; if (hat && el > 0.3) continue; const p = surf(dirOf(az, el), 0.18); blob(b, p, [rx * 0.2, rx * 0.2, rx * 0.2], { nu: 10, nv: 8, color: i % 3 ? C1 : C2, weights: hw }); }
      break;
    case 'mohawk': cap({ front: 0.5, side: 0.35, back: -0.3, thick: 0.02 });
      for (let i = 0; i < 9; i++) { const el = lerp(0.95, -0.25, i / 8) ; const az = el > 0.6 ? 0 : Math.PI; const e2 = el > 0.6 ? el : Math.PI - el - 1.2; spike(i < 3 ? 0 : Math.PI, i < 3 ? lerp(0.8, 1.35, i / 2) : lerp(1.35, 0.1, (i - 3) / 5), ry * (0.55 - Math.abs(i - 3) * 0.04), rx * 0.13, 0.5); void az; void e2; }
      break;
    case 'sidepart': cap({ front: 0.45, side: -0.05, back: -0.5, thick: 0.07 });
      for (let i = 0; i < 6; i++) bang(lerp(-0.3, 1.0, i / 5), { width: 0.24, len: lerp(0.95, 0.6, i / 5), curl: 0.8 });
      bang(-0.6, { width: 0.2, len: 0.5 }); break;
    case 'undercut': cap({ front: 0.55, side: 0.42, back: 0.1, thick: 0.05 });
      if (!hat) for (let i = 0; i < 7; i++) { const az = lerp(-0.9, 0.9, i / 6); const p0 = surf(dirOf(az * 1.2 + Math.PI, 0.8), 0.04), p1 = surf(dirOf(az, 1.3), 0.25), p2 = surf(dirOf(az * 0.8, 0.75), 0.2); clump([p0, p1, p2], rx * 0.22, rx * 0.03, { thick: 0.5 }); }
      break;
    case 'tuft': if (!hat) for (let i = 0; i < 4; i++) { const az = lerp(-0.45, 0.45, i / 3); const p0 = surf(dirOf(az, 1.05), 0.0), p1 = surf(dirOf(az * 1.2, 0.95), 0.18), p2 = surf(dirOf(az * 1.4, 0.7), 0.22); clump([p0, p1, p2], rx * 0.13, 0.001, { thick: 0.6 }); }
      break;
  }
  void animal;
  return { main: b };
}
