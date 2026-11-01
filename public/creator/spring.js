// Simple spring-bone simulation (same idea as VRM spring bones): each joint's tip lags behind with inertia,
// is pulled back toward its rest direction (stiffness), sags with gravity and is pushed out of collider spheres.
import * as THREE from 'three';


export class SpringSystem {
  constructor(root) { this.root = root; this.chains = []; this.colliders = []; }   // rest tips are given in the root's local space
  /** bones: THREE.Bone[] (parent -> child order); restTips: world tip position of each bone in the rest pose. */
  addChain(bones, restTips, { stiffness = 1.5, gravity = 0.1, drag = 0.4, radius = 0.02 } = {}) {
    this.chains.push({ joints: bones.map((b, i) => ({ bone: b, restTip: restTips[i].clone(), stiffness, gravity, drag, radius })) });
  }
  addCollider(object, offset, radius) { this.colliders.push({ object, offset: offset.clone(), radius }); }
  init() {
    this.root.updateWorldMatrix(true, true);
    const rootScale = new THREE.Vector3(); this.root.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), rootScale);
    for (const ch of this.chains) for (const j of ch.joints) {
      const b = j.bone;
      j.initialQ ??= b.quaternion.clone();
      // build space has identity rest rotations, so the rest tip direction in bone-local space is simply tip - head
      const restHead = b.userData.world;
      j.axis = j.restTip.clone().sub(restHead).normalize();
      j.length = Math.max(1e-4, j.restTip.distanceTo(restHead) * rootScale.x);
      const head = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld), q = new THREE.Quaternion(); b.getWorldQuaternion(q);
      const tip = head.clone().addScaledVector(j.axis.clone().applyQuaternion(q), j.length);
      j.cur = tip.clone(); j.prev = tip.clone();
    }
    this.ready = true;
  }
  reset() { this.ready = false; }
  update(dt) {
    if (!this.chains.length) return;
    if (!this.ready) this.init();
    dt = Math.min(dt, 1 / 30);
    const cols = this.colliders.map((c) => { c.object.updateWorldMatrix(true, false); return { p: c.offset.clone().applyMatrix4(c.object.matrixWorld), r: c.radius }; });
    for (const ch of this.chains) for (const j of ch.joints) {
      const b = j.bone, parent = b.parent;
      parent.updateWorldMatrix(true, false);
      // rest orientation of this bone given the parent's current pose
      const parentQ = new THREE.Quaternion(); parent.getWorldQuaternion(parentQ);
      const restQ = parentQ.clone().multiply(j.initialQ);
      const head = b.position.clone().applyMatrix4(parent.matrixWorld);
      const restDir = j.axis.clone().applyQuaternion(restQ);
      const inertia = j.cur.clone().sub(j.prev).multiplyScalar(1 - j.drag);
      const next = j.cur.clone().add(inertia)
        .addScaledVector(restDir, j.stiffness * dt * j.length * 6)
        .add(new THREE.Vector3(0, -1, 0).multiplyScalar(j.gravity * dt * j.length * 6));
      next.sub(head).setLength(j.length).add(head);
      for (const c of cols) {
        const d = next.clone().sub(c.p), r = c.r + j.radius;
        if (d.length() < r) next.copy(c.p).addScaledVector(d.normalize(), r).sub(head).setLength(j.length).add(head);
      }
      j.prev.copy(j.cur); j.cur.copy(next);
      // rotate the bone so its axis points at the simulated tip
      const toTip = next.clone().sub(head).applyQuaternion(restQ.clone().invert()).normalize();
      const delta = new THREE.Quaternion().setFromUnitVectors(j.axis, toTip);
      b.quaternion.copy(j.initialQ).multiply(delta);
      b.updateWorldMatrix(false, false);
    }
  }
}
