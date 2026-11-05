// Kael Studio realistic humans: one adjustable VRM per gender (MakeHuman CC0 base, built in Blender).
// A recipe picks body type, hair style and colours. Body types are shape keys plus a per-type skeleton;
// the skeleton is applied by patching the VRM's bone positions and bind matrices before three-vrm loads it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export const HUMAN_BASE = '/humans/';
const cache = new Map();
async function getBin(url) { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`missing ${url}`); return r.arrayBuffer(); })); return cache.get(url); }
async function getJSON(url) { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`missing ${url}`); return r.json(); })); return cache.get(url); }

export const SKIN_TONES = { porcelain: ['#f3d6c4', '#d9a891'], light: ['#e9bfa3', '#c98f78'], medium: ['#d39c78', '#a8705a'],
  tan: ['#b97c55', '#8a5638'], brown: ['#8d5a3b', '#62392a'], deep: ['#5e3a28', '#3c2219'] };
export const HAIR_COLORS = { black: '#1b1716', 'dark brown': '#3b2a22', brown: '#6b4630', auburn: '#7d3a24', blonde: '#c9a46a',
  platinum: '#e6dccb', red: '#a5442a', grey: '#9a9a9e', blue: '#3456a8', pink: '#d97aa8' };
export const EYE_COLORS = { brown: '#ffffff', hazel: '#ffe9b0', green: '#c8f0b4', blue: '#b8d6ff', grey: '#dfe4ea' };

export function defaultHuman(gender = 'female') {
  return { kind: 'human', gender, species: 'human', bodyType: 'Balanced', hair: gender === 'female' ? 'Pixie cut' : 'Short crew cut',
    skin: 'light', hairColor: 'dark brown', eyeColor: 'brown', clothing: '#2b2b31', name: gender === 'female' ? 'Human Female' : 'Human Male' };
}
export function humanFiles(gender) { const g = gender === 'male' ? 'Male' : 'Female'; return { vrm: `${HUMAN_BASE}Human_${g}.vrm`, meta: `${HUMAN_BASE}Human_${g}.json`, hair: `${HUMAN_BASE}hair_${gender === 'male' ? 'male' : 'female'}/` }; }
export async function humanMeta(gender) { return getJSON(humanFiles(gender).meta); }

// ------------------------------------------------------------------ GLB patch: move humanoid bones + rewrite inverse bind matrices
function parseGLB(buf) {
  const dv = new DataView(buf); let off = 12; const chunks = [];
  while (off < buf.byteLength) { const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); chunks.push({ type, data: buf.slice(off + 8, off + 8 + len) }); off += 8 + len; }
  const json = JSON.parse(new TextDecoder().decode(chunks.find((c) => c.type === 0x4e4f534a).data));
  const bin = chunks.find((c) => c.type === 0x004e4942)?.data;
  return { json, bin };
}
function buildGLB(json, bin) {
  let js = new TextEncoder().encode(JSON.stringify(json)); const pad = (4 - (js.length % 4)) % 4;
  if (pad) { const t = new Uint8Array(js.length + pad); t.set(js); t.fill(0x20, js.length); js = t; }
  const total = 12 + 8 + js.length + 8 + bin.byteLength; const out = new ArrayBuffer(total); const dv = new DataView(out); const u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(js, 20);
  const o = 20 + js.length; dv.setUint32(o, bin.byteLength, true); dv.setUint32(o + 4, 0x004e4942, true); u8.set(new Uint8Array(bin), o + 8);
  return out;
}
const toGL = (p) => new THREE.Vector3(p[0], p[2], -p[1]);           // Blender (Z up, -Y front) -> glTF/VRM1 (Y up, +Z front)
function nodeLocal(n) {
  const m = new THREE.Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  return m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
}
export function patchSkeleton(buf, bones) {
  const { json, bin } = parseGLB(buf);
  const hb = json.extensions?.VRMC_vrm?.humanoid?.humanBones || {};
  const parent = new Map(); json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const oldW = new Map(), newW = new Map();
  const world = (i, map, getLocal) => { if (map.has(i)) return map.get(i); const p = parent.get(i); const w = (p === undefined ? new THREE.Matrix4() : world(p, map, getLocal).clone()).multiply(getLocal(i)); map.set(i, w); return w; };
  json.nodes.forEach((_, i) => world(i, oldW, (k) => nodeLocal(json.nodes[k])));
  const target = new Map();
  for (const [name, b] of Object.entries(hb)) if (bones[name]) target.set(b.node, toGL(bones[name][0]));
  // top-down: new local translation so the bone lands on its target world position (rotation kept)
  const order = []; const seen = new Set();
  const visit = (i) => { if (seen.has(i)) return; const p = parent.get(i); if (p !== undefined) visit(p); seen.add(i); order.push(i); };
  json.nodes.forEach((_, i) => visit(i));
  for (const i of order) {
    const n = json.nodes[i]; const p = parent.get(i); const pw = p === undefined ? new THREE.Matrix4() : newW.get(p);
    if (target.has(i) && !n.matrix) {
      const local = pw.clone().invert(); const t = target.get(i).clone().applyMatrix4(local);
      n.translation = [t.x, t.y, t.z];
    }
    newW.set(i, pw.clone().multiply(nodeLocal(n)));
  }
  // inverse bind matrices: keep each joint's bind relation to the mesh (new = inv(newWorld) * oldWorld * oldIBM)
  const f32 = new Float32Array(bin);
  for (const skin of json.skins || []) {
    if (skin.inverseBindMatrices === undefined) continue;
    const acc = json.accessors[skin.inverseBindMatrices], bv = json.bufferViews[acc.bufferView];
    const base = ((bv.byteOffset || 0) + (acc.byteOffset || 0)) / 4;
    skin.joints.forEach((j, k) => {
      const ibm = new THREE.Matrix4().fromArray(f32, base + k * 16);
      const m = newW.get(j).clone().invert().multiply(oldW.get(j)).multiply(ibm);
      m.toArray(f32, base + k * 16);
    });
  }
  return buildGLB(json, bin);
}

// ------------------------------------------------------------------ materials
function findMat(vrm, re) { const out = []; vrm.scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (re.test(m.name)) out.push(m); }); return out; }
function setMToon(m, base, shade) {
  if (base && m.color) m.color.set(base);
  if (shade && m.shadeColorFactor) m.shadeColorFactor.set(shade);
  if (m.uniforms?.litFactor && base) m.uniforms.litFactor.value.set(base);
  if (m.uniforms?.shadeColorFactor && shade) m.uniforms.shadeColorFactor.value.set(shade);
}
function shadeOf(hex, k = 0.55) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
export function applyHumanColours(vrm, r) {
  const [skin, skinShade] = SKIN_TONES[r.skin] || SKIN_TONES.light;
  findMat(vrm, /^Skin/).forEach((m) => setMToon(m, skin, skinShade));
  const hc = HAIR_COLORS[r.hairColor] || r.hairColor || HAIR_COLORS['dark brown'];
  findMat(vrm, /^Brows|^Hair/).forEach((m) => setMToon(m, hc, shadeOf(hc)));
  const cl = r.clothing || '#2b2b31';
  findMat(vrm, /^Cloth/).forEach((m) => setMToon(m, cl, shadeOf(cl, 0.5)));
  const ec = EYE_COLORS[r.eyeColor] || '#ffffff';
  findMat(vrm, /^Eyes/).forEach((m) => setMToon(m, ec, shadeOf(ec, 0.85)));
}

// ------------------------------------------------------------------ hair: separate GLB per style, attached to the head
export const HUMAN_TYPES = {
  female: ['Balanced', 'Hourglass', 'Pear', 'Apple', 'Apple/Round', 'Rectangle', 'Inverted triangle', 'Tall', 'Slender', 'Athletic', 'Petite', 'Curvy / Plus', 'Tall / Long torso'],
  male: ['Balanced', 'Ectomorph', 'Slim runner', 'Average', 'Athletic', 'Swimmer', 'Hero', 'Bodybuilder', 'Stocky', 'Endomorph', 'Heavyweight'],
};
export const HUMAN_SPECIES = { human: 'Human', elf: 'Elf', fox: 'Fox', wolf: 'Wolf', cat: 'Cat', tiger: 'Tiger', bear: 'Bear', panda: 'Panda', raccoon: 'Raccoon', bunny: 'Bunny' };
export const ANIMALS = ['fox', 'wolf', 'cat', 'tiger', 'bear', 'panda', 'raccoon', 'bunny'];
export const thumbUrl = (kind, gender, name) => `${HUMAN_BASE}thumbs/${gender}_${kind}_${hairSlug(name)}.png`;
export const FEMALE_HAIR = ['Pixie cut', 'Bob', 'Long waves', 'Braided ponytail', 'Afro curls', 'Messy bun', 'Double buns', 'Bangs & straight', 'Side braid', 'High ponytail'];
export const MALE_HAIR = ['Short crew cut', 'Classic pompadour', 'Messy textured quiff', 'Undercut slick back', 'Buzz cut', 'Long wavy + beard', 'Short spiky', 'Man bun', 'Curly afro', 'Side part comb over'];
export const hairSlug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
async function attachHair(vrm, r, basisHead) {
  if (!r.hair || r.hair === 'None') return null;
  const url = `${humanFiles(r.gender).hair}${hairSlug(r.hair)}.glb`;
  const gltf = await new GLTFLoader().parseAsync((await getBin(url)).slice(0), '');
  const root = gltf.scene; root.name = 'Hair';
  const head = vrm.humanoid.getRawBoneNode('head');
  vrm.scene.updateMatrixWorld(true);
  // hair is authored around the basis head; keep that relation to the head bone for every body type
  const hq = new THREE.Quaternion(); head.getWorldQuaternion(hq);
  head.add(root);
  root.quaternion.copy(hq).invert();
  root.position.copy(toGL(basisHead).negate().applyQuaternion(root.quaternion));
  const hc = HAIR_COLORS[r.hairColor] || r.hairColor || HAIR_COLORS['dark brown'];
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = makeHairMaterial(hc); } });
  setupHairSprings(vrm, root);
  return root;
}
function makeHairMaterial(hex) {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(hex), side: THREE.DoubleSide, gradientMap: toonRamp() });
}
let ramp = null;
function toonRamp() {
  if (ramp) return ramp;
  const d = new Uint8Array([90, 150, 210, 255]); ramp = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); ramp.needsUpdate = true;
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; return ramp;
}
// simple spring chains for hair bones named "chain_<n>_<k>" (k = 0 at the root)
function setupHairSprings(vrm, root) {
  const chains = new Map();
  root.traverse((o) => { const m = /^chain_(\d+)_(\d+)$/.exec(o.name); if (m) { if (!chains.has(m[1])) chains.set(m[1], []); chains.get(m[1])[+m[2]] = o; } });
  const list = [...chains.values()].map((bones) => bones.filter(Boolean).map((b) => ({ b, rest: b.quaternion.clone(), vel: new THREE.Vector2(), ang: new THREE.Vector2() })));
  if (!list.length) return;
  const prev = new THREE.Vector3(); let has = false; const tmp = new THREE.Vector3(); const qx = new THREE.Quaternion(), qz = new THREE.Quaternion();
  const prevQ = new THREE.Quaternion();
  vrm.__hairSprings = (dt) => {
    const head = vrm.humanoid.getRawBoneNode('head'); head.getWorldPosition(tmp);
    const hq = new THREE.Quaternion(); head.getWorldQuaternion(hq);
    if (!has) { prev.copy(tmp); prevQ.copy(hq); has = true; return; }
    const acc = tmp.clone().sub(prev).divideScalar(Math.max(dt, 1e-3)); prev.copy(tmp);
    const local = acc.applyQuaternion(hq.clone().invert());
    const dq = hq.clone().multiply(prevQ.clone().invert()); prevQ.copy(hq);
    const turn = new THREE.Euler().setFromQuaternion(dq);
    for (const ch of list) ch.forEach((s, k) => {
      const force = new THREE.Vector2(-local.z * 0.08 - turn.x * 6, local.x * 0.08 + turn.z * 6).multiplyScalar(1 + k * 0.4);
      s.vel.addScaledVector(force, dt * 60).addScaledVector(s.ang, -dt * 90).multiplyScalar(Math.exp(-dt * 7));
      s.ang.addScaledVector(s.vel, dt); s.ang.clampLength(0, 0.6);
      qx.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.ang.x); qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), s.ang.y);
      s.b.quaternion.copy(s.rest).multiply(qx).multiply(qz);
    });
  };
}

// ------------------------------------------------------------------ public: build a human from its recipe
export async function loadHuman(recipe) {
  const r = { ...defaultHuman(recipe.gender), ...recipe };
  const files = humanFiles(r.gender);
  const [meta, raw] = await Promise.all([getJSON(files.meta), getBin(files.vrm)]);
  const typeIdx = Math.max(0, meta.types.findIndex((t) => t.name === r.bodyType));
  const type = meta.types[typeIdx];
  const buf = typeIdx === 0 ? raw.slice(0) : patchSkeleton(raw.slice(0), type.bones);
  const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(buf, '');
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  vrm.scene.traverse((o) => {                       // start from the basis body; only the chosen body type is applied
    if (!o.isMesh || !o.morphTargetDictionary) return;
    const sp = r.species && r.species !== 'human' ? 'Species_' + r.species[0].toUpperCase() + r.species.slice(1) : null;
    for (const [k, i] of Object.entries(o.morphTargetDictionary)) {
      if (k.startsWith('Body_')) o.morphTargetInfluences[i] = k === type.morph ? 1 : 0;
      if (k.startsWith('Species_')) o.morphTargetInfluences[i] = k === sp ? 1 : 0;
      if (k === 'HideHead' || k === 'Paws') o.morphTargetInfluences[i] = ANIMALS.includes(r.species) ? 1 : 0;
    }
  });
  applyHumanColours(vrm, r);
  const animal = ANIMALS.includes(r.species);
  if (animal) { try { await attachAnimal(vrm, r, meta.types[0].bones); } catch (e) { console.warn('animal', e); } }
  else { try { await attachHair(vrm, r, meta.types[0].bones.head[0]); } catch (e) { console.warn('hair', e); } }
  vrm.userData = { ...vrm.userData, human: r };
  return vrm;
}

// ------------------------------------------------------------------ animal species: head (with its own face shapes), eyes, tail
function attachToBone(vrm, boneName, obj, basisPos) {
  const bone = vrm.humanoid.getRawBoneNode(boneName);
  vrm.scene.updateMatrixWorld(true);
  const q = new THREE.Quaternion(); bone.getWorldQuaternion(q);
  bone.add(obj); obj.quaternion.copy(q).invert();
  obj.position.copy(toGL(basisPos).negate().applyQuaternion(obj.quaternion));
}
function vcolMaterial() { return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }); }
async function attachAnimal(vrm, r, basisBones) {
  const url = `${HUMAN_BASE}animals/${r.gender === 'male' ? 'male' : 'female'}_${r.species}.glb`;
  const gltf = await new GLTFLoader().parseAsync((await getBin(url)).slice(0), '');
  const root = gltf.scene, parts = {};
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = vcolMaterial(); if (o.morphTargetInfluences) o.material.morphTargets = true; } if (o.name) parts[o.name] = o; });
  // hide the human head parts that the animal head replaces
  vrm.scene.traverse((o) => { if (o.isMesh && /^(Eyes|BrowsLashes|Teeth)/.test(o.name)) o.visible = false; });
  const furHex = { fox: '#e9792f', wolf: '#8e94a2', cat: '#f2f0f4', tiger: '#ef8b2c', bear: '#8a5a3c', panda: '#f4f4f6', raccoon: '#9a9ca6', bunny: '#f1e6dd' }[r.species];
  findMat(vrm, /^Skin/).forEach((m) => setMToon(m, furHex, shadeOf(furHex, 0.62)));
  furPattern(vrm, r.species);
  const headGroup = new THREE.Group(); headGroup.name = 'AnimalHeadRoot';
  const head = parts.AnimalHead, eyeL = parts.AnimalEyeL, eyeR = parts.AnimalEyeR, tail = parts.AnimalTail;
  for (const o of [head, eyeL, eyeR]) if (o) headGroup.add(o);
  attachToBone(vrm, 'head', headGroup, basisBones.head[0]);
  let tailGroup = null;
  if (tail) { tailGroup = new THREE.Group(); tailGroup.add(tail); attachToBone(vrm, 'hips', tailGroup, basisBones.hips[0]); }
  const eyeRest = [eyeL?.quaternion.clone(), eyeR?.quaternion.clone()];
  const dict = head?.morphTargetDictionary || {}, inf = head?.morphTargetInfluences || [];
  const tailRest = tail?.quaternion.clone(); const tailState = { ang: new THREE.Vector2(), vel: new THREE.Vector2(), prev: null };
  vrm.__animalSync = (dt = 1 / 60) => {
    const em = vrm.expressionManager; const g = (n) => { try { return em?.getValue(n) || 0; } catch { return 0; } };
    const set = (k, v) => { if (k in dict) inf[dict[k]] = Math.min(1, Math.max(0, v)); };
    const blink = g('blink'), happy = g('happy'), sad = g('sad'), angry = g('angry'), surpr = g('surprised'), relaxed = g('relaxed');
    set('eyeBlinkLeft', Math.max(g('eyeBlinkLeft'), g('blinkLeft'), blink)); set('eyeBlinkRight', Math.max(g('eyeBlinkRight'), g('blinkRight'), blink));
    set('eyeWideLeft', Math.max(g('eyeWideLeft'), surpr)); set('eyeWideRight', Math.max(g('eyeWideRight'), surpr));
    set('eyeSquintLeft', Math.max(g('eyeSquintLeft'), happy * 0.5)); set('eyeSquintRight', Math.max(g('eyeSquintRight'), happy * 0.5));
    set('jawOpen', Math.max(g('jawOpen'), g('aa'), g('oh') * 0.7, g('ee') * 0.4, g('ih') * 0.3, g('ou') * 0.25, surpr * 0.4));
    set('mouthSmileLeft', Math.max(g('mouthSmileLeft'), happy, relaxed * 0.5)); set('mouthSmileRight', Math.max(g('mouthSmileRight'), happy, relaxed * 0.5));
    set('mouthFrownLeft', Math.max(g('mouthFrownLeft'), sad * 0.7, angry * 0.4)); set('mouthFrownRight', Math.max(g('mouthFrownRight'), sad * 0.7, angry * 0.4));
    set('browDownLeft', Math.max(g('browDownLeft'), angry)); set('browDownRight', Math.max(g('browDownRight'), angry));
    set('browInnerUp', Math.max(g('browInnerUp'), sad * 0.9, surpr * 0.8));
    set('browOuterUpLeft', Math.max(g('browOuterUpLeft'), surpr * 0.8)); set('browOuterUpRight', Math.max(g('browOuterUpRight'), surpr * 0.8));
    set('mouthPucker', Math.max(g('mouthPucker'), g('ou')));
    const yaw = THREE.MathUtils.degToRad(vrm.lookAt?.yaw || 0), pitch = THREE.MathUtils.degToRad(vrm.lookAt?.pitch || 0);
    [eyeL, eyeR].forEach((e, i) => { if (!e) return; e.quaternion.copy(eyeRest[i]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, yaw))); });
    if (tail) {             // tail sways with hip motion
      const hips = vrm.humanoid.getRawBoneNode('hips'); const p = new THREE.Vector3(); hips.getWorldPosition(p);
      if (tailState.prev) { const v = p.clone().sub(tailState.prev).divideScalar(Math.max(dt, 1e-3)); tailState.vel.x += -v.x * 2.5 * dt * 60; tailState.vel.y += v.z * 2.5 * dt * 60; }
      tailState.prev = p; const t = performance.now() / 1000;
      tailState.vel.addScaledVector(tailState.ang, -dt * 40).multiplyScalar(Math.exp(-dt * 4));
      tailState.ang.addScaledVector(tailState.vel, dt).clampLength(0, 0.5);
      tail.quaternion.copy(tailRest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tailState.ang.y, 0, tailState.ang.x + Math.sin(t * 1.3) * 0.06)));
    }
  };
}

// fur markings on the body: dark "gloves and socks", pale belly, from bone weights and position
const FUR = {   // base, belly (or null), limbs (or null)
  fox: ['#e9792f', '#fbf4ea', '#2a2228'], wolf: ['#8e94a2', '#e7e9ef', '#4b4f5a'], cat: ['#f2f0f4', null, null], tiger: ['#ef8b2c', '#fbf4ea', null],
  bear: ['#8a5a3c', null, '#5a3a26'], panda: ['#f4f4f6', null, '#24242a'], raccoon: ['#9a9ca6', '#ecebf0', '#2b2c33'], bunny: ['#f1e6dd', '#ffffff', null] };
function furPattern(vrm, species) {
  const [baseH, bellyH, limbH] = FUR[species] || [];
  if (!baseH) return;
  const base = new THREE.Color(baseH), belly = bellyH && new THREE.Color(bellyH), limb = limbH && new THREE.Color(limbH);
  const H = vrm.humanoid, idx = (n) => { const b = H.getRawBoneNode(n); return b; };
  vrm.scene.traverse((o) => {
    if (!o.isSkinnedMesh || ![].concat(o.material).some((m) => /^Skin/.test(m.name))) return;
    const g = o.geometry, pos = g.attributes.position, sw = g.attributes.skinWeight, si = g.attributes.skinIndex, nrm = g.attributes.normal;
    const bones = o.skeleton.bones.map((b) => b.name);
    const limbBones = new Set(); const upperLimb = new Set();
    o.skeleton.bones.forEach((b, i) => {
      const hn = Object.entries(H.humanBones).find(([, v]) => v?.node === b)?.[0] || '';
      if (/Hand|Thumb|Index|Middle|Ring|Little|Foot|Toes/.test(hn)) limbBones.add(i);
      if (/LowerArm|LowerLeg/.test(hn)) upperLimb.add(i);
      if (species === 'panda' && /UpperArm|Shoulder|UpperLeg/.test(hn)) limbBones.add(i);
    });
    const box = new THREE.Box3().setFromBufferAttribute(pos), h = box.max.y - box.min.y;
    const col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      c.copy(base);
      let wl = 0, wu = 0;
      for (let k = 0; k < 4; k++) { const b = si.getComponent(v, k), w = sw.getComponent(v, k); if (limbBones.has(b)) wl += w; if (upperLimb.has(b)) wu += w; }
      if (belly) {                     // front of torso and throat
        const y = (pos.getY(v) - box.min.y) / h, front = nrm.getZ(v), x = Math.abs(pos.getX(v));
        const t = THREE.MathUtils.smoothstep(front, 0.25, 0.7) * THREE.MathUtils.smoothstep(y, 0.5, 0.58) * (1 - THREE.MathUtils.smoothstep(y, 0.84, 0.9)) * (1 - THREE.MathUtils.smoothstep(x, 0.07, 0.12)) * (1 - wl - wu);
        c.lerp(belly, Math.max(0, t));
      }
      if (limb) c.lerp(limb, Math.min(1, wl + wu * 0.6));
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = [].concat(o.material).map((m) => (/^Skin/.test(m.name) ? Object.assign(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }), { name: 'SkinFur' }) : m));
    if (o.material.length === 1) o.material = o.material[0];
  });
}
