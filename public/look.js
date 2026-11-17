// Shared "studio look": image-based light for imported PBR models, a soft floor shadow and a tinted light rig,
// so every avatar (created, .vrm or .glb) is lit the same flattering way in the Studio, Library and OBS.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let env = null;
/** Soft studio reflections / ambient light. Only physically-based (imported .glb) materials use it; toon and MToon ignore it. */
export function studioEnvironment(renderer) {
  if (env) return env;
  const pmrem = new THREE.PMREMGenerator(renderer);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/** A soft round shadow under the feet so the character stands on something instead of floating. */
export function floorShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grad = g.createRadialGradient(128, 128, 8, 128, 128, 126);
  grad.addColorStop(0, 'rgba(8,6,18,0.62)'); grad.addColorStop(0.45, 'rgba(8,6,18,0.28)'); grad.addColorStop(1, 'rgba(8,6,18,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1; m.name = 'kael-floor-shadow';
  return m;
}
/** Put the shadow under a model (box = its bounding box). */
export function placeShadow(shadow, box) {
  const w = Math.max(0.35, (box.max.x - box.min.x) * 0.75), d = Math.max(0.3, (box.max.z - box.min.z) * 1.15);
  shadow.scale.set(Math.min(w, 0.9), Math.max(d, 0.42), 1);
  shadow.position.set((box.min.x + box.max.x) / 2, box.min.y + 0.002, (box.min.z + box.max.z) / 2);
}

/** Imported physically-based models: let them pick up the studio environment and a touch of rim light. */
export function polishImported(root) {
  root.traverse((o) => {
    const mats = o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m?.isMeshStandardMaterial && !m.userData.kaelPolished) {
      m.userData.kaelPolished = true;
      m.envMapIntensity = 0.75;
      if (m.roughness > 0.9) m.roughness = 0.82;          // fully matte surfaces read as flat cut-outs
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev?.(sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{
  float kr = 1.0 - saturate(dot(normalize(vViewPosition), normal));
  kr = smoothstep(0.5, 1.0, kr) * (0.5 + 0.5 * saturate(normal.y * 0.5 + 0.5));
  outgoingLight += (diffuseColor.rgb * 0.6 + 0.4) * vec3(1.0, 0.93, 0.88) * kr * 0.35;
}
#include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'kael-pbr-rim';
      m.needsUpdate = true;
    }
  });
}
