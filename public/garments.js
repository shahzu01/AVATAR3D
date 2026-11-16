// Generated garment pieces for the premium outfits: anything a cut-from-the-body layer cannot make.
// Puffed and bell sleeves, armour shoulder plates, capes, frills, corset lacing and bows. All of it is built in the
// kit's rest pose from the measured body (kit axes: x = character's left, -y = front, z = up; arms straight out to the
// sides) and skinned to the nearest sensible bone, so it follows the character when it moves.
import * as THREE from 'three';
import { toonGradient } from '/creator/geom.js';

const GL = (x, y, z) => [x, z, -y];
const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), side: THREE.DoubleSide, ...o });

export function buildExtras(ctx, extras, pal) {
  const { kit, P, bones, body, vrm } = ctx, sk = body.skeleton, out = [];
  const bi = (n) => Math.max(0, sk.bones.indexOf(vrm.humanoid.getRawBoneNode(n)));
  const B = (n) => bones[n][0], hz = B('leftUpperLeg')[2], sz = B('leftUpperArm')[2], H = sz - hz;
  const partOf = (m) => kit.parts[kit.partA[m]] || '';
  const torsoIds = []; for (let m = 0; m < kit.vertexCount; m++) if (partOf(m) === 'Torso') torsoIds.push(m);
  const C = (role) => pal[role] || role;

  // one mesh from GL positions, indices and a single bone (or a per-vertex bone list)
  const emit = (name, pos, idx, color, bone, vcol = null) => {
    const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { if (Array.isArray(bone)) { const [a, b, w] = bone[i]; si[i * 4] = a; si[i * 4 + 1] = b; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w; } else { si[i * 4] = bone; sw[i * 4] = 1; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    if (vcol) g.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.computeVertexNormals();
    const m = new THREE.SkinnedMesh(g, toon(color, vcol ? { vertexColors: true } : {})); m.name = 'Outfit_' + name; m.frustumCulled = false; m.castShadow = true;
    body.parent.add(m); m.bind(sk, body.bindMatrix); out.push(m); return m;
  };
  const grid = (rows, cols, wrap) => { const idx = []; for (let r = 0; r < rows - 1; r++) for (let c = 0; c < (wrap ? cols : cols - 1); c++) { const a = r * cols + c, b = r * cols + (c + 1) % cols; idx.push(a, b, b + cols, a, b + cols, a + cols); } return idx; };

  // ---- arms: radius of the stitched arm along a bone, then tubes around that bone
  const armRadius = (side, a, b) => {
    const A = B(side + a), E = B(side + b), u = E.map((v, i) => v - A[i]), L = Math.hypot(...u), ud = u.map((v) => v / L), bins = new Float32Array(24);
    for (let m = 0; m < kit.vertexCount; m++) { const p = partOf(m); if (!p.startsWith('Arm') || Math.sign(P[m * 3]) !== (side === 'left' ? 1 : -1)) continue;
      const d = [P[m * 3] - A[0], P[m * 3 + 1] - A[1], P[m * 3 + 2] - A[2]], t = (d[0] * ud[0] + d[1] * ud[1] + d[2] * ud[2]) / L; if (t < -0.1 || t > 1.1) continue;
      const r = Math.hypot(d[0] - ud[0] * t * L, d[1] - ud[1] * t * L, d[2] - ud[2] * t * L), k = Math.min(23, Math.max(0, Math.round((t + 0.1) / 1.2 * 23))); if (r > bins[k]) bins[k] = r; }
    for (let k = 1; k < 24; k++) if (!bins[k]) bins[k] = bins[k - 1]; for (let k = 22; k >= 0; k--) if (!bins[k]) bins[k] = bins[k + 1];
    return (t) => { const f = Math.min(23, Math.max(0, (t + 0.1) / 1.2 * 23)), k = Math.floor(f), q = Math.min(23, k + 1); return bins[k] + (bins[q] - bins[k]) * (f - k); };
  };
  const tube = (name, side, a, b, t0, t1, rFn, color, { rows = 14, cols = 28, th0 = 0, th1 = Math.PI * 2, bone = side + a } = {}) => {
    const A = B(side + a), E = B(side + b), u = E.map((v, i) => v - A[i]), L = Math.hypot(...u), ud = u.map((v) => v / L), rArm = armRadius(side, a, b);
    let v = [0, 0, -1]; const dv = v[0] * ud[0] + v[1] * ud[1] + v[2] * ud[2]; v = v.map((x, i) => x - ud[i] * dv); const nv = Math.hypot(...v); v = v.map((x) => x / nv);
    const w = [ud[1] * v[2] - ud[2] * v[1], ud[2] * v[0] - ud[0] * v[2], ud[0] * v[1] - ud[1] * v[0]], full = th1 - th0 >= Math.PI * 2 - 1e-6, pos = [];
    for (let r = 0; r < rows; r++) { const t = t0 + (t1 - t0) * r / (rows - 1);
      for (let c = 0; c < cols; c++) { const th = th0 + (th1 - th0) * c / (full ? cols : cols - 1), rad = rFn(t, th, rArm(Math.min(1, Math.max(0, t))), r / (rows - 1));
        const p = [0, 1, 2].map((i) => A[i] + ud[i] * t * L + (v[i] * Math.cos(th) + w[i] * Math.sin(th)) * rad); pos.push(...GL(...p)); } }
    return emit(name, pos, grid(rows, cols, full), color, bi(bone));
  };

  // ---- torso cross-section by angle at a height, about the torso's own centre line
  const torsoProfile = (z, tol = 0.014, S = 64) => {
    let cy = 0, n = 0; for (const m of torsoIds) if (Math.abs(P[m * 3 + 2] - z) < tol) { cy += P[m * 3 + 1]; n++; } cy = n ? cy / n : 0;
    const prof = new Float32Array(S);
    for (const m of torsoIds) { if (Math.abs(P[m * 3 + 2] - z) >= tol) continue; const x = P[m * 3], y = P[m * 3 + 1] - cy, s = Math.round(((Math.atan2(y, x) / (2 * Math.PI)) + 1) * S) % S, r = Math.hypot(x, y);
      for (let d = -1; d <= 1; d++) { const q = (s + d + S) % S; if (r > prof[q]) prof[q] = r; } }
    const o = new Float32Array(S); for (let s = 0; s < S; s++) { let t = 0; for (let d = -2; d <= 2; d++) t += prof[(s + d + S) % S]; o[s] = Math.max(prof[s], t / 5); }
    return { cy, at: (th) => { const f = (((th / (2 * Math.PI)) % 1) + 1) % 1 * S, k = Math.floor(f) % S, q = (k + 1) % S; return o[k] + (o[q] - o[k]) * (f - Math.floor(f)); } };
  };
  const torsoBone = (z) => z > B('upperChest')[2] - 0.02 ? 'upperChest' : z > B('chest')[2] + 0.02 ? 'chest' : z > B('spine')[2] ? 'spine' : 'hips';

  // ---- front surface of the torso, for things laid on the chest
  const frontY = (x, z) => { let best = 1e9; for (const m of torsoIds) { if (Math.abs(P[m * 3] - x) < 0.009 && Math.abs(P[m * 3 + 2] - z) < 0.009 && P[m * 3 + 1] < best) best = P[m * 3 + 1]; } return best; };
  const backY = (x, z) => { let best = -1e9; for (const m of torsoIds) { if (Math.abs(P[m * 3] - x) < 0.01 && Math.abs(P[m * 3 + 2] - z) < 0.01 && P[m * 3 + 1] > best) best = P[m * 3 + 1]; } return best; };

  // ---- a bow: two lobes, a knot and two tails. dir: 1 = faces front, -1 = faces back
  const bow = (name, cx, cy, cz, size, color, dir, bone, tails = 1) => {
    const pos = [], idx = [], add = (pts, ix) => { const o = pos.length / 3; pos.push(...pts); idx.push(...ix.map((i) => i + o)); };
    const lobe = (s) => { const pts = [], R = 10, Cn = 14;
      for (let i = 0; i <= R; i++) for (let j = 0; j < Cn; j++) { const t = i / R, a = j / Cn * Math.PI * 2, ext = Math.sin(Math.PI * t) ** 0.7, w = size * (0.15 + 0.85 * t);
        const x = cx + s * size * 1.15 * t, y = cy - dir * (size * 0.18 * ext * Math.cos(a) + 0.004), z = cz + w * 0.62 * Math.sin(a) * (0.35 + 0.65 * ext) + size * 0.12 * t;
        pts.push(...GL(x, y, z)); }
      const ix = []; for (let i = 0; i < R; i++) for (let j = 0; j < Cn; j++) { const a = i * Cn + j, b = i * Cn + (j + 1) % Cn; ix.push(a, b, b + Cn, a, b + Cn, a + Cn); } add(pts, ix); };
    lobe(1); lobe(-1);
    { const pts = [], ix = [], R = 6, Cn = 12; for (let i = 0; i <= R; i++) for (let j = 0; j < Cn; j++) { const p = i / R * Math.PI, a = j / Cn * Math.PI * 2, r = size * 0.24;
        pts.push(...GL(cx + r * Math.sin(p) * Math.cos(a) * 0.8, cy - dir * (r * Math.cos(p) * 0.55 + 0.006), cz + r * Math.sin(p) * Math.sin(a))); }
      for (let i = 0; i < R; i++) for (let j = 0; j < Cn; j++) { const a = i * Cn + j, b = i * Cn + (j + 1) % Cn; ix.push(a, b, b + Cn, a, b + Cn, a + Cn); } add(pts, ix); }
    if (tails) for (const s of [1, -1]) { const pts = [], ix = [], R = 8, len = size * 2.4 * tails;
      for (let i = 0; i <= R; i++) { const t = i / R, x = cx + s * size * (0.15 + 0.55 * t), z = cz - len * t, w = size * 0.32 * (1 - 0.15 * t), y = cy - dir * 0.006;
        if (i < R) pts.push(...GL(x - w / 2, y, z), ...GL(x + w / 2, y, z)); else pts.push(...GL(x - w / 2, y, z + (s > 0 ? 0 : -size * 0.3)), ...GL(x + w / 2, y, z + (s > 0 ? -size * 0.3 : 0))); }
      for (let i = 0; i < R; i++) { const a = i * 2; ix.push(a, a + 1, a + 3, a, a + 3, a + 2); } add(pts, ix); }
    return emit(name, pos, idx, color, bi(bone));
  };

  for (const e of extras) {
    const color = C(e.color || 'main');
    if (e.type === 'puffSleeves') for (const side of ['left', 'right'])                // gathered at both ends, full in the middle
      tube('puff_' + side, side, 'UpperArm', 'LowerArm', -0.03, e.len || 0.42, (t, th, r, f) => r + 0.011 + (e.puff || 0.026) * Math.sin(Math.PI * f) ** 0.75 + 0.0024 * Math.sin(14 * th) * Math.sin(Math.PI * f), color, { rows: 16, cols: 42 });
    else if (e.type === 'bellSleeves') for (const side of ['left', 'right']) {        // widening from the elbow, open past the wrist, with a trim band at the edge
      tube('bell_' + side, side, 'LowerArm', 'Hand', 0.0, 1.14, (t, th, r, f) => r + 0.012 + (e.flare || 0.06) * f ** 1.7 + 0.0018 * Math.sin(10 * th) * f, color, { rows: 18, cols: 36 });
      if (e.trim) tube('bellTrim_' + side, side, 'LowerArm', 'Hand', 1.06, 1.15, (t, th, r, f) => r + 0.0145 + (e.flare || 0.06) * ((t / 1.14) ** 1.7) + 0.0012, C(e.trim), { rows: 3, cols: 36 }); }
    else if (e.type === 'wristFrills') for (const side of ['left', 'right'])
      tube('wristFrill_' + side, side, 'LowerArm', 'Hand', 0.86, 1.03, (t, th, r, f) => r + 0.008 + 0.024 * f ** 1.4 + 0.004 * Math.sin(16 * th) * f, color, { rows: 6, cols: 48 });
    else if (e.type === 'pauldrons') for (const side of ['left', 'right']) {         // two overlapping plates over the top of each shoulder
      tube('pauldron_' + side, side, 'UpperArm', 'LowerArm', -0.1, 0.24, (t, th, r, f) => r + 0.02 + 0.012 * Math.sin(Math.PI * f), color, { rows: 10, cols: 22, th0: Math.PI - 1.75, th1: Math.PI + 1.75 });
      tube('pauldron2_' + side, side, 'UpperArm', 'LowerArm', 0.16, 0.36, (t, th, r, f) => r + 0.016 + 0.008 * Math.sin(Math.PI * f), color, { rows: 8, cols: 22, th0: Math.PI - 1.55, th1: Math.PI + 1.55 });
      if (e.trim) tube('pauldronTrim_' + side, side, 'UpperArm', 'LowerArm', 0.22, 0.25, (t, th, r) => r + 0.0215, C(e.trim), { rows: 2, cols: 22, th0: Math.PI - 1.75, th1: Math.PI + 1.75 }); }
    else if (e.type === 'frill') {                      // a ruffled band around the torso at a height, hanging out and down
      const z0 = hz + e.at * H, pr = torsoProfile(z0), S = 96, rows = 5, pos = [], bones_ = [], b0 = bi(torsoBone(z0));
      for (let r = 0; r < rows; r++) { const f = r / (rows - 1); for (let s = 0; s < S; s++) { const th = s / S * Math.PI * 2, rad = pr.at(th) + (e.off || 0.013) + (e.out || 0.03) * f + 0.006 * Math.sin((e.waves || 22) * th) * f;
        pos.push(...GL(rad * Math.cos(th), pr.cy + rad * Math.sin(th), z0 - (e.len || 0.035) * f - 0.003 * Math.cos((e.waves || 22) * th) * f)); } }
      emit('frill_' + e.at, pos, grid(rows, S, true), color, b0); }
    else if (e.type === 'lacing') {                     // criss-cross cord down the front of a corset
      const z1 = hz + (e.from || 0.12) * H, z2 = hz + (e.to || 0.55) * H, n = e.n || 7, w = e.w || 0.016, off = e.off || 0.0135, mat = toon(color);
      for (const dirn of [1, -1]) { const pts = []; for (let i = 0; i <= n; i++) { const z = z1 + (z2 - z1) * i / n, x = (i % 2 ? 1 : -1) * dirn * w; pts.push(new THREE.Vector3(...GL(x, frontY(x, z) - off, z))); }
        const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), n * 6, 0.0019, 6), p = Array.from(tg.attributes.position.array), ix = Array.from(tg.index.array);
        emit('lacing' + dirn, p, ix, color, bi('spine')); mat.dispose(); }
      for (const s of [1, -1]) for (let i = 0; i <= n; i++) { const z = z1 + (z2 - z1) * i / n, x = s * w, g = new THREE.SphereGeometry(0.0032, 8, 6); g.translate(...GL(x, frontY(x, z) - off - 0.0005, z));
        emit('eyelet', Array.from(g.attributes.position.array), Array.from(g.index.array), C(e.eyelet || 'metal'), bi('spine')); } }
    else if (e.type === 'bow') {
      const z = hz + e.at * H, size = e.size || 0.05;
      if (e.where === 'back') bow('bowBack', 0, backY(0, z) + (e.off ?? 0.03), z, size, color, -1, torsoBone(z), e.tails ?? 1.2);
      else bow('bowFront', 0, frontY(0, z) - (e.off ?? 0.02), z, size, color, 1, torsoBone(z), e.tails ?? 0.6); }
    else if (e.type === 'cape') {                       // hangs from the shoulders down the back, clear of the arms
      const zt = sz + 0.035, zb = hz - (e.len ?? 0.42), rows = 16, cols = 30, pos = [], wts = [], sx = B('leftUpperArm')[0];
      const rowsZ = Array.from({ length: rows }, (_, r) => zt + (zb - zt) * (r / (rows - 1)) ** 1.1);
      let cy0 = 0, n0 = 0; for (const m of torsoIds) if (Math.abs(P[m * 3 + 2] - sz) < 0.03) { cy0 += P[m * 3 + 1]; n0++; } cy0 /= n0 || 1;
      const reach = new Float32Array(rows * cols), half = (r) => { const f = r / (rows - 1); return 1.38 - 0.28 * f; };      // angle either side of straight back
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const th = Math.PI / 2 + (c / (cols - 1) * 2 - 1) * half(r); reach[r * cols + c] = 0.05; }
      for (let m = 0; m < kit.vertexCount; m++) { const p = partOf(m); if (!(p === 'Torso' || p === 'Neck' || p.startsWith('Leg') || (p.startsWith('Arm') && Math.abs(P[m * 3]) < sx + 0.07))) continue;
        const x = P[m * 3], y = P[m * 3 + 1] - cy0, z = P[m * 3 + 2]; if (z > zt + 0.03 || z < zb - 0.05) continue; const th = Math.atan2(y, x), rad = Math.hypot(x, y);
        for (let r = 0; r < rows; r++) { if (Math.abs(z - rowsZ[r]) > 0.035) continue; const c = Math.round(((th - Math.PI / 2) / half(r) + 1) / 2 * (cols - 1)); for (let d = -1; d <= 1; d++) { const q = c + d; if (q >= 0 && q < cols && rad > reach[r * cols + q]) reach[r * cols + q] = rad; } } }
      for (const sm of ctx.pieces || []) { if (!/^Outfit_skirt/.test(sm.name)) continue; const sp = sm.geometry.attributes.position;      // hang clear of the skirts too
        for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = -sp.getZ(i) - cy0, z = sp.getY(i); const th = Math.atan2(y, x), rad = Math.hypot(x, y);
          for (let r = 0; r < rows; r++) { if (Math.abs(z - rowsZ[r]) > 0.035) continue; const c = Math.round(((th - Math.PI / 2) / half(r) + 1) / 2 * (cols - 1)); for (let d = -1; d <= 1; d++) { const q = c + d; if (q >= 0 && q < cols && rad + 0.012 > reach[r * cols + q]) reach[r * cols + q] = rad + 0.012; } } } }
      for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) reach[r * cols + c] = Math.max(reach[r * cols + c], reach[(r - 1) * cols + c] * 0.97);
      for (let r = 0; r < rows; r++) { const f = r / (rows - 1), z = rowsZ[r], bone = torsoBone(Math.max(z, hz + 0.05));
        for (let c = 0; c < cols; c++) { const th = Math.PI / 2 + (c / (cols - 1) * 2 - 1) * half(r), cc = c / (cols - 1) * 2 - 1;
          let s = 0, k = 0; for (let d = -2; d <= 2; d++) { const q = Math.min(cols - 1, Math.max(0, c + d)); s += reach[r * cols + q]; k++; }
          const rad = Math.max(reach[r * cols + c], s / k) + 0.02 + (e.flare || 0.09) * f ** 1.3 + 0.017 * (0.5 + 0.5 * Math.sin(7 * cc * Math.PI)) * f ** 1.2;      // soft folds that deepen toward the hem
          pos.push(...GL(rad * Math.cos(th), cy0 + rad * Math.sin(th), z - 0.012 * cc * cc * f)); wts.push([bi(bone), bi(bone), 0]); } }
      emit('cape', pos, grid(rows, cols, false), color, wts);
      if (e.clasp) for (const s of [1, -1]) { const g = new THREE.SphereGeometry(0.011, 12, 10); g.scale(1, 1, 0.6); g.translate(...GL(s * 0.075, frontY(s * 0.075, sz - 0.03) - 0.012, sz - 0.03));
        emit('clasp', Array.from(g.attributes.position.array), Array.from(g.index.array), C(e.clasp), bi('upperChest')); } }
  }
  return out;
}
