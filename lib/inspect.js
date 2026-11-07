// Avatar file validator and capability inspector.
// Reads a GLB container (.vrm / .glb) as untrusted data: no code is executed, nothing outside the file is fetched,
// and every offset is bounds-checked. Produces a report the UI shows before the user saves an import.

export const DEFAULT_LIMITS = {
  maxFileMB: 300,          // reject above
  maxJsonMB: 64,           // reject above
  warnTriangles: 300_000,  // "heavy for real-time" warning
  maxTriangles: 4_000_000, // reject above
  warnTextureSize: 4096,
  maxTextureSize: 16384,   // reject above
  maxTextures: 512,
  maxNodes: 50_000,
  maxAnimations: 1_000,
};

// glTF extensions three.js can load in this app without extra decoders
const SUPPORTED_EXT = new Set([
  'VRM', 'VRMC_vrm', 'VRMC_springBone', 'VRMC_springBone_extended_collider', 'VRMC_materials_mtoon', 'VRMC_node_constraint',
  'VRMC_vrm_animation', 'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_emissive_strength', 'KHR_mesh_quantization',
  'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_clearcoat', 'KHR_materials_sheen',
  'KHR_materials_volume', 'KHR_materials_iridescence', 'KHR_materials_anisotropy', 'KHR_lights_punctual', 'KHR_materials_variants',
  'EXT_texture_webp',
]);

const REQUIRED_BONES = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
const UPPER_BODY = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'];
const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft',
  'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft',
  'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft', 'browDownRight', 'browInnerUp',
  'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];
const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

class Reject extends Error {}

function imageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { mime: 'image/png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { mime: 'image/jpeg', w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { mime: 'image/jpeg', w: 0, h: 0 };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { mime: 'image/webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { mime: 'image/webp', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8 ') return { mime: 'image/webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/**
 * Inspect a GLB/VRM file held in memory.
 * @param {Buffer} buf file contents
 * @param {{filename?:string, limits?:object}} opts
 */
export function inspectAvatar(buf, opts = {}) {
  const L = { ...DEFAULT_LIMITS, ...(opts.limits || {}) };
  const filename = opts.filename || 'avatar.vrm';
  const ext = (filename.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const report = {
    ok: false, errors: [], warnings: [], filename, bytes: buf.length,
    format: { container: null, type: null, extension: ext, vrmVersion: null, specVersion: null, generator: null },
    meta: {}, stats: {}, capabilities: {}, suitability: { level: 'unsupported', tracking: false, reasons: [] },
  };
  const err = (m) => { report.errors.push(m); throw new Reject(m); };
  const warn = (m) => report.warnings.push(m);
  try {
    if (!['vrm', 'glb'].includes(ext)) err('Unsupported file type. Choose a .vrm file (or a .glb model).');
    if (buf.length > L.maxFileMB * 1e6) err(`File is too large (${(buf.length / 1e6).toFixed(0)} MB). The limit is ${L.maxFileMB} MB.`);
    if (buf.length < 20) err('The file is empty or truncated.');
    // ---- GLB header
    if (buf.readUInt32LE(0) !== 0x46546c67) {
      if (buf.slice(0, 1).toString() === '{') err('This is a text .gltf file. Export it as binary .glb or .vrm instead.');
      err('Not a VRM/GLB file (the file header is wrong). It may be damaged or a different format renamed to .vrm.');
    }
    const version = buf.readUInt32LE(4), total = buf.readUInt32LE(8);
    if (version !== 2) err(`Unsupported glTF container version ${version} (only version 2 is supported).`);
    if (total > buf.length) err('The file is truncated (it is shorter than its header says). Try exporting or downloading it again.');
    report.format.container = 'GLB';
    // ---- chunks
    let off = 12, json = null, bin = null;
    while (off + 8 <= total) {
      const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
      if (off + 8 + len > total) err('The file is damaged (a data chunk runs past the end of the file).');
      if (type === 0x4e4f534a && !json) {
        if (len > L.maxJsonMB * 1e6) err('The model description is unreasonably large.');
        try { json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len).replace(/\u0000+$/, '')); } catch { err('The file is damaged (its model description is not valid JSON).'); }
      } else if (type === 0x004e4942 && !bin) bin = buf.subarray(off + 8, off + 8 + len);
      off += 8 + len;
    }
    if (!json || typeof json !== 'object') err('The file is damaged (no model description found).');
    if (!String(json.asset?.version || '').startsWith('2.')) err('Unsupported glTF version (expected 2.0).');
    report.format.generator = typeof json.asset?.generator === 'string' ? json.asset.generator.slice(0, 120) : null;
    const arr = (k) => (Array.isArray(json[k]) ? json[k] : []);
    // ---- extensions
    const used = arr('extensionsUsed'), required = arr('extensionsRequired');
    const missingReq = required.filter((e) => !SUPPORTED_EXT.has(e));
    if (missingReq.length) err(`The model needs features this app cannot decode: ${missingReq.join(', ')}. Re-export without compression (Draco/Meshopt/KTX2).`);
    const vrm0 = json.extensions?.VRM, vrm1 = json.extensions?.VRMC_vrm;
    report.format.type = vrm1 ? 'VRM' : vrm0 ? 'VRM' : 'glTF';
    report.format.vrmVersion = vrm1 ? '1.0' : vrm0 ? '0.x' : null;
    report.format.specVersion = (vrm1?.specVersion || vrm0?.specVersion || null) && String(vrm1?.specVersion || vrm0?.specVersion).slice(0, 16);
    if (ext === 'vrm' && !vrm0 && !vrm1) err('This .vrm file has no VRM data. It may be a plain glTF renamed to .vrm.');
    report.format.extensions = used.filter((e) => typeof e === 'string').slice(0, 40);
    // ---- buffers, external references (never fetched)
    const buffers = arr('buffers');
    buffers.forEach((b, i) => {
      if (b.uri !== undefined) {
        if (typeof b.uri !== 'string' || !b.uri.startsWith('data:')) err('The model references external files, which is not allowed for imports. Export it as a single self-contained .vrm/.glb.');
      } else if (i === 0 && !bin) err('The file is damaged (its binary data chunk is missing).');
    });
    const bufLen = (i) => (i === 0 && buffers[0] && buffers[0].uri === undefined ? bin?.length || 0 : buffers[i]?.byteLength || 0);
    const views = arr('bufferViews');
    views.forEach((v, i) => {
      const end = (v.byteOffset || 0) + (v.byteLength || 0);
      if (!(v.buffer in buffers) || end > bufLen(v.buffer) || (v.byteOffset || 0) < 0) err(`The file is damaged (buffer view ${i} points outside its data).`);
    });
    const accessors = arr('accessors');
    accessors.forEach((a, i) => {
      if (a.bufferView === undefined) return;
      const v = views[a.bufferView];
      if (!v) err(`The file is damaged (accessor ${i} has no data).`);
      const elem = (COMPONENT_SIZE[a.componentType] || 0) * (TYPE_COUNT[a.type] || 0);
      if (!elem) err(`The file is damaged (accessor ${i} has an unknown data type).`);
      const stride = v.byteStride || elem;
      if ((a.byteOffset || 0) + stride * Math.max(0, (a.count || 0) - 1) + elem > (v.byteLength || 0)) err(`The file is damaged (accessor ${i} reads past its data).`);
    });
    // ---- geometry stats
    const nodes = arr('nodes'), meshes = arr('meshes');
    if (nodes.length > L.maxNodes) err(`The model has too many nodes (${nodes.length}).`);
    let tris = 0, verts = 0, maxMorph = 0;
    const morphNames = new Set();
    for (const m of meshes) {
      for (const p of m.primitives || []) {
        const mode = p.mode ?? 4;
        const n = p.indices !== undefined ? accessors[p.indices]?.count || 0 : accessors[p.attributes?.POSITION]?.count || 0;
        if (mode === 4) tris += Math.floor(n / 3); else if (mode === 5 || mode === 6) tris += Math.max(0, n - 2);
        verts += accessors[p.attributes?.POSITION]?.count || 0;
        maxMorph = Math.max(maxMorph, (p.targets || []).length);
      }
      for (const n of m.extras?.targetNames || []) morphNames.add(String(n));
    }
    if (tris > L.maxTriangles) err(`The model is too detailed for real-time use (${tris.toLocaleString()} triangles; limit ${L.maxTriangles.toLocaleString()}).`);
    if (tris > L.warnTriangles) warn(`Heavy model (${tris.toLocaleString()} triangles). It may lower the frame rate on a MacBook Air.`);
    // ---- textures
    const images = arr('images');
    if (images.length > L.maxTextures) err(`The model has too many textures (${images.length}).`);
    let maxTex = 0;
    const badImages = [];
    images.forEach((im, i) => {
      let data = null;
      if (im.uri !== undefined) {
        if (typeof im.uri !== 'string' || !im.uri.startsWith('data:')) err('The model references external texture files, which is not allowed for imports. Export it as a single self-contained file.');
        const b64 = im.uri.split(',')[1] || ''; data = Buffer.from(b64.slice(0, 200), 'base64');
      } else if (im.bufferView !== undefined && views[im.bufferView]) {
        const v = views[im.bufferView];
        const src = v.buffer === 0 && buffers[0]?.uri === undefined ? bin : null;
        if (src) data = src.subarray(v.byteOffset || 0, Math.min(src.length, (v.byteOffset || 0) + Math.min(v.byteLength || 0, 256 * 1024)));
      }
      const sz = data ? imageSize(data) : null;
      if (!sz) { badImages.push(im.name || `image ${i}`); return; }
      maxTex = Math.max(maxTex, sz.w, sz.h);
      if (Math.max(sz.w, sz.h) > L.maxTextureSize) err(`A texture is too large (${sz.w}×${sz.h}; limit ${L.maxTextureSize}).`);
    });
    if (badImages.length) warn(`${badImages.length} texture(s) could not be read (unknown or damaged image data): ${badImages.slice(0, 5).join(', ')}. They may appear blank.`);
    if (maxTex > L.warnTextureSize) warn(`Large textures (up to ${maxTex}px) use a lot of video memory.`);
    const anims = arr('animations');
    if (anims.length > L.maxAnimations) err(`The model has too many animations (${anims.length}).`);
    const materials = arr('materials');
    report.stats = { triangles: tris, vertices: verts, meshes: meshes.length, materials: materials.length, textures: images.length,
      unreadableTextures: badImages.length, maxTextureSize: maxTex, nodes: nodes.length, skins: arr('skins').length,
      maxMorphTargetsPerMesh: maxMorph, animations: anims.length };

    // ---- VRM metadata
    const s = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : v === undefined || v === null ? null : String(v).slice(0, n));
    if (vrm1) {
      const m = vrm1.meta || {};
      report.meta = { name: s(m.name), version: s(m.version), authors: Array.isArray(m.authors) ? m.authors.slice(0, 10).map((a) => s(a)) : [],
        copyright: s(m.copyrightInformation), contact: s(m.contactInformation), license: s(m.licenseUrl), otherLicense: s(m.otherLicenseUrl),
        avatarPermission: s(m.avatarPermission), commercialUsage: s(m.commercialUsage), allowRedistribution: m.allowRedistribution ?? null,
        modification: s(m.modification), creditNotation: s(m.creditNotation) };
    } else if (vrm0) {
      const m = vrm0.meta || {};
      report.meta = { name: s(m.title), version: s(m.version), authors: m.author ? [s(m.author)] : [], contact: s(m.contactInformation),
        license: s(m.licenseName), otherLicense: s(m.otherLicenseUrl), avatarPermission: s(m.allowedUserName), commercialUsage: s(m.commercialUssageName),
        violentUsage: s(m.violentUssageName), sexualUsage: s(m.sexualUssageName) };
    } else {
      const sc0 = json.scenes?.[json.scene || 0] || {};
      report.meta = { name: s(sc0.extras?.kaelCharacterName) || s(sc0.name) || null, characterType: s(sc0.extras?.kaelCharacterType) || null };   // character type set by the Blender pipeline
    }

    // ---- humanoid rig
    const bones = {};
    if (vrm1?.humanoid?.humanBones && typeof vrm1.humanoid.humanBones === 'object') for (const [k, v] of Object.entries(vrm1.humanoid.humanBones)) bones[k] = v?.node;
    if (Array.isArray(vrm0?.humanoid?.humanBones)) for (const b of vrm0.humanoid.humanBones) if (b && typeof b.bone === 'string') bones[b.bone] = b.node;
    const validBone = (k) => Number.isInteger(bones[k]) && bones[k] >= 0 && bones[k] < nodes.length;
    const present = Object.keys(bones).filter(validBone);
    const missing = REQUIRED_BONES.filter((b) => !validBone(b));
    const fingers = present.filter((b) => /Thumb|Index|Middle|Ring|Little/.test(b)).length;
    const upperOk = UPPER_BODY.every(validBone);
    report.capabilities.humanoid = { ok: missing.length === 0 && present.length > 0, upperBodyOk: upperOk, bones: present.length, fingers,
      missing, neck: validBone('neck'), eyes: validBone('leftEye') && validBone('rightEye') };

    // ---- expressions
    let exprs = [];
    if (vrm1?.expressions) {
      for (const [k, v] of Object.entries(vrm1.expressions.preset || {})) if (v) exprs.push({ name: k, preset: true });
      for (const [k, v] of Object.entries(vrm1.expressions.custom || {})) if (v) exprs.push({ name: k, preset: false });
    } else if (Array.isArray(vrm0?.blendShapeMaster?.blendShapeGroups)) {
      for (const g of vrm0.blendShapeMaster.blendShapeGroups) {
        const preset = g.presetName && g.presetName !== 'unknown' ? g.presetName : null;
        exprs.push({ name: String(g.name || preset || 'unnamed').slice(0, 64), preset: !!preset, presetName: preset });
      }
    }
    exprs = exprs.slice(0, 400);
    const lower = new Set(exprs.flatMap((e) => [e.name.toLowerCase(), (e.presetName || '').toLowerCase()]));
    const has = (...n) => n.some((x) => lower.has(x.toLowerCase()));
    const arkit = ARKIT.filter((n) => lower.has(n.toLowerCase())).length;
    report.capabilities.expressions = {
      count: exprs.length, names: exprs.map((e) => e.name), blink: has('blink', 'blink_l', 'blinkLeft', 'eyeBlinkLeft'),
      mouth: has('aa', 'a', 'jawOpen'), visemes: ['aa', 'ih', 'ou', 'ee', 'oh'].filter((v) => has(v, v[0])).length,
      emotions: ['happy', 'joy', 'angry', 'sad', 'sorrow', 'relaxed', 'fun', 'surprised'].filter((v) => has(v)).length,
      perfectSync: arkit >= 40, arkitShapes: arkit, rawMorphTargets: morphNames.size,
    };
    // ---- look-at / gaze
    const lookType = vrm1?.lookAt?.type || (vrm0?.firstPerson?.lookAtTypeName || null);
    report.capabilities.lookAt = { type: lookType ? String(lookType).toLowerCase().slice(0, 20) : null,
      supported: !!lookType && (String(lookType).toLowerCase() === 'bone' ? report.capabilities.humanoid.eyes : true) };
    // ---- secondary motion, materials, animation
    const springs = json.extensions?.VRMC_springBone?.springs?.length || vrm0?.secondaryAnimation?.boneGroups?.length || 0;
    report.capabilities.springBones = springs;
    const mtoon = vrm1 ? materials.filter((m) => m.extensions?.VRMC_materials_mtoon).length
      : Array.isArray(vrm0?.materialProperties) ? vrm0.materialProperties.filter((m) => /MToon/i.test(m.shader || '')).length : 0;
    report.capabilities.materials = { total: materials.length, mtoon, unlit: materials.filter((m) => m.extensions?.KHR_materials_unlit).length };
    report.capabilities.animations = { embedded: anims.length, builtInMotions: report.capabilities.humanoid.upperBodyOk };

    // ---- suitability for live use
    const c = report.capabilities, r = report.suitability.reasons;
    if (report.format.type === 'VRM' && c.humanoid.upperBodyOk) {
      report.suitability.tracking = true;
      report.suitability.level = c.expressions.perfectSync ? 'full' : (c.expressions.blink && c.expressions.mouth ? 'standard' : 'basic');
      if (!c.humanoid.ok) r.push(`Leg bones missing (${c.humanoid.missing.join(', ')}); full-body framing may look wrong.`);
      if (!c.expressions.blink) r.push('No blink expression: the eyes will not blink.');
      if (!c.expressions.mouth) r.push('No mouth expression (aa / jawOpen): no lip sync.');
      if (!c.expressions.perfectSync) r.push('No ARKit "Perfect Sync" shapes: face tracking uses basic blink, mouth and emotion presets.');
      if (!c.lookAt.supported) r.push('No eye controls: gaze tracking unavailable.');
      if (!c.humanoid.fingers) r.push('No finger bones: hand tracking will not move fingers.');
    } else if (report.format.type === 'VRM') {
      report.suitability.level = 'preview-only';
      r.push(`The humanoid rig is incomplete (missing ${missing.join(', ')}). It can be previewed but not used for live tracking.`);
    } else {
      report.suitability.level = 'preview-only';
      r.push('Plain glTF/GLB has no VRM humanoid mapping, so it can be previewed and stored but not driven by tracking. Convert it to VRM (for example with the VRM Add-on for Blender or UniVRM).');
    }
    if (report.format.vrmVersion === '0.x' && report.meta?.avatarPermission === 'OnlyAuthor') warn('Licence: this avatar is marked "only the author may use it". Make sure that is you.');
    if (report.format.vrmVersion === '1.0' && report.meta?.avatarPermission === 'onlyAuthor') warn('Licence: this avatar is marked "only the author may use it". Make sure that is you.');
    report.ok = true;
  } catch (e) {
    if (!(e instanceof Reject)) report.errors.push('The file could not be read. It may be damaged.');
    report.ok = false;
  }
  return report;
}

export function sniffHeader(buf) {
  return buf.length >= 12 && buf.readUInt32LE(0) === 0x46546c67 && buf.readUInt32LE(4) === 2;
}
