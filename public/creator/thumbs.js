// Thumbnails for the creator: face parts are drawn instantly with the real face renderer;
// 3D parts (species, hair, outfits, accessories...) are rendered on your own character in the background and cached.
import * as THREE from 'three';
import { FaceDrawer } from './face.js';
import { SPECIES } from './catalog.js';
import { buildCharacter } from './build.js';

// ------------------------------------------------------------------ drawn face-part thumbnails
const FACE_REGION = {   // [centre-y as fraction of ry, size as fraction of rx]
  eyes: (L) => [L.eyeY, L.rx * 1.25], brows: (L) => [L.eyeY + L.eyeH * 0.55, L.rx * 1.25], mouth: (L) => [L.mouthY + L.eyeH * 0.05, L.rx * 0.75],
  nose: (L) => [(L.noseY + L.mouthY) / 2, L.rx * 0.8], markings: (L) => [L.eyeY - L.eyeH * 0.4, L.rx * 2.1],
};
const faceCache = new Map();
export function faceThumb(recipe, kind, size = 150) {
  const sp = SPECIES[recipe.species] || SPECIES.human;
  const key = JSON.stringify([kind, recipe.species, recipe.face, recipe.colors]);
  if (faceCache.has(key)) return faceCache.get(key);
  const body = { head: { rx: 0.17 * sp.head[0], ry: 0.16 * sp.head[1], rz: 0.16 }, headC: { x: 0, y: 0, z: 0 } };
  const probe = new FaceDrawer(recipe, body, { x0: -1, x1: 1, y0: -1, y1: 1 }, sp, 8);
  const [cy, s] = FACE_REGION[kind](probe.L);
  probe.texture.dispose();
  const region = { x0: -s / 2, x1: s / 2, y0: cy - s / 2, y1: cy + s / 2 };
  const fd = new FaceDrawer(recipe, body, region, sp, size * 2);
  fd.update({}, null);
  const out = document.createElement('canvas'); out.width = out.height = size * 2;
  const c = out.getContext('2d');
  // skin / fur backdrop with soft light, like the head surface
  const base = recipe.colors?.skin || '#e8c4a8';
  const g = c.createRadialGradient(size * 0.7, size * 0.55, size * 0.2, size, size, size * 1.5);
  g.addColorStop(0, shade(base, 0.08)); g.addColorStop(1, shade(base, -0.12));
  c.fillStyle = g; c.fillRect(0, 0, out.width, out.height);
  if (sp.style === 'animal' && recipe.face?.markings !== 'mask') {          // muzzle tone around the mouth
    if (kind === 'mouth' || kind === 'nose') { c.fillStyle = recipe.colors?.fur2 || '#fff'; c.beginPath(); c.ellipse(size, size * 1.15, size * 0.95, size * 0.8, 0, 0, 7); c.fill(); }
  }
  c.drawImage(fd.canvas, 0, 0);
  if ((kind === 'nose' || kind === 'mouth') && ((recipe.face?.nose === 'auto' && sp.nose === 'animal') || recipe.face?.nose === 'animal' || recipe.face?.nose === 'button')) {
    const ny = size * 2 * (1 - (probe.L.noseY - region.y0) / s);
    c.fillStyle = recipe.face?.nose === 'button' ? shade(base, -0.06) : (recipe.colors?.nose || '#222');
    c.beginPath(); c.ellipse(size, ny, size * 0.32 * (0.17 / s * 0.8), size * 0.2 * (0.17 / s * 0.8), 0, 0, 7); c.fill();
  }
  fd.texture.dispose();
  const url = out.toDataURL('image/png');
  faceCache.set(key, url);
  return url;
}

// ------------------------------------------------------------------ rendered 3D thumbnails
let R = null;
function renderer() {
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(200, 200, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight('#ffffff', 1.7); key.position.set(-1.2, 2.2, 2.5);
  const rim = new THREE.DirectionalLight('#b48bff', 1.0); rim.position.set(1.5, 1.8, -2.5);
  scene.add(key, rim, new THREE.HemisphereLight('#ffffff', '#444455', 1.0));
  R = { renderer, scene, camera: new THREE.PerspectiveCamera(26, 1, 0.02, 30) };
  return R;
}
const memo = new Map();
const STORE = 'kaelthumb6:';   // bump when character geometry changes so cached tiles are re-rendered
const lsGet = (k) => { try { return localStorage.getItem(STORE + k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(STORE + k, v); } catch { /* full or blocked: memory cache still works */ } };
export function cachedThumb(key) { return memo.get(key) || lsGet(key) || null; }

/** framing: 'bust' | 'head' | 'torso' | 'legs' | 'feet' | 'back' | 'full' ; view angle in radians (0 = front). */
function shoot(recipe, framing, angle) {
  const { renderer: rr, scene, camera } = renderer();
  const v = buildCharacter(recipe, { faceSize: 256 });
  scene.add(v.scene);
  const B = (n) => v.humanoid.getNormalizedBoneNode(n);
  const aa = (ax, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0), a);
  B('leftUpperArm').quaternion.copy(aa('z', -1.2)); B('rightUpperArm').quaternion.copy(aa('z', 1.2));
  for (let i = 0; i < 20; i++) v.update(1 / 30);
  v.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(v.scene), h = box.max.y - box.min.y;
  const head = new THREE.Vector3(); B('head').getWorldPosition(head);
  const top = Math.min(box.max.y, head.y + 0.6);
  const hips = new THREE.Vector3(); B('hips').getWorldPosition(hips);
  let target, dist;
  switch (framing) {
    case 'head': target = new THREE.Vector3(0, (head.y + top) / 2, 0); dist = (top - head.y + 0.1) * 3.1; break;
    case 'torso': target = new THREE.Vector3(0, (head.y + hips.y) / 2 - 0.02, 0); dist = (head.y - hips.y + 0.25) * 2.6; break;
    case 'legs': target = new THREE.Vector3(0, hips.y * 0.62, 0); dist = hips.y * 2.9; break;
    case 'feet': target = new THREE.Vector3(0, 0.1, 0.03); dist = 0.75; break;
    case 'back': target = new THREE.Vector3(0, hips.y + 0.08, 0); dist = (head.y - hips.y + 0.5) * 2.2; break;
    case 'full': target = new THREE.Vector3(0, h * 0.5, 0); dist = h * 2.25; break;
    default: target = new THREE.Vector3(0, (top + head.y - 0.32) / 2, 0); dist = (top - head.y + 0.4) * 2.5;
  }
  camera.position.set(target.x + Math.sin(angle) * dist, target.y + dist * 0.06, target.z + Math.cos(angle) * dist);
  camera.lookAt(target);
  rr.render(scene, camera);
  const url = rr.domElement.toDataURL('image/png');
  scene.remove(v.scene);
  v.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { m.map?.dispose(); m.dispose(); } });
  return url;
}

// background queue: newest requests first, one render at a time, yielding to the page between renders
let queue = [], busy = false;
export function requestThumb(key, recipe, framing, angle, onDone) {
  const hit = cachedThumb(key);
  if (hit) { memo.set(key, hit); onDone(hit); return; }
  queue = queue.filter((j) => j.key !== key);
  queue.push({ key, recipe, framing, angle, onDone });
  pump();
}
export function clearThumbQueue() { queue = []; }
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const j = queue.shift();
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
    try { const url = shoot(j.recipe, j.framing, j.angle); memo.set(j.key, url); lsSet(j.key, url); j.onDone(url); } catch (e) { console.warn('thumbnail failed', e); }
  }
  busy = false;
}
export const thumbsBusy = () => busy || queue.length > 0;

function shade(hex, amt) { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt))); return '#' + c.getHexString(); }
