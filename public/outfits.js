// Outfits for mixed characters. Every garment is cut from the stitched body itself (so it follows any mix of parts)
// or generated around it (the skirt). Hems are smooth: each layer carries a per-vertex "cover" value and the shader
// cuts along cover = 0, a straight line across the triangles, instead of following the body's own edges.
import * as THREE from 'three';
import { toonGradient } from '/creator/geom.js';
import { buildExtras } from '/garments.js';

// group: which characters the outfit was designed for (any outfit still works on any body). acc: accessories it comes with.
export const OUTFITS = {
  m_street: { group: 'male', label: 'Street: open jacket, T-shirt, long trousers', layers: ['tee', 'trousers', 'jacket', 'shoes'], acc: ['headset'] },
  m_smart: { group: 'male', label: 'Smart: shirt, waistcoat, trousers', layers: ['shirt', 'trousers', 'waistcoat', 'shoes'], acc: ['glasses'] },
  m_athlete: { group: 'male', label: 'Athlete: tank top, shorts, wristbands', layers: ['tank', 'shorts', 'wristbands', 'socksAnkle', 'shoes'], acc: [] },
  f_dress: { group: 'female', label: 'Summer dress with belt', layers: ['briefs', 'dressTop', 'belt', 'shoes'], skirt: { len: 0.36, flare: 0.13, pleat: 0.003, top: 0.30 }, acc: ['bow'] },
  f_office: { group: 'female', label: 'Office: blouse, fitted skirt, tights', layers: ['tights', 'shirt', 'shoes'], skirt: { len: 0.27, flare: 0.022, pleat: 0, top: 0.24 }, acc: ['glasses', 'choker'] },
  f_street: { group: 'female', label: 'Streetwear: cropped jacket, tank, shorts', layers: ['tank', 'shortShorts', 'cropJacket', 'socksKnee', 'shoes'], acc: ['headset'] },
  a_magical: { group: 'anime', label: 'Magical idol: crop top, pleated skirt, bow', layers: ['briefs', 'socksThigh', 'cropTop', 'sleeves', 'shoes'], skirt: { len: 0.2, flare: 0.105, pleat: 0.008, top: 0.17 }, acc: ['bow', 'choker'] },
  a_sailor: { group: 'anime', label: 'Sailor uniform: shirt, scarf, pleated skirt', layers: ['briefs', 'socksKnee', 'tee', 'shoes'], skirt: { len: 0.185, flare: 0.085, pleat: 0.0065, top: 0.17 }, acc: ['scarf'] },
  a_cyber: { group: 'anime', label: 'Cyber gamer: jacket, crop top, cat-ear headset', layers: ['socksThigh', 'cropTop', 'shortShorts', 'cropJacket', 'wristbands', 'shoes'], acc: ['headset', 'catEars', 'tail'] },
  // premium: many layers, generated pieces (garments.js) and a signature colour pair. Layer 'name:role' picks its colour:
  // main / accent (the two pickers), dark, light (lace white), metal (silver), gold.
  p_gothic: { group: 'premium', label: 'Gothic Lolita: corset dress, lace petticoat, puff sleeves', colors: { clothing: '#1c1a22', accent: '#a3172f' },
    layers: ['briefs:dark', 'socksThigh:dark', 'garters:accent', 'blouse:light', 'corset:main', 'cuffs:light', 'maryJanes:dark'],
    skirts: [{ len: 0.29, flare: 0.17, shape: 0.6, top: 0.2, color: 'light', pleat: 0, ruffle: 0.006, waves: 30, band: null },
      { len: 0.25, flare: 0.2, shape: 0.55, top: 0.22, outset: 0.018, color: 'main', pleat: 0.004, ruffle: 0.004, waves: 20, band: 'accent' }],
    extras: [{ type: 'puffSleeves', color: 'main' }, { type: 'lacing', color: 'accent', from: 0.26, to: 0.6, eyelet: 'metal', off: 0.021 }, { type: 'frill', at: 0.64, color: 'light', len: 0.03, out: 0.022, waves: 28 },
      { type: 'bow', where: 'back', at: 0.27, size: 0.075, color: 'accent', tails: 1.4 }, { type: 'bow', where: 'front', at: 0.79, size: 0.032, color: 'accent', tails: 0.7 }], acc: ['headdress', 'choker'] },
  p_knight: { group: 'premium', label: 'Magical knight: armour, cape, gauntlets, battle skirt', colors: { clothing: '#24315e', accent: '#8d1f2c' },
    layers: ['briefs:dark', 'tights:dark', 'longSleeves:main', 'tank:main', 'armorPlate:metal', 'plateTrim:gold', 'gloves:dark', 'gauntlets:metal', 'boots:dark', 'bootCuffs:metal', 'belt:gold'],
    skirts: [{ len: 0.21, flare: 0.1, pleat: 0.007, top: 0.17, color: 'main', band: 'gold' }],
    extras: [{ type: 'cape', color: 'accent', len: 0.46, flare: 0.1, clasp: 'gold' }, { type: 'pauldrons', color: 'metal', trim: 'gold' }], acc: ['tiara'] },
  p_kimono: { group: 'premium', label: 'Modern kimono: wrap top, bell sleeves, obi with big bow', colors: { clothing: '#2b3f73', accent: '#e0566d' },
    layers: ['briefs:dark', 'socksKnee:light', 'kimonoWrap:main', 'kimonoCollar:light', 'obi:accent', 'obiCord:gold', 'shoes:dark'],
    skirts: [{ len: 0.24, flare: 0.12, shape: 0.9, top: 0.3, color: 'main', pleat: 0.002, ruffle: 0.003, waves: 14, band: 'accent' }],
    extras: [{ type: 'bellSleeves', color: 'main', flare: 0.065, trim: 'accent' }, { type: 'bow', where: 'back', at: 0.4, size: 0.1, color: 'accent', tails: 1.6, off: 0.036 }], acc: ['kanzashi'] },
  p_idol: { group: 'premium', label: 'Stage idol: off-shoulder frills, three-tier tutu, boots', colors: { clothing: '#ff5fa2', accent: '#ffd166' },
    layers: ['briefs:dark', 'idolTop:main', 'waistband:accent', 'offShoulder:light', 'boots:light', 'bootCuffs:accent', 'garters:accent'],
    skirts: [{ len: 0.18, flare: 0.21, shape: 0.5, top: 0.19, color: 'light', pleat: 0, ruffle: 0.008, waves: 34, band: null },
      { len: 0.155, flare: 0.205, shape: 0.5, top: 0.19, outset: 0.011, color: 'accent', pleat: 0, ruffle: 0.007, waves: 28, band: null },
      { len: 0.125, flare: 0.195, shape: 0.5, top: 0.19, outset: 0.022, color: 'main', pleat: 0, ruffle: 0.006, waves: 22, band: 'light' }],
    extras: [{ type: 'frill', at: 0.74, color: 'light', len: 0.034, out: 0.026, waves: 30 }, { type: 'wristFrills', color: 'light' }, { type: 'bow', where: 'front', at: 0.74, size: 0.04, color: 'accent', tails: 0.8 },
      { type: 'bow', where: 'back', at: 0.2, size: 0.07, color: 'accent', tails: 1.3 }], acc: ['headset', 'bow', 'choker'] },
  p_maid: { group: 'premium', label: 'Victorian maid: long dress, frilled apron, puff sleeves', colors: { clothing: '#211e2b', accent: '#f4f1ec' },
    layers: ['briefs:dark', 'socksThigh:light', 'maidBodice:main', 'collar:light', 'cuffs:light', 'apronBib:light', 'maryJanes:dark'],
    skirts: [{ len: 0.43, flare: 0.16, shape: 0.75, top: 0.2, color: 'light', pleat: 0, ruffle: 0.006, waves: 32, band: null },
      { len: 0.41, flare: 0.165, shape: 0.75, top: 0.2, outset: 0.004, color: 'main', pleat: 0.003, band: null },
      { len: 0.37, flare: 0.185, shape: 0.75, top: 0.2, outset: 0.024, color: 'light', pleat: 0, ruffle: 0.004, waves: 9, band: null, arc: [-2.45, -0.69] }],
    extras: [{ type: 'puffSleeves', color: 'main', len: 0.36, puff: 0.022 }, { type: 'frill', at: 0.2, color: 'light', len: 0.022, out: 0.012, waves: 26, off: 0.03 },
      { type: 'bow', where: 'back', at: 0.21, size: 0.085, color: 'light', tails: 1.8 }], acc: ['headdress'] },
  idol: { group: 'any', label: 'Idol: crop top, pleated skirt, long socks', layers: ['briefs', 'socksThigh', 'cropTop', 'sleeves', 'shoes'], skirt: {}, acc: [] },
  casual: { group: 'any', label: 'Casual: T-shirt and shorts', layers: ['tee', 'shorts', 'socksAnkle', 'shoes'], acc: [] },
  sport: { group: 'any', label: 'Sport: tank top and short shorts', layers: ['tank', 'shortShorts', 'shoes'], acc: [] },
  school: { group: 'any', label: 'School: shirt, pleated skirt, knee socks', layers: ['briefs', 'socksKnee', 'tee', 'shoes'], skirt: {}, acc: [] },
  basic: { group: 'any', label: 'Basic: top and shorts only', layers: ['tank', 'shorts'], acc: [] },
};
export const PREMIUM_LABEL = 'Premium (female & anime)';
export const outfitGroup = (kit, torsoBody) => { const b = kit.bodies[torsoBody]; return b?.style === 'anime' && b?.base === 'female' ? 'anime' : b?.base === 'male' ? 'male' : 'female'; };
export const defaultOutfit = (kit, torsoBody) => ({ anime: 'a_magical', male: 'm_street', female: 'f_dress' }[outfitGroup(kit, torsoBody)]);

const toon = (o) => new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...o });
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** ctx: { kit, P (Blender axes), bones, body (SkinnedMesh), toMaster, fromMaster, pos, nrm, recipe } */
export function buildOutfit(ctx) {
  const { kit, P, bones, body, toMaster, pos, nrm, recipe } = ctx; const def = OUTFITS[recipe.outfit] || OUTFITS[defaultOutfit(kit, recipe.parts.Torso)];
  const B = (n) => bones[n][0], hz = B('leftUpperLeg')[2], sz = B('leftUpperArm')[2], sx = B('leftUpperArm')[0], H = sz - hz;
  const elbow = B('leftLowerArm')[0], wrist = B('leftHand')[0], knee = B('leftLowerLeg')[2], ankle = B('leftFoot')[2], neck = B('neck'), hipx = B('leftUpperLeg')[0];
  const main = recipe.clothing, accent = recipe.accent || '#f2efe9', dark = shade(main, 0.55);
  const pal = { main, accent, dark: def.group === 'premium' ? '#1e1b24' : dark, light: '#f6f1ea', metal: '#c9d0db', gold: '#d6b15a' };
  const isNeck = (m) => kit.parts[kit.partA[m]] === 'Neck';
  const region = new Uint8Array(kit.vertexCount);          // 0 torso, 1 arm, 2 leg, 3 foot, 4 head/neck, 5 hand
  for (let m = 0; m < kit.vertexCount; m++) {
    const p = kit.parts[kit.partA[m]] || '', ax = Math.abs(P[m * 3]), z = P[m * 3 + 2];
    region[m] = p.startsWith('Arm') ? 1 : p.startsWith('Hand') ? 5 : p.startsWith('Leg') ? 2 : p.startsWith('Foot') ? 3 : (p === 'Head' || p === 'Neck') ? 4
      : p === 'Torso' ? 0 : ax > sx + 0.05 ? (ax > wrist - 0.01 ? 5 : 1) : z < ankle + 0.03 ? 3 : z < hz - 0.08 ? 2 : z > neck[2] + 0.01 ? 4 : 0;
  }
  const kEdge = (z) => { const zv = hz + 0.52 * H, zt = neck[2] + 0.01; return 0.006 + 0.068 * Math.min(1, Math.max(0, (z - zv) / (zt - zv))); };
  const scoop = (x, y, z, r) => Math.hypot(x, (y - (neck[1] - 0.012)) * 0.9, z - (neck[2] + 0.012)) - r;      // neckline: outside a ball at the base of the neck
  // cover(x, y, z, |x|, region) in metres: positive = cloth here
  // looser cuts: extra room that grows away from where the garment hangs (shoulders for tops, hips for trousers)
  const drape = (k) => (y) => k * Math.min(1, Math.max(0, (sz - y) / H)), legRoom = (k) => (y) => k * Math.min(1, Math.max(0, (hz - 0.06 - y) / (hz - ankle)));
  const L = {
    cropTop: { smooth: 12, off: 0.0100, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.56 * H), scoop(x, y, z, 0.088), sx + 0.016 - ax) : r === 1 ? sx + 0.016 - ax : -1 },
    tank: { smooth: 12, clear: 0.0074, off: 0.0105, color: accent, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.20 * H), scoop(x, y, z, 0.092), sx + 0.012 - ax) : r === 1 ? sx + 0.012 - ax : -1 },
    tee: { smooth: 12, clear: 0.0074, loose: drape(0.010), off: 0.0105, color: accent, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.14 * H), scoop(x, y, z, 0.078)) : r === 1 ? sx + 0.105 - ax : -1 },
    sleeves: { off: 0.0065, color: main, f: (x, y, z, ax, r) => r === 1 ? Math.min(ax - (sx + 0.42 * (elbow - sx)), wrist - 0.004 - ax) : -1 },
    shorts: { off: 0.0056, color: main, f: (x, y, z, ax, r) => (r === 0 || r === 2) ? Math.min(hz + 0.20 * H - z, z - (hz - 0.115)) : -1 },
    shortShorts: { off: 0.0056, color: main, f: (x, y, z, ax, r) => (r === 0 || r === 2) ? Math.min(hz + 0.18 * H - z, z - (hz - 0.055)) : -1 },
    briefs: { off: 0.0045, color: dark, f: (x, y, z, ax, r) => (r === 0 || r === 2) ? Math.min(hz + 0.13 * H - z, z - (hz - 0.03)) : -1 },
    socksThigh: { off: 0.0042, color: accent, f: (x, y, z, ax, r) => r === 2 ? knee + 0.13 - z : r === 3 ? 1 : -1 },
    socksKnee: { off: 0.0042, color: accent, f: (x, y, z, ax, r) => r === 2 ? knee - 0.045 - z : r === 3 ? 1 : -1 },
    socksAnkle: { off: 0.0042, color: accent, f: (x, y, z, ax, r) => r === 2 ? ankle + 0.075 - z : r === 3 ? 1 : -1 },
    shirt: { smooth: 12, clear: 0.0074, loose: drape(0.008), off: 0.0100, color: accent, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.10 * H), scoop(x, y, z, 0.066)) : r === 1 ? wrist - 0.006 - ax : -1 },
    dressTop: { smooth: 12, clear: 0.0074, off: 0.0100, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.24 * H), scoop(x, y, z, 0.094), sx + 0.014 - ax) : r === 1 ? sx + 0.014 - ax : -1 },
    jacket: { smooth: 14, clear: 0.0125, loose: drape(0.022), off: 0.0150, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.06 * H), scoop(x, y, z, 0.072), y < neck[1] ? ax - 0.030 : 1) : r === 1 ? wrist - 0.012 - ax : -1 },
    cropJacket: { smooth: 14, clear: 0.0125, loose: drape(0.020), off: 0.0150, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.50 * H), scoop(x, y, z, 0.074), y < neck[1] ? ax - 0.034 : 1) : r === 1 ? wrist - 0.012 - ax : -1 },
    waistcoat: { smooth: 10, clear: 0.0125, off: 0.0148, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.16 * H), scoop(x, y, z, 0.105) + (y < neck[1] ? 0 : 0.03), sx + 0.004 - ax) : r === 1 ? sx + 0.004 - ax : -1 },
    trousers: { smooth: 8, clear: 0.0050, loose: legRoom(0.020), off: 0.0058, color: dark, f: (x, y, z, ax, r) => (r === 0 || r === 2 || r === 3) ? Math.min(hz + 0.20 * H - z, z - (ankle + 0.035)) : -1 },
    tights: { off: 0.0036, color: dark, f: (x, y, z, ax, r) => r === 0 ? hz + 0.14 * H - z : (r === 2 || r === 3) ? 1 : -1 },
    belt: { off: 0.0165, color: accent, f: (x, y, z, ax, r) => r === 0 ? 0.014 - Math.abs(z - (hz + 0.185 * H)) : -1 },
    wristbands: { off: 0.0085, color: accent, f: (x, y, z, ax, r) => r === 1 ? 0.016 - Math.abs(ax - (wrist - 0.03)) : -1 },
    blouse: { smooth: 12, clear: 0.0074, loose: drape(0.006), off: 0.0098, color: accent, f: (x, y, z, ax, r, m) => r === 0 ? z - (hz + 0.10 * H) : r === 1 ? wrist - 0.008 - ax : (r === 4 && isNeck(m)) ? neck[2] + 0.045 - z : -1 },
    longSleeves: { off: 0.0068, color: main, f: (x, y, z, ax, r) => r === 1 ? wrist - 0.006 - ax : -1 },
    corset: { smooth: 14, clear: 0.0185, off: 0.0195, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.12 * H), hz + 0.63 * H - z) : -1 },
    cuffs: { off: 0.0128, color: accent, f: (x, y, z, ax, r) => r === 1 ? 0.016 - Math.abs(ax - (wrist - 0.022)) : -1 },
    gloves: { off: 0.0082, color: dark, f: (x, y, z, ax, r) => r === 1 ? ax - (elbow + 0.02) : -1 },
    gauntlets: { smooth: 6, clear: 0.011, off: 0.0125, color: accent, f: (x, y, z, ax, r) => r === 1 ? Math.min(ax - (elbow + 0.08), wrist - 0.002 - ax) : -1 },
    boots: { smooth: 10, clear: 0.0085, off: 0.0105, color: dark, f: (x, y, z, ax, r) => r === 2 ? knee + 0.035 - z : r === 3 ? 1 : -1 },
    bootCuffs: { off: 0.0128, color: accent, f: (x, y, z, ax, r) => r === 2 ? 0.014 - Math.abs(z - (knee + 0.03)) : -1 },
    maryJanes: { smooth: 16, clear: 0.0085, off: 0.0125, color: dark, f: (x, y, z, ax, r) => (r === 2 || r === 3) ? ankle + 0.012 - z : -1 },
    garters: { off: 0.0068, color: accent, f: (x, y, z, ax, r) => r === 2 ? 0.0075 - Math.abs(z - (knee + 0.135)) : -1 },
    armorPlate: { smooth: 16, clear: 0.0165, off: 0.0185, color: accent, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.32 * H), hz + 0.84 * H - z, B('spine')[1] - 0.004 - y, scoop(x, y, z, 0.085)) : -1 },
    plateTrim: { smooth: 16, clear: 0.0185, off: 0.0205, color: accent, f: (x, y, z, ax, r) => r === 0 ? Math.min(0.0075 - Math.abs(z - (hz + 0.335 * H)), B('spine')[1] - 0.004 - y) : -1 },
    kimonoWrap: { smooth: 12, clear: 0.0074, loose: drape(0.006), off: 0.0102, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.04 * H), y < neck[1] ? ax - kEdge(z) : scoop(x, y, z, 0.066)) : r === 1 ? elbow + 0.02 - ax : -1 },
    kimonoArms: { smooth: 6, clear: 0.0074, off: 0.0102, color: main, f: (x, y, z, ax, r) => r === 1 ? elbow + 0.02 - ax : -1 },
    kimonoCollar: { smooth: 12, clear: 0.0112, off: 0.0124, color: accent, f: (x, y, z, ax, r) => r === 0 ? (y < neck[1] ? Math.min(0.0105 - Math.abs(ax - kEdge(z)), z - (hz + 0.5 * H)) : 0.0095 - Math.abs(scoop(x, y, z, 0.066))) : -1 },
    obi: { smooth: 14, clear: 0.0165, off: 0.0178, color: accent, f: (x, y, z, ax, r) => r === 0 ? 0.062 - Math.abs(z - (hz + 0.4 * H)) : -1 },
    obiCord: { smooth: 14, clear: 0.0195, off: 0.0205, color: accent, f: (x, y, z, ax, r) => r === 0 ? 0.0045 - Math.abs(z - (hz + 0.4 * H)) : -1 },
    idolTop: { smooth: 12, clear: 0.0074, off: 0.0102, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.5 * H), hz + 0.76 * H - z) : -1 },
    offShoulder: { smooth: 6, clear: 0.0115, off: 0.0135, color: accent, f: (x, y, z, ax, r) => r === 1 ? Math.min(ax - (sx + 0.03), sx + 0.1 - ax) : -1 },
    maidBodice: { smooth: 12, clear: 0.0074, loose: drape(0.006), off: 0.0100, color: main, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.10 * H), scoop(x, y, z, 0.06)) : r === 1 ? wrist - 0.01 - ax : -1 },
    collar: { smooth: 12, clear: 0.0118, off: 0.0128, color: accent, f: (x, y, z, ax, r) => (r === 0 || r === 4) ? Math.min(scoop(x, y, z, 0.06) + 0.003, 0.088 - (scoop(x, y, z, 0.06) + 0.06)) : -1 },
    apronBib: { smooth: 12, clear: 0.0122, off: 0.0134, color: accent, f: (x, y, z, ax, r) => r === 0 ? Math.min(z - (hz + 0.18 * H), hz + 0.66 * H - z, 0.062 - ax * (1 + 0.6 * Math.max(0, (z - (hz + 0.18 * H)) / H)), B('spine')[1] - 0.004 - y) : -1 },
    waistband: { smooth: 14, clear: 0.0175, off: 0.0185, color: accent, f: (x, y, z, ax, r) => r === 0 ? 0.017 - Math.abs(z - (hz + 0.205 * H)) : -1 },
    shoes: { smooth: 16, clear: 0.0085, off: 0.0125, color: dark, f: (x, y, z, ax, r) => (r === 2 || r === 3) ? ankle + 0.022 - z : -1 },
  };
  const out = [], n = pos.count; let nb = null;
  const neighbours = () => { if (nb) return nb; nb = Array.from({ length: kit.vertexCount }, () => []); const Q = kit.quadsA;
    for (let f = 0; f < Q.length; f += 4) for (let k = 0; k < 4; k++) { const a = Q[f + k], b = Q[f + (k + 1) % 4]; nb[a].push(b); nb[b].push(a); } return nb; };
  for (const spec of def.layers) {
    const [name, role] = spec.split(':'), l = L[name], cov = new Float32Array(kit.vertexCount), colour = role ? pal[role] : l.color;
    for (let m = 0; m < kit.vertexCount; m++) cov[m] = l.f(P[m * 3], P[m * 3 + 1], P[m * 3 + 2], Math.abs(P[m * 3]), region[m], m);
    const gp = new Float32Array(n * 3), col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const o = l.off + (l.loose ? l.loose(pos.getY(i)) : 0); gp[i * 3] = pos.getX(i) + nrm.getX(i) * o; gp[i * 3 + 1] = pos.getY(i) + nrm.getY(i) * o; gp[i * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * o; }
    if (l.smooth) {                                // cloth spans small body relief instead of tracing it: relax the shell, then keep it clear of the skin
      const N = neighbours(), fm = ctx.fromMaster, act = []; for (let m = 0; m < kit.vertexCount; m++) if (cov[m] > -0.03 && fm[m] >= 0) act.push(m);
      for (let it = 0; it < l.smooth; it++) { const nx = new Float32Array(act.length * 3);
        act.forEach((m, a) => { let x = 0, y = 0, z = 0, c = 0; for (const q of N[m]) { const g = fm[q]; if (g < 0) continue; x += gp[g * 3]; y += gp[g * 3 + 1]; z += gp[g * 3 + 2]; c++; } const g = fm[m];
          nx[a * 3] = c ? gp[g * 3] * 0.4 + (x / c) * 0.6 : gp[g * 3]; nx[a * 3 + 1] = c ? gp[g * 3 + 1] * 0.4 + (y / c) * 0.6 : gp[g * 3 + 1]; nx[a * 3 + 2] = c ? gp[g * 3 + 2] * 0.4 + (z / c) * 0.6 : gp[g * 3 + 2]; });
        act.forEach((m, a) => { const g = fm[m]; let x = nx[a * 3], y = nx[a * 3 + 1], z = nx[a * 3 + 2];
          const d = (x - pos.getX(g)) * nrm.getX(g) + (y - pos.getY(g)) * nrm.getY(g) + (z - pos.getZ(g)) * nrm.getZ(g), need = Math.max(l.off * 0.35, l.clear || 0) + (l.loose ? l.loose(pos.getY(g)) * 0.8 : 0) - d;
          if (need > 0) { x += nrm.getX(g) * need; y += nrm.getY(g) * need; z += nrm.getZ(g) * need; } gp[g * 3] = x; gp[g * 3 + 1] = y; gp[g * 3 + 2] = z; }); }
    }
    for (let i = 0; i < n; i++) { const c = cov[toMaster[i]];
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = 0.5 + Math.max(-1, Math.min(1, c)) * 20; }       // 0.5 = the hem; kept linear so the cut is straight
    const I = ctx.fullIndex, idx = [];
    for (let t = 0; t < I.length; t += 3) if (cov[toMaster[I[t]]] > 0 || cov[toMaster[I[t + 1]]] > 0 || cov[toMaster[I[t + 2]]] > 0) idx.push(I[t], I[t + 1], I[t + 2]);
    if (!idx.length) continue;
    { const cm = ctx.vrm.__coverMax ||= new Float32Array(kit.vertexCount).fill(-1); for (let m = 0; m < kit.vertexCount; m++) if (cov[m] > cm[m]) cm[m] = cov[m]; }      // how deep under cloth each body vertex is (the VRM baker drops skin that cannot be seen)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(gp, 3)); g.setAttribute('normal', body.geometry.attributes.normal);
    const ownNormals = !!l.smooth;
    g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setAttribute('skinIndex', body.geometry.attributes.skinIndex); g.setAttribute('skinWeight', body.geometry.attributes.skinWeight); g.setIndex(idx);
    if (ownNormals) { const full = g.clone(); full.setIndex(I); full.deleteAttribute('normal'); full.computeVertexNormals(); g.setAttribute('normal', full.attributes.normal); }
    const mesh = new THREE.SkinnedMesh(g, toon({ color: colour, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })); mesh.name = 'Outfit_' + name; mesh.frustumCulled = false;
    body.parent.add(mesh); mesh.bind(body.skeleton, body.bindMatrix); out.push(mesh);
  }
  if (def.skirt) out.push(buildSkirt(ctx, { hz, H, hipx, main, accent, ...def.skirt }));
  (def.skirts || []).forEach((sp, i) => out.push(buildSkirt(ctx, { hz, H, hipx, ...sp, main: pal[sp.color] || main, accent: sp.band ? pal[sp.band] : null, name: 'skirt' + i })));
  if (def.extras) try { out.push(...buildExtras(ctx, def.extras, pal)); } catch (e) { console.warn('outfit extras', e); }
  return out;
}

/** Pleated skirt generated around the stitched hips: clears the body everywhere, flares to the hem, follows hips and thighs. */
function buildSkirt(ctx, { hz, H, main, accent, len = 0.185, flare = 0.085, pleat = 0.0065, top: waist = 0.17, shape = 0.85, ruffle = 0, waves = 24, outset = 0, arc = null, name = 'skirt' }) {
  const { kit, P, bones, body, vrm } = ctx; const S = 64, SC = arc ? 72 : ruffle ? 128 : 64, F = [0, 0.035, 0.16, 0.3, 0.44, 0.58, 0.72, 0.86, 0.955, 1], R = F.length, zTop = hz + waist * H, zHem = hz - len, cy = bones.hips[0][1];
  const prof = Array.from({ length: R }, () => new Float32Array(S));
  for (let m = 0; m < kit.vertexCount; m++) {              // how far the body reaches in each direction at each height
    const p = kit.parts[kit.partA[m]] || 'Torso'; if (!(p === 'Torso' || p.startsWith('Leg'))) continue;
    const x = P[m * 3], y = P[m * 3 + 1] - cy, z = P[m * 3 + 2]; if (z > zTop + 0.04 || z < zHem - 0.04) continue;
    const s = Math.round(((Math.atan2(y, x) / (2 * Math.PI)) + 1) * S) % S, r = Math.hypot(x, y);
    for (let k = 0; k < R; k++) { const zk = zTop + (zHem - zTop) * F[k]; if (Math.abs(z - zk) < 0.03) for (let d = -1; d <= 1; d++) { const q = (s + d + S) % S; if (r > prof[k][q]) prof[k][q] = r; } }
  }
  for (let k = 1; k < R; k++) for (let s = 0; s < S; s++) prof[k][s] = Math.max(prof[k][s], prof[k - 1][s] * 0.985);        // cloth hangs: never narrower than the row above
  const smooth = (a) => { const o = new Float32Array(S); for (let s = 0; s < S; s++) { let t = 0; for (let d = -3; d <= 3; d++) t += a[(s + d + S) % S]; o[s] = Math.max(a[s], t / 7); } return o; };
  const pos = [], col = [], si = [], sw = [], idx = [], sk = body.skeleton, bi = (n) => sk.bones.indexOf(vrm.humanoid.getRawBoneNode(n)), hip = bi('hips'), ll = bi('leftUpperLeg'), rl = bi('rightUpperLeg');
  const top = smooth(prof[0]), A = new THREE.Color(accent || main), at = (a, th) => { const f = (((th / (2 * Math.PI)) % 1) + 1) % 1 * S, i = Math.floor(f) % S, q = (i + 1) % S; return a[i] + (a[q] - a[i]) * (f - Math.floor(f)); };
  const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let k = 0; k < R; k++) { const f = F[k], zk0 = zTop + (zHem - zTop) * f, pr = smooth(prof[k]);
    for (let s = 0; s < SC; s++) { const th = arc ? arc[0] + (arc[1] - arc[0]) * s / (SC - 1) : s / SC * 2 * Math.PI, pl = ((s % 4) < 2 ? 1 : -1) * pleat * f, ru = ruffle * sm((f - 0.5) / 0.5);
      const og = outset * sm(f / 0.3), r = Math.max(at(pr, th) + 0.015 + og, at(top, th) + 0.014 + og + flare * Math.pow(f, shape)) + pl + ru * Math.sin(waves * th), x = r * Math.cos(th), y = r * Math.sin(th) + cy, zk = zk0 - ru * 0.7 * Math.cos(waves * th);
      pos.push(x, zk, -y); const band = accent && (k === 0 || k === R - 1), M = new THREE.Color(main); col.push(band ? A.r / Math.max(M.r, 0.02) : 1, band ? A.g / Math.max(M.g, 0.02) : 1, band ? A.b / Math.max(M.b, 0.02) : 1);
      const lw = 0.94 * Math.pow(f, 0.8), side = 0.5 + 0.5 * Math.tanh(x / 0.035); si.push(hip, ll, rl, 0); sw.push(1 - lw, lw * side, lw * (1 - side), 0); } }
  for (let k = 0; k < R - 1; k++) for (let s = 0; s < (arc ? SC - 1 : SC); s++) { const a = k * SC + s, b = k * SC + (s + 1) % SC, c = a + SC, d = b + SC; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, toon({ color: main, side: THREE.DoubleSide, vertexColors: true })); mesh.name = 'Outfit_' + name; mesh.frustumCulled = false;
  body.parent.add(mesh); mesh.bind(sk, body.bindMatrix); return mesh;
}
