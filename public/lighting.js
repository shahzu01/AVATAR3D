// Kael Studio lighting: one cinematic light rig shared by the stream/OBS page and every preview.
// Three-point lighting (soft key with shadows, fill, coloured rim + optional kicker), sky/ground bounce and
// image-based light for global illumination, screen-space ambient occlusion, soft contact shadows on the floor,
// warm skin shading and eye catchlights. Presets set the whole look; the user's key/rim colour and strength
// sliders still work on top of any preset.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { LIGHT_PRESETS, lightDefaults } from '/light-presets.js';
export { LIGHT_PRESETS, lightDefaults };

export class StudioLighting {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.opts = opts; this.models = [];
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;      // blurred shadow edges: soft contact shadows instead of a hard cut-out
    const dl = (shadow) => { const l = new THREE.DirectionalLight(); l.castShadow = !!shadow; scene.add(l); scene.add(l.target); return l; };
    this.key = dl(true); this.fill = dl(); this.rim = dl(); this.kick = dl();
    this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0006; this.key.shadow.normalBias = 0.03; this.key.shadow.radius = 9; this.key.shadow.blurSamples = 18;
    this.hemi = new THREE.HemisphereLight(); scene.add(this.hemi);
    this.bounce = new THREE.DirectionalLight(); this.bounce.position.set(0, -1, 0.6); scene.add(this.bounce);       // light coming back up off the floor
    const pm = new THREE.PMREMGenerator(renderer); this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); scene.environment = this.envMap;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.3, color: 0x0a0616 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.floor.renderOrder = -2; this.floor.name = 'kael-contact-shadow'; scene.add(this.floor);
    this.composer = null; this.aoOn = false; this.wantAO = opts.ao !== false; this.state = { preset: 'cute' }; this.centre = new THREE.Vector3(0, 0.9, 0); this.size = 1.7;
    this.setPreset('cute');
  }
  _composer() {
    if (this.composer) return;
    const s = this.renderer.getSize(new THREE.Vector2()), pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(s.x * pr, s.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt); this.composer.setPixelRatio(pr); this.composer.setSize(s.x, s.y);
    this.rp = new RenderPass(this.scene, this.camera); this.composer.addPass(this.rp); this._cc = new THREE.Color();
    this.gtao = new GTAOPass(this.scene, this.camera, s.x, s.y); this.gtao.normalMaterial.side = THREE.DoubleSide;      // thin cloth (skirts, capes) is seen from both sides: without this, AO looks straight through it this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.updateGtaoMaterial({ radius: 0.16, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.gtao); this.composer.addPass(new OutputPass());
  }
  /** s: { lightingPreset, lightColor, lightIntensity, rimColor, rimIntensity, lightingAO, transparent } - any may be missing */
  apply(s = {}) {
    const name = LIGHT_PRESETS[s.lightingPreset] ? s.lightingPreset : (s.lightingPreset === undefined && (s.lightColor || s.rimColor) ? 'classic' : (s.lightingPreset || 'cute'));
    this.setPreset(LIGHT_PRESETS[name] ? name : 'cute', s);
  }
  setPreset(name, s = {}) {
    const p = LIGHT_PRESETS[name] || LIGHT_PRESETS.cute, legacy = name === 'classic'; this.state = { preset: name, s }; this.p = p;
    const gain = s.lightIntensity ?? 1, rimGain = legacy ? (s.rimIntensity ?? 0.6) / 0.6 : (s.rimIntensity ?? 1);
    const set = (l, d, col, k) => { if (!d) { l.visible = false; return; } l.visible = d[1] * k > 0.001; l.color.set(col || d[0]); l.intensity = d[1] * k; l.userData.dir = d[2]; };
    set(this.key, p.key, s.lightColor && s.lightColor.toLowerCase() !== '#ffffff' ? s.lightColor : (legacy ? s.lightColor : null), gain);
    set(this.fill, p.fill, null, gain); set(this.rim, p.rim, s.rimColor || null, rimGain); set(this.kick, p.kick, null, rimGain);
    this.hemi.color.set(p.sky); this.hemi.groundColor.set(p.ground); this.hemi.intensity = p.hemi * gain;
    this.bounce.color.set(p.ground); this.bounce.intensity = 0.35 * p.hemi * gain; this.bounce.visible = !legacy;
    this.scene.environmentIntensity = p.env; this.floor.material.opacity = p.shadow; this.floor.visible = p.shadow > 0; this.key.castShadow = p.shadow > 0 || p.selfShadow;
    this.aoOn = this.wantAO && s.lightingAO !== false && p.ao > 0 && !s.transparent;      // AO needs an opaque frame: it is skipped on a transparent (OBS) background
    if (this.aoOn) { this._composer(); this.gtao.blendIntensity = p.ao; }
    this._place(); for (const m of this.models) this._dress(m);
  }
  /** Tell the rig what it is lighting: call after a character loads or is resized. */
  attach(vrmOrRoot, box) {
    const root = vrmOrRoot.scene || vrmOrRoot; this.models = this.models.filter((m) => m.root.parent); const m = { root, vrm: vrmOrRoot.scene ? vrmOrRoot : null }; this.models.push(m);
    const b = box || new THREE.Box3().setFromObject(root); if (!b.isEmpty()) { b.getCenter(this.centre); this.size = Math.max(0.6, b.max.y - b.min.y); this.floor.position.set(this.centre.x, b.min.y + 0.001, this.centre.z); }
    this._place(); this._dress(m); this._catchlights(m);
  }
  _place() {
    const c = this.centre, r = this.size * 1.6;
    for (const l of [this.key, this.fill, this.rim, this.kick]) { const d = l.userData.dir; if (!d) continue; l.target.position.copy(c); l.position.set(c.x + d[0] * r, c.y + d[1] * r * 0.6, c.z + d[2] * r); l.target.updateMatrixWorld(); }
    const sc = this.key.shadow.camera, h = this.size * 0.75; sc.left = -h; sc.right = h; sc.top = h; sc.bottom = -h; sc.near = 0.1; sc.far = this.size * 6; sc.updateProjectionMatrix();
    for (const m of this.models) this._eyeAim(m);
  }
  _dress(m) {
    const p = this.p, rimCol = this.rim.color;
    m.root.traverse((o) => {
      if (!o.isMesh || o.name === 'kael-floor-shadow') return;
      o.castShadow = true; o.receiveShadow = !!p.selfShadow;
      for (const mat of [].concat(o.material)) {
        if (!mat) continue;
        if (mat.isMToonMaterial) {                     // VRM toon materials: soft coloured edge light + warmer shadow side on skin
          if (mat.userData.kaelRim0 === undefined) mat.userData.kaelRim0 = { c: mat.parametricRimColorFactor?.clone?.(), sh: mat.shadeColorFactor?.clone?.(), pw: mat.parametricRimFresnelPowerFactor, mix: mat.rimLightingMixFactor };
          const skin = /skin|body|face/i.test(mat.name || '') && !mat.map;
          if (p.skinGlow && mat.parametricRimColorFactor) {
            const g = new THREE.Color(p.skinGlow[0]).lerp(rimCol, 0.45).multiplyScalar(p.skinGlow[1] * (skin ? 1 : 0.55));
            mat.parametricRimColorFactor.copy(g); mat.parametricRimFresnelPowerFactor = 3.2; mat.parametricRimLiftFactor = 0; mat.rimLightingMixFactor = 0.6;
            if (skin && mat.shadeColorFactor && mat.color) mat.shadeColorFactor.copy(mat.color).multiply(new THREE.Color(0.80, 0.60, 0.60));      // shadow turns warm, like light passing through skin
          } else if (mat.userData.kaelRim0?.c) { mat.parametricRimColorFactor.copy(mat.userData.kaelRim0.c); mat.parametricRimFresnelPowerFactor = mat.userData.kaelRim0.pw; mat.rimLightingMixFactor = mat.userData.kaelRim0.mix; }
        } else if (mat.isMeshStandardMaterial) mat.envMapIntensity = 1;
      }
    });
  }
  /** Small bright reflections of the key light on each eye. Only for characters that have eye bones. */
  _catchlights(m) {
    const h = m.vrm?.humanoid; if (!h || this.opts.catchlights === false || m.vrm.userData?.modular?.headModel || m.vrm.userData?.paintedEyes) return;      // a complete head brings its own painted eyes
    const L = h.getRawBoneNode('leftEye'), R = h.getRawBoneNode('rightEye'); if (!L || !R || L.userData.kaelGlint) return;
    m.root.updateMatrixWorld(true); const a = L.getWorldPosition(new THREE.Vector3()), b = R.getWorldPosition(new THREE.Vector3()), ipd = a.distanceTo(b); if (ipd < 0.02 || ipd > 0.2) return;
    const r = (m.vrm.userData?.eyeRadius) || ipd * 0.2, mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }); m.glints = [];
    for (const eye of [L, R]) { const g = new THREE.Group(); g.name = 'kael-eye-glint';
      const big = new THREE.Mesh(new THREE.CircleGeometry(r * 0.2, 16), mat), small = new THREE.Mesh(new THREE.CircleGeometry(r * 0.09, 12), mat); big.renderOrder = small.renderOrder = 5; g.add(big, small); g.userData = { big, small, r };
      m.root.add(g); g.position.copy(eye.getWorldPosition(new THREE.Vector3())); m.root.worldToLocal(g.position); eye.attach(g); eye.userData.kaelGlint = g; m.glints.push(g); }
    this._eyeAim(m);
  }
  _eyeAim(m) {
    if (!m.glints) return; const d = this.key.userData.dir || [-1, 1.5, 2], n = Math.hypot(d[0], d[1]) || 1;
    for (const g of m.glints) { const { big, small, r } = g.userData; const ux = d[0] / n, uy = Math.min(0.9, Math.max(0.35, d[1] / n));
      big.position.set(ux * r * 0.34, uy * r * 0.36, r * 1.03); small.position.set(-ux * r * 0.30, -uy * r * 0.34, r * 1.03); }
  }
  setSize(w, h) { this.composer?.setSize(w, h); this.gtao?.setSize(w, h); }
  render() {
    for (const m of this.models) if (m.glints) { const em = m.vrm?.expressionManager, bl = em ? Math.max(em.getValue('blink') || 0, ((em.getValue('blinkLeft') || 0) + (em.getValue('blinkRight') || 0)) / 2) : 0; for (const g of m.glints) g.visible = bl < 0.6; }      // no reflections on closed eyes
    if (!(this.aoOn && this.composer)) { this.renderer.render(this.scene, this.camera); return; }
    this.renderer.getClearColor(this._cc); this.rp.clearColor = this._cc.convertSRGBToLinear(); this.rp.clearAlpha = this.renderer.getClearAlpha();   // the background colour goes through the output pass too: pre-compensate so it stays the colour that was asked for
    this.composer.render();
  }
}
