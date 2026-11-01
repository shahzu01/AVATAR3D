// Turns a creator recipe into a live, rigged, expressive avatar.
// The returned object mimics the parts of a three-vrm VRM that Kael Studio uses (humanoid bones, expressions,
// look-at and update), so the OBS renderer, tracking, gestures and the library viewer work with it unchanged.
import * as THREE from 'three';
import { SPECIES, defaultRecipe } from './catalog.js';
import { Builder, toonMaterial, outlineMaterial, col, V } from './geom.js';
import { Body } from './body.js';
import { makeHeadShape, makeColoring, buildHead, buildEars, buildNose, buildTail, buildFaceDecal, headPoint } from './head.js';
import { FaceDrawer, ALL_EXPRESSIONS } from './face.js';
import { SpringSystem } from './spring.js';
import { buildHair } from './hair.js';
import { buildClothes } from './clothes.js';
import { buildAccessories } from './accessories.js';

export const HUMANOID = ['hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  ...['left', 'right'].flatMap((s) => [`${s}ThumbMetacarpal`, `${s}ThumbProximal`, `${s}ThumbDistal`, ...['Index', 'Middle', 'Ring', 'Little'].flatMap((f) => [`${s}${f}Proximal`, `${s}${f}Intermediate`, `${s}${f}Distal`])])];

/** Fill in anything missing from an older or partial recipe. */
export function normalizeRecipe(r) {
  const d = defaultRecipe(), out = { ...d, ...r };
  for (const k of ['body', 'face', 'ears', 'tail', 'hair', 'top', 'bottom', 'shoes']) out[k] = { ...d[k], ...(r?.[k] || {}) };
  if (!SPECIES[out.species]) out.species = 'human';
  out.colors = { ...SPECIES[out.species].colors, ...(r?.colors || {}) };
  out.accessories = Array.isArray(r?.accessories) ? r.accessories.filter((a) => a && typeof a.id === 'string').slice(0, 8) : [];
  return out;
}

export function buildCharacter(input, { faceSize = 1024 } = {}) {
  const recipe = normalizeRecipe(input || {});
  const sp = SPECIES[recipe.species];
  const body = new Body(recipe, sp);
  body.buildSkeleton();
  const root = new THREE.Group(); root.name = 'KaelCharacter';
  root.add(body.bones.hips);
  root.updateMatrixWorld(true);
  const springs = new SpringSystem(root);
  const springDefs = [];
  const addSpring = (names, parent, pts, opts = {}) => {
    names.forEach((n, i) => body.addBone(n, i === 0 ? parent : names[i - 1], pts[i]));
    springDefs.push({ names, tips: pts.slice(1, names.length + 1), opts });
  };
  const shape = makeHeadShape(body, sp, recipe);
  const colors = makeColoring(recipe, sp, body);
  colors.nose = col(recipe.colors.nose || '#222');
  colors.earTips = recipe.species === 'fox' || (recipe.pattern === 'points');
  colors.tailTip = recipe.species === 'fox' ? col(recipe.colors.fur2) : null;
  const earType = recipe.ears.type === 'auto' ? sp.ears : recipe.ears.type;
  const tailType = recipe.tail.type === 'auto' ? sp.tail : recipe.tail.type;
  const noseType = recipe.face.nose === 'auto' ? sp.nose : recipe.face.nose;
  const ctx = { recipe, sp, body, shape, colors, addSpring, headPoint: (dir) => headPoint(body, shape, dir), earType, tailType };

  // geometry (bones for springs are added while building, so build before creating the skeleton)
  const parts = [];
  const add = (name, fn, opts = {}) => { const b = new Builder(); fn(b); if (b.count) parts.push({ name, b, ...opts }); return b; };
  const headB = add('head', (b) => buildHead(b, body, shape, colors));
  add('headParts', (b) => { buildEars(b, body, shape, earType, colors, recipe.ears.size, addSpring); buildNose(b, body, shape, noseType, colors); });
  const noFeet = !['none', 'sandals'].includes(recipe.shoes.style);
  add('body', (b) => body.build(b, { bodyColor: colors.bodyColor, hideFeet: noFeet }));
  add('tail', (b) => buildTail(b, body, tailType, colors, recipe.tail.size, addSpring));
  for (const [name, b] of Object.entries(buildHair(ctx) || {})) if (b.count) parts.push({ name: `hair-${name}`, b });
  for (const [name, b] of Object.entries(buildClothes(ctx) || {})) if (b.count) parts.push({ name: `clothes-${name}`, b });
  for (const [name, b] of Object.entries(buildAccessories(ctx) || {})) if (b.count) parts.push({ name: `acc-${name}`, b, ...(name.startsWith('glow') ? { glow: true } : {}) });

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(body.boneList);
  const mat = toonMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const outline = outlineMaterial(0.0012 + 0.0045 * (recipe.outline ?? 0.5) * body.sc);
  const meshes = [];
  for (const p of parts) {
    const g = p.b.geometry();
    const m = new THREE.SkinnedMesh(g, p.glow ? glowMat : mat); m.name = p.name; m.frustumCulled = false;
    root.add(m); m.bind(skeleton, new THREE.Matrix4());
    meshes.push(m);
    if ((recipe.outline ?? 0.5) > 0.02 && !p.glow) { const o = new THREE.SkinnedMesh(g, outline); o.name = `${p.name}-outline`; o.frustumCulled = false; root.add(o); o.bind(skeleton, new THREE.Matrix4()); }
  }
  // drawn face
  const decal = buildFaceDecal(body, headB.geometry());
  const face = new FaceDrawer(recipe, body, decal.region, sp, faceSize);
  const faceMat = new THREE.MeshToonMaterial({ map: face.texture, transparent: true, depthWrite: false, gradientMap: mat.gradientMap, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const faceMesh = new THREE.SkinnedMesh(decal.builder.geometry(), faceMat); faceMesh.name = 'face'; faceMesh.frustumCulled = false; faceMesh.renderOrder = 2;
  root.add(faceMesh); faceMesh.bind(skeleton, new THREE.Matrix4());
  face.update({}, null);

  // springs
  for (const d of springDefs) springs.addChain(d.names.map((n) => body.bones[n]), d.tips, d.opts);
  springs.addCollider(body.bones.head, V(0, body.headC.y - body.yHead, 0), Math.min(body.head.rx, body.head.ry) * 0.92);
  springs.addCollider(body.bones.chest, V(0, 0.02 * body.sc, -0.02 * body.sc), body.r.chest[1] * 1.15);
  springs.addCollider(body.bones.hips, V(0, -0.02 * body.sc, 0), body.r.hip[1] * 1.1);

  // ---------------------------------------------------------------- VRM-like interface
  const humanBones = {};
  for (const n of HUMANOID) if (body.bones[n]) humanBones[n] = { node: body.bones[n] };
  const values = {};
  const expressions = ALL_EXPRESSIONS.map((n) => ({ expressionName: n }));
  const lookAt = { yaw: 0, pitch: 0, autoUpdate: false, update() {} };
  const vrm = {
    isCreated: true, recipe, scene: root, skeleton,
    meta: { metaVersion: '1', name: recipe.name },
    humanoid: { humanBones, getNormalizedBoneNode: (n) => humanBones[n]?.node || null, getRawBoneNode: (n) => humanBones[n]?.node || null },
    expressionManager: {
      expressions,
      setValue: (n, v) => { values[n] = v; }, getValue: (n) => values[n] || 0,
      getExpression: (n) => (ALL_EXPRESSIONS.includes(n) ? { expressionName: n } : null),
    },
    lookAt,
    springs, face,
    update(dt) { springs.update(dt); face.update(values, { yaw: lookAt.yaw, pitch: lookAt.pitch }); },
    resetSprings() { springs.reset(); },
    stats() { let tris = 0; for (const m of meshes) tris += m.geometry.index.count / 3; return { triangles: tris, meshes: meshes.length, bones: body.boneList.length }; },
  };
  root.userData.vrm = vrm;
  return vrm;
}
