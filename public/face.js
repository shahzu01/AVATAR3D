// Face movement and small life-like touches for mixed characters:
// blink / mouth shapes / expressions (from public/modular/face_kit.json, MakeHuman's CC0 expression units),
// a mouth interior, iris and pupil for the plain human eyeballs, and hair that lags and settles when the head moves.
import * as THREE from 'three';
import { VRMExpressionManager, VRMExpression, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';

let kitP = null;
const b64 = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
export function loadFaceKit(base) {
  return kitP || (kitP = fetch(base + 'face_kit.json').then((r) => r.ok ? r.json() : null).then((j) => { if (!j) return null;
    for (const e of Object.values(j.expressions)) { e.idsA = b64(e.ids, Uint16Array); e.dA = b64(e.d, Float32Array); } return j; }).catch(() => null));
}

/** Morph targets on the body mesh + a VRM expression manager, so tracking, lip-sync and triggers work like on any VRM. */
export function addFace({ face, vrm, body, toMaster, P, scale, anime, eyeZ = null }) {
  if (!face) return [];
  const geo = body.geometry, n = geo.attributes.position.count, names = Object.keys(face.expressions).filter((k) => k[0] !== '_'), targets = [];
  const rest = face.expressions._smile;                    // neutral faces rest in a slight smile instead of a flat line
  if (rest) { const at = new Map(); for (let k = 0; k < rest.idsA.length; k++) at.set(rest.idsA[k], k); const pos = geo.attributes.position;
    for (let i = 0; i < n; i++) { const k = at.get(toMaster[i]); if (k === undefined) continue; const m = toMaster[i], w = eyeZ === null ? 1 : Math.min(1, Math.max(0, (eyeZ - 0.04 * scale - P[m * 3 + 2]) / (0.015 * scale)));      // the cheek lift stops below the eyes
      if (w > 0) pos.setXYZ(i, pos.getX(i) + rest.dA[k * 3] * scale * w, pos.getY(i) + rest.dA[k * 3 + 2] * scale * w, pos.getZ(i) - rest.dA[k * 3 + 1] * scale * w); } pos.needsUpdate = true; }
  for (const name of names) { const e = face.expressions[name], dense = new Float32Array(face.vertexCount * 3), lid = anime ? 2.1 : 1;      // anime eyes are taller: the lids travel further
    for (let k = 0; k < e.idsA.length; k++) { const m = e.idsA[k]; dense[m * 3] = e.dA[k * 3] * scale; dense[m * 3 + 1] = e.dA[k * 3 + 1] * scale; dense[m * 3 + 2] = e.dA[k * 3 + 2] * scale * (/blink/i.test(name) ? lid : 1); }
    const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const m = toMaster[i]; a[i * 3] = dense[m * 3]; a[i * 3 + 1] = dense[m * 3 + 2]; a[i * 3 + 2] = -dense[m * 3 + 1]; }
    targets.push(new THREE.BufferAttribute(a, 3)); }
  geo.morphAttributes.position = targets; geo.morphTargetsRelative = true; body.morphTargetDictionary = Object.fromEntries(names.map((nm, i) => [nm, i])); body.morphTargetInfluences = names.map(() => 0);
  for (const m of [].concat(body.material)) m.needsUpdate = true;
  const mgr = new VRMExpressionManager();
  names.forEach((nm, i) => { const ex = new VRMExpression(nm); ex.addBind(new VRMExpressionMorphTargetBind({ primitives: [body], index: i, weight: 1 })); if (/blink/i.test(nm)) ex.isBinary = false; mgr.registerExpression(ex); });
  vrm.expressionManager = mgr;
  // brows are separate pieces on the kit heads: give each brow vertex the movement of the skin just under it, so brow
  // raises, frowns and every expression that moves the forehead carry the brows along
  const brows = []; vrm.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && /brow/i.test(o.userData.matName || o.name)) { let p = o, inHead = false; while (p) { if (p.name === 'HeadModel') inHead = true; p = p.parent; } if (!inHead) brows.push(o); } });
  followSkin(vrm, body, brows);
  // something dark behind the lips, so an open mouth is not a hole through the head
  const aa = face.expressions.aa, c = [0, 0, 0]; let w = 0;
  for (let k = 0; k < aa.idsA.length; k++) { const d = Math.hypot(aa.dA[k * 3], aa.dA[k * 3 + 1], aa.dA[k * 3 + 2]); if (d > 0.012) { const m = aa.idsA[k]; c[0] += P[m * 3] * d; c[1] += P[m * 3 + 1] * d; c[2] += P[m * 3 + 2] * d; w += d; } }
  const head = vrm.humanoid.getRawBoneNode('head');
  if (w && head) { const inside = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x471820 })); inside.name = 'MouthInside';
    inside.scale.set(0.021 * scale, 0.017 * scale, 0.016 * scale); vrm.scene.add(inside); vrm.scene.updateMatrixWorld(true);
    inside.position.set(0, c[2] / w + 0.004 * scale, -(c[1] / w) - 0.020 * scale); head.attach(inside); }
  return names;
}

/** Pieces laid on the face (brows, liner) move with the skin under them: each vertex takes the expression movement of the
 *  three nearest skin vertices, as its own morph targets bound to the same expressions. */
export function followSkin(vrm, body, meshes) {
  const geo = body.geometry, targets = geo.morphAttributes.position, mgr = vrm.expressionManager; if (!targets?.length || !mgr || !meshes.length) return;
  const names = Object.keys(body.morphTargetDictionary).sort((a, b) => body.morphTargetDictionary[a] - body.morphTargetDictionary[b]);
  vrm.scene.updateMatrixWorld(true); const bp = geo.attributes.position, n = bp.count, head = vrm.humanoid.getRawBoneNode('head'), hy = head ? head.getWorldPosition(new THREE.Vector3()).y : 0;
  const near = []; for (let i = 0; i < n; i++) if (bp.getY(i) > hy - 0.02) near.push(i);
  for (const b of meshes) { const g = b.geometry, p = g.attributes.position, m = b.matrixWorld, inv = new THREE.Matrix3().setFromMatrix4(m).invert(), v = new THREE.Vector3();
    const pick = []; for (let j = 0; j < p.count; j++) { if (b.userData.rowPairs && j % 2) { pick.push(pick[j - 1]); continue; }      // thin strokes: both edges of a slice move together, so a closing lid never crumples the line
      v.fromBufferAttribute(p, j).applyMatrix4(m);
      if (b.userData.followEdge) { const { ids, sigma } = b.userData.followEdge, ws = ids.map((i) => Math.exp(-((Math.abs(bp.getX(i)) - Math.abs(v.x)) ** 2) / (2 * sigma * sigma))), s = ws.reduce((a, c) => a + c, 0) || 1; pick.push(ids.map((i, q) => [i, ws[q] / s])); continue; }      // a lash line rides on the upper lid edge, blended smoothly along it
      const best = [[1e9, 0], [1e9, 0], [1e9, 0]];
      for (const i of near) { const d = (bp.getX(i) - v.x) ** 2 + (bp.getY(i) - v.y) ** 2 + (bp.getZ(i) - v.z) ** 2; if (d < best[2][0]) { best[2] = [d, i]; best.sort((a, c) => a[0] - c[0]); } }
      const w = best.map(([d]) => 1 / (Math.sqrt(d) + 1e-4)), s = w[0] + w[1] + w[2]; pick.push(best.map(([, i], k) => [i, w[k] / s])); }
    g.morphAttributes.position = targets.map((t) => { const a = new Float32Array(p.count * 3);
      for (let j = 0; j < p.count; j++) { v.set(0, 0, 0); for (const [i, w] of pick[j]) v.x += t.getX(i) * w, v.y += t.getY(i) * w, v.z += t.getZ(i) * w; v.applyMatrix3(inv); a[j * 3] = v.x; a[j * 3 + 1] = v.y; a[j * 3 + 2] = v.z; }
      return new THREE.BufferAttribute(a, 3); });
    g.morphTargetsRelative = true; b.morphTargetDictionary = { ...body.morphTargetDictionary }; b.morphTargetInfluences = names.map(() => 0);
    for (const mm of [].concat(b.material)) mm.needsUpdate = true;
    names.forEach((nm, i) => mgr.getExpression(nm)?.addBind(new VRMExpressionMorphTargetBind({ primitives: [b], index: i, weight: 1 }))); }
}

/** Plain white eyeballs (human heads) get an iris, a darker rim and a pupil, painted per vertex so no texture is needed. */
export function paintEyes(root, colour = '#4f7396') {
  const iris = new THREE.Color(colour), rim = iris.clone().multiplyScalar(0.45), pupil = new THREE.Color('#120f16'), white = new THREE.Color('#f6f3f1');
  root.traverse((o) => {
    if (!o.isMesh || !/eye/i.test(o.name) || /lash|brow/i.test(o.name) || o.geometry.attributes.uv) return;
    const p = o.geometry.attributes.position, col = new Float32Array(p.count * 3), box = [new THREE.Box3(), new THREE.Box3()], v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) box[p.getX(i) > 0 ? 0 : 1].expandByPoint(v.fromBufferAttribute(p, i));
    const cen = box.map((b) => b.getCenter(new THREE.Vector3())), rad = box.map((b) => b.getSize(new THREE.Vector3()).y / 2);
    for (let i = 0; i < p.count; i++) { const s = p.getX(i) > 0 ? 0 : 1; v.fromBufferAttribute(p, i).sub(cen[s]).normalize(); const a = Math.acos(Math.min(1, v.z));
      const c = a < 0.24 ? pupil : a < 0.55 ? iris : a < 0.63 ? rim : white; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = new THREE.MeshBasicMaterial({ vertexColors: true }); o.userData.eyeRadius = (rad[0] + rad[1]) / 2;
  });
}

/** Hair without bones still moves: every strand vertex is pushed by one damped spring, more the further it hangs from the crown. */
export function addHairSway(vrm, root) {
  const sway = new THREE.Vector3(), vel = new THREE.Vector3(), box = new THREE.Box3(), uni = { uSway: { value: sway }, uTop: { value: 0 }, uLen: { value: 1 } }; let first = true;
  root.traverse((o) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox);
    for (const m of [].concat(o.material)) { const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { prev?.(sh, r); Object.assign(sh.uniforms, uni);
        sh.vertexShader = 'uniform vec3 uSway; uniform float uTop; uniform float uLen;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += uSway * pow(clamp((uTop - position.y) / uLen, 0.0, 1.0), 1.6);'); };
      m.customProgramCacheKey = () => 'kael-hair-sway'; m.needsUpdate = true; } });
  if (box.isEmpty()) return; uni.uTop.value = box.max.y - (box.max.y - box.min.y) * 0.25; uni.uLen.value = Math.max(0.05, (box.max.y - box.min.y) * 0.75);
  const probe = new THREE.Vector3(), last = new THREE.Vector3(), tmp = new THREE.Vector3(), q = new THREE.Quaternion(), prevHook = vrm.__hairSprings; let t = 0;
  vrm.__hairSprings = (dt) => { prevHook?.(dt); if (!(dt > 0)) return; t += dt;
    root.updateWorldMatrix(true, false); probe.set(0, uni.uTop.value - uni.uLen.value, 0).applyMatrix4(root.matrixWorld);       // a point down among the tips
    if (first) { last.copy(probe); first = false; }
    tmp.copy(probe).sub(last).divideScalar(dt); last.copy(probe);
    tmp.applyQuaternion(root.getWorldQuaternion(q).invert()).multiplyScalar(-0.05 / Math.max(0.2, root.getWorldScale(new THREE.Vector3()).x)); if (tmp.length() > 0.06) tmp.setLength(0.06);
    tmp.x += Math.sin(t * 1.3) * 0.0025; tmp.z += Math.sin(t * 0.9 + 1.0) * 0.0018;                                                // a little air
    vel.addScaledVector(tmp.sub(sway), 60 * dt).multiplyScalar(Math.max(0, 1 - 7 * dt)); sway.addScaledVector(vel, dt * 9);
  };
  return { root, top: uni.uTop.value, len: uni.uLen.value };
}

/** Anime heads carry their eyes and lashes as separate pieces: on a blink the upper lash line comes down with the lid and the eyeball hides. */
export function animeBlink(vrm, head) {
  const eyes = [], lashes = []; let h = 0;
  head.traverse((o) => { if (!o.isMesh) return; const n = o.userData.matName || ''; if (/lash/i.test(n)) lashes.push(o); else if (/eyes/i.test(n)) { eyes.push(o); o.geometry.computeBoundingBox(); h = Math.max(h, o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y); } });
  if (!eyes.length) return; const base = lashes.map((l) => l.position.y), prev = vrm.__hairSprings;
  vrm.__hairSprings = (dt) => { prev?.(dt); const em = vrm.expressionManager; if (!em) return;
    const v = (n) => em.getValue(n) || 0, b = Math.max(v('blink'), (Math.max(v('blinkLeft'), v('eyeBlinkLeft')) + Math.max(v('blinkRight'), v('eyeBlinkRight'))) / 2);
    lashes.forEach((l, i) => { l.position.y = base[i] - h * 0.42 * b; }); for (const e of eyes) e.visible = b < 0.8; };
  return { eyes, lashes, h };
}

/** Ink outlines: every piece gets a slightly larger, inside-out copy in a dark tint of its own colour, the classic anime edge. */
export function addOutlines(vrm, { width = 0.0017, skin = '#ecc4ad' } = {}) {
  const made = [], skip = /eyes|lash|brow|mouth|iris|glint|shadow|outline/i, todo = [];
  vrm.scene.traverse((o) => { if (o.isMesh) todo.push(o); });
  for (const o of todo) {
    let p = o, inHead = false; while (p) { if (p.name === 'HeadModel') inHead = true; p = p.parent; } if (inHead) continue;           // a complete head keeps its own look
    const m0 = [].concat(o.material)[0]; if (!m0 || m0.transparent || skip.test(o.name) || skip.test(o.userData.matName || '') || o.userData.noOutline) continue;
    const base = m0.userData.inkBase ? m0.userData.inkBase.clone() : m0.isMToonMaterial || !m0.color ? new THREE.Color(skin) : m0.color.clone(), ink = base.clone().multiplyScalar(0.3).lerp(new THREE.Color('#2a1420'), 0.35);
    const mat = new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide, vertexColors: !!o.geometry.attributes.color && o.geometry.attributes.color.itemSize === 4, alphaTest: m0.alphaTest || 0 });
    const sway = m0.customProgramCacheKey?.() === 'kael-hair-sway' ? m0.onBeforeCompile : null;
    const w = o.userData.outlineWidth ?? width;      // dense layered hair takes a finer line, or its outline shows between the strands
    mat.onBeforeCompile = (sh, r) => { sway?.(sh, r); sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${w.toFixed(5)};`); };
    mat.customProgramCacheKey = () => 'kael-outline' + (sway ? '-sway' : '') + w;
    let e;
    if (o.isSkinnedMesh) { e = new THREE.SkinnedMesh(o.geometry, mat); o.parent.add(e); e.bind(o.skeleton, o.bindMatrix); if (o.morphTargetInfluences) { e.morphTargetInfluences = o.morphTargetInfluences; e.morphTargetDictionary = o.morphTargetDictionary; } }
    else { e = new THREE.Mesh(o.geometry, mat); o.add(e); }
    e.name = 'Outline'; e.frustumCulled = false; e.castShadow = false; e.userData.noOutline = true; made.push(e);
  }
  return made;
}

/** Anime face styling for the kit's anime heads, toward the look of a painted VTuber face: smaller nose, narrower chin,
 *  large painted eyes laid onto the face, a strong upper lash line with a wing, and blush.
 *  Works in the head's own reference frame (kit axes: x left, -y front, z up) and writes the reshaped skin back into P.
 *  Returns a group (glTF axes, same frame as the head's other extras) holding eyes, lashes and blush. */
export function styleFace({ kit, P, headBone, basis, scale, eyeRef, male, eyeColor, hairColor, eyeStyle = {} }) {
  const es = { a: 1, b: 1, tilt: 0, top: 9, lash: 1, wing: 1, lower: 0, tex: 'classic', noseDot: false, ...eyeStyle };
  const ids = kit.partVerts[kit.parts.indexOf('Head')], n = ids.length, R = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) R[k * 3 + c] = basis[c] + (P[ids[k] * 3 + c] - headBone[c]) / scale;
  const front = []; for (let k = 0; k < n; k++) if (R[k * 3 + 1] < basis[1] - 0.015) front.push(k);
  const depthAt = (x, z) => { const best = Array.from({ length: 8 }, () => [1e9, 0]);      // the outer skin only: points well behind the nearest front-most one (eye-socket lining) are ignored
    for (const k of front) { const d = (R[k * 3] - x) ** 2 + (R[k * 3 + 2] - z) ** 2; if (d < best[7][0]) { best[7] = [d, R[k * 3 + 1]]; best.sort((p, q) => p[0] - q[0]); } }
    const lim = Math.min(...best.map((b) => b[1])) + 0.003;
    let w = 0, y = 0; for (const [d, v] of best) { if (v > lim) continue; const g = 1 / (d + 1e-7); w += g; y += v * g; } return y / w; };
  const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const ex = eyeRef[0] + 0.001, ez = eyeRef[2] - (male ? 0.002 : 0.005), a = (male ? 0.0155 : 0.019) * es.a, b = (male ? 0.0165 : 0.023) * es.b;
  // the eye opening: an ellipse, sheared so the outer corner rises (tilt > 0) or falls, with the top flattened into a lid line for sleepy eyes
  const TOP = es.top * b, flat = (zr) => zr > TOP ? TOP + (zr - TOP) * 0.12 : zr, unflat = (zr) => zr > TOP ? TOP + (zr - TOP) / 0.12 : zr;
  const pt = (s, t, f) => { const u = a * f * Math.cos(t), zr = flat(b * f * Math.sin(t)) + es.tilt * u; return [s * (ex + u), ez + zr]; };
  const inside = (s, x, z) => { const u = s * x - ex, zr = unflat(z - ez - es.tilt * u); return Math.hypot(u / a, zr / b); };
  // nose: find the tip on the centre line and take most of its height away
  let tip = -1; for (const k of front) if (Math.abs(R[k * 3]) < 0.008 && R[k * 3 + 2] < ez - 0.008 && R[k * 3 + 2] > ez - 0.045 && (tip < 0 || R[k * 3 + 1] < R[tip * 3 + 1])) tip = k;
  let tz = ez - 0.025;
  if (tip >= 0) { tz = R[tip * 3 + 2]; const prot = (depthAt(0.024, tz) + depthAt(-0.024, tz)) / 2 - R[tip * 3 + 1], push = Math.max(0, prot) * (male ? 0.45 : 0.72);
    const plane = (depthAt(0.024, tz) + depthAt(-0.024, tz)) / 2 - Math.max(0, prot) * (male ? 0.55 : 0.28), keep = male ? 0.5 : es.noseDot ? 0.02 : 0.12;      // nostrils and bridge collapse onto one small soft bump
    for (const k of front) { const gs = Math.exp(-(R[k * 3] ** 2) / (2 * 0.014 ** 2) - ((R[k * 3 + 2] - tz) ** 2) / (2 * 0.015 ** 2)), bump = plane - (plane - R[k * 3 + 1]) * keep;
      R[k * 3 + 1] += (bump + 0.006 * (1 - gs) - R[k * 3 + 1]) * gs * (male ? 0.6 : 0.92); } void push; }
  // jaw: narrower toward the chin, a little fuller at the cheeks
  const zm = tz - 0.02;
  for (let k = 0; k < n; k++) { const y = R[k * 3 + 1], z = R[k * 3 + 2], wy = sm((basis[1] + 0.01 - y) / 0.05);
    R[k * 3] *= 1 - (male ? 0.05 : 0.13) * sm((zm + 0.012 - z) / 0.05) * wy + (male ? 0 : 0.03) * Math.exp(-((z - (tz - 0.002)) ** 2) / (2 * 0.018 ** 2)) * wy; }
  // eyes: a smooth membrane across each eye opening; skin inside it steps back, the painted eye lies on it
  const g = new THREE.Group(); g.name = 'FaceArt'; const GL = (x, y, z) => [x, z, -y];
  const tex = eyeTexture(eyeColor, es.tex), eyeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const ink = new THREE.Color(hairColor || '#3a2a26').multiplyScalar(0.28).lerp(new THREE.Color('#1a1014'), 0.5);
  const lashMat = new THREE.MeshBasicMaterial({ color: ink, side: THREE.DoubleSide }), lowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8a5a55'), side: THREE.DoubleSide });
  const mk = (pos, idx, mat, name, matName, uv) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.name = name; m.userData.matName = matName; m.userData.noOutline = true; m.frustumCulled = false; m.castShadow = false; g.add(m); return m; };
  const sides = [];
  for (const s of [1, -1]) {
    const rim = []; for (let j = 0; j < 20; j++) { const [x, z] = pt(s, j / 20 * Math.PI * 2, 1.1); rim.push([x, z, depthAt(x, z)]); }
    const mem = (x, z) => { let w = 0, y = 0; for (const [rx, rz, ry] of rim) { const q = 1 / (((rx - x) ** 2 + (rz - z) ** 2) ** 1.5 + 1e-9); w += q; y += ry * q; } return y / w; };
    for (const k of front) { const e = inside(s, R[k * 3], R[k * 3 + 2]); if (e < 1.08) R[k * 3 + 1] = Math.max(R[k * 3 + 1], mem(R[k * 3], R[k * 3 + 2]) + 0.004);
      else if (e < 1.6) R[k * 3 + 1] = Math.max(R[k * 3 + 1], mem(R[k * 3], R[k * 3 + 2]) + 0.0008 - 0.0055 * sm((e - 1.08) / 0.52)); }      // the socket edge sits just behind the painted eye, so no skin cuts into it
    // painted eye
    const pos = [], uv = [], idx = [], RG = 6, SG = 28;
    const A0 = male ? 0.0155 : 0.019, B0 = male ? 0.0165 : 0.023, ia = Math.max(a, A0 * 0.92), ib = Math.max(b, B0 * 0.92);      // the iris keeps its size: a smaller or flattened opening covers more of it
    for (let i = 0; i <= RG; i++) for (let j = 0; j < SG; j++) { const rho = i / RG, t = j / SG * Math.PI * 2, [x, z] = pt(s, t, rho);
      pos.push(...GL(x, mem(x, z) - 0.0013 - 0.0012 * (1 - rho * rho), z)); uv.push(0.5 + 0.31 * (x - s * ex) / ia, 0.5 - 0.31 * (z - ez) / ib); }
    for (let i = 0; i < RG; i++) for (let j = 0; j < SG; j++) { const p = i * SG + j, q = i * SG + (j + 1) % SG; idx.push(p, q, q + SG, p, q + SG, p + SG); }
    const eye = mk(pos, idx, eyeMat, 'Eyes_Painted', 'Eyes_painted', uv);
    const lidPos = pos.slice(); for (let i = 2; i < lidPos.length; i += 3) lidPos[i] += 0.0008;      // the eyelid: same opening, just in front of the eye, drawn only above the lash line
    const lid = mk(lidPos, idx.slice(), eyeMat, 'Eyelid', 'Eyelid'); lid.visible = false; lid.userData.base = Float32Array.from(lidPos);
    // upper lash line, thicker toward the outer corner, with a wing
    const lp = [], li = [], N = 26, t0 = 170 * Math.PI / 180, t1 = 6 * Math.PI / 180;
    for (let j = 0; j <= N; j++) { const t = t0 + (t1 - t0) * j / N, out = (Math.cos(t) + 1) / 2, th = ((male ? 0.0013 : 0.002) + (male ? 0.0012 : 0.0026) * out) * es.lash, taper = Math.min(1, j / 3);
      for (const f of [0.95, 0.95 + th * taper / b]) { const [x, z] = pt(s, t, f); lp.push(...GL(x, Math.min(mem(x, z), depthAt(x, z)) - 0.0024, z)); } }
    for (let j = 0; j < N; j++) { const p = j * 2; li.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    if (!male && es.wing > 0) { const w0 = lp.length / 3; for (const [t, f] of [[30, 1.1], [2, 0.97]]) { const [x, z] = pt(s, t * Math.PI / 180, f); lp.push(...GL(x, Math.min(mem(x, z), depthAt(x, z)) - 0.0024, z)); }
      const wu = a * (1 + 0.36 * es.wing), wx = s * (ex + wu), wz = ez + flat(b * 0.5) * (es.tilt < 0 ? 0.2 : 1) + es.tilt * wu * 1.25; lp.push(...GL(wx, depthAt(wx, wz) - 0.002, wz)); li.push(w0, w0 + 1, w0 + 2); }
    const lash = mk(lp, li, lashMat, 'Lashes_Painted', 'Lashes_painted');
    // lower lid line
    const bp = [], bi = [], M = 14, u0 = 222 * Math.PI / 180, u1 = 322 * Math.PI / 180;
    for (let j = 0; j <= M; j++) { const t = u0 + (u1 - u0) * j / M; for (const f of [0.97, 0.97 + 0.0008 / b]) { const [x, z] = pt(s, t, f); bp.push(...GL(x, mem(x, z) - 0.002, z)); } }
    for (let j = 0; j < M; j++) { const p = j * 2; bi.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    if (es.lower) for (const t of [250, 275, 300, 318]) { const r = t * Math.PI / 180, [x, z] = pt(s, r, 0.98), [x2, z2] = pt(s, r, 1.0 + 0.004 * es.lower / b), w = 0.0007, n0 = bp.length / 3;      // small lower lashes
      bp.push(...GL(x - w, mem(x, z) - 0.002, z), ...GL(x + w, mem(x, z) - 0.002, z), ...GL(x2 + s * 0.0012, depthAt(x2, z2) - 0.0018, z2 - 0.0035 * es.lower)); bi.push(n0, n0 + 1, n0 + 2); }
    const low = mk(bp, bi, lowMat, 'LidLine_Lower', 'LowerLine'); sides.push({ s, eye, lid, lash, low });
    if (!male) {                                   // blush
      const cx = s * (ex + 0.011), cz = ez - Math.max(b, 0.02) - 0.013, qp = [], qu = [], qi = [], BR = 3, BS = 16;
      for (let i = 0; i <= BR; i++) for (let j = 0; j < BS; j++) { const rho = i / BR, t = j / BS * Math.PI * 2, x = cx + 0.016 * rho * Math.cos(t), z = cz + 0.0095 * rho * Math.sin(t); qp.push(...GL(x, depthAt(x, z) - 0.0026, z)); qu.push(0.5 + 0.5 * rho * Math.cos(t), 0.5 + 0.5 * rho * Math.sin(t)); }
      for (let i = 0; i < BR; i++) for (let j = 0; j < BS; j++) { const p = i * BS + j, q = i * BS + (j + 1) % BS; qi.push(p, q, q + BS, p, q + BS, p + BS); }
      mk(qp, qi, blushMaterial(), 'Blush', 'Blush', qu).renderOrder = 2;
    }
  }
  if (es.noseDot) {                              // a tiny soft dot for the nose, the usual anime shorthand
    const nz = tz + 0.002, qp = [], qu = [], qi = [], BS = 14; for (let i = 0; i <= 2; i++) for (let j = 0; j < BS; j++) { const rho = i / 2, t = j / BS * Math.PI * 2, x = 0.0026 * rho * Math.cos(t), z = nz + 0.0018 * rho * Math.sin(t); qp.push(...GL(x, depthAt(x, z) - 0.0016, z)); qu.push(0.5 + 0.5 * rho * Math.cos(t), 0.5 + 0.5 * rho * Math.sin(t)); }
    for (let i = 0; i < 2; i++) for (let j = 0; j < BS; j++) { const p = i * BS + j, q = i * BS + (j + 1) % BS; qi.push(p, q, q + BS, p, q + BS, p + BS); }
    mk(qp, qi, blushMaterial('rgba(200,110,110,0.55)'), 'NoseDot', 'Blush', qu).renderOrder = 2; }
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) P[ids[k] * 3 + c] = headBone[c] + (R[k * 3 + c] - basis[c]) * scale;
  // blink: the lash line comes down and turns into a soft downward curve, the lid follows it and covers the eye
  const topZ = ez + Math.min(0.95 * b, TOP) + Math.abs(es.tilt) * a * 0.4, zp = ez - 0.1 * b, was = [-1, -1];
  const blink = (left, right) => sides.forEach((d, i) => { const v = Math.min(1, Math.max(0, d.s > 0 ? left : right)); if (Math.abs(v - was[i]) < 0.004) return; was[i] = v;
    const k = 1 - 1.5 * v; d.lash.scale.y = k; d.lash.position.y = zp * (1 - k); d.lash.position.z = 0.0018 * v; d.low.visible = v < 0.85; d.lid.visible = v > 0.02;
    if (d.lid.visible) { const cut = v > 0.9 ? -1e9 : zp + k * (topZ - zp), base = d.lid.userData.base, p = d.lid.geometry.attributes.position; for (let j = 0; j < p.count; j++) p.setY(j, Math.max(base[j * 3 + 1], cut)); p.needsUpdate = true; } });
  return { group: g, browShift: Math.max(0, ez + Math.min(b, TOP) + Math.max(0, es.tilt) * a + 0.006 - (eyeRef[2] + 0.022)), lids: sides.map((d) => d.lid), blink, sides, topZ, zp };
}
const texCache = new Map();
function eyeTexture(colour = '#4f7396', style = 'classic') {
  const key = colour + style; if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'), base = new THREE.Color(colour), css = (col) => '#' + col.getHexString();
  const dark = base.clone().multiplyScalar(0.22), deep = base.clone().multiplyScalar(0.5), light = base.clone().lerp(new THREE.Color('#ffffff'), 0.5), glow = base.clone().lerp(new THREE.Color('#fff6d8'), 0.72);
  x.fillStyle = '#fbf6f4'; x.fillRect(0, 0, 512, 512);
  let gr = x.createLinearGradient(0, 90, 0, 250); gr.addColorStop(0, 'rgba(70,60,90,0.55)'); gr.addColorStop(1, 'rgba(70,60,90,0)'); x.fillStyle = gr; x.fillRect(0, 0, 512, 512);      // lid shadow on the white
  const iris = () => { x.beginPath(); x.ellipse(256, 266, 118, 142, 0, 0, Math.PI * 2); };
  iris(); gr = x.createLinearGradient(0, 124, 0, 408); gr.addColorStop(0, css(dark)); gr.addColorStop(0.42, css(deep)); gr.addColorStop(0.72, css(base)); gr.addColorStop(1, css(light)); x.fillStyle = gr; x.fill();
  x.save(); iris(); x.clip();
  gr = x.createRadialGradient(256, 372, 8, 256, 360, 120); gr.addColorStop(0, css(glow)); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.globalAlpha = 0.75; x.fillStyle = gr; x.fillRect(0, 0, 512, 512); x.globalAlpha = 1;
  x.fillStyle = css(base.clone().multiplyScalar(0.1)); x.beginPath(); x.ellipse(256, 252, style === 'cat' ? 18 : style === 'sleepy' ? 50 : 44, style === 'cat' ? 92 : 64, 0, 0, Math.PI * 2); x.fill();                                                        // pupil
  gr = x.createLinearGradient(0, 110, 0, 250); gr.addColorStop(0, 'rgba(10,8,20,0.8)'); gr.addColorStop(1, 'rgba(10,8,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 512, 512);            // upper lid shadow
  x.restore();
  x.lineWidth = 11; x.strokeStyle = css(base.clone().multiplyScalar(0.16)); iris(); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.97)';
  if (style === 'sparkle') {                     // idol eyes: four-point star highlights and a ring of small glints
    const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.28 : r; x.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } x.closePath(); x.fill(); };
    star(204, 196, 50); star(318, 330, 26); for (const [px, py, pr] of [[290, 186, 9], [196, 300, 7], [336, 250, 6], [232, 360, 5]]) { x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill(); }
  } else if (style === 'sleepy') { x.beginPath(); x.ellipse(214, 270, 22, 18, -0.4, 0, Math.PI * 2); x.fill(); }
  else if (style === 'cute') { x.beginPath(); x.ellipse(196, 214, 52, 44, -0.35, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(318, 336, 22, 0, Math.PI * 2); x.fill(); x.globalAlpha = 0.8; x.beginPath(); x.arc(286, 182, 11, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }      // one big soft highlight and two small ones
  else if (style === 'droopy') { x.beginPath(); x.ellipse(210, 214, 40, 34, -0.3, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(300, 350, 20, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(320, 316, 8, 0, Math.PI * 2); x.fill(); }
  else { x.beginPath(); x.ellipse(206, 196, 36, 30, -0.4, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(314, 342, 15, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}
function blushMaterial(core = 'rgba(255,120,140,0.62)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, core); gr.addColorStop(1, 'rgba(255,120,140,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** Face shapes for kit heads. Widths are scale factors at the forehead (fw), cheekbones (cw), jaw corners (jw) and chin (chw);
 *  len stretches the face below the mouth, fwd brings the chin forward (m), full rounds the cheeks (m) at height fullU,
 *  mouthUp lifts the mouth toward the nose (m). The eyes, nose and
 *  mouth line stay where they are, so painted eyes, brows and expressions still line up. */
export const FACE_SHAPES = {
  female: [['f_oval', 'Oval', {}], ['f_heart', 'Heart', { fw: 1.04, cw: 1.045, jw: 0.9, chw: 0.72, len: 0.06, fwd: 0.002 }],
    ['f_round', 'Round', { cw: 1.06, jw: 1.07, chw: 1.12, len: -0.12, full: 0.0045 }], ['f_long', 'Long', { fw: 0.97, cw: 0.95, jw: 0.95, chw: 0.92, len: 0.2 }],
    ['f_square', 'Soft square', { jw: 1.1, chw: 1.16, len: -0.03, fwd: 0.001 }], ['f_model', 'Model (defined jaw, rounded chin)', { cw: 0.96, jw: 1.05, chw: 1.0, len: 0.08, fwd: 0.004, jawK: 0.1, full: -0.0015 }]],
  male: [['m_oval', 'Oval', {}], ['m_square', 'Square', { cw: 1.02, jw: 1.13, chw: 1.22, len: 0.03, fwd: 0.003 }],
    ['m_diamond', 'Diamond', { fw: 0.94, cw: 1.08, jw: 0.92, chw: 0.82, len: 0.07, fwd: 0.002 }], ['m_long', 'Long', { fw: 0.98, cw: 0.97, jw: 1.05, chw: 1.1, len: 0.22, fwd: 0.002 }],
    ['m_round', 'Round', { cw: 1.06, jw: 1.07, chw: 1.08, len: -0.1, full: 0.0045 }], ['m_model', 'Model (defined jaw, rounded chin)', { cw: 0.96, jw: 1.05, chw: 1.0, len: 0.08, fwd: 0.004, jawK: 0.1, full: -0.0015 }]],
  cartoon: [['c_classic', 'Classic', {}], ['c_cute', 'Cute (short, round)', { cw: 1.05, jw: 0.98, chw: 1.38, len: -0.29, mouthUp: 0.004, full: 0.003, fullU: 0.25 }], ['c_vline', 'V-line', { cw: 1.02, jw: 0.86, chw: 0.6, len: 0.1, fwd: 0.003 }],
    ['c_round', 'Round (chibi)', { cw: 1.09, jw: 1.1, chw: 1.16, len: -0.22, full: 0.006 }], ['c_heart', 'Heart', { fw: 1.05, cw: 1.06, jw: 0.88, chw: 0.7, len: 0.02 }],
    ['c_mature', 'Mature', { fw: 0.98, cw: 0.96, jw: 1.0, chw: 0.9, len: 0.18, fwd: 0.002 }],
    ['c_model', 'Model (defined jaw, rounded chin)', { cw: 0.96, jw: 1.05, chw: 1.0, len: 0.08, fwd: 0.004, jawK: 0.1, full: -0.0015 }],
    ['c_elegant', 'Elegant (slim, long)', { fw: 0.98, cw: 0.97, jw: 0.88, chw: 0.78, len: 0.15, fwd: 0.002 }],
    ['c_strong', 'Strong (broad, square jaw)', { cw: 1.0, jw: 1.14, chw: 1.16, len: 0.06, fwd: 0.003, jawK: 0.08 }]],
};
export const faceShapeGroup = (kit, headBody) => { const b = kit.bodies[headBody]; return b?.style === 'anime' ? 'cartoon' : b?.base === 'male' ? 'male' : 'female'; };
export const faceShapeOf = (kit, recipe) => { const list = FACE_SHAPES[faceShapeGroup(kit, recipe.parts.Head)]; return (list.find(([k]) => k === recipe.faceShape) || list[0]); };

export function shapeFace({ kit, P, headBone, basis, scale, eyeRef, params }) {
  const K = 1.35, q = params || {};          // presets are written mild; K sets how strongly they show
  const p = { fw: 1, cw: 1, jw: 1, chw: 1, len: 0, fwd: 0, full: 0, fullU: 0.48, mouthUp: 0, jawK: 0 };      // jawK: a jaw corner (width just above the chin's sides) for (const [k, v] of Object.entries(q)) p[k] = ['fw', 'cw', 'jw', 'chw'].includes(k) ? 1 + (v - 1) * K : k === 'fullU' ? v : v * K;
  if (Object.keys(params || {}).length === 0) return null;
  const ids = kit.partVerts[kit.parts.indexOf('Head')], ring = kit.rings.HEAD_NECK_SOCKET, toR = (i, c) => basis[c] + (P[i * 3 + c] - headBone[c]) / scale;
  const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }, ez = eyeRef[2];
  // the neck seam: a tilted plane through the ring (lower at the front), nothing moves on it
  let sy = 0, sz = 0, syy = 0, syz = 0; for (const i of ring) { const y = toR(i, 1), z = toR(i, 2); sy += y; sz += z; syy += y * y; syz += y * z; }
  const nr = ring.length, slope = (nr * syz - sy * sz) / (nr * syy - sy * sy || 1), icpt = (sz - slope * sy) / nr, seam = (y) => icpt + slope * y;
  // chin tip: the point furthest forward-and-down on the face centre line
  let cz = ez - 0.1, best = -1e9; for (const i of ids) { const x = toR(i, 0), y = toR(i, 1), z = toR(i, 2); if (Math.abs(x) < 0.012 && z < ez - 0.03 && -y - z > best) { best = -y - z; cz = z; } }
  const Lf = ez - cz, mz = ez - 0.6 * Lf;
  const U = [-1.0, -0.35, 0.05, 0.42, 0.78, 1.0], S = [p.fw, 1, 1, p.cw, p.jw, p.chw];
  const width = (u) => { if (u <= U[0]) return S[0]; if (u >= U[5]) return S[5]; let k = 0; while (u > U[k + 1]) k++; return S[k] + (S[k + 1] - S[k]) * sm((u - U[k]) / (U[k + 1] - U[k])); };
  let moved = 0;
  for (const i of ids) {
    let x = toR(i, 0), y = toR(i, 1), z = toR(i, 2); const x0 = x, y0 = y, z0 = z;
    const wN = sm((z - seam(y)) / 0.022), wD = sm((basis[1] + 0.03 - y) / 0.05), w = wN * wD, u = (ez - z) / Lf;
    x *= 1 + (width(u) - 1) * w * (u < 0 ? sm((basis[1] - 0.01 - y) / 0.04) : 1);              // forehead only changes at the front, so hair still fits
    if (z < mz && p.len) z = mz + (z - mz) * (1 + p.len * w);
    if (p.jawK) x *= 1 + p.jawK * Math.exp(-(((u - 0.84) / 0.09) ** 2)) * sm((Math.abs(x0) - 0.012) / 0.03) * w;
    if (p.fwd) y -= p.fwd * Math.exp(-(((u - 1) / 0.28) ** 2)) * Math.exp(-((x0 / 0.032) ** 2)) * wN;
    if (p.full) { const g = Math.exp(-(((u - p.fullU) / 0.2) ** 2) - (((Math.abs(x0) - 0.046) / 0.022) ** 2)) * sm((basis[1] - 0.03 - y0) / 0.03) * wN; y -= p.full * g; x += Math.sign(x0) * p.full * 0.8 * g; }
    if (p.mouthUp) { const g = Math.exp(-(((u - 0.62) / 0.16) ** 2)) * Math.exp(-((x0 / 0.04) ** 2)) * wD * wN; z += p.mouthUp * g; }      // mouth closer to the nose
    if (x !== x0 || y !== y0 || z !== z0) moved++;
    P[i * 3] = headBone[0] + (x - basis[0]) * scale; P[i * 3 + 1] = headBone[1] + (y - basis[1]) * scale; P[i * 3 + 2] = headBone[2] + (z - basis[2]) * scale;
  }
  return { moved, chinZ: cz, mouthZ: mz };
}

/** Eye shapes: human female heads move the eyelid skin (MakeHuman eye targets in face_kit.json, strength K);
 *  anime girl heads change the painted eye opening (size, tilt, lid line), lashes and highlights. */
export const EYE_SHAPES = {
  male: [['hm_classic', 'Classic', {}], ['hm_deepset', 'Deep-set (intense)', { k: 1.6 }], ['hm_narrow', 'Narrow (focused)', { k: 1.8 }], ['hm_wide', 'Wide (open, friendly)', { k: 1.8 }], ['hm_downturned', 'Downturned (calm)', { k: 2.4 }]],
  animeMale: [['am_classic', 'Classic', {}],
    ['am_sharp', 'Sharp', { a: 1.04, b: 0.78, tilt: 0.16, lash: 1.2, tex: 'cat' }],
    ['am_calm', 'Calm (gentle)', { a: 1.0, b: 0.9, tilt: -0.18, lash: 0.9, tex: 'droopy' }],
    ['am_bright', 'Bright', { a: 1.06, b: 1.08, tex: 'sparkle' }],
    ['am_tired', 'Tired (half-lidded)', { a: 1.03, b: 1.0, top: 0.32, lash: 1.3, tex: 'sleepy' }]],
  female: [['hf_almond', 'Almond', {}], ['hf_round', 'Round', { k: 2.0 }], ['hf_upturned', 'Upturned', { k: 2.7 }], ['hf_downturned', 'Downturned', { k: 2.7 }], ['hf_hooded', 'Hooded', { k: 1.4 }]],
  anime: [['ag_classic', 'Classic', {}], ['ag_cute', 'Cute (soft highlight, dot nose)', { a: 1.06, b: 1.14, top: 0.72, lash: 1.25, wing: 0.6, lower: 0.5, tex: 'cute', noseDot: true }],
    ['ag_sparkle', 'Sparkly idol', { a: 1.07, b: 1.1, tex: 'sparkle', lash: 1.1 }],
    ['ag_cat', 'Cat (upturned)', { a: 1.06, b: 0.8, tilt: 0.2, wing: 1.25, lash: 1.15, tex: 'cat' }],
    ['ag_droopy', 'Droopy (gentle)', { a: 1.02, b: 0.92, tilt: -0.24, wing: 0.6, lower: 1, lash: 0.85, tex: 'droopy' }],
    ['ag_sleepy', 'Sleepy (half-lidded)', { a: 1.04, b: 1.0, top: 0.3, lash: 1.5, wing: 0.8, tex: 'sleepy' }]],
};
export const eyeShapeGroup = (kit, headBody) => { const b = kit.bodies[headBody]; if (!b) return null; const m = b.base === 'male'; return b.style === 'anime' ? (m ? 'animeMale' : 'anime') : (m ? 'male' : 'female'); };
export const eyeShapeOf = (kit, recipe) => { const g = eyeShapeGroup(kit, recipe.parts.Head); if (!g) return null; const l = EYE_SHAPES[g]; return l.find(([k]) => k === recipe.eyeShape) || l[0]; };
export function humanEyes({ face, kit, P, key, k = 1, scale = 1 }) {
  const e = face?.eyeShapes?.[key]; if (!e) return false;
  if (!e.idsA) { e.idsA = b64(e.ids, Uint16Array); e.dA = b64(e.d, Float32Array); }
  const hp = kit.parts.indexOf('Head');
  for (let j = 0; j < e.idsA.length; j++) { const m = e.idsA[j]; if (kit.partA[m] !== hp) continue; for (let c = 0; c < 3; c++) P[m * 3 + c] += e.dA[j * 3 + c] * k * scale; }
  return true;
}

/** Human heads (MakeHuman kit heads) come with bare skin and eyeballs only. Give them a drawn, stream-readable face in the
 *  same spirit as the anime heads: brows and an upper lash line laid onto the skin (they follow every expression and blink),
 *  lip colour and, for women, blush painted onto the face skin itself (so they stay put when the mouth opens).
 *  Works in glTF world space on the rest pose (x = character's left, y up, z front). Call after addFace. */
export function humanMakeup({ vrm, body, face, toMaster, male = false, hairColor = '#4a2f22', skin = '#ecc4ad' }) {
  const geo = body.geometry, bp = geo.attributes.position, n = bp.count, mgr = vrm.expressionManager; vrm.scene.updateMatrixWorld(true);
  const headB = vrm.humanoid.getRawBoneNode('head'); if (!headB) return [];
  const made = [], V = (x, y, z) => new THREE.Vector3(x, y, z);
  // eyeballs: centre and radius per side from the eye mesh in world space
  const eyes = {}; vrm.scene.traverse((o) => { if (!o.isMesh || o.userData.eyeRadius === undefined) return; const p = o.geometry.attributes.position, box = { L: new THREE.Box3(), R: new THREE.Box3() }, v = V();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); box[v.x > 0 ? 'L' : 'R'].expandByPoint(v); }
    for (const s of ['L', 'R']) if (!box[s].isEmpty()) eyes[s] = { C: box[s].getCenter(V()), R: box[s].getSize(V()).y / 2 }; });
  if (!eyes.L || !eyes.R) return [];
  const R = (eyes.L.R + eyes.R.R) / 2, k = R / 0.0125, eyeY = (eyes.L.C.y + eyes.R.C.y) / 2, midZ = headB.getWorldPosition(V()).z;
  // front skin of the face, binned for quick "how far forward is the skin here" lookups
  const front = []; for (let i = 0; i < n; i++) { const y = bp.getY(i), z = bp.getZ(i); if (y > eyeY - 0.1 * k && y < eyeY + 0.07 * k && z > midZ && Math.abs(bp.getX(i)) < 0.085 * k) front.push(i); }
  // exact skin depth: the front-most skin triangle under (x, y), so a stroke never dips behind a bulge such as the brow ridge
  const inFront = new Uint8Array(n); for (const i of front) inFront[i] = 1;
  const I = geo.index.array, tris = []; for (let t = 0; t < I.length; t += 3) if (inFront[I[t]] && inFront[I[t + 1]] && inFront[I[t + 2]]) tris.push(I[t], I[t + 1], I[t + 2]);
  const depth = (x, y) => { let best = -1e9;
    for (let t = 0; t < tris.length; t += 3) { const a = tris[t], b = tris[t + 1], c = tris[t + 2], ax = bp.getX(a), ay = bp.getY(a), bx = bp.getX(b), by = bp.getY(b), cx = bp.getX(c), cy = bp.getY(c);
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-12) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, w = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, q = 1 - u - w;
      if (u < -1e-4 || w < -1e-4 || q < -1e-4) continue; const z = u * bp.getZ(a) + w * bp.getZ(b) + q * bp.getZ(c); if (z > best) best = z; }
    if (best > -1e8) return best;
    let bd = 1e9; for (const i of front) { const dd = (bp.getX(i) - x) ** 2 + (bp.getY(i) - y) ** 2; if (dd < bd) { bd = dd; best = bp.getZ(i); } } return best; };
  const inv = headB.matrixWorld.clone().invert();
  const strip = (name, rows, mat) => {        // rows: [[bottom, top], ...] world points along the stroke -> a mesh on the head bone
    const pos = [], idx = []; rows.forEach(([a, b], j) => { pos.push(...a.clone().applyMatrix4(inv).toArray(), ...b.clone().applyMatrix4(inv).toArray()); if (j) { const q = (j - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.name = name; m.userData.noOutline = true; m.userData.matName = name; m.frustumCulled = false; m.castShadow = false; headB.add(m); made.push(m); return m; };
  const ink = new THREE.Color(hairColor).multiplyScalar(male ? 0.55 : 0.45).lerp(new THREE.Color('#1c1214'), 0.35);
  const browMat = new THREE.MeshToonMaterial({ color: ink, gradientMap: null, side: THREE.DoubleSide }), lashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a1013'), side: THREE.DoubleSide });
  for (const [S, sg] of [['L', 1], ['R', -1]]) {
    const { C } = eyes[S], ax = Math.abs(C.x);
    // brow: thick rounded head at the inside, arching, thin tail
    const rows = [], N = 30;
    for (let j = 0; j <= N; j++) { const t = j / N, x = sg * (ax - 0.011 * k + 0.034 * k * t);
      const arch = male ? 0.0022 * Math.sin(Math.PI * t) : 0.0048 * Math.sin(Math.PI * Math.min(1, t * 1.2) * 0.85) - 0.0035 * Math.max(0, t - 0.78) / 0.22;
      const y = C.y + (male ? 0.0118 : 0.0128) * k + arch * k, th = ((male ? 0.0042 : 0.0029) * (1 - t) + (male ? 0.0026 : 0.0008) * t) * k * Math.min(1, 0.55 + t * 4);
      rows.push([V(x, y - th / 2, depth(x, y - th / 2) + 0.0006), V(x, y + th / 2, depth(x, y + th / 2) + 0.0006)]); }
    strip(`Makeup_brow${S}`, rows, browMat);
    // upper lash line along the upper lid edge: skin vertices resting on the eyeball, above its middle
    const edge = [], edgeIds = []; for (let i = 0; i < n; i++) { const v = V(bp.getX(i), bp.getY(i), bp.getZ(i)); if (Math.sign(v.x) !== sg || v.z < C.z + 0.25 * R || v.y < C.y - 0.15 * R) continue; const d = v.distanceTo(C); if (Math.abs(d - R) < 0.0022 * k && d < R * 1.25) { edge.push(v); edgeIds.push(i); } }
    { const bins = new Map(); edge.forEach((v, q) => { const key = Math.round(Math.abs(v.x) / (0.0016 * k)); const o = bins.get(key); if (!o || v.y < edge[o].y) bins.set(key, q); });      // the lid edge is the lowest of them at each point along the eye (not the fold above it)
      const keep = [...bins.values()]; const e2 = keep.map((q) => edge[q]), i2 = keep.map((q) => edgeIds[q]); edge.length = 0; edgeIds.length = 0; edge.push(...e2); edgeIds.push(...i2); }
    if (edge.length >= 4) {
      edge.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
      const lr = [], M = 16, x0 = Math.abs(edge[0].x), x1 = Math.abs(edge[edge.length - 1].x);
      const yAt = (ax2) => { let w = 0, y = 0; for (const e of edge) { const g = Math.exp(-((Math.abs(e.x) - ax2) ** 2) / (2 * (0.0025 * k) ** 2)); w += g; y += e.y * g; } return y / w; };
      for (let j = 0; j <= M; j++) { const t = j / M, axj = x0 + (x1 - x0) * t, x = sg * axj, y = yAt(axj), th = ((male ? 0.0007 : 0.0009) + (male ? 0.0005 : 0.0015) * t ** 1.4) * k;
        lr.push([V(x, y - 0.0002, Math.max(depth(x, y - 0.0002), C.z + R * Math.sqrt(Math.max(0, 1 - ((y - C.y) / R) ** 2 - ((x - C.x) / R) ** 2))) + (male ? 0.0011 : 0.0005)), V(x, y + th, depth(x, y + th) + (male ? 0.0012 : 0.0006))]); }
      if (!male) { const last = lr[lr.length - 1][1], x = last.x + sg * 0.0032 * k, y = last.y + 0.0016 * k; lr.push([V(x - sg * 0.0006, y - 0.0004, depth(x, y) + 0.0005), V(x, y, depth(x, y) + 0.0005)]); }      // a small flick at the outer corner
      const ln = strip(`Makeup_liner${S}`, lr, lashMat); ln.userData.rowPairs = true; ln.userData.followEdge = { ids: edgeIds, sigma: 0.0022 * k };
    }
  }
  followSkin(vrm, body, made);
  // painted onto the skin itself: the face's own triangles again, coloured, with a soft or crisp edge carried in vertex alpha
  const overlay = (name, alpha, colour, soft) => {
    const I = geo.index.array, idx = []; for (let t = 0; t < I.length; t += 3) if (alpha[I[t]] > 0.02 || alpha[I[t + 1]] > 0.02 || alpha[I[t + 2]] > 0.02) idx.push(I[t], I[t + 1], I[t + 2]);
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(a, geo.attributes[a]);
    const col = new Float32Array(n * 4); for (let i = 0; i < n; i++) { col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = alpha[i]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx); g.morphAttributes = geo.morphAttributes; g.morphTargetsRelative = geo.morphTargetsRelative;
    const mat = new THREE.MeshToonMaterial({ color: colour, gradientMap: [].concat(body.material)[0].gradientMap || null, vertexColors: true, transparent: soft, alphaTest: soft ? 0 : 0.5, depthWrite: !soft, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const m = new THREE.SkinnedMesh(g, mat); m.name = name; m.frustumCulled = false; m.castShadow = false; m.userData.noOutline = true; m.userData.bakeLift = 0.00025; m.renderOrder = 1;
    body.parent.add(m); m.bind(body.skeleton, body.bindMatrix);
    if (body.morphTargetDictionary) { const names = Object.keys(body.morphTargetDictionary).sort((a, b) => body.morphTargetDictionary[a] - body.morphTargetDictionary[b]); m.morphTargetDictionary = { ...body.morphTargetDictionary }; m.morphTargetInfluences = names.map(() => 0);
      names.forEach((nm, i) => mgr?.getExpression(nm)?.addBind(new VRMExpressionMorphTargetBind({ primitives: [m], index: i, weight: 1 }))); }
    made.push(m); return m; };
  // lips: rolling the lips in moves the lips and nothing else, so those two shapes outline them
  const rl = face?.expressions?.mouthRollLower, ru = face?.expressions?.mouthRollUpper;
  if (rl && ru) { const mag = new Float32Array(face.vertexCount);
    for (const e of [rl, ru]) { let mx = 0; for (let j = 0; j < e.idsA.length; j++) mx = Math.max(mx, Math.hypot(e.dA[j * 3], e.dA[j * 3 + 1], e.dA[j * 3 + 2]));
      for (let j = 0; j < e.idsA.length; j++) mag[e.idsA[j]] = Math.max(mag[e.idsA[j]], Math.hypot(e.dA[j * 3], e.dA[j * 3 + 1], e.dA[j * 3 + 2]) / mx); }
    const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = 0.5 + (mag[toMaster[i]] - 0.42) * 6;
    overlay('Makeup_lips', a, new THREE.Color(skin).lerp(new THREE.Color(male ? '#b07068' : '#c4505c'), male ? 0.22 : 0.58), false); }
  if (!male) {          // blush
    const a = new Float32Array(n); for (const S of ['L', 'R']) { const c = eyes[S].C, cx = c.x + Math.sign(c.x) * 0.006 * k, cy = c.y - 0.03 * k;
      for (const i of front) { const g = Math.exp(-(((bp.getX(i) - cx) / (0.014 * k)) ** 2 + ((bp.getY(i) - cy) / (0.0095 * k)) ** 2) / 2); a[i] = Math.max(a[i], 0.3 * g); } }
    overlay('Makeup_blush', a, new THREE.Color('#ee7f86'), true); }
  return made;
}
