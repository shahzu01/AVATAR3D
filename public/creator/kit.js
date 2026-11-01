// Head kit made in Blender (see kit/heads.json + kit/heads.bin): sculpted head shapes per species, baked as
// radial shape maps for short / normal / long snouts, plus soft muzzle and cheek-fluff masks and an animal nose.
// Loaded once (top-level await) so every module that builds characters gets it; if it can't load, the
// Creator falls back to its built-in procedural heads.
let KIT = null;
const skip = typeof location !== 'undefined' && /[?&]nokit\b/.test(location.search);   // ?nokit compares with the old heads
if (!skip) try {
  const [meta, buf] = await Promise.all([
    fetch(new URL('./kit/heads.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(new URL('./kit/heads.bin', import.meta.url)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]);
  if (buf.byteLength >= meta.bytes) KIT = { meta, buf };
} catch (e) {
  if (typeof window !== 'undefined') console.warn('Head kit not loaded, using procedural heads.', e);
}

const TAU = Math.PI * 2;
/** Bilinear sampler for a (nu x nv) sphere grid; theta wraps around, phi runs pole to pole. */
function sampler(arr, nu, nv, scale) {
  return (dir) => {
    const th = (Math.atan2(dir.x, dir.z) + TAU) % TAU, ph = Math.acos(Math.max(-1, Math.min(1, dir.y)));
    const fu = (th / TAU) * nu, fv = (ph / Math.PI) * (nv - 1);
    const i0 = Math.floor(fu) % nu, i1 = (i0 + 1) % nu, j0 = Math.min(nv - 2, Math.floor(fv)), u = fu - Math.floor(fu), v = fv - j0;
    const a = arr[j0 * nu + i0], b = arr[j0 * nu + i1], c = arr[(j0 + 1) * nu + i0], d = arr[(j0 + 1) * nu + i1];
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * scale;
  };
}

const cache = new Map();
/** Head sampler for a species, or null if the kit isn't available. */
export function kitHead(species) {
  if (!KIT) return null;
  if (cache.has(species)) return cache.get(species);
  const { meta, buf } = KIT, off = meta.species[species];
  if (off === undefined) return null;
  const n = meta.nu * meta.nv, rs = meta.rmax / 65535;
  const radius = [0, 1, 2].map((k) => sampler(new Uint16Array(buf, off + k * n * 2, n), meta.nu, meta.nv, rs));
  const mOff = off + 3 * n * 2;
  const out = {
    /** radius (in species-head units) for a unit direction and a 0..1 snout setting */
    radius: (dir, muzzle) => {
      const m = Math.max(0, Math.min(1, muzzle)) * 2, k = Math.min(1, Math.floor(m)), t = m - k;
      return radius[k](dir) * (1 - t) + radius[k + 1](dir) * t;
    },
    muzzle: sampler(new Uint8Array(buf, mOff, n), meta.nu, meta.nv, 1 / 255),
    cheek: sampler(new Uint8Array(buf, mOff + n, n), meta.nu, meta.nv, 1 / 255),
  };
  cache.set(species, out);
  return out;
}

let noseS = null;
/** Animal nose radius for a unit direction (nose half-width = 1), or null without the kit. */
export function kitNose() {
  if (!KIT) return null;
  if (!noseS) { const { meta, buf } = KIT, N = meta.nose; noseS = sampler(new Uint16Array(buf, N.offset, N.nu * N.nv), N.nu, N.nv, meta.rmax / 65535); }
  return noseS;
}
export const kitLoaded = () => !!KIT;

// ------------------------------------------------------------------ body kit (kit/bodies.json + kit/bodies.bin)
// Sculpted torso, arms, legs, palms and bare feet, baked as cylindrical shape maps: for each height h (0..1)
// along a part and angle psi around it, how far the sculpted surface sits out from the plain tube.
let BODY = null;
const skipBody = skip || (typeof location !== 'undefined' && /[?&]nobody\b/.test(location.search));   // ?nobody compares with the old bodies
if (!skipBody) try {
  const [meta, buf] = await Promise.all([
    fetch(new URL('./kit/bodies.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(new URL('./kit/bodies.bin', import.meta.url)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]);
  if (buf.byteLength >= meta.bytes) BODY = { meta, buf };
} catch (e) {
  if (typeof window !== 'undefined') console.warn('Body kit not loaded, using procedural bodies.', e);
}
function cylSampler(arr, nu, nv, scale) {
  return (h, psi) => {
    const fu = ((((psi / TAU) % 1) + 1) % 1) * nu, fv = Math.max(0, Math.min(1, h)) * (nv - 1);
    const i0 = Math.floor(fu) % nu, i1 = (i0 + 1) % nu, j0 = Math.min(nv - 2, Math.floor(fv)), u = fu - Math.floor(fu), v = fv - j0;
    const a = arr[j0 * nu + i0], b = arr[j0 * nu + i1], c = arr[(j0 + 1) * nu + i0], d = arr[(j0 + 1) * nu + i1];
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * scale;
  };
}
const bodyCache = new Map();
/** Body shape maps for a style ('human' | 'animal'), or null without the kit.
 *  Returns part(name) -> { skin(h, psi, kb, kc), cloth(h, psi, kb, kc) } where kb / kc blend in the build and chest shapes. */
export function kitBody(style) {
  if (!BODY) return null;
  if (bodyCache.has(style)) return bodyCache.get(style);
  const { meta, buf } = BODY, parts = {};
  for (const name of ['torso', 'arm', 'leg', 'palm', 'foot']) {
    const e = meta.parts[`${style}.${name}`]; if (!e) return null;
    const n = e.nu * e.nv, S = (key) => cylSampler(new Int8Array(buf, e.offsets[key], n), e.nu, e.nv, meta.scale);
    const sk = ['base', 'build', 'chest'].map((c) => S(`skin.${c}`)), cl = ['base', 'build', 'chest'].map((c) => S(`cloth.${c}`));
    const skin = (h, psi, kb = 0, kc = 0) => sk[0](h, psi) + kb * sk[1](h, psi) + kc * sk[2](h, psi);
    parts[name] = { skin, cloth: (h, psi, kb = 0, kc = 0) => Math.max(cl[0](h, psi) + kb * cl[1](h, psi) + kc * cl[2](h, psi), skin(h, psi, kb, kc) + 0.004) };
  }
  bodyCache.set(style, parts);
  return parts;
}
