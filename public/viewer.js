// Interactive 3D inspector for the Avatar Library: orbit/zoom, preset views, lighting and background,
// expression and motion preview, load-time checks (textures, orientation, rig) and thumbnail capture.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const LIGHTS = {
  studio: { key: ['#ffffff', 1.7], rim: ['#a35cff', 0.9], amb: 0.9 },
  soft: { key: ['#fff6ec', 1.1], rim: ['#ffffff', 0.4], amb: 1.3 },
  warm: { key: ['#ffd2a1', 1.6], rim: ['#ff7a45', 0.9], amb: 0.8 },
  cool: { key: ['#cfe3ff', 1.5], rim: ['#3aa0ff', 1.0], amb: 0.85 },
  neon: { key: ['#ffffff', 1.1], rim: ['#ff2bd6', 1.6], amb: 0.6 },
};
export const LIGHT_PRESETS = Object.keys(LIGHTS);

export class AvatarViewer {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.02, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12; this.controls.minDistance = 0.2; this.controls.maxDistance = 15;
    this.key = new THREE.DirectionalLight(); this.key.position.set(-1.2, 2.2, 2.5);
    this.rim = new THREE.DirectionalLight(); this.rim.position.set(1.5, 1.8, -2.5);
    this.amb = new THREE.HemisphereLight(0xffffff, 0x444455, 1);
    this.scene.add(this.key, this.rim, this.amb);
    this.grid = new THREE.GridHelper(4, 16, 0x555566, 0x2c2e38); this.grid.material.transparent = true; this.grid.material.opacity = 0.5;
    this.scene.add(this.grid);
    this.setLighting('studio'); this.setBackground('dark');
    this.clock = new THREE.Clock();
    this.model = null; this.vrm = null; this.mixer = null; this.motion = 'idle'; this.expr = null; this.isVRM0 = false;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); this.resize();
    const loop = () => { if (this.disposed) return; this.tick(); this.raf = requestAnimationFrame(loop); };
    loop();
  }
  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    if (this.shiftPx) this.camera.setViewOffset(w, h, this.shiftPx, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  /** Shift the picture left (positive px) so the character stays centred in the space not covered by side panels. */
  setShift(px) { this.shiftPx = px || 0; this.resize(); }
  setLighting(name) {
    const L = LIGHTS[name] || LIGHTS.studio; this.lighting = name;
    this.key.color.set(L.key[0]); this.key.intensity = L.key[1];
    this.rim.color.set(L.rim[0]); this.rim.intensity = L.rim[1]; this.amb.intensity = L.amb;
  }
  setBackground(name) {
    this.background = name;
    const c = { dark: '#15161c', light: '#e9e9ef', green: '#00b140', transparent: null }[name];
    this.renderer.setClearColor(c ? new THREE.Color(c) : 0x000000, c ? 1 : 0);
    this.el.classList.toggle('checker', !c);
  }
  setGrid(on) { this.grid.visible = on; }

  unload() {
    if (!this.model) return;
    this.scene.remove(this.model);
    VRMUtils.deepDispose(this.model);
    this.mixer?.stopAllAction(); this.mixer = null;
    this.model = null; this.vrm = null; this.gltf = null;
  }
  dispose() { this.disposed = true; cancelAnimationFrame(this.raf); this.unload(); this.ro.disconnect(); this.renderer.dispose(); this.renderer.domElement.remove(); }

  /** Load a model; resolves with load checks. onProgress receives 0..1. */
  /** Show a character made in the creator (a recipe object, or a URL to one). */
  async loadCreated(recipeOrUrl, { keepCamera = false } = {}) {
    const recipe = typeof recipeOrUrl === 'string' ? await fetch(recipeOrUrl).then((r) => { if (!r.ok) throw new Error('character file missing'); return r.json(); }) : recipeOrUrl;
    const { buildCharacter } = await import('/creator/build.js');
    const v = buildCharacter(recipe);
    const cam = keepCamera && this.model ? { p: this.camera.position.clone(), t: this.controls.target.clone() } : null;
    this.unload();
    this.vrm = v; this.gltf = null; this.isVRM0 = false; this.model = v.scene;
    this.rest = {};
    for (const n of Object.keys(v.humanoid.humanBones)) this.rest[n] = v.humanoid.getNormalizedBoneNode(n).quaternion.clone();
    this.scene.add(this.model); this.model.updateMatrixWorld(true);
    const checks = this.inspect([]);
    if (cam) { this.camera.position.copy(cam.p); this.controls.target.copy(cam.t); this.controls.update(); } else this.frame('front');
    if (this.expr) this.setExpression(this.expr);
    return checks;
  }
  async load(url, { onProgress, kind } = {}) {
    if (kind === 'created') return this.loadCreated(url);
    this.unload();
    const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
    const failedImages = [];
    const manager = loader.manager;
    const prevErr = manager.onError; manager.onError = (u) => failedImages.push(u);
    let gltf;
    try {
      gltf = await loader.loadAsync(url, (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); });
    } finally { manager.onError = prevErr; }
    this.gltf = gltf;
    const vrm = gltf.userData.vrm || null;
    this.vrm = vrm;
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons?.(gltf.scene);
      this.isVRM0 = vrm.meta?.metaVersion === '0';
      VRMUtils.rotateVRM0(vrm);
      if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
      this.model = vrm.scene;
      this.rest = {};
      for (const n of Object.keys(vrm.humanoid?.humanBones || {})) { const b = vrm.humanoid.getNormalizedBoneNode(n); if (b) this.rest[n] = b.quaternion.clone(); }
    } else {
      this.model = gltf.scene;
      if (gltf.animations?.length) { this.mixer = new THREE.AnimationMixer(gltf.scene); }
    }
    this.model.traverse((o) => { o.frustumCulled = false; });
    this.scene.add(this.model);
    this.model.updateMatrixWorld(true);
    const checks = this.inspect(failedImages);
    this.frame('front');
    return checks;
  }

  inspect(failedImages) {
    const issues = [], info = {};
    const box = new THREE.Box3().setFromObject(this.model), size = box.getSize(new THREE.Vector3());
    info.height = +size.y.toFixed(2); info.width = +size.x.toFixed(2); info.depth = +size.z.toFixed(2);
    this.box = box;
    if (!isFinite(size.y) || size.y === 0) issues.push({ level: 'error', text: 'The model has no visible geometry.' });
    else if (size.y < 0.3 || size.y > 3.5) issues.push({ level: 'warn', text: `Unusual size: ${size.y.toFixed(2)} m tall (a person is about 1.5–1.9 m). It may have been exported in the wrong units.` });
    if (size.z > size.y * 1.2 && size.z > size.x) issues.push({ level: 'warn', text: 'The model looks like it is lying down (it is deeper than it is tall). Check the export "up" axis.' });
    if (box.min.y < -0.25 || box.min.y > 0.25) issues.push({ level: 'warn', text: `The feet are not at floor level (lowest point ${box.min.y.toFixed(2)} m).` });
    // textures and materials
    const textures = new Set(), broken = new Set(), types = {};
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        const tname = m.isMToonMaterial ? 'MToonMaterial' : m.type; types[tname] = (types[tname] || 0) + 1;
        for (const k of Object.keys(m)) {
          const t = m[k];
          if (t && t.isTexture) { textures.add(t); const img = t.image; if (!img || !(img.width || img.videoWidth)) broken.add(t); }
        }
      }
    });
    info.materialTypes = types; info.texturesLoaded = textures.size - broken.size;
    if (failedImages.length || broken.size) issues.push({ level: 'warn', text: `${Math.max(failedImages.length, broken.size)} texture(s) failed to load and will appear blank.` });
    const known = ['MToonMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial'];
    const odd = Object.keys(types).filter((t) => !known.includes(t));
    if (odd.length) issues.push({ level: 'warn', text: `Some materials use unusual shaders (${odd.join(', ')}) and may not look the same as in the original program.` });
    // orientation and rig (VRM)
    if (this.vrm?.humanoid) {
      const pos = (n) => { const b = this.vrm.humanoid.getNormalizedBoneNode(n); if (!b) return null; const v = new THREE.Vector3(); b.getWorldPosition(v); return v; };
      const head = pos('head'), hips = pos('hips'), lA = pos('leftUpperArm'), rA = pos('rightUpperArm');
      if (head && hips && head.y <= hips.y) issues.push({ level: 'error', text: 'The rig is upside down or broken (the head is below the hips).' });
      if (lA && rA && lA.x <= rA.x) issues.push({ level: 'warn', text: 'The avatar seems to face away from the camera, or its left/right arms are swapped in the rig.' });
      if (lA && rA && Math.abs(lA.y - rA.y) > 0.15) issues.push({ level: 'warn', text: 'The shoulders are at very different heights; the rest pose may be unusual.' });
      info.facing = lA && rA && lA.x > rA.x ? 'front' : 'unknown';
      this.headPos = head;
    } else {
      info.facing = 'unknown (no humanoid rig)';
      this.headPos = new THREE.Vector3(0, box.max.y - size.y * 0.1, 0);
    }
    info.expressions = this.expressionNames();
    info.animations = this.gltf?.animations?.map((a) => a.name || 'animation') || [];
    info.springBones = this.vrm?.springBoneManager ? (this.vrm.springBoneManager.joints?.size ?? 0) : 0;
    return { issues, info };
  }

  expressionNames() { return this.vrm?.expressionManager?.expressions.map((e) => e.expressionName) || []; }
  setExpression(name) {
    this.expr = name;
    const em = this.vrm?.expressionManager; if (!em) return;
    for (const e of em.expressions) em.setValue(e.expressionName, e.expressionName === name ? 1 : 0);
  }
  setMotion(name) {
    this.motion = name; this.motionStart = this.clock.elapsedTime;
    if (this.mixer) {
      this.mixer.stopAllAction();
      const clip = this.gltf.animations.find((a) => (a.name || 'animation') === name);
      if (clip) this.mixer.clipAction(clip).play();
    }
  }

  frame(view = 'front') {
    if (!this.model) return;
    const box = this.box || new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    if (view === 'face' && this.headPos) {        // close-up on the face
      const top = box.max.y, h = Math.max(0.18, top - this.headPos.y);
      const target = new THREE.Vector3(0, this.headPos.y + h * 0.42, 0), d = Math.max(0.55, h * 3.0);
      this.camera.position.set(0, target.y + 0.02, d); this.controls.target.copy(target); this.controls.update(); return;
    }
    const full = view.endsWith('-full') || !this.vrm;
    const v = view.replace('-full', '');
    let target, dist;
    const fov = THREE.MathUtils.degToRad(this.camera.fov), fit = (h, w) => Math.max(h / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / Math.max(0.5, this.camera.aspect)) * 1.12;
    if (!full && this.headPos) {        // bust: from mid-chest to the top of the head (heads, ears and hats vary a lot)
      const top = box.max.y + 0.03, bottom = Math.max(box.min.y, this.headPos.y - Math.max(0.62, size.y * 0.42));
      target = new THREE.Vector3(0, (top + bottom) / 2, 0); dist = fit(top - bottom, Math.min(size.x, (top - bottom) * 1.2));
    } else { target = center; dist = fit(size.y, size.x); }
    const ang = { front: 0, threequarter: Math.PI / 4, side: Math.PI / 2, back: Math.PI }[v] ?? 0;
    this.camera.position.set(target.x + Math.sin(ang) * dist, target.y + dist * 0.05, target.z + Math.cos(ang) * dist);
    this.controls.target.copy(target); this.controls.update();
  }
  zoom(f) { const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f); this.camera.position.copy(this.controls.target).add(off); }

  // ---- built-in preview motions for humanoid avatars (same conventions as the live renderer)
  pose(t) {
    const vrm = this.vrm; if (!vrm?.humanoid) return;
    const aa = (ax, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0), a);
    const conv = (q) => (this.isVRM0 ? new THREE.Quaternion(-q.x, q.y, -q.z, q.w) : q);
    const o = {};
    const m = this.motion, el = t - (this.motionStart || 0);
    if (m !== 'tpose') {
      const br = Math.sin(t * 1.6);
      o.leftUpperArm = aa('z', -1.22 + br * 0.02); o.rightUpperArm = aa('z', 1.22 - br * 0.02);
      o.leftLowerArm = aa('z', -0.12); o.rightLowerArm = aa('z', 0.12);
      o.spine = aa('x', br * 0.012); o.head = aa('y', Math.sin(t * 0.45) * 0.05);
    }
    if (m === 'wave') {
      o.rightUpperArm = aa('y', 0.35).multiply(aa('z', -0.5)); o.rightLowerArm = aa('z', -1.3 + Math.sin(t * 9) * 0.32); o.rightHand = aa('z', Math.sin(t * 9 + 0.6) * 0.25);
    } else if (m === 'nod') {
      o.head = aa('x', Math.max(0, Math.sin(el * 7)) * 0.3); o.neck = aa('x', Math.max(0, Math.sin(el * 7)) * 0.1);
    } else if (m === 'look') {
      if (vrm.lookAt) { vrm.lookAt.yaw = Math.sin(t * 1.2) * 20; vrm.lookAt.pitch = Math.cos(t * 0.9) * 8; }
      o.head = aa('y', Math.sin(t * 1.2) * 0.25);
    } else if (m === 'talk') {         // a few syllables of fake speech
      const em = vrm.expressionManager, ph = t * 7;
      if (em) { em.setValue('aa', Math.max(0, Math.sin(ph)) * 0.8); em.setValue('oh', Math.max(0, Math.sin(ph * 0.7 + 1)) * 0.4); em.setValue('ee', Math.max(0, Math.sin(ph * 1.3 + 2)) * 0.3); }
      o.head = aa('x', Math.sin(t * 3.5) * 0.03);
    } else if (m === 'blink') {
      const em = vrm.expressionManager; const b = Math.max(0, Math.sin(t * 6)) ** 4;
      if (em) { if (em.getExpression('blink')) em.setValue('blink', b); }
    }
    if (m !== 'look' && vrm.lookAt) { vrm.lookAt.yaw = 0; vrm.lookAt.pitch = 0; }
    for (const [n, rest] of Object.entries(this.rest || {})) {
      const b = vrm.humanoid.getNormalizedBoneNode(n); if (!b) continue;
      b.quaternion.copy(o[n] ? conv(o[n]) : rest);
    }
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.vrm) {
      if (this.motion !== 'blink' && this.expr === null && this.vrm.expressionManager) for (const e of this.vrm.expressionManager.expressions) this.vrm.expressionManager.setValue(e.expressionName, 0);
      this.pose(t);
      this.vrm.lookAt?.update?.(dt);
      this.vrm.update(dt);
    }
    this.mixer?.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Square PNG thumbnail (data URL), bust shot from the front-three-quarter. */
  thumbnail(size = 384) {
    const prev = { pos: this.camera.position.clone(), target: this.controls.target.clone(), aspect: this.camera.aspect, grid: this.grid.visible, bg: this.background };
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(size, size, false); this.camera.aspect = 1; this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
    this.grid.visible = false; this.setBackground('transparent');
    const keepMotion = this.motion, keepStart = this.motionStart;
    if (this.vrm) { this.motion = 'idle'; this.pose(0); this.vrm.expressionManager && this.expr && this.setExpression(this.expr); this.vrm.update(0); this.model.updateMatrixWorld(true); }
    this.motion = keepMotion; this.motionStart = keepStart;
    this.frame('threequarter');
    if (this.vrm) { const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(0.8); this.camera.position.copy(this.controls.target).add(off); }
    this.camera.lookAt(this.controls.target);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setSize(w, h, false); this.camera.aspect = prev.aspect; this.resize();
    this.camera.position.copy(prev.pos); this.controls.target.copy(prev.target); this.grid.visible = prev.grid; this.setBackground(prev.bg);
    return url;
  }
}
