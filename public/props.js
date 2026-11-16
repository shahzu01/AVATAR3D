// Props and scenes on the stream: things the character holds or wears (attached to a hand, the head, the chest or the
// hips, so they follow every move) and what stands behind it (a built-in set, your own 3D room, or a picture).
// Built-ins are made here from simple shapes, so they need no files. Your own come from the Studio as .glb models or
// pictures, stored next to settings.json (props/), and checked by the server before they are kept.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
const glow = (color, k = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const grp = (...c) => { const g = new THREE.Group(); g.add(...c); return g; };
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// ---------------------------------------------------------------- built-in props
// Each is built with its grip at the origin; `fit` is where it sits by default (bone, position in metres, rotation in degrees).
export const BUILTIN_PROPS = {
  mic: { label: 'Microphone', fit: { bone: 'rightHand', pos: [-0.075, 0.0, 0.03], rot: [0, 0, -90] },
    make: () => grp(M(new THREE.CylinderGeometry(0.014, 0.011, 0.16, 20), std('#1d1d24', { metalness: 0.6, roughness: 0.3 }), 0, 0.02, 0),
      M(new THREE.SphereGeometry(0.03, 24, 16), std('#9aa0ad', { metalness: 0.8, roughness: 0.35, wireframe: false }), 0, 0.125, 0), M(new THREE.TorusGeometry(0.03, 0.004, 8, 28), std('#ff5fa2'), 0, 0.105, 0)) },
  mug: { label: 'Coffee mug', fit: { bone: 'rightHand', pos: [-0.08, -0.02, 0.04], rot: [0, 0, 0] },
    make: () => { const cup = M(new THREE.CylinderGeometry(0.04, 0.036, 0.095, 28, 1, true), std('#f2efe9', { side: THREE.DoubleSide })); const bottom = M(new THREE.CircleGeometry(0.036, 28), std('#f2efe9'), 0, -0.047, 0); bottom.rotation.x = -Math.PI / 2;
      const coffee = M(new THREE.CircleGeometry(0.037, 28), std('#4a2c1d', { roughness: 0.2 }), 0, 0.035, 0); coffee.rotation.x = -Math.PI / 2;
      const handle = M(new THREE.TorusGeometry(0.024, 0.007, 10, 24, Math.PI), std('#f2efe9'), 0.04, 0, 0); handle.rotation.z = -Math.PI / 2;
      const band = M(new THREE.CylinderGeometry(0.0405, 0.0395, 0.02, 28, 1, true), std('#ff5fa2'), 0, 0.01, 0); return grp(cup, bottom, coffee, handle, band); } },
  lightstick: { label: 'Lightstick', fit: { bone: 'rightHand', pos: [-0.07, 0.0, 0.03], rot: [0, 0, -90] }, glowing: true,
    make: () => grp(M(new THREE.CylinderGeometry(0.013, 0.013, 0.17, 16), std('#2b2c36')), M(new THREE.CylinderGeometry(0.022, 0.017, 0.16, 20), glow('#ff5fa2', 2.4), 0, 0.165, 0),
      M(new THREE.SphereGeometry(0.022, 20, 12), glow('#ffd1e6', 3), 0, 0.245, 0)) },
  plush: { label: 'Plushie', fit: { bone: 'leftHand', pos: [0.08, -0.02, 0.06], rot: [0, 20, 0] },
    make: () => { const fur = std('#c98a5a', { roughness: 0.95 }), light = std('#f0d2b0', { roughness: 0.95 }), ink = std('#1d1416');
      const body = M(new THREE.SphereGeometry(0.06, 24, 16), fur, 0, 0, 0); body.scale.set(1, 1.05, 0.9);
      const head = M(new THREE.SphereGeometry(0.05, 24, 16), fur, 0, 0.085, 0.005), snout = M(new THREE.SphereGeometry(0.02, 16, 10), light, 0, 0.075, 0.045);
      const ears = [-1, 1].map((s) => M(new THREE.SphereGeometry(0.018, 12, 8), fur, s * 0.035, 0.125, 0)), eyes = [-1, 1].map((s) => M(new THREE.SphereGeometry(0.006, 8, 6), ink, s * 0.018, 0.095, 0.045));
      return grp(body, head, snout, ...ears, ...eyes, M(new THREE.SphereGeometry(0.005, 8, 6), ink, 0, 0.082, 0.064)); } },
  sign: { label: '"Thank you!" sign', fit: { bone: 'rightHand', pos: [-0.07, 0.02, 0.03], rot: [0, 0, -90] },
    make: () => { const tex = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#fff6fb'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff5fa2'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18); g.fillStyle = '#ff3d8e'; g.font = 'bold 92px "Arial Rounded MT Bold", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Thank you!', w / 2, h / 2 + 6); });
      const board = M(new THREE.BoxGeometry(0.34, 0.17, 0.008), [std('#ffd1e6'), std('#ffd1e6'), std('#ffd1e6'), std('#ffd1e6'), std('#ffffff', { map: tex }), std('#ffd1e6')], 0, 0.27, 0);
      return grp(M(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 10), std('#b07a4a')), board); } },
  crown: { label: 'Crown', fit: { bone: 'head', pos: [0, 0.16, 0], rot: [-8, 0, 0] },
    make: () => { const gold = std('#e6bf55', { metalness: 0.85, roughness: 0.3 }); const band = M(new THREE.CylinderGeometry(0.07, 0.072, 0.035, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#e6bf55', metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }));
      const pts = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2; return M(new THREE.ConeGeometry(0.014, 0.04, 8), gold, Math.sin(a) * 0.068, 0.035, Math.cos(a) * 0.068); });
      const gems = Array.from({ length: 6 }, (_, i) => { const a = (i + 0.5) / 6 * Math.PI * 2; return M(new THREE.SphereGeometry(0.007, 10, 8), glow(['#ff3d6e', '#4fa3ff', '#7fe0a8'][i % 3], 0.6), Math.sin(a) * 0.073, 0, Math.cos(a) * 0.073); });
      return grp(band, ...pts, ...gems); } },
};

// ---------------------------------------------------------------- built-in scenes (what stands behind the character)
export const BUILTIN_SCENES = {
  stage: { label: 'Concert stage', make: () => {
    const g = new THREE.Group(), floor = M(new THREE.CircleGeometry(3.2, 64), std('#15131c', { roughness: 0.25, metalness: 0.3 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.castShadow = false;
    const ring = M(new THREE.RingGeometry(1.15, 1.2, 64), glow('#ff5fa2', 1.6), 0, 0.003, 0); ring.rotation.x = -Math.PI / 2;
    const wall = M(new THREE.CylinderGeometry(4.2, 4.2, 4.5, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76), std('#120f1c', { side: THREE.BackSide, roughness: 0.9 }), 0, 2.2, 0.6);
    g.add(floor, ring, wall);
    for (let i = 0; i < 9; i++) { const a = Math.PI * 0.68 + i / 8 * Math.PI * 0.64, col = i % 2 ? '#7a5cff' : '#3fd0ff'; const strip = M(new THREE.BoxGeometry(0.05, 3.6, 0.05), glow(col, 2.2), Math.sin(a) * 4.05, 2.1, Math.cos(a) * 4.05 + 0.6); strip.castShadow = false; g.add(strip); }
    return g; } },
  room: { label: 'Cozy room', make: () => {
    const g = new THREE.Group(), wallTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#efe3d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#e7d8c8'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 8, h); }); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(12, 6);
    const wall = M(new THREE.PlaneGeometry(9, 4.5), std('#ffffff', { map: wallTex, roughness: 0.95 }), 0, 2.25, -1.6); wall.receiveShadow = true;
    const floor = M(new THREE.PlaneGeometry(9, 5), std('#9a6a45', { roughness: 0.7 }), 0, 0, 0.9); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    const sky = canvasTex(256, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7fb6ff'); gr.addColorStop(1, '#ffd9b8'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.85)'; for (const [x, y, r] of [[60, 70, 22], [85, 66, 28], [110, 74, 20], [180, 120, 18], [200, 116, 24]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } });
    const win = M(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshBasicMaterial({ map: sky }), 1.35, 1.75, -1.58), frame = std('#ffffff');
    const bars = [[1.48, 0.06, 1.35, 1.15], [1.48, 0.06, 1.35, 2.35], [0.06, 1.26, 0.62, 1.75], [0.06, 1.26, 2.08, 1.75], [0.04, 1.2, 1.35, 1.75], [1.4, 0.04, 1.35, 1.75]].map(([w, h, x, y]) => M(new THREE.BoxGeometry(w, h, 0.05), frame, x, y, -1.56));
    const shelf = M(new THREE.BoxGeometry(1.1, 0.04, 0.22), std('#7a4f33'), -1.45, 1.6, -1.48), books = [];
    ['#e0566d', '#2b3f73', '#ffd166', '#2f8f8a', '#8a4fb8', '#f2efe9'].forEach((c, i) => books.push(M(new THREE.BoxGeometry(0.06, 0.22 + (i % 3) * 0.03, 0.16), std(c), -1.85 + i * 0.075, 1.73 + (i % 3) * 0.015, -1.48)));
    const pot = M(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 24), std('#d98b5f'), -2.1, 0.15, -1.1), leaves = [];
    for (let i = 0; i < 7; i++) leaves.push(M(new THREE.SphereGeometry(0.17, 16, 12), std('#3f8f5a', { roughness: 0.8 }), -2.1 + Math.sin(i * 2.4) * 0.14, 0.45 + i * 0.07, -1.1 + Math.cos(i * 2.4) * 0.1));
    const lights = []; for (let i = 0; i < 16; i++) { const x = -2.8 + i * 0.37; lights.push(M(new THREE.SphereGeometry(0.025, 10, 8), glow(['#ffd166', '#ff9ec7', '#9fe6ff'][i % 3], 2.5), x, 3.05 - Math.sin(i / 15 * Math.PI) * 0.25, -1.55)); }
    g.add(wall, floor, win, ...bars, shelf, ...books, pot, ...leaves, ...lights); return g; } },
  night: { label: 'Night city window', make: () => {
    const g = new THREE.Group(), city = canvasTex(1024, 512, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b1030'); gr.addColorStop(0.7, '#3a2a6a'); gr.addColorStop(1, '#ff7aa8'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff7d6'; c.beginPath(); c.arc(820, 90, 34, 0, 7); c.fill(); let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; c.fillRect(rnd() * w, rnd() * h * 0.5, 2, 2); }
      for (let x = 0; x < w;) { const bw = 40 + rnd() * 70, bh = 120 + rnd() * 260; c.fillStyle = '#150f2c'; c.fillRect(x, h - bh, bw, bh); for (let wy = h - bh + 10; wy < h - 8; wy += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (rnd() < 0.45) { c.fillStyle = rnd() < 0.5 ? '#ffd166' : '#9fe6ff'; c.fillRect(wx, wy, 5, 7); } x += bw + 4; } });
    const view = M(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: city }), 0, 1.9, -2.2), frame = std('#1b1b26');
    const wall = M(new THREE.PlaneGeometry(10, 5), std('#221d33', { roughness: 0.95 }), 0, 2.5, -2.25);
    const mullions = [-1.75, 0, 1.75].map((x) => M(new THREE.BoxGeometry(0.07, 3.6, 0.08), frame, x, 1.9, -2.15)).concat([M(new THREE.BoxGeometry(7.1, 0.08, 0.08), frame, 0, 0.12, -2.15), M(new THREE.BoxGeometry(7.1, 0.08, 0.08), frame, 0, 3.68, -2.15)]);
    const floor = M(new THREE.PlaneGeometry(10, 5), std('#2a2338', { roughness: 0.4, metalness: 0.2 }), 0, 0, 0.3); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    wall.position.z = -2.3; g.add(wall, view, ...mullions, floor); return g; } },
};

const BONES = ['rightHand', 'leftHand', 'head', 'chest', 'hips'];
export const POSE_LIST = [['relaxed', 'Relaxed (standing)'], ['hips', 'Hands on hips'], ['crossed', 'Arms crossed'], ['thinking', 'Thinking (hand on chin)'], ['shy', 'Shy (hands together)'], ['lean', 'Leaning on one leg'], ['sit', 'Sitting (on a stool)']];      // must match POSES in avatar.js
export const ATTACH = { rightHand: 'Right hand', leftHand: 'Left hand', head: 'Head', chest: 'Chest', hips: 'Hips', floor: 'Floor (stays put)' };
const D = THREE.MathUtils.degToRad;

/** Keeps the stream's props and scene in step with the settings. */
export class PropStage {
  constructor(scene, rig) { this.scene = scene; this.rig = rig; this.items = new Map(); this.sceneObj = null; this.sceneKey = ''; this.vrm = null; this.flash = new Map(); this.loader = new GLTFLoader(); this.cache = new Map(); }
  async object(src) {              // a fresh copy of a built-in or of an uploaded model
    if (src.startsWith('builtin:')) { const b = BUILTIN_PROPS[src.slice(8)]; return b ? b.make() : null; }
    if (src.startsWith('file:')) { const f = src.slice(5); if (!this.cache.has(f)) this.cache.set(f, this.loader.loadAsync(`/userprops/${f}`).then((g) => g.scene).catch(() => null)); const s = await this.cache.get(f); return s ? s.clone(true) : null; }
    return null;
  }
  async apply(settings, vrm) {
    this.vrm = vrm || this.vrm; this.settings = settings;
    await this.applyScene(settings.scene || {});
    const want = new Map((settings.props || []).map((p) => [p.id, p]));
    for (const [id, it] of this.items) if (!want.has(id) || want.get(id).src !== it.src) { it.obj?.removeFromParent(); this.items.delete(id); }
    for (const p of want.values()) {
      let it = this.items.get(p.id);
      if (!it) { it = { src: p.src, obj: null, loading: true }; this.items.set(p.id, it); it.obj = await this.object(p.src); it.loading = false; if (!it.obj) continue; it.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); }
      if (this.items.get(p.id) !== it || !it.obj) continue;
      this.place(it.obj, p);
    }
  }
  place(obj, p) {
    const bone = p.attach !== 'floor' && this.vrm?.humanoid?.getNormalizedBoneNode(p.attach);
    const parent = bone || this.rig; if (obj.parent !== parent) parent.add(obj);
    const pos = p.pos || [0, 0, 0], rot = p.rot || [0, 0, 0];
    obj.position.set(pos[0], pos[1], pos[2]); obj.rotation.set(D(rot[0]), D(rot[1]), D(rot[2])); obj.scale.setScalar(p.scale || 1);
    const until = this.flash.get(p.id) || 0; obj.visible = p.on !== false || performance.now() < until;
  }
  /** Before the character is swapped: keep the props, so they can move onto the new one. */
  detachAll() { for (const it of this.items.values()) if (it.obj) this.rig.add(it.obj); }
  /** A rule shows a prop for a while, even one that is switched off. */
  show(id, seconds = 5) { this.flash.set(id, performance.now() + seconds * 1000); const p = (this.settings?.props || []).find((q) => q.id === id), it = this.items.get(id); if (p && it?.obj) this.place(it.obj, p); }
  update() { if (!this.flash.size) return; const now = performance.now(); for (const [id, until] of this.flash) if (now > until) { this.flash.delete(id); const p = (this.settings?.props || []).find((q) => q.id === id), it = this.items.get(id); if (p && it?.obj) this.place(it.obj, p); } }
  async applyScene(s) {
    const key = JSON.stringify([s.kind, s.key, s.file]);
    if (key !== this.sceneKey) {
      this.sceneObj?.removeFromParent(); this.sceneObj = null; this.sceneKey = key;
      if (s.kind === 'builtin' && BUILTIN_SCENES[s.key]) this.sceneObj = BUILTIN_SCENES[s.key].make();
      else if (s.kind === 'model' && s.file) { const o = await this.object(`file:${s.file}`); if (this.sceneKey !== key) return; this.sceneObj = o; }
      else if (s.kind === 'image' && s.file) { const tex = await new THREE.TextureLoader().loadAsync(`/userprops/${s.file}`).catch(() => null); if (this.sceneKey !== key || !tex) return; tex.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.userData.picture = tex.image.width / tex.image.height; this.sceneObj = m; }
      if (this.sceneObj) { this.sceneObj.name = 'kael-scene'; this.sceneObj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (!o.userData.picture) o.receiveShadow = true; } }); this.scene.add(this.sceneObj); }
    }
    if (this.sceneObj && !this.sceneObj.userData.picture) { const sc = s.scale || 1; this.sceneObj.scale.setScalar(sc); this.sceneObj.position.set(s.x || 0, s.y || 0, s.z || 0); this.sceneObj.rotation.set(0, D(s.rotY || 0), 0); }
    this.sceneCfg = s;
  }
  /** A picture backdrop always fills the view behind the character, whatever the framing. */
  frame(camera) {
    const m = this.sceneObj; if (!m?.userData.picture) return;
    const s = this.sceneCfg || {}, depth = 2.5 + (s.z || 0), dist = camera.position.z + depth, h = 2 * dist * Math.tan(D(camera.fov) / 2) * (s.scale || 1) * 1.04, w = Math.max(h * camera.aspect, h * m.userData.picture);
    m.scale.set(w, w / m.userData.picture, 1);      // w already covers both the view's width and its height
    m.position.set(camera.position.x + (s.x || 0), camera.position.y + (s.y || 0), -depth);
  }
}
export { BONES };
