// Relaxed standing pose shared by the Creator preview, thumbnails, the Library viewer and the live renderer.
// Euler angles (XYZ, radians) on normalized VRM 1.0 humanoid bones; VRM 0.x callers convert as usual.
// Arms hang softly with bent elbows, fingers curl a little, and the weight rests on the left leg.
import * as THREE from 'three';

export const RELAXED = {
  leftUpperArm: [0.1, 0, -1.28], rightUpperArm: [0.1, 0, 1.28],
  leftLowerArm: [0, -0.38, 0], rightLowerArm: [0, 0.38, 0],
  leftHand: [0.15, 0, 0.12], rightHand: [0.15, 0, -0.12],
  hips: [0, 0, 0.02], spine: [0, 0, -0.012], chest: [0, 0, -0.008], neck: [0, 0, 0.02], head: [0.02, 0, 0.03],
  leftUpperLeg: [0, 0, -0.02], rightUpperLeg: [-0.04, 0, -0.02], rightLowerLeg: [0.1, 0, 0], rightFoot: [-0.06, 0, 0.02],
};
for (const s of ['left', 'right']) {
  const g = s === 'left' ? -1 : 1;
  ['Index', 'Middle', 'Ring', 'Little'].forEach((f, i) => {
    const c = 0.18 + i * 0.07;
    RELAXED[`${s}${f}Proximal`] = [0, 0, g * c]; RELAXED[`${s}${f}Intermediate`] = [0, 0, g * c * 1.3]; RELAXED[`${s}${f}Distal`] = [0, 0, g * c];
  });
}
/** Bones that stay in the body (so arm-only callers can skip them). */
export const BODY_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperLeg', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

export const relaxedQ = (name) => { const e = RELAXED[name]; return e ? new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'XYZ')) : null; };

/** Put a humanoid into the relaxed pose. getBone(name) -> Object3D | null. */
export function applyRelaxed(getBone, { skip = [] } = {}) {
  for (const n of Object.keys(RELAXED)) { if (skip.includes(n)) continue; const b = getBone(n); if (b) b.quaternion.copy(relaxedQ(n)); }
}
