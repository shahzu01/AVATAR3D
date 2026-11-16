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
    for (let k = 0; k < e.idsA.length; k++) { const m = e.idsA[k]; dense[m * 3] = e.dA[k * 3] * scale; dense[m * 3 + 1] = e.dA[k * 3 + 1] * scale; dense[m * 3 + 2] = e.dA[k * 3 + 2] * scale * (/blink/.test(name) ? lid : 1); }
    const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const m = toMaster[i]; a[i * 3] = dense[m * 3]; a[i * 3 + 1] = dense[m * 3 + 2]; a[i * 3 + 2] = -dense[m * 3 + 1]; }
    targets.push(new THREE.BufferAttribute(a, 3)); }
  geo.morphAttributes.position = targets; geo.morphTargetsRelative = true; body.morphTargetDictionary = Object.fromEntries(names.map((nm, i) => [nm, i])); body.morphTargetInfluences = names.map(() => 0);
  for (const m of [].concat(body.material)) m.needsUpdate = true;
  const mgr = new VRMExpressionManager();
  names.forEach((nm, i) => { const ex = new VRMExpression(nm); ex.addBind(new VRMExpressionMorphTargetBind({ primitives: [body], index: i, weight: 1 })); if (/^blink/.test(nm)) ex.isBinary = false; mgr.registerExpression(ex); });
  vrm.expressionManager = mgr;
  // something dark behind the lips, so an open mouth is not a hole through the head
  const aa = face.expressions.aa, c = [0, 0, 0]; let w = 0;
  for (let k = 0; k < aa.idsA.length; k++) { const d = Math.hypot(aa.dA[k * 3], aa.dA[k * 3 + 1], aa.dA[k * 3 + 2]); if (d > 0.012) { const m = aa.idsA[k]; c[0] += P[m * 3] * d; c[1] += P[m * 3 + 1] * d; c[2] += P[m * 3 + 2] * d; w += d; } }
  const head = vrm.humanoid.getRawBoneNode('head');
  if (w && head) { const inside = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x471820 })); inside.name = 'MouthInside';
    inside.scale.set(0.021 * scale, 0.017 * scale, 0.016 * scale); vrm.scene.add(inside); vrm.scene.updateMatrixWorld(true);
    inside.position.set(0, c[2] / w + 0.004 * scale, -(c[1] / w) - 0.020 * scale); head.attach(inside); }
  return names;
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
      const c = a < 0.21 ? pupil : a < 0.46 ? iris : a < 0.53 ? rim : white; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
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
    const b = Math.max(em.getValue('blink') || 0, ((em.getValue('blinkLeft') || 0) + (em.getValue('blinkRight') || 0)) / 2);
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
    const base = m0.isMToonMaterial || !m0.color ? new THREE.Color(skin) : m0.color.clone(), ink = base.clone().multiplyScalar(0.3).lerp(new THREE.Color('#2a1420'), 0.35);
    const mat = new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide, vertexColors: !!o.geometry.attributes.color && o.geometry.attributes.color.itemSize === 4, alphaTest: m0.alphaTest || 0 });
    const sway = m0.customProgramCacheKey?.() === 'kael-hair-sway' ? m0.onBeforeCompile : null;
    mat.onBeforeCompile = (sh, r) => { sway?.(sh, r); sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${width.toFixed(5)};`); };
    mat.customProgramCacheKey = () => 'kael-outline' + (sway ? '-sway' : '') + width;
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
  const es = { a: 1, b: 1, tilt: 0, top: 9, lash: 1, wing: 1, lower: 0, tex: 'classic', ...eyeStyle };
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
    const plane = (depthAt(0.024, tz) + depthAt(-0.024, tz)) / 2 - Math.max(0, prot) * (male ? 0.55 : 0.28), keep = male ? 0.5 : 0.12;      // nostrils and bridge collapse onto one small soft bump
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
  else if (style === 'droopy') { x.beginPath(); x.ellipse(210, 214, 40, 34, -0.3, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(300, 350, 20, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(320, 316, 8, 0, Math.PI * 2); x.fill(); }
  else { x.beginPath(); x.ellipse(206, 196, 36, 30, -0.4, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(314, 342, 15, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}
function blushMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,120,140,0.62)'); gr.addColorStop(1, 'rgba(255,120,140,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** Face shapes for kit heads. Widths are scale factors at the forehead (fw), cheekbones (cw), jaw corners (jw) and chin (chw);
 *  len stretches the face below the mouth, fwd brings the chin forward (m), full rounds the cheeks (m). The eyes, nose and
 *  mouth line stay where they are, so painted eyes, brows and expressions still line up. */
export const FACE_SHAPES = {
  female: [['f_oval', 'Oval', {}], ['f_heart', 'Heart', { fw: 1.04, cw: 1.045, jw: 0.9, chw: 0.72, len: 0.06, fwd: 0.002 }],
    ['f_round', 'Round', { cw: 1.06, jw: 1.07, chw: 1.12, len: -0.12, full: 0.0045 }], ['f_long', 'Long', { fw: 0.97, cw: 0.95, jw: 0.95, chw: 0.92, len: 0.2 }],
    ['f_square', 'Soft square', { jw: 1.1, chw: 1.16, len: -0.03, fwd: 0.001 }]],
  male: [['m_oval', 'Oval', {}], ['m_square', 'Square', { cw: 1.02, jw: 1.13, chw: 1.22, len: 0.03, fwd: 0.003 }],
    ['m_diamond', 'Diamond', { fw: 0.94, cw: 1.08, jw: 0.92, chw: 0.82, len: 0.07, fwd: 0.002 }], ['m_long', 'Long', { fw: 0.98, cw: 0.97, jw: 1.05, chw: 1.1, len: 0.22, fwd: 0.002 }],
    ['m_round', 'Round', { cw: 1.06, jw: 1.07, chw: 1.08, len: -0.1, full: 0.0045 }]],
  cartoon: [['c_classic', 'Classic', {}], ['c_vline', 'V-line', { cw: 1.02, jw: 0.86, chw: 0.6, len: 0.1, fwd: 0.003 }],
    ['c_round', 'Round (chibi)', { cw: 1.09, jw: 1.1, chw: 1.16, len: -0.22, full: 0.006 }], ['c_heart', 'Heart', { fw: 1.05, cw: 1.06, jw: 0.88, chw: 0.7, len: 0.02 }],
    ['c_mature', 'Mature', { fw: 0.98, cw: 0.96, jw: 1.0, chw: 0.9, len: 0.18, fwd: 0.002 }]],
};
export const faceShapeGroup = (kit, headBody) => { const b = kit.bodies[headBody]; return b?.style === 'anime' ? 'cartoon' : b?.base === 'male' ? 'male' : 'female'; };
export const faceShapeOf = (kit, recipe) => { const list = FACE_SHAPES[faceShapeGroup(kit, recipe.parts.Head)]; return (list.find(([k]) => k === recipe.faceShape) || list[0]); };

export function shapeFace({ kit, P, headBone, basis, scale, eyeRef, params }) {
  const K = 1.35, q = params || {};          // presets are written mild; K sets how strongly they show
  const p = { fw: 1, cw: 1, jw: 1, chw: 1, len: 0, fwd: 0, full: 0 }; for (const [k, v] of Object.entries(q)) p[k] = ['fw', 'cw', 'jw', 'chw'].includes(k) ? 1 + (v - 1) * K : v * K;
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
    if (p.fwd) y -= p.fwd * Math.exp(-(((u - 1) / 0.28) ** 2)) * Math.exp(-((x0 / 0.032) ** 2)) * wN;
    if (p.full) { const g = Math.exp(-(((u - 0.48) / 0.2) ** 2) - (((Math.abs(x0) - 0.048) / 0.022) ** 2)) * sm((basis[1] - 0.03 - y0) / 0.03) * wN; y -= p.full * g; x += Math.sign(x0) * p.full * 0.8 * g; }
    if (x !== x0 || y !== y0 || z !== z0) moved++;
    P[i * 3] = headBone[0] + (x - basis[0]) * scale; P[i * 3 + 1] = headBone[1] + (y - basis[1]) * scale; P[i * 3 + 2] = headBone[2] + (z - basis[2]) * scale;
  }
  return { moved, chinZ: cz, mouthZ: mz };
}

/** Eye shapes: human female heads move the eyelid skin (MakeHuman eye targets in face_kit.json, strength K);
 *  anime girl heads change the painted eye opening (size, tilt, lid line), lashes and highlights. */
export const EYE_SHAPES = {
  female: [['hf_almond', 'Almond', {}], ['hf_round', 'Round', { k: 2.0 }], ['hf_upturned', 'Upturned', { k: 2.7 }], ['hf_downturned', 'Downturned', { k: 2.7 }], ['hf_hooded', 'Hooded', { k: 1.4 }]],
  anime: [['ag_classic', 'Classic', {}],
    ['ag_sparkle', 'Sparkly idol', { a: 1.07, b: 1.1, tex: 'sparkle', lash: 1.1 }],
    ['ag_cat', 'Cat (upturned)', { a: 1.06, b: 0.8, tilt: 0.2, wing: 1.25, lash: 1.15, tex: 'cat' }],
    ['ag_droopy', 'Droopy (gentle)', { a: 1.02, b: 0.92, tilt: -0.24, wing: 0.6, lower: 1, lash: 0.85, tex: 'droopy' }],
    ['ag_sleepy', 'Sleepy (half-lidded)', { a: 1.04, b: 1.0, top: 0.3, lash: 1.5, wing: 0.8, tex: 'sleepy' }]],
};
export const eyeShapeGroup = (kit, headBody) => { const b = kit.bodies[headBody]; return !b || b.base !== 'female' ? null : b.style === 'anime' ? 'anime' : 'female'; };
export const eyeShapeOf = (kit, recipe) => { const g = eyeShapeGroup(kit, recipe.parts.Head); if (!g) return null; const l = EYE_SHAPES[g]; return l.find(([k]) => k === recipe.eyeShape) || l[0]; };
export function humanEyes({ face, kit, P, key, k = 1, scale = 1 }) {
  const e = face?.eyeShapes?.[key]; if (!e) return false;
  if (!e.idsA) { e.idsA = b64(e.ids, Uint16Array); e.dA = b64(e.d, Float32Array); }
  const hp = kit.parts.indexOf('Head');
  for (let j = 0; j < e.idsA.length; j++) { const m = e.idsA[j]; if (kit.partA[m] !== hp) continue; for (let c = 0; c < 3; c++) P[m * 3 + c] += e.dA[j * 3 + c] * k * scale; }
  return true;
}
