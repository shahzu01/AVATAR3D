// Painted textures for Character Maker parts. The kit's pieces come without texture coordinates or artwork, so
// this module gives them both: coordinates projected from the shape of the piece, and a texture painted in code
// in the piece's own colours. Everything here ends up in the baked stream file and exported .vrm as ordinary textures.
import * as THREE from 'three';

const cache = new Map();
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hex = (c) => '#' + c.getHexString();
const tint = (base, k, toward = null, t = 0) => { const c = new THREE.Color(base).multiplyScalar(k); if (toward) c.lerp(new THREE.Color(toward), t); return hex(c); };

/** The anime shadow colour for a base colour: darker, a little more saturated, and nudged toward violet-red rather than grey. */
export function shadeOf(base) {
  const c = new THREE.Color(base), hsl = {}; c.getHSL(hsl);
  const hueShift = hsl.h > 0.08 && hsl.h < 0.55 ? 0.02 : -0.015;          // warm and cool colours both lean toward the reds of a painted shadow
  return new THREE.Color().setHSL((hsl.h + hueShift + 1) % 1, Math.min(1, hsl.s * 1.18 + 0.06), hsl.l * 0.62);
}

// ------------------------------------------------------------------ hair
/** A hair texture: strands running down (v), around the head (u, wraps), darker roots, and the anime shine ring.
 *  Painted twice from the same seed: once in the hair colour, once in its shadow colour (the shade texture of the stream file). */
function hairTexture(color, ringV, ringH) {
  const key = `hair:${color}:${ringV.toFixed(3)}:${ringH.toFixed(3)}`; if (cache.has(key)) return cache.get(key);
  const W = 1024, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), r = rnd(7919);
  const base = new THREE.Color(color), lum = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
  // body colour with a soft root-to-tip gradient (darker at the parting, a touch lighter toward the ends)
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, tint(color, 0.8)); grad.addColorStop(0.18, color); grad.addColorStop(1, tint(color, 1.06, '#ffffff', 0.05));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const strand = (x, y0, len, width, style) => { g.strokeStyle = style; g.lineWidth = width; g.beginPath();
    for (const dx of [-W, 0, W]) { g.moveTo(x + dx, y0); const wob = (r() - 0.5) * 10; g.bezierCurveTo(x + dx + wob, y0 + len * 0.33, x + dx - wob, y0 + len * 0.66, x + dx + wob * 0.4, y0 + len); } g.stroke(); };
  // strand lines: dark grooves between locks, and lighter fibres on them
  const dark = tint(color, 0.55, '#2a1430', 0.15), light = tint(color, 1.25, '#ffffff', lum < 0.25 ? 0.18 : 0.1);
  for (let i = 0; i < 150; i++) { const x = r() * W; g.globalAlpha = 0.18 + r() * 0.25; strand(x, -20, H * (0.55 + r() * 0.6), 1.5 + r() * 2.5, dark); }
  for (let i = 0; i < 260; i++) { const x = r() * W; g.globalAlpha = 0.08 + r() * 0.14; strand(x, r() * H * 0.3, H * (0.3 + r() * 0.5), 1 + r() * 1.5, light); }
  // shadow just under the shine ring
  const y = ringV * H, band = H * ringH;
  g.globalAlpha = 0.28; const sh = g.createLinearGradient(0, y, 0, y + band * 3.2); sh.addColorStop(0, dark); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, y + band * 0.6, W, band * 3);
  // the shine ring: jagged highlight streaks, one per lock, brightest in the middle
  const hi = tint(color, 1.0, '#ffffff', lum < 0.2 ? 0.45 : 0.6), core = tint(color, 1.0, '#ffffff', 0.85);
  g.globalAlpha = 0.3; const glow = g.createLinearGradient(0, y - band, 0, y + band); glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(0.5, hi); glow.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = glow; g.fillRect(0, y - band, W, band * 2);
  for (let x = 0; x < W; x += 4 + r() * 7) { const h = band * (0.5 + r() * 1.3), yy = y - h * (0.35 + r() * 0.3), w = 4 + r() * 9;
    g.globalAlpha = 0.75 + r() * 0.25; g.fillStyle = hi; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy + h * 0.15); g.lineTo(x + w * 0.5, yy + h); g.closePath(); g.fill();
    if (r() < 0.45) { g.globalAlpha = 0.7; g.fillStyle = core; g.fillRect(x + w * 0.3, yy + h * 0.25, Math.max(1.5, w * 0.25), h * 0.45); } }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.name = 'hair'; t.needsUpdate = true;
  cache.set(key, t); return t;
}

/** Give a hair root (a static mesh group attached to the head) projected texture coordinates and a painted texture. */
export function paintHair(root, color) {
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); }); if (!meshes.length) return false;
  root.updateMatrixWorld(true); const toRoot = new THREE.Matrix4(), inv = root.matrixWorld.clone().invert();
  // the crown and the axis the hair hangs around, in the root's space
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const m of meshes) { toRoot.multiplyMatrices(inv, m.matrixWorld); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(toRoot)); }
  const top = box.max.y, Wd = Math.max(box.max.x - box.min.x, 0.05), L = Math.max(top - box.min.y, Wd * 1.2);
  let cx = 0, cz = 0, n = 0;
  for (const m of meshes) { toRoot.multiplyMatrices(inv, m.matrixWorld); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(toRoot); if (v.y > top - Wd * 0.45) { cx += v.x; cz += v.z; n++; } } }
  cx /= n || 1; cz /= n || 1;
  const ringV = Math.min(0.4, (Wd * 0.24) / L), ringH = Math.min(0.12, (Wd * 0.085) / L), tex = hairTexture(color, ringV, ringH), shadeTex = hairTexture(hex(shadeOf(color)), ringV, ringH);
  for (const m of meshes) {
    toRoot.multiplyMatrices(inv, m.matrixWorld);
    const g = m.geometry = m.geometry.clone();          // the loaded hair may be shared between characters
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(toRoot); uv[i * 2] = (Math.atan2(v.x - cx, v.z - cz) / (Math.PI * 2) + 1.5) % 1; uv[i * 2 + 1] = Math.min(1, (top - v.y) / L); }
    if (!g.index) for (let t = 0; t < p.count; t += 3) { const us = [uv[t * 2], uv[t * 2 + 2], uv[t * 2 + 4]]; if (Math.max(...us) - Math.min(...us) > 0.5) for (let k = 0; k < 3; k++) if (us[k] < 0.5) uv[(t + k) * 2] += 1; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (g.index) fixSeam(g);
    m.userData.outlineWidth = 0.001;
    for (const mat of [].concat(m.material)) { mat.userData.inkBase = mat.color.clone(); mat.userData.shadeMap = shadeTex; mat.map = tex; mat.color.set('#ffffff'); mat.needsUpdate = true; }
  }
  return true;
}

/** Triangles that cross the u = 0/1 line get their own copies of the vertices on the low side, shifted by +1, so the texture
 *  repeats across the seam instead of squeezing the whole picture into one triangle. */
function fixSeam(g) {
  const idx = g.index.array, uv = g.attributes.uv, extra = new Map(), add = [];
  const names = Object.keys(g.attributes); let count = g.attributes.position.count;
  for (let t = 0; t < idx.length; t += 3) {
    const us = [0, 1, 2].map((k) => uv.getX(idx[t + k])); if (Math.max(...us) - Math.min(...us) < 0.5) continue;
    for (let k = 0; k < 3; k++) if (us[k] < 0.5) { const a = idx[t + k]; if (!extra.has(a)) { extra.set(a, count++); add.push(a); } idx[t + k] = extra.get(a); }
  }
  if (!add.length) return;
  for (const n of names) { const at = g.attributes[n], s = at.itemSize, arr = new at.array.constructor((at.count + add.length) * s); arr.set(at.array);
    add.forEach((a, j) => { for (let c = 0; c < s; c++) arr[(at.count + j) * s + c] = at.array[a * s + c]; if (n === 'uv') arr[(at.count + j) * s] += 1; });
    g.setAttribute(n, new THREE.BufferAttribute(arr, s, at.normalized)); }
  if (idx.constructor === Uint16Array && count > 65535) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1)); else g.index.needsUpdate = true;
}

// ------------------------------------------------------------------ shading
/** Anime shading for the toon pieces of a character: shadows take a deeper, warmer version of each colour instead of
 *  going grey, and a soft rim of light runs along the edges facing away from the viewer. (The stream file gets the same
 *  look through its MToon shade textures and rim settings, see bake.js.) */
export function animeShading(root, { rim = 0.22 } = {}) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.name === 'Outline') return;
    for (let p = o; p; p = p.parent) if (p.name === 'HeadModel') return;          // a complete head keeps its own look
    for (const m of [].concat(o.material)) {
      if (!m?.isMeshToonMaterial || m.userData.animeShading) continue;
      const base = m.userData.inkBase || m.color, sh = shadeOf(base), tintV = new THREE.Vector3(...['r', 'g', 'b'].map((k) => Math.min(1, sh[k] / Math.max(0.02, base[k]))));
      const uni = { uShadeTint: { value: tintV }, uRim: { value: rim } }, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
      m.onBeforeCompile = (s, r) => { prev?.(s, r); Object.assign(s.uniforms, uni);
        s.fragmentShader = 'uniform vec3 uShadeTint; uniform float uRim;\n' + s.fragmentShader
          .replace('#include <lights_toon_pars_fragment>', `#include <lights_toon_pars_fragment>
            #undef RE_Direct
            void RE_Direct_Anime( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
              float g = getGradientIrradiance( geometryNormal, directLight.direction ).r;
              vec3 ramp = mix( uShadeTint, vec3( 1.0 ), smoothstep( 0.38, 0.92, g ) );
              reflectedLight.directDiffuse += ramp * directLight.color * BRDF_Lambert( material.diffuseColor );
            }
            #define RE_Direct RE_Direct_Anime`)
          .replace('#include <opaque_fragment>', `float rimF = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 4.0 );
            outgoingLight += diffuseColor.rgb * rimF * uRim;
            #include <opaque_fragment>`); };
      m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|kael-anime';
      m.userData.animeShading = true; m.needsUpdate = true; n++;
    }
  });
  return n;
}
