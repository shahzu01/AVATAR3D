// Animal ears and tails for Character Maker characters (anime kemonomimi style).
// Ears are placed by measuring the finished head and hair (rays cast at the actual surface), so they sit on any head
// and any hairstyle. Tails are skinned to a short chain of VRM spring bones, so they swing and settle as the
// character moves, in the live preview, on stream, and in a baked .vrm.
import * as THREE from 'three';
import { VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm';
import { toonGradient } from '/creator/geom.js';

export const EARS = { none: 'None', cat: 'Cat', fox: 'Fox', wolf: 'Wolf', bunny: 'Bunny', bear: 'Bear', elf: 'Elf (pointed)' };
export const TAILS = { none: 'None', cat: 'Cat', fox: 'Fox', wolf: 'Wolf', bunny: 'Bunny puff', bear: 'Bear' };
/** Default tip / inner colours for a kind of animal, from the fur colour. */
export function furTipFor(kind, fur) {
  if (kind === 'fox') return '#f7f2ea';
  if (kind === 'wolf') return '#' + new THREE.Color(fur).multiplyScalar(0.45).getHexString();
  return fur;
}
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });

// ear outlines: base on y = 0, tip up; W = half the base width, H = height (both relative to the head)
const EAR = {
  cat: { H: 0.62, W: 0.36, side: 0.62, back: 0.14, cup: 0.16, bend: 0.06, outline: (s, W, H) => { s.moveTo(-W, 0); s.quadraticCurveTo(-W * 0.62, H * 0.55, -W * 0.08, H * 0.97); s.quadraticCurveTo(0, H * 1.03, W * 0.08, H * 0.97); s.quadraticCurveTo(W * 0.62, H * 0.55, W, 0); s.quadraticCurveTo(0, -H * 0.06, -W, 0); }, inner: '#f4b2c0' },
  fox: { H: 0.82, W: 0.42, side: 0.64, back: 0.12, cup: 0.18, bend: 0.08, outline: (s, W, H) => { s.moveTo(-W, 0); s.quadraticCurveTo(-W * 0.82, H * 0.6, -W * 0.06, H * 0.98); s.quadraticCurveTo(0, H * 1.02, W * 0.06, H * 0.98); s.quadraticCurveTo(W * 0.82, H * 0.6, W, 0); s.quadraticCurveTo(0, -H * 0.05, -W, 0); }, inner: '#f7f0e6' },
  wolf: { H: 0.8, W: 0.34, side: 0.58, back: 0.16, cup: 0.15, bend: 0.1, outline: (s, W, H) => { s.moveTo(-W, 0); s.quadraticCurveTo(-W * 0.78, H * 0.62, -W * 0.05, H * 0.99); s.quadraticCurveTo(0, H * 1.02, W * 0.05, H * 0.99); s.quadraticCurveTo(W * 0.78, H * 0.62, W, 0); s.quadraticCurveTo(0, -H * 0.05, -W, 0); }, inner: '#3a3236' },
  bunny: { H: 1.55, W: 0.2, side: 0.42, back: 0.2, cup: 0.12, bend: 0.22, outline: (s, W, H) => { s.moveTo(-W * 0.8, 0); s.bezierCurveTo(-W * 1.35, H * 0.45, -W * 1.05, H, 0, H); s.bezierCurveTo(W * 1.05, H, W * 1.35, H * 0.45, W * 0.8, 0); s.quadraticCurveTo(0, -H * 0.03, -W * 0.8, 0); }, inner: '#f4b2c0' },
  bear: { H: 0.52, W: 0.38, side: 0.64, back: 0.05, cup: 0.12, bend: 0, outline: (s, W, H) => { s.moveTo(-W, 0); s.bezierCurveTo(-W * 1.15, H * 1.32, W * 1.15, H * 1.32, W, 0); s.quadraticCurveTo(0, -H * 0.08, -W, 0); }, inner: '#c98f86' },
  elf: { H: 0.72, W: 0.17, side: 0, back: 0, cup: 0.1, bend: 0.05, outline: (s, W, H) => { s.moveTo(-W, 0); s.bezierCurveTo(-W * 1.4, H * 0.35, -W * 0.4, H * 0.8, 0, H); s.bezierCurveTo(W * 0.2, H * 0.6, W * 1.2, H * 0.25, W, 0); s.quadraticCurveTo(0, -H * 0.06, -W, 0); }, inner: null },
};

/** One ear as a closed, cupped solid (plus its inner patch): +Y is up the ear, +Z is the open (front) side. */
function earGeometry(spec, R) {
  const H = spec.H * R, W = spec.W * R, T = 0.11 * W + 0.004;
  const shape = new THREE.Shape(); spec.outline(shape, W, H);
  const solid = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: T * 0.45, bevelSize: Math.min(W, H) * 0.07, bevelSegments: 3, curveSegments: 14 });
  solid.translate(0, 0, -T / 2);
  const bend = (g, lift = 0) => {      // cup the front and lean the tip back
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), s = Math.max(0, Math.min(1, y / H));
      p.setZ(i, p.getZ(i) + lift - spec.bend * H * s * s); }      // (no cupping: the caps have no inner vertices to bend)
    g.computeVertexNormals(); return g; };
  const out = [bend(solid)];
  if (spec.inner) {
    const s2 = new THREE.Shape(); spec.outline(s2, W * 0.58, H * 0.8);
    const inner = new THREE.ShapeGeometry(s2, 14); inner.translate(0, H * 0.07, 0);
    out.push(bend(inner, T + 0.0012));
  }
  return out;
}

/** Tail path in a local frame: x = sideways, y = up, z = away from the back. Lengths relative to body height. */
const TAIL = {
  cat: { pts: [[0, 0, 0], [0, -0.06, 0.05], [0.02, -0.12, 0.13], [0.05, -0.09, 0.24], [0.07, 0.02, 0.31], [0.06, 0.13, 0.33]], r: (t) => 0.0125 * (1 - 0.25 * t) * Math.min(1, (1 - t) * 14), fluff: 0 },
  fox: { pts: [[0, 0, 0], [0.01, -0.07, 0.06], [0.04, -0.13, 0.16], [0.08, -0.11, 0.27], [0.1, -0.03, 0.35], [0.1, 0.06, 0.38]], r: (t) => 0.058 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.75) + 0.008, fluff: 0.08, tip: 0.76 },
  wolf: { pts: [[0, 0, 0], [0, -0.07, 0.05], [0.01, -0.15, 0.1], [0.03, -0.23, 0.13], [0.04, -0.3, 0.14]], r: (t) => 0.042 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.92)), 0.7) + 0.006, fluff: 0.07, tip: 0.8 },
};

/** ctx: { vrm, recipe, hasHeadModel, height } -> list of what was added (for the notes) */
export function buildAnimal({ vrm, recipe, hasHeadModel, height = 1.6 }) {
  const ears = EARS[recipe.ears] && recipe.ears !== 'none' && !hasHeadModel ? recipe.ears : null;
  const tail = TAILS[recipe.tail] && recipe.tail !== 'none' ? recipe.tail : null;
  if (!ears && !tail) return [];
  const made = [], raw = (n) => vrm.humanoid.getRawBoneNode(n), W = (o) => o.getWorldPosition(new THREE.Vector3());
  vrm.scene.updateMatrixWorld(true);
  const fur = recipe.furColor || recipe.hairColor || '#6b4226', tipColor = recipe.furTip || furTipFor(tail || ears, fur);
  const la = raw('leftUpperArm'), ra = raw('rightUpperArm'), fwdZ = la && ra && W(la).x < W(ra).x ? -1 : 1;      // which way the character faces
  const targets = []; vrm.scene.traverse((o) => { if (o.isMesh && o.visible && !/^(Outline|Eyelid|Acc_|Animal_)/.test(o.name) && !/^Acc_|^Animal_/.test(o.parent?.name || '')) targets.push(o); });
  for (const m of targets) if (m.isSkinnedMesh) m.skeleton.update();      // so rays see the body as it stands
  const ray = new THREE.Raycaster();
  const hit = (from, to) => { const d = to.clone().sub(from).normalize(); ray.set(from, d); ray.far = from.distanceTo(to) + 0.2; const h = ray.intersectObjects(targets, false)[0]; return h ? h.point : null; };

  if (ears) {
    const head = raw('head'), Hc = W(head), top = hit(Hc.clone().add(new THREE.Vector3(0, 1, 0)), Hc) || Hc.clone().add(new THREE.Vector3(0, 0.2, 0));
    const side = hit(Hc.clone().add(new THREE.Vector3(1, (top.y - Hc.y) * 0.45, 0)), Hc.clone().add(new THREE.Vector3(0, (top.y - Hc.y) * 0.45, 0)));
    const R = side ? Math.abs(side.x - Hc.x) : (top.y - Hc.y) * 0.55;          // half the head (and hair) width
    const spec = EAR[ears], C = new THREE.Vector3(Hc.x, top.y - R * 0.95, Hc.z);
    const g = new THREE.Group(); g.name = 'Animal_ears';
    const mats = ears === 'elf' ? [toon(recipe.skin || '#f2d0b8')] : [toon(fur), toon(spec.inner)];
    for (const s of [1, -1]) {
      let dir, upAxis;
      if (ears === 'elf') { dir = new THREE.Vector3(s, -0.05, -0.15 * fwdZ).normalize(); upAxis = new THREE.Vector3(s, 0.42, -0.42 * fwdZ).normalize(); }
      else { const a = Math.asin(Math.min(0.95, spec.side)); dir = new THREE.Vector3(s * Math.sin(a), Math.cos(a), -spec.back * fwdZ).normalize(); upAxis = dir.clone().lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize(); }
      const origin = ears === 'elf' ? new THREE.Vector3(Hc.x, Hc.y + (top.y - Hc.y) * 0.32, Hc.z - 0.01 * fwdZ) : C;
      const base = hit(origin.clone().addScaledVector(dir, 0.6), origin) || origin.clone().addScaledVector(dir, R);
      const front = new THREE.Vector3(0, 0, fwdZ).addScaledVector(dir, ears === 'elf' ? 0 : 0.0).add(new THREE.Vector3(s * (ears === 'elf' ? 0 : 0.22), 0, 0)).normalize();
      const z = front.clone().addScaledVector(upAxis, -front.dot(upAxis)).normalize(), x = new THREE.Vector3().crossVectors(upAxis, z).normalize();
      const geos = earGeometry(spec, R), ear = new THREE.Group();
      geos.forEach((geo, k) => { const m = new THREE.Mesh(geo, mats[Math.min(k, mats.length - 1)]); m.name = `Animal_ear${k ? '_inner' : ''}`; m.frustumCulled = false; ear.add(m); });
      ear.matrix.makeBasis(x, upAxis, z).setPosition(base.addScaledVector(upAxis, -R * (ears === 'elf' ? 0.12 : 0.1))); ear.matrix.decompose(ear.position, ear.quaternion, ear.scale);
      g.add(ear);
    }
    vrm.scene.add(g); vrm.scene.updateMatrixWorld(true); head.attach(g); made.push(`${EARS[ears]} ears`);
  }

  if (tail) {
    const hips = raw('hips'), Hp = W(hips), s = height / 1.6, back = new THREE.Vector3(0, 0, -fwdZ);
    const aim = Hp.clone().add(new THREE.Vector3(0, -0.04 * s, 0));
    const base = hit(aim.clone().addScaledVector(back, 0.8), aim) || aim.clone().addScaledVector(back, 0.12 * s);
    const g = new THREE.Group(); g.name = 'Animal_tail';
    if (tail === 'bunny' || tail === 'bear') {           // a round puff, no bones needed
      const r = (tail === 'bunny' ? 0.05 : 0.04) * s, geo = new THREE.IcosahedronGeometry(r, 3), p = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(), k = tail === 'bunny' ? 1 + 0.09 * Math.sin(n.x * 11) * Math.sin(n.y * 13) * Math.sin(n.z * 9) : 1; p.setXYZ(i, v.x * k, v.y * k, v.z * k * 0.85); }
      geo.computeVertexNormals(); const m = new THREE.Mesh(geo, toon(tail === 'bunny' ? (recipe.furTip || '#f8f5f0') : fur)); m.name = 'Animal_tail'; m.frustumCulled = false;
      m.position.copy(base).addScaledVector(back, r * 0.55); g.add(m); vrm.scene.add(g); vrm.scene.updateMatrixWorld(true); hips.attach(g);
    } else {
      const spec = TAIL[tail], side = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0);
      const pts = spec.pts.map(([x, y, z]) => base.clone().addScaledVector(side, x * s).addScaledVector(up, y * s).addScaledVector(back, z * s));
      pts[0].addScaledVector(back, -0.015 * s);                 // start just inside the body
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      // bones along the tail, each a child of the one before, hanging from the hips
      const K = 6, bones = []; let parent = hips;
      for (let k = 0; k < K; k++) { const b = new THREE.Bone(); b.name = `Tail_${k}`; parent.add(b); b.position.copy(parent.worldToLocal(curve.getPointAt(k / (K - 1)))); b.updateMatrixWorld(true); bones.push(b); parent = b; }
      const skel = new THREE.Skeleton(bones, bones.map((b) => b.matrixWorld.clone().invert()));
      const M = 48, SEG = 18, frames = curve.computeFrenetFrames(M, false);
      const ring = (i) => { const t = i / M, c = curve.getPointAt(t), r = spec.r(t) * s, out = [];
        for (let j = 0; j <= SEG; j++) { const a = j / SEG * Math.PI * 2, f = 1 + spec.fluff * Math.sin(a * 7 + t * 23) * Math.min(1, t * 6); out.push(c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r * f).addScaledVector(frames.binormals[i], Math.sin(a) * r * f)); } return out; };
      const rings = Array.from({ length: M + 1 }, (_, i) => ring(i));
      const part = (i0, i1, color, name) => {
        const pos = [], si = [], sw = [], idx = [];
        for (let i = i0; i <= i1; i++) { const u = i / M * (K - 1), b0 = Math.min(K - 2, Math.floor(u)), w1 = u - b0;
          for (const p of rings[i]) { pos.push(p.x, p.y, p.z); si.push(b0, b0 + 1, 0, 0); sw.push(1 - w1, w1, 0, 0); } }
        for (let i = 0; i < i1 - i0; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
        if (i1 === M) { const c = curve.getPointAt(1), last = (i1 - i0) * (SEG + 1), ci = pos.length / 3; pos.push(c.x, c.y, c.z); si.push(K - 1, 0, 0, 0); sw.push(1, 0, 0, 0); for (let j = 0; j < SEG; j++) idx.push(last + j, ci, last + j + 1); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setIndex(idx);
        // flip the winding if the frames turned it inside out
        geo.computeVertexNormals(); const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, (SEG + 1) * 2), p0 = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, (SEG + 1) * 2), c0 = curve.getPointAt((i0 + 2) / M);
        if (n.dot(p0.sub(c0)) < 0) { for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]]; geo.setIndex(idx); geo.computeVertexNormals(); }
        const m = new THREE.SkinnedMesh(geo, toon(color)); m.name = name; m.frustumCulled = false; m.bind(skel, new THREE.Matrix4()); return m; };
      const cut = spec.tip ? Math.round(spec.tip * M) : M;
      g.add(part(0, cut, fur, 'Animal_tail')); if (cut < M) g.add(part(cut, M, tipColor, 'Animal_tail_tip'));
      vrm.scene.add(g); g.updateMatrixWorld(true);
      // spring bones: the tail swings, and a ball at the hips keeps it out of the body
      const mgr = vrm.springBoneManager || (vrm.springBoneManager = new VRMSpringBoneManager());
      const ball = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ offset: new THREE.Vector3(), radius: Math.max(0.05, Hp.distanceTo(base) * 0.85) })); ball.name = 'Collider_tail_hips'; hips.add(ball);
      const group = { colliders: [ball], name: 'Tail' };
      for (let k = 0; k < K - 1; k++) { const t = k / (K - 1);
        mgr.addJoint(new VRMSpringBoneJoint(bones[k], bones[k + 1], { hitRadius: Math.max(0.01, spec.r(t) * s * 0.8), stiffness: 1.6 - t * 0.9, gravityPower: 0.04, gravityDir: new THREE.Vector3(0, -1, 0), dragForce: 0.45 }, [group])); }
      mgr.setInitState();
    }
    made.push(`${TAILS[tail]} tail`);
  }
  return made;
}
