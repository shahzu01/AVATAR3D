// Accessories for mixed characters: small pieces built to the measured size of the stitched head, neck and hips,
// each fixed to one bone. Chosen per outfit by default, or picked one by one in the Part Mixer.
import * as THREE from 'three';
import { toonGradient } from '/creator/geom.js';

export const ACCESSORIES = { headset: 'Gaming headset', catEars: 'Cat ears', glasses: 'Glasses', bow: 'Hair bow', choker: 'Choker', scarf: 'Scarf', tail: 'Cat tail', headdress: 'Lace headdress', tiara: 'Tiara', kanzashi: 'Flower hairpin' };
const HEAD_ONLY = new Set(['headset', 'catEars', 'glasses', 'bow', 'headdress', 'tiara', 'kanzashi']);
const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...o });

/** ctx: { kit, P (kit axes), bones, vrm, recipe, list, hasHeadModel } */
export function buildAccessories({ kit, P, bones, vrm, recipe, list, hasHeadModel }) {
  const G = (p) => new THREE.Vector3(p[0], p[2], -p[1]), h = vrm.humanoid, made = [];
  const part = (n) => kit.partVerts[kit.parts.indexOf(n)] || [], main = recipe.clothing, accent = recipe.accent || '#f2efe9', dark = '#' + new THREE.Color(main).multiplyScalar(0.5).getHexString();
  // head measurements from the stitched head
  let top = -1e9, hw = 0, cy = 0, n = 0, front = -1e9; const eye = bones.leftEye ? bones.leftEye[0] : null, hb = bones.head[0];
  for (const i of part('Head')) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; top = Math.max(top, z); if (z > hb[2] + (top - hb[2]) * 0.3) { hw = Math.max(hw, Math.abs(x)); cy += y; n++; } }
  cy /= Math.max(1, n); const earZ = eye ? eye[2] - 0.005 : hb[2] + (top - hb[2]) * 0.45, hair = recipe.hair && recipe.hair !== 'None' ? 0.022 : 0.004;
  for (const i of part('Head')) if (eye && Math.abs(P[i * 3 + 2] - eye[2]) < 0.012 && Math.abs(P[i * 3]) < Math.abs(eye[0]) + 0.02) front = Math.max(front, -P[i * 3 + 1]);
  const add = (name, bone, group) => { group.name = 'Acc_' + name; group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); vrm.scene.add(group); vrm.scene.updateMatrixWorld(true); (h.getRawBoneNode(bone) || vrm.scene).attach(group); made.push(name); };
  const mesh = (geo, mat, pos, rot) => { const m = new THREE.Mesh(geo, mat); if (pos) m.position.copy(pos); if (rot) m.rotation.set(...rot); return m; };
  const ringR = (ringName) => { const r = kit.rings[ringName]; if (!r) return null; const c = [0, 0, 0]; for (const i of r) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / r.length; let rad = 0; for (const i of r) rad += Math.hypot(P[i * 3] - c[0], P[i * 3 + 1] - c[1]) / r.length; return { c, rad }; };
  for (const a of list) {
    if (hasHeadModel && HEAD_ONLY.has(a)) continue;           // a complete head (NekoMika) already has its own ears, bow and hair volume
    const g = new THREE.Group();
    if (a === 'headset') { const R = hw + hair + 0.012, c = G([0, cy, earZ]), body = toon(dark), trim = toon(accent);
      g.add(mesh(new THREE.TorusGeometry(R, 0.0075, 10, 40, Math.PI), body, c));
      for (const s of [1, -1]) { g.add(mesh(new THREE.CylinderGeometry(0.031, 0.034, 0.024, 24), body, c.clone().add(new THREE.Vector3(s * (R - 0.004), 0, 0)), [0, 0, Math.PI / 2]));
        g.add(mesh(new THREE.TorusGeometry(0.027, 0.004, 8, 24), trim, c.clone().add(new THREE.Vector3(s * (R + 0.009), 0, 0)), [0, Math.PI / 2, 0])); }
      const a0 = c.clone().add(new THREE.Vector3(R, -0.012, 0.01)), a1 = new THREE.Vector3(Math.abs(eye ? eye[0] : 0.03) + 0.012, c.y - 0.062, (front > -1e8 ? front : c.z + 0.09) + 0.012);
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a0, a0.clone().lerp(a1, 0.5).add(new THREE.Vector3(0.022, -0.012, 0.006)), a1]), 14, 0.0032, 6), body));
      g.add(mesh(new THREE.SphereGeometry(0.008, 10, 8), trim, a1)); add(a, 'head', g); }
    else if (a === 'catEars') { const fur = toon(recipe.hairColor), inner = toon('#f4a9b8');
      for (const s of [1, -1]) { const p = G([s * hw * 0.62, cy + 0.005, top + hair - 0.012]); const e = mesh(new THREE.ConeGeometry(0.036, 0.075, 4, 1), fur, p, [0, Math.PI / 4, -s * 0.32]); e.scale.z = 0.55;
        const i2 = mesh(new THREE.ConeGeometry(0.022, 0.05, 4, 1), inner, p.clone().add(new THREE.Vector3(0, -0.004, 0.009)), [0, Math.PI / 4, -s * 0.32]); i2.scale.z = 0.4; g.add(e, i2); } add(a, 'head', g); }
    else if (a === 'glasses' && eye && front > -1e8) { const fr = toon('#1c1c22'), z = front + 0.011, r = Math.max(0.017, Math.abs(eye[0]) * 0.62), lens = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, depthWrite: false });
      for (const s of [1, -1]) { const p = new THREE.Vector3(s * Math.abs(eye[0]), eye[2], z); g.add(mesh(new THREE.TorusGeometry(r, 0.0022, 8, 28), fr, p)); g.add(mesh(new THREE.CircleGeometry(r, 24), lens, p));
        const t0 = p.clone().add(new THREE.Vector3(s * r, 0.003, 0)), t1 = new THREE.Vector3(s * (hw + 0.004), eye[2] + 0.004, -cy - 0.005); g.add(mesh(new THREE.TubeGeometry(new THREE.LineCurve3(t0, t1), 2, 0.0018, 6), fr)); }
      g.add(mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-Math.abs(eye[0]) + r, eye[2] + 0.004, z), new THREE.Vector3(Math.abs(eye[0]) - r, eye[2] + 0.004, z)), 2, 0.0022, 6), fr)); add(a, 'head', g); }
    else if (a === 'bow') { const m = toon(accent), b = new THREE.Group(); b.position.copy(G([hw * 0.72, cy + 0.02, top + hair - 0.045])); b.rotation.z = -0.35;
      for (const s of [1, -1]) { const w = mesh(new THREE.ConeGeometry(0.03, 0.055, 12, 1), m, new THREE.Vector3(s * 0.03, 0, 0), [0, 0, -s * Math.PI / 2]); w.scale.z = 0.5; b.add(w); }
      b.add(mesh(new THREE.SphereGeometry(0.012, 12, 10), m)); g.add(b); add(a, 'head', g); }
    else if (a === 'headdress' || a === 'tiara') {           // both sit on the hair a little behind the hairline: measure the head there
      const zc = eye ? eye[2] + (a === 'tiara' ? 0.05 : 0.065) : top - 0.06; let R = 0, yc = 0, nn = 0;
      for (const i of part('Head')) if (Math.abs(P[i * 3 + 2] - zc) < 0.01) { R = Math.max(R, Math.abs(P[i * 3])); yc += P[i * 3 + 1]; nn++; } yc /= nn || 1; R += hair + 0.004;
      if (a === 'headdress') { const band = toon('#f6f1ea'), dk = toon('#1e1b24'), c = G([0, yc + 0.012, zc]), up = top + hair - zc, tilt = new THREE.Euler(-0.42, 0, 0);
        const arcPt = (t, d = 0) => new THREE.Vector3((R + d) * Math.cos(t), (up + d) * Math.sin(t), 0).applyEuler(tilt).add(c);
        const pts = []; for (let i = 0; i <= 24; i++) pts.push(arcPt(i / 24 * Math.PI)); g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0075, 8), band));
        const pts2 = []; for (let i = 0; i <= 24; i++) pts2.push(arcPt(i / 24 * Math.PI, 0.004)); g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 48, 0.0026, 6), dk));
        for (let i = 1; i < 14; i++) { const t = i / 14 * Math.PI, p = arcPt(t, 0.011), q = arcPt(t, 0.02); const fr = mesh(new THREE.ConeGeometry(0.0075, 0.018, 6), band, p); fr.lookAt(q); fr.rotateX(Math.PI / 2); fr.scale.z = 0.5; g.add(fr); }
        add(a, 'head', g); }
      else { const gold = toon('#d6b15a'), gem = toon(accent), pts = [];
        for (let i = 0; i <= 20; i++) { const t = -Math.PI / 2 + (i / 20 * 2 - 1) * 1.15; pts.push(G([R * Math.cos(t), yc + R * 1.05 * Math.sin(t), zc])); }
        g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0032, 6), gold));
        for (let i = -3; i <= 3; i++) { const t = -Math.PI / 2 + i * 0.3, h = i === 0 ? 0.03 : 0.018 - Math.abs(i) * 0.0025, p = G([R * Math.cos(t), yc + R * 1.05 * Math.sin(t), zc + h / 2]);
          g.add(mesh(new THREE.ConeGeometry(0.0045, h, 4), gold, p)); }
        g.add(mesh(new THREE.OctahedronGeometry(0.008), gem, G([0, yc - R * 1.05 - 0.002, zc + 0.012]))); add(a, 'head', g); } }
    else if (a === 'kanzashi') { const pet = toon(accent), mid = toon('#ffe08a'), p = G([hw * 0.8, cy + 0.005, top + hair - 0.06]), f = new THREE.Group(); f.position.copy(p); f.rotation.set(0, Math.PI / 2 * 0.8, 0.2);
      for (let i = 0; i < 5; i++) { const t = i / 5 * Math.PI * 2, pe = mesh(new THREE.SphereGeometry(0.0125, 10, 8), pet, new THREE.Vector3(Math.cos(t) * 0.014, Math.sin(t) * 0.014, 0)); pe.scale.set(1, 1, 0.35); f.add(pe); }
      f.add(mesh(new THREE.SphereGeometry(0.0065, 10, 8), mid)); for (let j = 0; j < 3; j++) { f.add(mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.03, 4), toon('#d6b15a'), new THREE.Vector3(0.006 * (j - 1), -0.03, 0.002)));
        f.add(mesh(new THREE.SphereGeometry(0.0042, 8, 6), pet, new THREE.Vector3(0.006 * (j - 1), -0.047, 0.002))); }
      g.add(f); add(a, 'head', g); }
    else if (a === 'choker') { const r = ringR('HEAD_NECK_SOCKET') || ringR('NECK_TORSO_SOCKET'); if (!r) continue; const lo = ringR('NECK_TORSO_SOCKET'), c = lo ? r.c.map((v, k) => v * 0.55 + lo.c[k] * 0.45) : r.c, rad = (lo ? r.rad * 0.55 + lo.rad * 0.45 : r.rad) + 0.004;
      const t = mesh(new THREE.TorusGeometry(rad, 0.0058, 8, 36), toon('#1b1b22'), G(c), [Math.PI / 2, 0, 0]); t.scale.z = 1.6; g.add(t); g.add(mesh(new THREE.SphereGeometry(0.008, 12, 10), toon(accent), G([c[0], c[1] - rad - 0.003, c[2] - 0.004]))); add(a, 'neck', g); }
    else if (a === 'scarf') { const r = ringR('NECK_TORSO_SOCKET'); if (!r) continue; const m = toon(accent), c = G([r.c[0], r.c[1], r.c[2] + 0.012]);
      const t = mesh(new THREE.TorusGeometry(r.rad + 0.014, 0.019, 10, 36), m, c, [Math.PI / 2, 0, 0]); g.add(t); g.add(mesh(new THREE.SphereGeometry(0.02, 12, 10), m, c.clone().add(new THREE.Vector3(0.012, -0.012, r.rad + 0.02))));
      for (const s of [1, -1]) { const e = mesh(new THREE.BoxGeometry(0.034, 0.1, 0.008), m, c.clone().add(new THREE.Vector3(0.012 + s * 0.02, -0.07, r.rad + 0.024)), [0.12, 0, s * 0.16]); g.add(e); } add(a, 'upperChest', g); }
    else if (a === 'tail') { const hp = bones.hips[0]; let back = -1e9; for (const i of part('Torso')) if (Math.abs(P[i * 3 + 2] - hp[2]) < 0.03 && Math.abs(P[i * 3]) < 0.03) back = Math.max(back, P[i * 3 + 1]);
      const s0 = G([0, back - 0.01, hp[2] - 0.005]), pts = [s0, s0.clone().add(new THREE.Vector3(0.02, -0.06, -0.09)), s0.clone().add(new THREE.Vector3(0.06, -0.10, -0.2)), s0.clone().add(new THREE.Vector3(0.11, -0.03, -0.27)), s0.clone().add(new THREE.Vector3(0.14, 0.07, -0.26))];
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.017, 10); g.add(mesh(tube, toon(recipe.hairColor))); g.add(mesh(new THREE.SphereGeometry(0.0185, 12, 10), toon(recipe.hairColor), pts[4])); add(a, 'hips', g); }
  }
  return made;
}
