// Modular characters: stitch one body out of parts taken from different master bodies (blender/modular kit).
// Every master shares one quad topology and one skeleton, so a part is just "these vertices, from that body".
// assemble() mirrors blender/modular/build_parts.py; loadModular() turns the result into a VRM the viewer can track.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { patchSkeleton } from '/human.js';
import { toonGradient } from '/creator/geom.js';
import { buildOutfit, OUTFITS, defaultOutfit, outfitGroup } from '/outfits.js';
import { buildAccessories, ACCESSORIES } from '/accessories.js';
import { loadFaceKit, addFace, paintEyes, addHairSway, animeBlink, addOutlines, styleFace, shapeFace, FACE_SHAPES, faceShapeGroup, faceShapeOf, EYE_SHAPES, eyeShapeGroup, eyeShapeOf, humanEyes } from '/face.js';
export { FACE_SHAPES, faceShapeGroup, faceShapeOf, EYE_SHAPES, eyeShapeGroup, eyeShapeOf };
export { OUTFITS, defaultOutfit, outfitGroup, ACCESSORIES };
/** The accessories a recipe wears: its own list if it has one, otherwise the ones its outfit comes with. */
export const accessoriesOf = (kit, recipe) => Array.isArray(recipe.accessories) ? recipe.accessories : (recipe.outfit === 'none' ? [] : (OUTFITS[recipe.outfit] || OUTFITS[defaultOutfit(kit, recipe.parts.Torso)])?.acc || []);

export const KIT_BASE = '/modular/';
export const PART_ROWS = [['Head', ['Head']], ['Neck', ['Neck']], ['Torso', ['Torso']], ['Arms', ['Arm_L', 'Arm_R']], ['Hands', ['Hand_L', 'Hand_R']], ['Legs', ['Leg_L', 'Leg_R']], ['Feet', ['Foot_L', 'Foot_R']]];
let kitP = null; const bins = new Map();
const dec = (b64, T) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T(u.buffer); };
const getBin = (url) => { if (!bins.has(url)) bins.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${url} is missing`); return r.arrayBuffer(); })); return bins.get(url); };

export function loadKit() {
  kitP ||= fetch(KIT_BASE + 'kit.json').then((r) => { if (!r.ok) throw new Error('The modular kit is missing (public/modular/kit.json).'); return r.json(); }).then((k) => {
    k.quadsA = dec(k.quads, Uint16Array); k.partA = dec(k.partOfVertex, Uint8Array);
    for (const b of Object.values(k.bodies)) b.P = dec(b.positions, Float32Array);
    k.partVerts = k.parts.map(() => []); for (let i = 0; i < k.vertexCount; i++) if (k.partA[i] !== 255) k.partVerts[k.partA[i]].push(i);
    return k;
  }).then(async (k) => { try { const r = await fetch(KIT_BASE + 'heads.json'); k.heads = r.ok ? await r.json() : {}; } catch { k.heads = {}; }
    try { const r = await fetch(KIT_BASE + 'hand_master.json'); k.hand = r.ok ? await r.json() : null; } catch { k.hand = null; } return k; });
  return kitP;
}
export function defaultModular(body = 'anime_female') {
  const parts = {}, fit = {}; for (const [, ps] of PART_ROWS) for (const p of ps) { parts[p] = body; if (p !== 'Torso') fit[p] = 'own'; }
  return { version: 1, kind: 'modular', name: 'Mixed character', parts, fit, headModel: null, hair: 'None', skin: '#ecc4ad', hairColor: '#5c3a29', clothing: '#2b2c36', accent: '#f2efe9', outfit: null };
}

const circ = (R) => { let s = 0; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; s += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); } return s; };
const mean = (R) => { const c = [0, 0, 0]; for (const p of R) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map((x) => x / R.length); };

/** Stitch a body. Returns positions (Blender axes, metres), bone head/tail positions, the head's scale and seam notes. */
export function assemble(kit, recipe, blend = 0.05) {
  const NV = kit.vertexCount, P = new Float32Array(NV * 3), aff = {}, notes = [];
  const get = (A, i) => [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]], set = (i, p) => { P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; };
  const src = (p) => kit.bodies[recipe.parts[p]] ? recipe.parts[p] : 'female';
  const apply = (p, x) => { const { A, c, t } = aff[p]; const d = [x[0] - c[0], x[1] - c[1], x[2] - c[2]];
    return [A[0] * d[0] + A[1] * d[1] + A[2] * d[2] + c[0] + t[0], A[3] * d[0] + A[4] * d[1] + A[5] * d[2] + c[1] + t[1], A[6] * d[0] + A[7] * d[1] + A[8] * d[2] + c[2] + t[2]]; };
  for (const [p, par, sk] of kit.tree) {
    const X = kit.bodies[src(p)].P, ids = kit.partVerts[kit.parts.indexOf(p)], kids = kit.tree.filter((t) => t[1] === p).map((t) => t[2]);
    if (!par) {
      aff[p] = { A: [1, 0, 0, 0, 1, 0, 0, 0, 1], c: [0, 0, 0], t: [0, 0, 0], g: 1 };
      for (const i of ids) set(i, get(X, i));
      for (const k2 of kids) for (const i of kit.rings[k2]) set(i, get(X, i));
      continue;
    }
    const ring = kit.rings[sk], target = ring.map((i) => get(P, i)), own = ring.map((i) => get(X, i));
    const c = mean(own), tc = mean(target), t = [tc[0] - c[0], tc[1] - c[1], tc[2] - c[2]];
    const mode = recipe.fit?.[p] ?? 'own'; let g = mode === 'match' ? circ(target) / circ(own) : typeof mode === 'number' ? mode : 1;
    let A = [g, 0, 0, 0, g, 0, 0, 0, g];
    if (kit.far[p] && g !== 1) {                    // limbs and neck: thickness only, length kept
      const f = mean(kit.rings[kit.far[p]].map((i) => get(X, i))); let ax = [f[0] - c[0], f[1] - c[1], f[2] - c[2]]; const l = Math.hypot(...ax); ax = ax.map((v) => v / l);
      A = []; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) A.push((r === q ? g : 0) + (1 - g) * ax[r] * ax[q]);
    }
    aff[p] = { A, c, t, g };
    const ownT = own.map((x) => apply(p, x)), resid = ownT.map((x, i) => [target[i][0] - x[0], target[i][1] - x[1], target[i][2] - x[2]]);
    const gap = Math.max(...resid.map((r) => Math.hypot(...r)));
    for (const i of ids) {
      const q = apply(p, get(X, i));
      if (gap > 1e-7) {                             // blend what is left of the ring mismatch into the part
        const best = [[1e9, 0], [1e9, 0], [1e9, 0], [1e9, 0]];
        for (let k = 0; k < ownT.length; k++) { const d = Math.hypot(q[0] - ownT[k][0], q[1] - ownT[k][1], q[2] - ownT[k][2]);
          if (d < best[3][0]) { best[3] = [d, k]; best.sort((a, b) => a[0] - b[0]); } }
        let f = 1 - Math.min(best[0][0] / blend, 1); f = f * f * (3 - 2 * f);
        if (f > 0) { let ws = 0; const o = [0, 0, 0];
          for (const [d, k] of best) { const w = 1 / Math.max(d, 1e-6) ** 2; ws += w; o[0] += resid[k][0] * w; o[1] += resid[k][1] * w; o[2] += resid[k][2] * w; }
          q[0] += (o[0] / ws) * f; q[1] += (o[1] / ws) * f; q[2] += (o[2] / ws) * f; }
      }
      set(i, q);
    }
    for (const k2 of kids) for (const i of kit.rings[k2]) set(i, apply(p, get(X, i)));
    if (src(par) !== src(p) || g !== 1) notes.push(`${p}: ${kit.bodies[src(p)].label} onto ${kit.bodies[src(par)].label}, scale ${g.toFixed(2)}, seam blended ${(gap * 1000).toFixed(0)} mm`);
  }
  let dz = Infinity; for (let i = 0; i < NV; i++) dz = Math.min(dz, P[i * 3 + 2]);
  for (let i = 0; i < NV; i++) P[i * 3 + 2] -= dz;
  const bones = {};
  for (const [p, list] of Object.entries(kit.partBones)) for (const b of list) {
    const sb = kit.bodies[src(p)].bones[b]; if (!sb) continue;
    bones[b] = [apply(p, sb[0]), apply(p, sb[1])].map((v) => [v[0], v[1], v[2] - dz]);
  }
  let h = 0; for (let i = 0; i < NV; i++) h = Math.max(h, P[i * 3 + 2]);
  const headXf = (x) => { const v = apply('Head', x); return [v[0], v[1], v[2] - dz]; };
  return { P, bones, headScale: aff.Head.g, headXf, height: h, notes };
}

const toGL = (p) => new THREE.Vector3(p[0], p[2], -p[1]);           // Blender (Z up, -Y front) -> glTF (Y up, +Z front)
function masterNormals(kit, P) {
  const N = new Float32Array(P.length), Q = kit.quadsA, a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f = 0; f < Q.length; f += 4) {
    const i = Q[f], j = Q[f + 1], k = Q[f + 2], l = Q[f + 3];
    a.set(P[k * 3] - P[i * 3], P[k * 3 + 1] - P[i * 3 + 1], P[k * 3 + 2] - P[i * 3 + 2]); b.set(P[l * 3] - P[j * 3], P[l * 3 + 1] - P[j * 3 + 1], P[l * 3 + 2] - P[j * 3 + 2]); n.crossVectors(a, b);
    for (const v of [i, j, k, l]) { N[v * 3] += n.x; N[v * 3 + 1] += n.y; N[v * 3 + 2] += n.z; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
const toon = (opts) => new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...opts });
function attachToHead(vrm, obj, basisHead, scale) {
  const bone = vrm.humanoid.getRawBoneNode('head'); vrm.scene.updateMatrixWorld(true);
  const q = new THREE.Quaternion(); bone.getWorldQuaternion(q);
  bone.add(obj); obj.quaternion.copy(q).invert(); obj.scale.setScalar(scale);
  obj.position.copy(toGL(basisHead).multiplyScalar(-scale).applyQuaternion(obj.quaternion));
}
const HEAD_SCALE = { anime_female: 1.16, anime_male: 1.10 };       // blender/modular/master_dimensions.json
/** Which body's hair set a head uses, and how much to scale it. */
export function hairSource(kit, headBody) {
  const ex = kit.extras[headBody]; if (ex?.hair?.length) return { body: ex.from && !kit.extras[headBody].hair ? ex.from : headBody, scale: 1 };
  const src = kit.bodies[headBody]?.base === 'male' ? 'anime_male' : 'anime_female'; return { body: src, scale: 1 / (HEAD_SCALE[src] || 1) };
}
export const hairChoices = (kit, headBody) => kit.extras[hairSource(kit, headBody).body]?.hair || [];
/** A complete head cut from a finished character (blender/modular/extract_head_part.py): its own face layer,
 *  expressions and hair/ear sway. Its head bone is re-parented under the kit head bone, chin on chin. */
async function attachHeadModel(vrm, def, chinGL, scale) {
  const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
  const hv = (await loader.parseAsync((await getBin(KIT_BASE + def.file)).slice(0), '')).userData.vrm;
  hv.scene.name = 'HeadModel'; vrm.scene.add(hv.scene); vrm.scene.updateMatrixWorld(true);
  const fit = new THREE.Matrix4().makeTranslation(chinGL.x, chinGL.y, chinGL.z).multiply(new THREE.Matrix4().makeScale(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(-def.chin[0], -def.chin[1], -def.chin[2]));
  const move = (obj, parent) => { const m = parent.matrixWorld.clone().invert().multiply(fit).multiply(obj.matrixWorld); parent.add(obj); m.decompose(obj.position, obj.quaternion, obj.scale); };
  const hb = hv.humanoid.getRawBoneNode('head'), inHead = new Set(); hb.traverse((o) => inHead.add(o));
  const nameOf = new Map(); for (const [n, b] of Object.entries(hv.humanoid.humanBones)) if (b?.node) nameOf.set(b.node, n);
  for (const c of hv.springBoneManager?.colliders || []) {              // body colliders follow the kit body instead
    if (inHead.has(c.parent)) continue;
    const target = vrm.humanoid.getRawBoneNode(nameOf.get(c.parent)); if (target) move(c, target);
  }
  move(hb, vrm.humanoid.getRawBoneNode('head')); vrm.scene.updateMatrixWorld(true);
  hv.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  hv.springBoneManager?.setInitState(); hv.springBoneManager?.reset();
  if (hv.expressionManager) vrm.expressionManager = hv.expressionManager;
  if (hv.springBoneManager) { if (vrm.springBoneManager) { for (const j of hv.springBoneManager.joints) vrm.springBoneManager.addJoint(j); vrm.springBoneManager.setInitState(); } else vrm.springBoneManager = hv.springBoneManager; }      // cloth chains may already be there
  if (hv.materials) vrm.materials = [...(vrm.materials || []), ...hv.materials];
  return hv;
}
async function loadStatic(url) { return (await new GLTFLoader().parseAsync((await getBin(url)).slice(0), '')).scene; }

export async function loadModular(input) {
  const kit = await loadKit(), recipe = { ...defaultModular(), ...input, parts: { ...defaultModular().parts, ...(input.parts || {}) }, fit: { ...(input.fit || {}) } };
  const model = kit.heads?.[recipe.headModel] || null;
  if (model?.neckFit && (recipe.fit.Neck ?? 'own') === 'own') recipe.fit.Neck = model.neckFit;      // slim the kit neck so it sits inside the head's own neck and collar
  const { P, bones, headScale, headXf, height, notes } = assemble(kit, recipe);
  // anime heads: reshape the face and paint the eyes (public/face.js). Done here, before normals and clothing are made from P.
  let faceArt = null;
  { const k0 = kit.bodies[recipe.parts.Head] ? recipe.parts.Head : 'female', e0 = kit.extras[k0], src = e0.from || k0;
    if (!model && kit.bodies[src].bones.leftEye) try {          // face shape first, so the anime styling below is laid onto the new shape
      const [, label, params] = faceShapeOf(kit, recipe);
      if (shapeFace({ kit, P, headBone: bones.head[0], basis: kit.bodies[src].bones.head[0], scale: headScale * (e0.scale || 1), eyeRef: kit.bodies[src].bones.leftEye[0], params })) notes.push(`Face shape: ${label}`);
    } catch (e) { console.warn('modular face shape', e); }
    const eyeSh = model ? null : eyeShapeOf(kit, recipe);
    if (eyeSh && kit.bodies[k0].style !== 'anime' && eyeSh[2].k) try {                       // human eyes: move the eyelid skin
      if (humanEyes({ face: await loadFaceKit(KIT_BASE), kit, P, key: eyeSh[0], k: eyeSh[2].k, scale: headScale })) notes.push(`Eye shape: ${eyeSh[1]}`);
    } catch (e) { console.warn('modular eye shape', e); }
    if (!model && kit.bodies[k0].style === 'anime' && recipe.face !== 'classic' && kit.bodies[src].bones.leftEye) try {
      faceArt = styleFace({ kit, P, headBone: bones.head[0], basis: kit.bodies[src].bones.head[0], scale: headScale * (e0.scale || 1), eyeRef: kit.bodies[src].bones.leftEye[0], male: kit.bodies[k0].base === 'male', eyeColor: recipe.eyeColor || (kit.bodies[k0].base === 'male' ? '#2f8f8a' : '#4f7396'), hairColor: recipe.hairColor, eyeStyle: eyeSh && kit.bodies[k0].style === 'anime' ? eyeSh[2] : {} });
      if (eyeSh && kit.bodies[k0].style === 'anime' && Object.keys(eyeSh[2]).length) notes.push(`Eye shape: ${eyeSh[1]}`);
    } catch (e) { console.warn('modular face style', e); } }
  // master hands (blender/modular/hand_master.py): one rebuilt hand, mirrored, welded to each wrist; finger bones move to its joint centres
  const hands = kit.hand && recipe.hands !== 'classic' ? [['left', 1, 'L'], ['right', -1, 'R']].map(([side, sgn, S]) => {
    const ring = kit.rings[`WRIST_${S}_SOCKET`], pv = kit.partVerts[kit.parts.indexOf(`Hand_${S}`)], O = [0, 0, 0];
    for (const i of ring) { O[0] += P[i * 3] / ring.length; O[1] += P[i * 3 + 1] / ring.length; O[2] += P[i * 3 + 2] / ring.length; }
    let len = 0; for (const i of pv) len = Math.max(len, Math.abs(P[i * 3] - O[0]));
    const s = Math.min(1.1, Math.max(0.9, (len / kit.hand.baseLength) * 0.97)), at = (v) => [O[0] + v[0] * sgn * s, O[1] + v[1] * s, O[2] + v[2] * s];
    for (const [n, j] of Object.entries(kit.hand.joints)) if (n !== 'Hand' && !n.endsWith('_tip')) bones[side + n] = [at(j), at(j)];
    return { side, sgn, S, ring, O, s, at };
  }) : null;
  const buf = patchSkeleton((await getBin(KIT_BASE + 'base.vrm')).slice(0), bones);
  const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buf, ''); const vrm = gltf.userData.vrm;
  let body = null; vrm.scene.traverse((o) => { if (o.isSkinnedMesh && !body) body = o; });
  if (!body) throw new Error('The modular base body could not be read.');
  const bake = vrm.__bake = { body, toMaster: null, faceArt, animeBlink: null, hair: [] };      // what the VRM baker (public/bake.js) needs to know
  const geo = body.geometry, pos = geo.attributes.position, F = kit.bodies.female.P;
  // glTF vertex -> master vertex id, matched by rest position (the base file is the female master, no UV seams)
  const key = (x, y, z) => `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`; const lut = new Map();
  for (let i = 0; i < kit.vertexCount; i++) lut.set(key(F[i * 3], F[i * 3 + 2], -F[i * 3 + 1]), i);
  const toMaster = new Int32Array(pos.count), fromMaster = new Int32Array(kit.vertexCount).fill(-1); let miss = 0;
  for (let i = 0; i < pos.count; i++) {
    let m = lut.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
    if (m === undefined) {                          // rounding fell on a cell edge: nearest master vertex
      let bd = 1e9; for (let k = 0; k < kit.vertexCount; k++) { const d = (F[k * 3] - pos.getX(i)) ** 2 + (F[k * 3 + 2] - pos.getY(i)) ** 2 + (-F[k * 3 + 1] - pos.getZ(i)) ** 2; if (d < bd) { bd = d; m = k; } }
      if (bd > 1e-6) miss++;
    }
    toMaster[i] = m; fromMaster[m] = i;
  }
  if (miss) console.warn(`modular: ${miss} base vertices did not match the kit`);
  bake.toMaster = toMaster;
  const N = masterNormals(kit, P), nrm = geo.attributes.normal || new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
  for (let i = 0; i < pos.count; i++) { const m = toMaster[i]; pos.setXYZ(i, P[m * 3], P[m * 3 + 2], -P[m * 3 + 1]); nrm.setXYZ(i, N[m * 3], N[m * 3 + 2], -N[m * 3 + 1]); }
  geo.setAttribute('normal', nrm); pos.needsUpdate = true; nrm.needsUpdate = true; geo.computeBoundingBox(); geo.computeBoundingSphere(); body.frustumCulled = false; body.name = 'Body';
  const fullIndex = Array.from(geo.index.array);
  if (model && geo.index) {                         // a complete head replaces the kit head: drop its faces
    const hi = kit.parts.indexOf('Head'), I = geo.index.array, keep = [];
    for (let t = 0; t < I.length; t += 3) if (kit.partA[toMaster[I[t]]] !== hi && kit.partA[toMaster[I[t + 1]]] !== hi && kit.partA[toMaster[I[t + 2]]] !== hi) keep.push(I[t], I[t + 1], I[t + 2]);
    geo.setIndex(keep);
  }
  if (hands && geo.index) {
    const hp = new Set([kit.parts.indexOf('Hand_L'), kit.parts.indexOf('Hand_R')]), I = geo.index.array, keep = [];
    for (let t = 0; t < I.length; t += 3) if (!hp.has(kit.partA[toMaster[I[t]]]) && !hp.has(kit.partA[toMaster[I[t + 1]]]) && !hp.has(kit.partA[toMaster[I[t + 2]]])) keep.push(I[t], I[t + 1], I[t + 2]);
    geo.setIndex(keep);
    const HD = kit.hand, nv = HD.verts.length / 3, sk = body.skeleton, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    for (const h of hands) {
      const boneIx = HD.bones.map((b) => sk.bones.indexOf(vrm.humanoid.getRawBoneNode(h.side + b)));
      const hp2 = new Float32Array(nv * 3), hi = new Uint16Array(nv * 4), hw = new Float32Array(nv * 4), B = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) { const q = h.at([HD.verts[v * 3], HD.verts[v * 3 + 1], HD.verts[v * 3 + 2]]); B[v * 3] = q[0]; B[v * 3 + 1] = q[1]; B[v * 3 + 2] = q[2];
        HD.weights[v].forEach(([b, w], k) => { hi[v * 4 + k] = Math.max(0, boneIx[b]); hw[v * 4 + k] = w; }); }
      // weld: pair the hand's wrist loop with the body's wrist ring by angle around the arm, take the body vertex's place and weights
      const ang = (y, z) => Math.atan2(z - h.O[2], y - h.O[1]);
      const br = h.ring.map((i) => [ang(P[i * 3 + 1], P[i * 3 + 2]), i]).sort((a, b) => a[0] - b[0]), hl = HD.wristLoop.map((v) => [ang(B[v * 3 + 1], B[v * 3 + 2]), v]).sort((a, b) => a[0] - b[0]);
      let best = 0, bs = 1e9; for (let k = 0; k < br.length; k++) { let e = 0; for (let j = 0; j < hl.length; j++) { const d = br[(j + k) % br.length][0] - hl[j][0]; e += Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); } if (e < bs) { bs = e; best = k; } }
      hl.forEach(([, v], j) => { const m = br[(j + best) % br.length][1], g = fromMaster[m]; B[v * 3] = P[m * 3]; B[v * 3 + 1] = P[m * 3 + 1]; B[v * 3 + 2] = P[m * 3 + 2];
        if (g >= 0) for (let k = 0; k < 4; k++) { hi[v * 4 + k] = si.getComponent(g, k); hw[v * 4 + k] = sw.getComponent(g, k); } });
      for (let v = 0; v < nv; v++) { hp2[v * 3] = B[v * 3]; hp2[v * 3 + 1] = B[v * 3 + 2]; hp2[v * 3 + 2] = -B[v * 3 + 1]; }
      const idx = []; for (let q = 0; q < HD.quads.length; q += 4) { const [a, b, c, d] = h.sgn === 1 ? [HD.quads[q], HD.quads[q + 1], HD.quads[q + 2], HD.quads[q + 3]] : [HD.quads[q + 3], HD.quads[q + 2], HD.quads[q + 1], HD.quads[q]]; idx.push(a, b, c, a, c, d); }
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp2, 3)); hg.setAttribute('skinIndex', new THREE.BufferAttribute(hi, 4)); hg.setAttribute('skinWeight', new THREE.BufferAttribute(hw, 4)); hg.setIndex(idx); hg.computeVertexNormals();
      // outward check: flip if the normals point at the hand's own middle
      { const n = hg.attributes.normal, c = new THREE.Vector3(); for (let v = 0; v < nv; v++) c.add(new THREE.Vector3(hp2[v * 3], hp2[v * 3 + 1], hp2[v * 3 + 2])); c.multiplyScalar(1 / nv); let dot = 0;
        for (let v = 0; v < nv; v++) dot += n.getX(v) * (hp2[v * 3] - c.x) + n.getY(v) * (hp2[v * 3 + 1] - c.y) + n.getZ(v) * (hp2[v * 3 + 2] - c.z);
        if (dot < 0) { for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } hg.setIndex(idx); hg.computeVertexNormals(); } }
      const hm = new THREE.SkinnedMesh(hg, body.material); hm.name = `Hand_${h.S}`; hm.frustumCulled = false; body.parent.add(hm); hm.bind(sk, body.bindMatrix);
    }
  }
  for (const m of [].concat(body.material)) { m.color?.set(recipe.skin); m.shadeColorFactor?.set(new THREE.Color(recipe.skin).multiplyScalar(0.72)); m.name = 'Skin'; }
  // clothing: cut from / built around the stitched body, so it follows swapped and scaled parts (public/outfits.js)
  if (recipe.outfit !== 'none') buildOutfit({ kit, P, bones, body, vrm, toMaster, fromMaster, pos, nrm, recipe, fullIndex });
  // head extras (eyes, lashes, brows, mouth line) and hair belong to the head's body and scale with it
  const hk = kit.bodies[recipe.parts.Head] ? recipe.parts.Head : 'female', ex = kit.extras[hk];
  // a body derived from another one (ex.from) reuses that body's head extras and hair, scaled about the head bone
  const basis = kit.bodies[ex.from || hk].bones.head[0], exScale = headScale * (ex.scale || 1);
  if (model) {
    // chin of the kit head this one replaces: lowest front-centre point of that body's head part
    const X = kit.bodies[hk].P, hi = kit.parts.indexOf('Head'); let ci = -1;
    for (const i of kit.partVerts[hi]) if (Math.abs(X[i * 3]) < 0.012 && X[i * 3 + 1] < kit.bodies[hk].bones.head[0][1] && (ci < 0 || X[i * 3 + 2] < X[ci * 3 + 2])) ci = i;
    const chin = headXf([0, X[ci * 3 + 1], X[ci * 3 + 2]]);
    await attachHeadModel(vrm, model, toGL(chin), headScale * (model.scale || 1));
    notes.push(`Head: ${model.label} (complete head with its own face, hair and ears)`);
  } else try {
    const head = await loadStatic(KIT_BASE + ex.head); head.name = 'HeadExtras';
    head.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const m = o.material; o.userData.matName = m.name || ''; o.material = toon({ color: m.map ? '#ffffff' : m.color, map: m.map || null }); } });
    if (kit.bodies[hk].style !== 'anime') paintEyes(head, recipe.eyeColor || '#4f7396');
    else { if (faceArt) { const old = []; head.traverse((o) => { if (o.isMesh && /Eyes_Anime|Lashes/i.test(o.userData.matName || '')) old.push(o); else if (o.isMesh && /brow/i.test(o.userData.matName || '')) o.position.y += faceArt.browShift; });
        for (const o of old) o.parent.remove(o); head.add(faceArt.group); notes.push('Face: anime styling (painted eyes, lash line, blush)');
        const skinMat = [].concat(body.material)[0]; for (const l of faceArt.lids) l.material = skinMat;
        const prev = vrm.__hairSprings; vrm.__hairSprings = (dt) => { prev?.(dt); const em = vrm.expressionManager; if (!em) return; const bb = em.getValue('blink') || 0; faceArt.blink(Math.max(bb, em.getValue('blinkLeft') || 0), Math.max(bb, em.getValue('blinkRight') || 0)); }; }
      else bake.animeBlink = animeBlink(vrm, head); }
    attachToHead(vrm, head, basis, exScale);
  } catch (e) { console.warn('modular head extras', e); }
  // heads without their own hair set (the human heads) wear the matching anime set, sized back down to a human skull
  const hs = hairSource(kit, hk), hairList = kit.extras[hs.body]?.hair || [];
  const hair = model ? null : hairList.find((h) => h.name === recipe.hair);
  if (hair) try {
    let hairFit = { basis, scale: exScale };
    if (hs.body !== hk) {              // borrowed hair: measure how this head's skull relates to the head the hair was made for (same vertices, so a direct fit)
      const A = kit.bodies[hs.body].P, Hh = kit.bodies[hk].P, hi = kit.parts.indexOf('Head'), zb = kit.bodies[hs.body].bones.head[0][2]; let zt = -1e9; for (const i of kit.partVerts[hi]) zt = Math.max(zt, A[i * 3 + 2]);
      const ids = kit.partVerts[hi].filter((i) => A[i * 3 + 2] > zb + (zt - zb) * 0.55), mA = [0, 0, 0], mH = [0, 0, 0];
      for (const i of ids) for (let k = 0; k < 3; k++) { mA[k] += A[i * 3 + k] / ids.length; mH[k] += Hh[i * 3 + k] / ids.length; }
      let vA = 0, vH = 0; for (const i of ids) for (let k = 0; k < 3; k++) { vA += (A[i * 3 + k] - mA[k]) ** 2; vH += (Hh[i * 3 + k] - mH[k]) ** 2; }
      const sc = Math.sqrt(vH / vA) * 1.035, hb = kit.bodies[hk].bones.head[0];            // a touch of room so the scalp stays covered
      hairFit = { basis: [0, 1, 2].map((k) => mA[k] - (mH[k] - hb[k]) / sc), scale: headScale * sc };
    }
    const root = await loadStatic(KIT_BASE + hair.file); root.name = 'Hair';
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = toon({ color: recipe.hairColor }); } });
    attachToHead(vrm, root, hairFit.basis, hairFit.scale); const sw = addHairSway(vrm, root); if (sw) bake.hair.push(sw);
  } catch (e) { console.warn('modular hair', e); }
  // how far each finger fans away from the middle finger in the rest pose (about the vertical axis), so the viewer can close the hand
  const kitHand = {}, dir = (s, f) => { const a = bones[`${s}${f}Proximal`], b = bones[`${s}${f}Intermediate`]; return a && b ? Math.atan2(-(b[0][1] - a[0][1]), b[0][0] - a[0][0]) : null; };   // angle in glTF x-z
  for (const s of ['left', 'right']) { const mid = dir(s, 'Middle'); if (mid === null) continue;
    for (const f of ['Index', 'Ring', 'Little']) { const d = dir(s, f); if (d !== null) kitHand[`${s}${f}Proximal`] = Math.atan2(Math.sin(d - mid), Math.cos(d - mid)) * 0.92; } }
  try { const acc = buildAccessories({ kit, P, bones, vrm, recipe, list: accessoriesOf(kit, recipe), hasHeadModel: !!model }); if (acc.length) notes.push(`Accessories: ${acc.map((a) => ACCESSORIES[a]).join(', ')}`); } catch (e) { console.warn('modular accessories', e); }
  // blink, mouth shapes and expressions for the kit heads (a complete head such as NekoMika brings its own)
  let faceNames = [];
  if (!model) faceNames = addFace({ face: await loadFaceKit(KIT_BASE), vrm, body, toMaster, P, scale: headScale * (HEAD_SCALE[ex.from || hk] || 1) * (ex.scale || 1), anime: kit.bodies[hk].style === 'anime', eyeZ: bones.leftEye ? bones.leftEye[0][2] : null });
  if (faceNames.length) notes.push(`Face: ${faceNames.length} expressions (blink, mouth shapes, moods)`);
  if (recipe.outline !== false) addOutlines(vrm, { skin: recipe.skin });
  vrm.userData = { ...vrm.userData, modular: recipe, modularNotes: notes, modularHeight: height, kitHand: hands ? 'master' : kitHand, paintedEyes: !!faceArt };
  return vrm;
}
