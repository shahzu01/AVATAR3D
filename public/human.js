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
export const HUMAN_SPECIES = { human: 'Human', elf: 'Elf' };
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
    }
  });
  applyHumanColours(vrm, r);
  try { await attachHair(vrm, r, meta.types[0].bones.head[0]); } catch (e) { console.warn('hair', e); }
  vrm.userData = { ...vrm.userData, human: r };
  return vrm;
}
