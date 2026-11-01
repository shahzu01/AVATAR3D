// Turns a creator recipe into a live, rigged, expressive avatar.
// The returned object mimics the parts of a three-vrm VRM that Kael Studio uses (humanoid bones, expressions,
// look-at and update), so the OBS renderer, tracking, gestures and the library viewer work with it unchanged.
import * as THREE from 'three';
import { SPECIES, defaultRecipe } from './catalog.js';
import { Builder, toonMaterial, outlineMaterial, fabricGradient, col, V, smooth, clamp } from './geom.js';
import { Body } from './body.js';
import { makeHeadShape, makeColoring, buildHead, buildEars, buildNose, buildTail, buildFaceDecal, headPoint } from './head.js';
import { FaceDrawer, ALL_EXPRESSIONS } from './face.js';
import { SpringSystem } from './spring.js';
import { buildHair } from './hair.js';
import { buildClothes, garmentEdges } from './clothes.js';
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
  out.proportions = r?.proportions === 'v2' ? 'v2' : 'classic';
  out.presentation = r?.presentation === 'male' || r?.presentation === 'female' ? r.presentation : null;
  out.bodyType = ['compact', 'balanced', 'athletic', 'broad', 'custom'].includes(r?.bodyType) ? r.bodyType : null;
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
  if (body.v2) addContactShading(body, recipe, colors);
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
  const clothMat = body.v2 ? toonMaterial({ gradientMap: fabricGradient() }) : mat;
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const outline = outlineMaterial(0.0012 + 0.0045 * (recipe.outline ?? 0.5) * body.sc);
  const meshes = [];
  for (const p of parts) {
    const g = p.b.geometry();
    const m = new THREE.SkinnedMesh(g, p.glow ? glowMat : p.name.startsWith('clothes-') ? clothMat : mat); m.name = p.name; m.frustumCulled = false;
    root.add(m); m.bind(skeleton, new THREE.Matrix4());
    meshes.push(m);
    if ((recipe.outline ?? 0.5) > 0.02 && !p.glow) { const o = new THREE.SkinnedMesh(g, outline); o.name = `${p.name}-outline`; o.frustumCulled = false; root.add(o); o.bind(skeleton, new THREE.Matrix4()); }
  }
  // drawn face
  // the face decal is projected onto a lighter copy of the head (much faster to raycast, same surface within a fraction of a mm)
  let proxy = headB;
  if (shape.kit) { proxy = new Builder(); buildHead(proxy, body, shape, { headColor: () => colors.main }, { nu: 80, nv: 56 }); }
  const decal = buildFaceDecal(body, proxy.geometry());
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

/** v2 materials: soft contact shading baked into the skin colours - under garment edges, under the chin,
 *  in the armpits and between the thighs - so parts read as touching rather than floating. */
function addContactShading(body, recipe, colors) {
  const e = garmentEdges(body, recipe), sc = body.sc, base = colors.bodyColor, head = colors.headColor;
  const band = (d, w) => 1 - 0.2 * (1 - smooth(0, w, d));          // darkest right at the edge, fading over w
  const arm = (side) => { const s = side === 'left' ? 1 : -1, ua = body.bones[`${side}UpperArm`].userData.world, total = body.upperArmLen + body.lowerArmLen + 0.03 * sc; return { s, x0: ua.x - s * 0.03 * sc, total, y: ua.y }; };
  const A = { left: arm('left'), right: arm('right') };
  const legTop = body.yHip - 0.012 * sc, legBot = body.yAnkle - 0.022 * sc;
  colors.bodyColor = (p, part) => {
    const c = base(p, part).clone(); let f = 1;
    if (part === 'neck') f *= 0.86 + 0.1 * smooth(body.yHead, body.ySh, p.y);
    if (part === 'leg' || part === 'foot' || part === 'torso') {
      for (const y of e.y) if (p.y < y) f *= band(y - p.y, 0.04 * sc);
      if (e.shoeY && p.y > e.shoeY && part === 'leg') f *= band(p.y - e.shoeY, 0.03 * sc) * 0.5 + 0.5 * 1;
      if (e.legT != null && part === 'leg') { const yEnd = legTop - e.legT * (legTop - legBot); if (p.y < yEnd) f *= band(yEnd - p.y, 0.035 * sc); }
      if (part === 'leg' && p.y > body.yHip - 0.08 * sc && Math.abs(p.x) < body.hipX * 0.9) f *= 0.88 + 0.12 * smooth(body.yHip - 0.02 * sc, body.yHip - 0.09 * sc, p.y);   // between the thighs
    }
    if (part === 'arm' || part === 'hand') {
      const a = A[p.x >= 0 ? 'left' : 'right'], t = ((p.x - a.x0) * a.s) / a.total;
      if (e.armT != null && t > e.armT) f *= band((t - e.armT) * a.total, 0.035 * sc);
      if (t < 0.16 && p.y < a.y) f *= 0.84 + 0.16 * smooth(0.02, 0.16, t);   // armpit
    }
    return c.multiplyScalar(clamp(f, 0.7, 1));
  };
  colors.headColor = (p, dir, mw, cw) => head(p, dir, mw, cw).clone().multiplyScalar(1 - 0.12 * smooth(-0.6, -0.92, dir.y));   // under the chin
}
