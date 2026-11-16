// Kael Studio · Bake to VRM
// Turns a Part Mixer character (dozens of separately drawn pieces, built live from code) into one standard VRM 1.0 file:
//  - every piece merged into two skinned meshes: "Face" (everything an expression moves) and "Body" (the rest)
//  - flat colours, two-colour bands and the alpha-cut cloth hems packed into one small palette texture, so the
//    whole character draws with a handful of materials instead of ~100
//  - skin hidden under opaque clothing removed (fewer triangles, no skin poking through cloth)
//  - expressions, painted-eye blinks and lash lines baked into morph targets; hair sway turned into VRM spring bones
//  - MToon toon materials with ink outlines, so the file looks right in other VTuber apps too
// The file is built in the browser (three.js GLTFExporter + VRM extensions written here), nothing to install.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadModular } from '/modular.js';

const PRESETS = new Set(['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft', 'blinkRight', 'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'neutral']);
const NO_OUTLINE = /eyes|lash|brow|mouth|iris|glint|shadow|outline/i;
// the bake is long, plain number crunching: hand the page back every ~25 ms so it stays responsive (and a Studio tab keeps tracking)
let lastBreath = 0;
// (a message, not a timer: Chrome slows timers in background tabs to once a second, later once a minute)
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); r(); }; ch.port2.postMessage(0); });
const breathe = async () => { const t = performance.now(); if (t - lastBreath > 25) { await yieldNow(); lastBreath = performance.now(); } };
const HIDDEN_UNDER_CLOTH = 0.012;          // metres a body vertex must sit inside a garment's edge before its skin is dropped

/** Build the character from its recipe and return a VRM 1.0 file (ArrayBuffer) plus before/after numbers. */
export async function bakeVRM(recipe, { name = recipe.name || 'Kael character', textureMax = 2048, onStep = () => {} } = {}) {
  onStep('Building the character');
  const vrm = await loadModular({ ...recipe, outline: false });
  const scene = vrm.scene; scene.updateMatrixWorld(true);
  const before = countScene(scene);
  const bk = vrm.__bake || {};

  // ---------- bones: every bone that skins something, is humanoid, or carries a spring / collider (plus ancestors) ----------
  onStep('Collecting the skeleton');
  const meshes = []; scene.traverse((o) => { if (o.isMesh && o.name !== 'Outline' && o.name !== 'Eyelid') meshes.push(o); });
  const lids = []; scene.traverse((o) => { if (o.isMesh && o.name === 'Eyelid') lids.push(o); });
  const keep = new Set(), addUp = (o) => { for (let p = o; p && p !== scene; p = p.parent) if (p.isBone) keep.add(p); };
  for (const m of meshes) if (m.isSkinnedMesh) { const w = m.geometry.attributes.skinWeight, ix = m.geometry.attributes.skinIndex, used = new Set();
    for (let i = 0; i < w.count; i++) for (let k = 0; k < 4; k++) if (w.getComponent(i, k) > 0) used.add(ix.getComponent(i, k));
    for (const b of used) if (m.skeleton.bones[b]) addUp(m.skeleton.bones[b]); }
  for (const b of Object.values(vrm.humanoid.humanBones)) if (b?.node) addUp(b.node);
  const springs = vrm.springBoneManager ? [...vrm.springBoneManager.joints] : [];
  for (const j of springs) { addUp(j.bone); if (j.child) addUp(j.child); }
  for (const c of vrm.springBoneManager?.colliders || []) addUp(c.parent);
  for (const m of meshes) if (!m.isSkinnedMesh) { let p = m.parent; while (p && !p.isBone) p = p.parent; if (p) addUp(p); }
  // new bones, same world transforms; non-bone groups in between are folded into the child's local transform
  const order = []; scene.traverse((o) => { if (keep.has(o)) order.push(o); });
  const nb = new Map(), used = new Map(), uniq = (n) => { const c = used.get(n) || 0; used.set(n, c + 1); return c ? `${n}_${c}` : n; };
  const root = new THREE.Group(); root.name = 'Armature';
  const inv = new THREE.Matrix4(), loc = new THREE.Matrix4();
  for (const o of order) { const b = new THREE.Bone(); b.name = uniq(o.name || 'bone'); let p = o.parent; while (p && !keep.has(p)) p = p.parent;
    loc.copy(o.matrixWorld); if (p) loc.premultiply(inv.copy(p.matrixWorld).invert()); loc.decompose(b.position, b.quaternion, b.scale);
    (p ? nb.get(p) : root).add(b); nb.set(o, b); }
  const head = vrm.humanoid.getRawBoneNode('head'), hips = vrm.humanoid.getRawBoneNode('hips');
  // hair sway (a shader wobble in the live app) becomes one spring bone per hair piece, hanging from the head
  const hairSprings = [];
  root.updateMatrixWorld(true);
  for (const [k, h] of (bk.hair || []).entries()) {
    const top = h.root.localToWorld(new THREE.Vector3(0, h.top, 0)), tip = h.root.localToWorld(new THREE.Vector3(0, h.top - h.len, 0));
    const hb = nb.get(head), s = new THREE.Bone(), t = new THREE.Bone(); s.name = uniq(`HairSway${k || ''}`); t.name = uniq(`HairSway${k || ''}_end`);
    hb.add(s); s.position.copy(hb.worldToLocal(top.clone())); s.quaternion.copy(hb.getWorldQuaternion(new THREE.Quaternion())).invert(); s.updateMatrixWorld(true);
    s.add(t); t.position.copy(s.worldToLocal(tip.clone())); t.updateMatrixWorld(true);
    hairSprings.push({ root: h.root, top: h.top, len: h.len, bone: s, tail: t, tipWorld: tip });
  }
  root.updateMatrixWorld(true);
  const boneList = []; root.traverse((o) => { if (o.isBone) boneList.push(o); });
  const boneIx = new Map(boneList.map((b, i) => [b, i]));
  const ixOf = (old) => boneIx.get(nb.get(old));

  // ---------- expressions: gather every morph bind, and the painted-face blinks ----------
  onStep('Baking expressions');
  const exprs = [];
  for (const ex of vrm.expressionManager?.expressions || []) {
    const binds = (ex._binds || []).filter((b) => b.primitives && b.index !== undefined);
    exprs.push({ name: ex.expressionName, isBinary: !!ex.isBinary, overrideBlink: ex.overrideBlink || 'none', overrideLookAt: ex.overrideLookAt || 'none', overrideMouth: ex.overrideMouth || 'none', binds });
  }
  const exprIx = new Map(exprs.map((e, i) => [e.name, i])), ensure = (n) => { if (!exprIx.has(n)) { exprIx.set(n, exprs.length); exprs.push({ name: n, isBinary: false, overrideBlink: 'none', overrideLookAt: 'none', overrideMouth: 'none', binds: [] }); } return exprIx.get(n); };
  // extra per-vertex world deltas for meshes the live app animates in code: Map(mesh -> Map(exprIndex -> Float32Array))
  const extra = new Map(), addExtra = (mesh, e, d) => { if (!extra.has(mesh)) extra.set(mesh, new Map()); const m = extra.get(mesh); const prev = m.get(e); if (prev) for (let i = 0; i < d.length; i++) prev[i] += d[i]; else m.set(e, d); };
  const worldPos = (mesh) => { mesh.updateWorldMatrix(true, false); const p = mesh.geometry.attributes.position, out = new Float32Array(p.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; } return out; };
  const blinkDelta = (mesh, a, b) => { const d = new Float32Array(a.length), L = new Float32Array(a.length), R = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) for (let c = 0; c < 3; c++) { d[i + c] = b[i + c] - a[i + c]; (a[i] >= 0 ? L : R)[i + c] = d[i + c]; }
    addExtra(mesh, ensure('blink'), d); addExtra(mesh, ensure('blinkLeft'), L); addExtra(mesh, ensure('blinkRight'), R);
    if (exprIx.has('eyeBlinkLeft')) { addExtra(mesh, exprIx.get('eyeBlinkLeft'), L.slice()); addExtra(mesh, exprIx.get('eyeBlinkRight'), R.slice()); } };      // iPhone blinks close the painted eyes too
  const fa = bk.faceArt;
  if (fa?.sides) for (const d of fa.sides) {
    // lash line: scale and drop are linear in the blink value, so one morph reproduces it exactly
    const a = worldPos(d.lash); d.lash.scale.y = -0.5; d.lash.position.y = fa.zp * 1.5; d.lash.position.z = 0.0018; const b = worldPos(d.lash);
    d.lash.scale.y = 1; d.lash.position.set(0, 0, 0); d.lash.updateMatrixWorld(true); blinkDelta(d.lash, a, b);
    // eyelid: rests folded flat into the lash line, closes over the whole eye
    const base = d.lid.userData.base, p = d.lid.geometry.attributes.position;
    for (let j = 0; j < p.count; j++) p.setXYZ(j, base[j * 3], base[j * 3 + 1], base[j * 3 + 2]); const closed = worldPos(d.lid);
    for (let j = 0; j < p.count; j++) p.setY(j, fa.topZ); p.needsUpdate = true; const open = worldPos(d.lid);
    d.lid.visible = true; meshes.push(d.lid); blinkDelta(d.lid, open, closed);
  }
  const ab = bk.animeBlink;
  if (ab) { for (const l of ab.lashes) { const a = worldPos(l); l.position.y -= ab.h * 0.42; const b = worldPos(l); l.position.y += ab.h * 0.42; l.updateMatrixWorld(true); blinkDelta(l, a, b); }
    for (const e of ab.eyes) { e.geometry.computeBoundingBox(); const a = worldPos(e), p = e.geometry.attributes.position, keepY = Float32Array.from(p.array), line = e.geometry.boundingBox.max.y - ab.h * 0.42;
      for (let j = 0; j < p.count; j++) p.setY(j, line); const b = worldPos(e); p.array.set(keepY); blinkDelta(e, a, b); } }

  // ---------- geometry: every piece into world space, skinned to the new bones ----------
  onStep('Merging pieces');
  const cover = vrm.__coverMax, toMaster = bk.toMaster, bodyMesh = bk.body;
  const pal = new Palette(), groups = new Map();       // material key -> { mat spec, tris: [] }
  const parts = [];
  let trimmed = 0;
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), N3 = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const mesh of meshes) {
    await breathe();
    if (!lids.includes(mesh)) { let vis = true; for (let p = mesh; p; p = p.parent) if (!p.visible) vis = false; if (!vis) continue; }
    const g = mesh.geometry, P = g.attributes.position, nv = P.count; if (!nv) continue;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), lin = new Array(nv);
    if (mesh.isSkinnedMesh) {
      const sk = mesh.skeleton, bi = g.attributes.skinIndex, bw = g.attributes.skinWeight, BM = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]));
      const pre = mesh.bindMatrix, post = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
      for (let i = 0; i < nv; i++) { if ((i & 255) === 0) await breathe(); M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); let tot = 0; const ws = [];
        for (let k = 0; k < 4; k++) { const w = bw.getComponent(i, k); if (w <= 0) continue; const b = bi.getComponent(i, k); const e = BM[b].elements, me = M.elements; for (let q = 0; q < 16; q++) me[q] += e[q] * w; tot += w; const nbI = ixOf(sk.bones[b]); if (nbI !== undefined) ws.push([nbI, w]); }
        if (tot > 0) M.multiplyScalar(1 / tot); else M.identity();
        T.multiplyMatrices(post, M).multiply(pre); lin[i] = new THREE.Matrix3().setFromMatrix4(T);
        v.fromBufferAttribute(P, i).applyMatrix4(T); pos.set([v.x, v.y, v.z], i * 3);
        if (g.attributes.normal) { n.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(N3.getNormalMatrix(T)).normalize(); nrm.set([n.x, n.y, n.z], i * 3); }
        ws.sort((a, b) => b[1] - a[1]); const s = ws.reduce((a, b) => a + b[1], 0) || 1; if (!ws.length) ws.push([ixOf(hips), 1]);
        for (let q = 0; q < Math.min(4, ws.length); q++) { si[i * 4 + q] = ws[q][0]; sw[i * 4 + q] = ws[q][1] / s; }
      }
    } else {
      let p = mesh.parent; while (p && !p.isBone) p = p.parent; const bIx = p ? ixOf(p) : ixOf(hips), L3 = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld);
      N3.getNormalMatrix(mesh.matrixWorld);
      const hs = hairSprings.find((h) => { let q = mesh; while (q && q !== h.root) q = q.parent; return !!q; });
      for (let i = 0; i < nv; i++) { if ((i & 1023) === 0) await breathe(); v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); pos.set([v.x, v.y, v.z], i * 3); lin[i] = L3;
        if (g.attributes.normal) { n.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(N3).normalize(); nrm.set([n.x, n.y, n.z], i * 3); }
        if (hs) { const y = hs.root.worldToLocal(v.clone()).y, w = Math.pow(Math.min(1, Math.max(0, (hs.top - y) / hs.len)), 1.6);
          si[i * 4] = boneIx.get(hs.bone); sw[i * 4] = w; si[i * 4 + 1] = bIx; sw[i * 4 + 1] = 1 - w; }
        else { si[i * 4] = bIx; sw[i * 4] = 1; } }
    }
    if (!g.attributes.normal) { const tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (g.index) tmp.setIndex(g.index); tmp.computeVertexNormals(); nrm.set(tmp.attributes.normal.array); }
    // morph deltas, per expression, in world space
    const morph = new Map();
    if (g.morphAttributes.position?.length) for (const [e, ex] of exprs.entries()) for (const b of ex.binds) { if (!b.primitives.includes(mesh)) continue;
      const A = g.morphAttributes.position[b.index]; if (!A) continue; await breathe(); const d = morph.get(e) || new Float32Array(nv * 3), rel = g.morphTargetsRelative;
      for (let i = 0; i < nv; i++) { v.fromBufferAttribute(A, i); if (!rel) v.sub(new THREE.Vector3().fromBufferAttribute(P, i)); v.multiplyScalar(b.weight ?? 1).applyMatrix3(lin[i]); d[i * 3] += v.x; d[i * 3 + 1] += v.y; d[i * 3 + 2] += v.z; }
      morph.set(e, d); }
    for (const [e, d] of extra.get(mesh) || []) { const m0 = morph.get(e); if (m0) for (let i = 0; i < d.length; i++) m0[i] += d[i]; else morph.set(e, d); }
    const moving = new Uint8Array(nv); for (const d of morph.values()) for (let i = 0; i < nv; i++) if (!moving[i] && (Math.abs(d[i * 3]) > 1e-6 || Math.abs(d[i * 3 + 1]) > 1e-6 || Math.abs(d[i * 3 + 2]) > 1e-6)) moving[i] = 1;
    // triangles, per material group
    const idx = g.index ? g.index.array : Array.from({ length: nv }, (_, i) => i);
    const mats = [].concat(mesh.material), grp = g.groups.length && Array.isArray(mesh.material) ? g.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
    const col = g.attributes.color, uv = g.attributes.uv;
    const part = { pos, nrm, si, sw, morph, moving, uv };
    parts.push(part);
    for (const gr of grp) { const mat = mats[gr.materialIndex] || mats[0]; const spec = classify(mat, mesh, !!col);
      const key = spec.key; if (!groups.has(key)) groups.set(key, { spec, tris: [] }); const G = groups.get(key);
      const base = baseColor(mat), op = mat.transparent ? (mat.opacity ?? 1) : 1;
      for (let t = gr.start; t < gr.start + gr.count; t += 3) { if ((t & 3071) === 0) await breathe(); const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (mesh === bodyMesh && cover && toMaster && cover[toMaster[a]] > HIDDEN_UNDER_CLOTH && cover[toMaster[b]] > HIDDEN_UNDER_CLOTH && cover[toMaster[c]] > HIDDEN_UNDER_CLOTH) { trimmed++; continue; }
        const corners = [a, b, c];
        let uvs;
        if (spec.palette) {
          const rgba = corners.map((i) => { const r = base.clone(); let al = op; if (col && mat.vertexColors) { r.r *= col.getX(i); r.g *= col.getY(i); r.b *= col.getZ(i); if (col.itemSize === 4) al = col.getW(i); } return [r, al]; });
          uvs = pal.place(rgba, spec.alphaRamp);
        } else uvs = corners.map((i) => uv ? [uv.getX(i), uv.getY(i)] : [0, 0]);
        G.tris.push(part, a, b, c, uvs, moving[a] || moving[b] || moving[c]);
      } }
  }

  // ---------- assemble the two meshes ----------
  onStep('Packing the palette');
  const palTex = pal.texture();
  const exprCount = exprs.length;
  const out = { Face: new Builder(exprCount), Body: new Builder(0) };
  const matObjs = new Map();
  for (const [key, G] of groups) { const mat = makeMaterial(G.spec, palTex); matObjs.set(key, mat);
    for (let t = 0; t < G.tris.length; t += 6) { if (t % 6144 === 0) await breathe(); const [part, a, b, c, uvs, mv] = G.tris.slice(t, t + 6); (mv ? out.Face : out.Body).tri(key, part, [a, b, c], uvs, G.spec.palette); } }
  const exported = new THREE.Scene(); exported.name = 'Kael baked'; exported.add(root);
  exported.userData = { kaelPaintedEyes: !!fa, kaelBaked: 1 };
  const skeleton = new THREE.Skeleton(boneList, boneList.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert()));
  const made = {};
  for (const [nm, B] of Object.entries(out)) { if (!B.count()) continue;
    const { geo, mats } = B.build(matObjs, pal.H); const sm = new THREE.SkinnedMesh(geo, mats); sm.name = nm; sm.frustumCulled = false;
    if (nm === 'Face') { sm.morphTargetDictionary = Object.fromEntries(exprs.map((e, i) => [e.name, i])); sm.morphTargetInfluences = exprs.map(() => 0); }
    exported.add(sm); sm.bind(skeleton, new THREE.Matrix4()); made[nm] = sm; }
  const after = countScene(exported);

  // ---------- write glTF, then add the VRM extensions ----------
  onStep('Writing the VRM file');
  const glb = await new GLTFExporter().parseAsync(exported, { binary: true, maxTextureSize: textureMax, onlyVisible: false });
  const { json, bin } = readGLB(glb);
  const nodeIx = new Map(json.nodes.map((nd, i) => [nd.name, i]));
  const nodeOf = (newObj) => nodeIx.get(newObj.name);
  // materials: MToon on the toon ones (the shade texture rode along as the emissive texture)
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon'])];
  for (const md of json.materials || []) { const x = md.extras?.mtoon; if (!x) continue;
    const shadeTex = md.emissiveTexture ? { index: md.emissiveTexture.index } : null; delete md.emissiveTexture; delete md.emissiveFactor;
    md.extensions = { ...(md.extensions || {}), VRMC_materials_mtoon: { specVersion: '1.0', transparentWithZWrite: !!x.zwrite, renderQueueOffsetNumber: 0, shadeColorFactor: x.shade,
      ...(shadeTex ? { shadeMultiplyTexture: shadeTex } : {}), shadingShiftFactor: x.shift ?? -0.05, shadingToonyFactor: x.toony ?? 0.9, giEqualizationFactor: 0.9,
      matcapFactor: [0, 0, 0], parametricRimColorFactor: [0, 0, 0], parametricRimFresnelPowerFactor: 5, parametricRimLiftFactor: 0, rimLightingMixFactor: 1,
      outlineWidthMode: x.outline ? 'worldCoordinates' : 'none', outlineWidthFactor: x.outline ? 0.0017 : 0, outlineColorFactor: [0.13, 0.07, 0.09], outlineLightingMixFactor: 1,
      uvAnimationScrollXSpeedFactor: 0, uvAnimationScrollYSpeedFactor: 0, uvAnimationRotationSpeedFactor: 0 } };
    delete md.extras; }
  // humanoid, expressions, look-at, first person, meta
  const humanBones = {}; for (const [k, b] of Object.entries(vrm.humanoid.humanBones)) if (b?.node && nb.get(b.node)) humanBones[k] = { node: nodeOf(nb.get(b.node)) };
  const preset = {}, custom = {};
  const faceNode = made.Face ? nodeOf(made.Face) : null;
  exprs.forEach((e, i) => { const def = { isBinary: e.isBinary, overrideBlink: e.overrideBlink, overrideLookAt: e.overrideLookAt, overrideMouth: e.overrideMouth, morphTargetBinds: faceNode !== null ? [{ node: faceNode, index: i, weight: 1 }] : [] };
    (PRESETS.has(e.name) ? preset : custom)[e.name] = def; });
  const la = vrm.lookAt;
  const range = (r, d) => ({ inputMaxValue: r?.inputMaxValue ?? 90, outputScale: r?.outputScale ?? d });
  json.extensions = { ...(json.extensions || {}),
    VRMC_vrm: { specVersion: '1.0',
      meta: { name, version: '1', authors: ['Kael Studio'], licenseUrl: 'https://vrm.dev/licenses/1.0/', avatarPermission: 'onlyAuthor', allowExcessivelyViolentUsage: false, allowExcessivelySexualUsage: false,
        commercialUsage: 'personalNonProfit', allowPoliticalOrReligiousUsage: false, allowAntisocialOrHateUsage: false, creditNotation: 'required', allowRedistribution: false, modification: 'prohibited' },
      humanoid: { humanBones },
      firstPerson: { meshAnnotations: Object.values(made).map((m) => ({ node: nodeOf(m), type: 'auto' })) },
      lookAt: { type: 'bone', offsetFromHeadBone: la ? la.offsetFromHeadBone.toArray() : [0, 0.06, 0], rangeMapHorizontalInner: range(la?.applier?.rangeMapHorizontalInner, 10), rangeMapHorizontalOuter: range(la?.applier?.rangeMapHorizontalOuter, 10), rangeMapVerticalDown: range(la?.applier?.rangeMapVerticalDown, 10), rangeMapVerticalUp: range(la?.applier?.rangeMapVerticalUp, 10) },
      expressions: { preset, custom } },
    VRMC_springBone: springJSON({ springs, vrm, nb, nodeOf, hairSprings, head, root }) };
  const file = writeGLB(json, bin);
  const notes = [`${before.meshes} pieces → ${after.meshes} meshes`, `${before.materials} materials → ${after.materials}`, `${fmt(before.tris)} → ${fmt(after.tris)} triangles`];
  if (trimmed) notes.push(`${fmt(trimmed)} hidden skin triangles removed`);
  if (hairSprings.length) notes.push('Hair sway as VRM spring bones');
  return { file, before, after, notes, expressions: exprs.map((e) => e.name), size: file.byteLength };
}

// ---------- helpers ----------
const fmt = (x) => x >= 1000 ? `${(x / 1000).toFixed(x >= 1e4 ? 0 : 1)}k` : `${x}`;
function countScene(s) { let meshes = 0, tris = 0; const mats = new Set();
  s.traverse((o) => { if (!o.isMesh || o.name === 'Outline' || !o.visible) return; meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    const ms = [].concat(o.material); if (Array.isArray(o.material) && g.groups.length) meshes += g.groups.length - 1; for (const m of ms) mats.add(m.uuid); });
  return { meshes, materials: mats.size, tris: Math.round(tris) }; }
const baseColor = (m) => (m.color ? m.color.clone() : new THREE.Color(1, 1, 1));
function texOf(m) { return m.map || m.uniforms?.map?.value || null; }
/** Which merged material a piece goes into. */
function classify(m, mesh, hasColor) {
  const tex = texOf(m), unlit = m.isMeshBasicMaterial, blend = !!m.transparent, outline = !unlit && !blend && !NO_OUTLINE.test(mesh.name) && !NO_OUTLINE.test(mesh.userData.matName || '') && !mesh.userData.noOutline;
  if (tex) { const mt = m.isMToonMaterial || m.type === 'ShaderMaterial' && m.shadeColorFactor;
    return { key: `tex:${tex.uuid}:${unlit ? 'u' : 't'}:${blend ? 'b' : 'o'}`, palette: false, tex, unlit, blend, alphaTest: m.alphaTest || 0, outline: false, mtoon: mt ? m : null }; }
  const alphaRamp = !!(m.alphaTest && hasColor && m.vertexColors && mesh.geometry.attributes.color?.itemSize === 4);
  // all opaque toon pieces share one material (cut-out hems ride in the palette's alpha); see-through ones get their own
  return { key: `pal:${unlit ? 'u' : 't'}:${blend ? 'b' : 'o'}:${outline ? 'line' : 'plain'}`, palette: true, unlit, blend, alphaTest: blend ? 0 : 0.5, outline, alphaRamp };
}
function makeMaterial(spec, palTex) {
  const map = spec.palette ? palTex : spec.tex;
  if (!spec.palette && !spec.blend && spec.tex) spec.tex.userData.mimeType = 'image/jpeg';      // opaque photo-like textures: much smaller as JPEG
  if (spec.unlit) { const m = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, transparent: spec.blend, alphaTest: spec.blend ? 0 : (spec.palette ? 0.5 : spec.alphaTest) }); m.name = spec.palette ? 'Unlit' : 'UnlitTex'; return m; }
  const mt = spec.mtoon;
  const shade = mt ? (mt.shadeMultiplyTexture || null) : map;
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, transparent: spec.blend, alphaTest: spec.blend ? 0 : (spec.palette ? 0.5 : spec.alphaTest), roughness: 1, metalness: 0 });
  if (shade) { m.emissiveMap = shade; m.emissive.set(1, 1, 1); }
  const sc = mt?.shadeColorFactor ? mt.shadeColorFactor.toArray() : [0.74, 0.7, 0.76];
  m.userData.mtoon = { shade: sc, outline: spec.outline, shift: mt?.shadingShiftFactor ?? -0.05, toony: mt?.shadingToonyFactor ?? 0.9, zwrite: !!mt?.transparentWithZWrite };
  m.name = spec.palette ? (spec.outline ? 'Toon' : 'ToonNoLine') + (spec.blend ? 'Blend' : '') : (mt?.name || 'ToonTex');
  if (mt && mt.color) m.color.copy(mt.color);
  return m;
}

/** Flat colours, two-colour bands and alpha-cut hems, packed into one texture. Rows are 16 px tall; a colour is a 16 px cell,
 *  a band or a hem is a 64 px ramp sampled along its length (the hem ramp stores alpha -0.5..1.5, so the 0.5 cut lands exactly where the live app put it). */
class Palette {
  constructor() { this.W = 512; this.rows = []; this.entries = new Map(); this.x = 0; this.y = 0; }
  alloc(w) { if (this.x + w > this.W) { this.x = 0; this.y += 16; } const r = [this.x, this.y]; this.x += w; return r; }
  key(c) { return [c.r, c.g, c.b].map((x) => Math.round(THREE.MathUtils.clamp(x, 0, 1) * 255)).join(','); }
  entry(k, make) { if (!this.entries.has(k)) this.entries.set(k, make()); return this.entries.get(k); }
  place(rgba, hem) {
    const ks = rgba.map(([c]) => this.key(c));
    if (hem) { const e = this.entry(`h:${ks[0]}`, () => ({ type: 'hem', c: rgba[0][0], at: this.alloc(64) }));
      return rgba.map(([, a]) => { const t = (THREE.MathUtils.clamp(a, -0.5, 1.5) + 0.5) / 2; return this.uv(e.at[0] + 0.5 + t * 63, e.at[1] + 8); }); }
    const uniq = [...new Set(ks)];
    const alpha = rgba[0][1];
    if (uniq.length === 1) { const e = this.entry(`c:${ks[0]}:${alpha.toFixed(2)}`, () => ({ type: 'cell', c: rgba[0][0], a: alpha, at: this.alloc(16) })); const u = this.uv(e.at[0] + 8, e.at[1] + 8); return [u, u, u]; }
    const [k0, k1] = uniq.slice(0, 2).sort(), c0 = rgba[ks.indexOf(k0)][0], c1 = rgba[ks.indexOf(k1)][0];
    const e = this.entry(`r:${k0}|${k1}:${alpha.toFixed(2)}`, () => ({ type: 'ramp', c0, c1, a: alpha, at: this.alloc(64) }));
    const near = (k, c) => { if (k === k0) return 0; if (k === k1) return 1; const d0 = dist(c, c0), d1 = dist(c, c1); return d0 <= d1 ? 0 : 1; };
    return rgba.map(([c], i) => this.uv(e.at[0] + 0.5 + near(ks[i], c) * 63, e.at[1] + 8));
  }
  uv(px, py) { return [px / this.W, py]; }       // v resolved once the height is known
  texture() {
    const H = Math.max(16, THREE.MathUtils.ceilPowerOfTwo(this.y + 16)); this.H = H;
    const cv = document.createElement('canvas'); cv.width = this.W; cv.height = H; const cx = cv.getContext('2d'), img = cx.createImageData(this.W, H), D = img.data;
    const put = (x, y, c, a) => { const s = c.clone().convertLinearToSRGB(), o = (y * this.W + x) * 4; D[o] = s.r * 255; D[o + 1] = s.g * 255; D[o + 2] = s.b * 255; D[o + 3] = THREE.MathUtils.clamp(a, 0, 1) * 255; };
    for (const e of this.entries.values()) { const [x0, y0] = e.at;
      for (let y = y0; y < y0 + 16; y++) {
        if (e.type === 'cell') for (let x = x0; x < x0 + 16; x++) put(x, y, e.c, e.a);
        else if (e.type === 'ramp') for (let x = 0; x < 64; x++) put(x0 + x, y, e.c0.clone().lerp(e.c1, x / 63), e.a);
        else for (let x = 0; x < 64; x++) put(x0 + x, y, e.c, -0.5 + 2 * (x + 0.5) / 64); } }
    cx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.name = 'palette';
    t.userData.mimeType = 'image/png'; this.tex = t; return t;
  }
}
const dist = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;

/** Collects welded vertices for one output mesh, one index list per material. */
class Builder {
  constructor(nm) { this.nm = nm; this.v = new Map(); this.pos = []; this.nrm = []; this.uv = []; this.si = []; this.sw = []; this.src = []; this.pal = []; this.idx = new Map(); this.parts = new Map(); }
  count() { let c = 0; for (const l of this.idx.values()) c += l.length; return c; }
  tri(key, part, corners, uvs, isPal) {
    if (!this.parts.has(part)) this.parts.set(part, this.parts.size);
    const pid = this.parts.get(part), list = this.idx.get(key) || []; this.idx.set(key, list);
    corners.forEach((i, k) => { const [u, vv] = uvs[k], id = `${pid}:${i}:${u.toFixed(5)}:${typeof vv === 'number' ? vv.toFixed(5) : vv}`; let o = this.v.get(id);
      if (o === undefined) { o = this.src.length; this.v.set(id, o); this.src.push([part, i]); this.uv.push(u, isPal ? vv / 1e4 : vv); this.pal.push(isPal ? 1 : 0);
        this.pos.push(part.pos[i * 3], part.pos[i * 3 + 1], part.pos[i * 3 + 2]); this.nrm.push(part.nrm[i * 3], part.nrm[i * 3 + 1], part.nrm[i * 3 + 2]);
        for (let q = 0; q < 4; q++) { this.si.push(part.si[i * 4 + q]); this.sw.push(part.sw[i * 4 + q]); } }
      list.push(o); });
  }
  build(matObjs, palH) {
    const n = this.src.length, g = new THREE.BufferGeometry(), uv = new Float32Array(this.uv);
    for (let i = 0; i < n; i++) if (this.pal[i]) uv[i * 2 + 1] = uv[i * 2 + 1] * 1e4 / palH;      // palette rows were placed in pixels; the height is known now
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const all = [], mats = []; for (const [key, list] of this.idx) { g.addGroup(all.length, list.length, mats.length); mats.push(matObjs.get(key)); for (const i of list) all.push(i); }
    g.setIndex(all);
    if (this.nm) { const targets = []; for (let e = 0; e < this.nm; e++) { const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const [part, s] = this.src[i], d = part.morph.get(e); if (d) { a[i * 3] = d[s * 3]; a[i * 3 + 1] = d[s * 3 + 1]; a[i * 3 + 2] = d[s * 3 + 2]; } }
        targets.push(new THREE.BufferAttribute(a, 3)); }
      g.morphAttributes.position = targets; g.morphTargetsRelative = true; }
    return { geo: g, mats };
  }
}

function springJSON({ springs, vrm, nb, nodeOf, hairSprings, head, root }) {
  const colliders = [], groups = [], out = { specVersion: '1.0', colliders, colliderGroups: groups, springs: [] };
  const v = new THREE.Vector3(), s = new THREE.Vector3();
  const colIx = new Map();
  const addCollider = (c) => { if (colIx.has(c)) return colIx.get(c); let p = c.parent; while (p && !nb.get(p)) p = p.parent; if (!p) return -1;
    const node = nb.get(p), sh = c.shape, k = c.getWorldScale(s).x / node.getWorldScale(new THREE.Vector3()).x;
    const off = node.worldToLocal(c.localToWorld(v.copy(sh.offset))).toArray();
    const shape = sh.type === 'capsule' ? { capsule: { offset: off, tail: node.worldToLocal(c.localToWorld(v.copy(sh.tail))).toArray(), radius: sh.radius * k } } : { sphere: { offset: off, radius: sh.radius * k } };
    colliders.push({ node: nodeOf(node), shape }); colIx.set(c, colliders.length - 1); return colliders.length - 1; };
  const grpIx = new Map(), addGroup = (g) => { if (grpIx.has(g)) return grpIx.get(g); const cs = g.colliders.map(addCollider).filter((i) => i >= 0); groups.push({ colliders: cs }); grpIx.set(g, groups.length - 1); return groups.length - 1; };
  // the head model's own spring chains: rebuild each chain from its joints
  const byBone = new Map(springs.map((j) => [j.bone, j])), isChild = new Set(springs.map((j) => j.child).filter(Boolean));
  for (const j0 of springs) { if (isChild.has(j0.bone)) continue; const joints = [], cg = new Set(); let j = j0;
    while (j) { if (!nb.get(j.bone)) break; const st = j.settings; joints.push({ node: nodeOf(nb.get(j.bone)), hitRadius: st.hitRadius, stiffness: st.stiffness, gravityPower: st.gravityPower, gravityDir: st.gravityDir.toArray(), dragForce: st.dragForce });
      for (const g of j.colliderGroups || []) cg.add(addGroup(g));
      if (!j.child) break; const nx = byBone.get(j.child); if (!nx && nb.get(j.child)) joints.push({ node: nodeOf(nb.get(j.child)), hitRadius: st.hitRadius, stiffness: st.stiffness, gravityPower: st.gravityPower, gravityDir: st.gravityDir.toArray(), dragForce: st.dragForce }); j = nx; }
    if (joints.length > 1) out.springs.push({ name: j0.bone.name, joints, colliderGroups: [...cg] }); }
  // kit hair: one swaying segment, kept off the head and chest
  if (hairSprings.length) {
    root.updateMatrixWorld(true);
    const hb = nb.get(head), chestOld = vrm.humanoid.getRawBoneNode('upperChest') || vrm.humanoid.getRawBoneNode('chest'), cb = chestOld && nb.get(chestOld);
    const mk = (bone, offsetWorld, radius) => { const off = bone.worldToLocal(offsetWorld.clone()).toArray(); colliders.push({ node: nodeOf(bone), shape: { sphere: { offset: off, radius } } }); return colliders.length - 1; };
    const hw = hb.getWorldPosition(new THREE.Vector3()), tips = hairSprings.map((h) => h.tipWorld);
    const fit = (c, want) => Math.max(0.02, Math.min(want, ...tips.map((t) => t.distanceTo(c) - 0.04)));
    const hc = hw.clone().add(new THREE.Vector3(0, 0.07, 0)), cs = [mk(hb, hc, fit(hc, 0.1))];
    if (cb) { const cc = cb.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, -0.01)); cs.push(mk(cb, cc, fit(cc, 0.13))); }
    groups.push({ colliders: cs }); const gi = groups.length - 1;
    for (const h of hairSprings) out.springs.push({ name: h.bone.name, colliderGroups: [gi], joints: [
      { node: nodeOf(h.bone), hitRadius: 0.025, stiffness: 1.1, gravityPower: 0.12, gravityDir: [0, -1, 0], dragForce: 0.45 },
      { node: nodeOf(h.tail), hitRadius: 0.025, stiffness: 1.1, gravityPower: 0.12, gravityDir: [0, -1, 0], dragForce: 0.45 }] });
  }
  return out;
}

function readGLB(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const bl = dv.getUint32(20 + jl, true), bin = new Uint8Array(buf, 28 + jl, bl); return { json, bin };
}
function writeGLB(json, bin) {
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - js.length % 4) % 4; if (jp) { const t = new Uint8Array(js.length + jp); t.set(js); t.fill(0x20, js.length); js = t; }
  const bp = (4 - bin.length % 4) % 4, bl = bin.length + bp, total = 12 + 8 + js.length + 8 + bl, out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(js, 20);
  dv.setUint32(20 + js.length, bl, true); dv.setUint32(24 + js.length, 0x004E4942, true); u8.set(bin, 28 + js.length);
  return out;
}
