// Validation for characters made in the Kael Studio creator. A character is a small JSON "recipe";
// everything in it is checked against the catalog, so nothing unexpected is ever stored or rendered.
import { SPECIES, OPTIONS, ACCESSORY_LIMIT } from '../public/creator/catalog.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ids = (k) => new Set(OPTIONS[k].map((o) => o.id));
const num = (v, d = 0.5, a = 0, b = 1) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
const pickId = (v, k, d) => (ids(k).has(v) ? v : d);
const color = (v, d) => (HEX.test(String(v)) ? String(v).toLowerCase() : d);
const text = (v, d, n = 60) => (String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || d);

export class RecipeError extends Error {}

// Realistic humans (Blender/MakeHuman models in /humans): body type, hair and colours chosen from fixed lists.
export const HUMAN_TYPES = {
  female: ['Balanced', 'Hourglass', 'Pear', 'Apple', 'Apple/Round', 'Rectangle', 'Inverted triangle', 'Tall', 'Slender', 'Athletic', 'Petite', 'Curvy / Plus', 'Tall / Long torso'],
  male: ['Balanced', 'Ectomorph', 'Slim runner', 'Average', 'Athletic', 'Swimmer', 'Hero', 'Bodybuilder', 'Stocky', 'Endomorph', 'Heavyweight'],
};
export const HUMAN_HAIR = {
  female: ['None', 'Pixie cut', 'Bob', 'Long waves', 'Braided ponytail', 'Afro curls', 'Messy bun', 'Double buns', 'Bangs & straight', 'Side braid', 'High ponytail'],
  male: ['None', 'Short crew cut', 'Classic pompadour', 'Messy textured quiff', 'Undercut slick back', 'Buzz cut', 'Long wavy + beard', 'Short spiky', 'Man bun', 'Curly afro', 'Side part comb over'],
};
const SKINS = ['porcelain', 'light', 'medium', 'tan', 'brown', 'deep'];
const HAIRC = ['black', 'dark brown', 'brown', 'auburn', 'blonde', 'platinum', 'red', 'grey', 'blue', 'pink'];
const EYEC = ['brown', 'hazel', 'green', 'blue', 'grey'];
export function sanitizeHuman(r) {
  const gender = r.gender === 'male' ? 'male' : 'female';
  const one = (v, list, d) => (list.includes(v) ? v : d);
  return { version: 1, kind: 'human', name: text(r.name, gender === 'male' ? 'Human Male' : 'Human Female'), gender, species: one(r.species, ['human', 'elf', 'fox', 'wolf', 'cat', 'tiger', 'bear', 'panda', 'raccoon', 'bunny'], 'human'),
    bodyType: one(r.bodyType, HUMAN_TYPES[gender], 'Balanced'), hair: one(r.hair, HUMAN_HAIR[gender], HUMAN_HAIR[gender][1]),
    skin: one(r.skin, SKINS, 'light'), hairColor: one(r.hairColor, HAIRC, 'dark brown'), eyeColor: one(r.eyeColor, EYEC, 'brown'),
    clothing: color(r.clothing, '#2b2b31'), outfit: one(r.outfit, ['basic', 'harness'], 'basic'), harnessColor: color(r.harnessColor, '#5a3a26') };
}

// Modular characters (blender/modular kit in /modular): one body chosen per part, a fit per part, hair for the chosen head.
export const MODULAR_BODIES = ['female', 'male', 'anime_female', 'anime_male', 'mika_female'];
export const MODULAR_PARTS = ['Head', 'Neck', 'Torso', 'Arm_L', 'Arm_R', 'Hand_L', 'Hand_R', 'Leg_L', 'Leg_R', 'Foot_L', 'Foot_R'];
export function sanitizeModular(r) {
  const parts = {}, fit = {};
  for (const p of MODULAR_PARTS) {
    parts[p] = MODULAR_BODIES.includes(r.parts?.[p]) ? r.parts[p] : 'female';
    const f = r.fit?.[p];
    if (p !== 'Torso') fit[p] = f === 'match' ? 'match' : typeof f === 'number' && Number.isFinite(f) ? Math.min(1.6, Math.max(0.6, f)) : 'own';
  }
  return { version: 1, kind: 'modular', name: text(r.name, 'Mixed character'), parts, fit,
    hands: r.hands === 'classic' ? 'classic' : 'master', outline: r.outline !== false,
    eyeColor: typeof r.eyeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.eyeColor) ? r.eyeColor : null, face: r.face === 'classic' ? 'classic' : 'styled', faceShape: typeof r.faceShape === 'string' && /^[fmc]_[a-z]{3,10}$/.test(r.faceShape) ? r.faceShape : null,
    eyeShape: typeof r.eyeShape === 'string' && /^(hf|ag)_[a-z]{3,12}$/.test(r.eyeShape) ? r.eyeShape : null,
    outfit: ['m_street', 'm_smart', 'm_athlete', 'f_dress', 'f_office', 'f_street', 'a_magical', 'a_sailor', 'a_cyber', 'p_gothic', 'p_knight', 'p_kimono', 'p_idol', 'p_maid', 'idol', 'casual', 'sport', 'school', 'basic', 'none'].includes(r.outfit) ? r.outfit : null, accent: color(r.accent, '#f2efe9'),
    accessories: Array.isArray(r.accessories) ? [...new Set(r.accessories.filter((a) => ['headset', 'catEars', 'glasses', 'bow', 'choker', 'scarf', 'tail', 'headdress', 'tiara', 'kanzashi'].includes(a)))] : null,
    headModel: typeof r.headModel === 'string' && /^[a-z0-9_]{1,32}$/.test(r.headModel) ? r.headModel : null,
    hair: typeof r.hair === 'string' && r.hair.length < 40 ? r.hair.replace(/[^A-Za-z0-9 &+-]/g, '') : 'None',
    skin: color(r.skin, '#ecc4ad'), hairColor: color(r.hairColor, '#5c3a29'), clothing: color(r.clothing, '#2b2c36') };
}

export function sanitizeRecipe(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new RecipeError('The character data is missing or not valid.');
  if (JSON.stringify(r).length > 64 * 1024) throw new RecipeError('The character data is too large.');
  if (r.kind === 'human') return sanitizeHuman(r);
  if (r.kind === 'modular') return sanitizeModular(r);
  const species = SPECIES[r.species] ? r.species : 'human';
  const sp = SPECIES[species];
  const b = r.body || {}, f = r.face || {}, c = r.colors || {};
  const out = {
    version: 1, name: text(r.name, 'New character'), species,
    body: { height: num(b.height, 1.55, 0.9, 2.0), head: num(b.head, 1.1, 0.7, 1.6), build: num(b.build), shoulders: num(b.shoulders), chest: num(b.chest), waist: num(b.waist), hips: num(b.hips), arms: num(b.arms), legs: num(b.legs), legLength: num(b.legLength) },
    colors: { skin: color(c.skin, sp.colors.skin), fur2: color(c.fur2, sp.colors.fur2), fur3: color(c.fur3, sp.colors.fur3), inner: color(c.inner, sp.colors.inner), nose: color(c.nose, sp.colors.nose) },
    pattern: pickId(r.pattern, 'pattern', 'none'),
    face: {
      eyes: pickId(f.eyes, 'eyes', 'round'), eyeColor: color(f.eyeColor, '#2f6fd8'), eyeSize: num(f.eyeSize), eyeSpacing: num(f.eyeSpacing), eyeHeight: num(f.eyeHeight), eyeTilt: num(f.eyeTilt),
      lashes: !!f.lashes, brows: pickId(f.brows, 'brows', 'soft'), browColor: color(f.browColor, '#2b2c33'), mouth: pickId(f.mouth, 'mouth', 'simple'),
      nose: pickId(f.nose, 'nose', 'auto'), markings: pickId(f.markings, 'markings', 'none'), muzzle: num(f.muzzle),
    },
    ears: { type: pickId(r.ears?.type, 'ears', 'auto'), size: num(r.ears?.size) },
    tail: { type: pickId(r.tail?.type, 'tail', 'auto'), size: num(r.tail?.size) },
    hair: { style: pickId(r.hair?.style, 'hair', 'none'), color: color(r.hair?.color, '#3b2a22'), color2: color(r.hair?.color2, '#6b4226') },
    top: { style: pickId(r.top?.style, 'top', 'none'), color: color(r.top?.color, '#30508a'), color2: color(r.top?.color2, '#27426f') },
    bottom: { style: pickId(r.bottom?.style, 'bottom', 'none'), color: color(r.bottom?.color, '#1f2026') },
    shoes: { style: pickId(r.shoes?.style, 'shoes', 'none'), color: color(r.shoes?.color, '#30323a'), color2: color(r.shoes?.color2, '#e6e6ea') },
    accessories: [],
    outline: num(r.outline),
    proportions: r.proportions === 'v2' ? 'v2' : r.proportions === 'real' ? 'real' : 'classic',   // 'v2' = improved proportions (proof of concept)
    presentation: r.presentation === 'male' || r.presentation === 'female' ? r.presentation : null,   // starting anatomy
    bodyType: ['compact', 'balanced', 'athletic', 'broad', 'custom'].includes(r.bodyType) ? r.bodyType : null,
  };
  const seen = new Set();
  for (const a of Array.isArray(r.accessories) ? r.accessories : []) {
    if (!a || !ids('accessories').has(a.id) || seen.has(a.id) || seen.size >= ACCESSORY_LIMIT) continue;
    seen.add(a.id); out.accessories.push({ id: a.id, color: color(a.color, '#1f2026') });
  }
  return out;
}

/** Report in the same shape as the file inspector produces, so created and imported avatars share one library. */
export function creationReport(recipe, bytes) {
  if (recipe.kind === 'human') return humanReport(recipe, bytes);
  if (recipe.kind === 'modular') return modularReport(recipe, bytes);
  const tracks = ['ponytail', 'twintails', 'long', 'hime'].includes(recipe.hair.style) ? 1 : 0;
  const springs = (recipe.ears.type === 'bunny' || (recipe.ears.type === 'auto' && SPECIES[recipe.species].ears === 'bunny') ? 1 : 0)
    + (['none', 'stub', 'pom'].includes(recipe.tail.type === 'auto' ? SPECIES[recipe.species].tail : recipe.tail.type) ? 0 : 1) + tracks;
  return {
    ok: true, errors: [], warnings: [], filename: `${recipe.name}.kaelchar.json`, bytes,
    format: { container: 'Recipe', type: 'Kael Studio character', extension: 'json', vrmVersion: null, specVersion: '1' },
    meta: { name: recipe.name, authors: ['You (made in Kael Studio)'], license: 'Your own character', avatarPermission: 'Everyone' },
    stats: { triangles: 0, vertices: 0, meshes: 0, materials: 0, textures: 1, unreadableTextures: 0, maxTextureSize: 1024, nodes: 0, skins: 1, maxMorphTargetsPerMesh: 0, animations: 0 },
    capabilities: {
      humanoid: { ok: true, upperBodyOk: true, bones: 51, fingers: 30, missing: [], neck: true, eyes: false },
      expressions: { count: 84, names: [], blink: true, mouth: true, visemes: 5, emotions: 5, perfectSync: true, arkitShapes: 52, rawMorphTargets: 0 },
      lookAt: { type: 'drawn eyes', supported: true }, springBones: springs,
      materials: { total: 3, mtoon: 0, unlit: 0 }, animations: { embedded: 0, builtInMotions: true },
    },
    suitability: { level: 'full', tracking: true, reasons: [] },
  };
}

function humanReport(recipe, bytes) {
  return {
    ok: true, errors: [], warnings: [], filename: `${recipe.name}.kaelchar.json`, bytes,
    format: { container: 'Recipe', type: 'Kael Studio realistic human', extension: 'json', vrmVersion: '1.0', specVersion: '1' },
    meta: { name: recipe.name, authors: ['You (made in Kael Studio)'], license: 'Your own character (MakeHuman CC0 base)', avatarPermission: 'Everyone' },
    stats: { triangles: 0, vertices: 0, meshes: 6, materials: 7, textures: 1, unreadableTextures: 0, maxTextureSize: 1024, nodes: 0, skins: 1, maxMorphTargetsPerMesh: 50, animations: 0 },
    capabilities: {
      humanoid: { ok: true, upperBodyOk: true, bones: 53, fingers: 30, missing: [], neck: true, eyes: true },
      expressions: { count: 49, names: [], blink: true, mouth: true, visemes: 5, emotions: 5, perfectSync: true, arkitShapes: 36, rawMorphTargets: 0 },
      lookAt: { type: 'bone', supported: true }, springBones: 1,
      materials: { total: 7, mtoon: 7, unlit: 0 }, animations: { embedded: 0, builtInMotions: true },
    },
    suitability: { level: 'full', tracking: true, reasons: [] },
  };
}

function modularReport(recipe, bytes) {
  return {
    ok: true, errors: [], warnings: ['Mixed characters have no blink, mouth or expression shapes yet.'], filename: `${recipe.name}.kaelchar.json`, bytes,
    format: { container: 'Recipe', type: 'Kael Studio mixed character', extension: 'json', vrmVersion: '1.0', specVersion: '1' },
    meta: { name: recipe.name, authors: ['You (made in Kael Studio)'], license: 'Your own character (MakeHuman CC0 base)', avatarPermission: 'Everyone' },
    stats: { triangles: 26756, vertices: 13380, meshes: 3, materials: 3, textures: 0, unreadableTextures: 0, maxTextureSize: 512, nodes: 0, skins: 1, maxMorphTargetsPerMesh: 0, animations: 0 },
    capabilities: {
      humanoid: { ok: true, upperBodyOk: true, bones: 54, fingers: 30, missing: [], neck: true, eyes: true },
      expressions: { count: 0, names: [], blink: false, mouth: false, visemes: 0, emotions: 0, perfectSync: false, arkitShapes: 0, rawMorphTargets: 0 },
      lookAt: { type: 'none', supported: false }, springBones: 0,
      materials: { total: 3, mtoon: 1, unlit: 0 }, animations: { embedded: 0, builtInMotions: true },
    },
    suitability: { level: 'partial', tracking: true, reasons: ['Body tracking works; the face does not move yet.'] },
  };
}
