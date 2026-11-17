// Cloth that moves: skirts and capes get chains of VRM spring bones, so they swing, settle and bounce off the legs
// when the character moves. Built when the character loads (live preview, stream page) and carried into a baked VRM.
// All skirt layers of one outfit hang from the same chains, so a petticoat can never swing through the dress over it.
import * as THREE from 'three';
import { VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider, VRMSpringBoneColliderShapeCapsule, VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm';

const SKIRT = { hitRadius: 0.032, stiffness: 1.35, gravityPower: 0.12, gravityDir: new THREE.Vector3(0, -1, 0), dragForce: 0.42 };
const CAPE = { hitRadius: 0.02, stiffness: 0.75, gravityPower: 0.22, gravityDir: new THREE.Vector3(0, -1, 0), dragForce: 0.4 };

/** Add spring chains to the outfit's skirts and cape. Returns how many chains were made. */
export function rigCloth(ctx, pieces) {
  const { vrm, P, kit } = ctx; vrm.scene.updateMatrixWorld(true);
  const raw = (n) => vrm.humanoid.getRawBoneNode(n), W = (o) => o.getWorldPosition(new THREE.Vector3());
  const skirts = pieces.filter((m) => /^Outfit_skirt/.test(m.name)), cape = pieces.find((m) => m.name === 'Outfit_cape');
  if (!skirts.length && !cape) return 0;
  const mgr = vrm.springBoneManager || (vrm.springBoneManager = new VRMSpringBoneManager());
  const groups = [bodyColliders(vrm, kit, P)];
  let chains = 0;

  if (skirts.length) {
    const hips = raw('hips'), C = W(hips), K = 16;
    // chain heights from the longest layer; joint radii from the outermost layer at that height and angle
    const ext = skirts.map((m) => { const p = m.geometry.attributes.position; let lo = 1e9, hi = -1e9; for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); } return { m, lo, hi }; });
    const top = Math.max(...ext.map((e) => e.hi)), hem = Math.min(...ext.map((e) => e.lo)), L = top - hem;
    const ys = [top - 0.06 * L, top - 0.42 * L, top - 0.78 * L, hem];
    const radius = (th, y) => { let best = 0; for (const { m } of ext) { const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const dy = p.getY(i) - y; if (Math.abs(dy) > 0.035) continue; const dx = p.getX(i) - C.x, dz = p.getZ(i) - C.z, a = Math.atan2(dz, dx), d = Math.atan2(Math.sin(a - th), Math.cos(a - th));
        if (Math.abs(d) < Math.PI / K) best = Math.max(best, Math.hypot(dx, dz)); } } return best; };
    const bones = [];        // bones[chain][level]
    for (let j = 0; j < K; j++) { const th = j / K * Math.PI * 2, row = []; let parent = hips;
      ys.forEach((y, l) => { let r = radius(th, y); if (!r) r = row.length ? row[row.length - 1].r : 0.12;
        const b = new THREE.Bone(); b.name = `Skirt_${j}_${l}`; const wp = new THREE.Vector3(C.x + r * Math.cos(th), y, C.z + r * Math.sin(th));
        parent.add(b); b.position.copy(parent.worldToLocal(wp.clone())); b.updateMatrixWorld(true); row.push(Object.assign(b, { r })); parent = b; });
      bones.push(row); }
    const flat = bones.flat();
    for (const { m } of ext) {
      const g = m.geometry, p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, base = m.skeleton.bones.length;
      const sk = new THREE.Skeleton([...m.skeleton.bones, ...flat], [...m.skeleton.boneInverses, ...flat.map((b) => b.matrixWorld.clone().invert())]);
      const hipIx = m.skeleton.bones.indexOf(hips);
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = Math.atan2(p.getZ(i) - C.z, p.getX(i) - C.x), u = ((a / (Math.PI * 2) * K) % K + K) % K, c0 = Math.floor(u) % K, c1 = (c0 + 1) % K, w1 = u - Math.floor(u);
        if (y >= ys[0]) { si.setXYZW(i, hipIx, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); continue; }
        let l = 0; while (l < 2 && y < ys[l + 1]) l++;
        const ix = (c, lv) => base + c * ys.length + lv;
        si.setXYZW(i, ix(c0, l), ix(c1, l), 0, 0); sw.setXYZW(i, 1 - w1, w1, 0, 0); }
      si.needsUpdate = sw.needsUpdate = true; m.bind(sk, m.bindMatrix);
    }
    for (const row of bones) { for (let l = 0; l < row.length - 1; l++) mgr.addJoint(new VRMSpringBoneJoint(row[l], row[l + 1], SKIRT, groups)); chains++; }
  }

  if (cape) {
    const g = cape.geometry, p = g.attributes.position, cols = 30, rows = p.count / cols, parent = raw('upperChest') || raw('chest') || raw('spine');
    if (Number.isInteger(rows) && rows >= 8) {
      const cs = [0, 6, 12, 17, 23, 29], lv = [1, Math.round(rows * 0.38), Math.round(rows * 0.7), rows - 1], at = (r, c) => new THREE.Vector3(p.getX(r * cols + c), p.getY(r * cols + c), p.getZ(r * cols + c));
      const bones = cs.map((c, j) => { let par = parent; return lv.map((r, l) => { const b = new THREE.Bone(); b.name = `Cape_${j}_${l}`; par.add(b); b.position.copy(par.worldToLocal(at(r, c))); b.updateMatrixWorld(true); par = b; return b; }); });
      const flat = bones.flat(), base = cape.skeleton.bones.length, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pIx = cape.skeleton.bones.indexOf(parent);
      const sk = new THREE.Skeleton([...cape.skeleton.bones, ...flat], [...cape.skeleton.boneInverses, ...flat.map((b) => b.matrixWorld.clone().invert())]);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c;
        if (r <= lv[0]) { si.setXYZW(i, pIx, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); continue; }
        let k = 0; while (k < cs.length - 2 && c > cs[k + 1]) k++; const w1 = (c - cs[k]) / (cs[k + 1] - cs[k]);
        let l = 0; while (l < 2 && r > lv[l + 1]) l++;
        si.setXYZW(i, base + k * lv.length + l, base + (k + 1) * lv.length + l, 0, 0); sw.setXYZW(i, 1 - w1, w1, 0, 0); }
      si.needsUpdate = sw.needsUpdate = true; cape.bind(sk, cape.bindMatrix);
      for (const row of bones) { for (let l = 0; l < row.length - 1; l++) mgr.addJoint(new VRMSpringBoneJoint(row[l], row[l + 1], CAPE, groups)); chains++; }
    }
  }
  // colliders must not start out overlapping the cloth, or the first frame shoves it outwards
  fitColliders(groups[0], [...mgr.joints].map((j) => j.child).filter(Boolean));
  mgr.setInitState();
  return chains;
}

/** Thighs, shins and hips as capsules and spheres, sized from the stitched body itself. */
function bodyColliders(vrm, kit, P) {
  const raw = (n) => vrm.humanoid.getRawBoneNode(n), W = (o) => o.getWorldPosition(new THREE.Vector3()), colliders = [];
  const meas = (a, b, part) => {            // typical distance of the limb's skin from the bone line (kit axes -> GL)
    const A = W(a), B = W(b), u = B.clone().sub(A), len = u.length(); u.normalize(); const ds = [];
    for (let m = 0; m < kit.vertexCount; m++) { if (!(kit.parts[kit.partA[m]] || '').startsWith(part)) continue; const v = new THREE.Vector3(P[m * 3], P[m * 3 + 2], -P[m * 3 + 1]).sub(A), t = v.dot(u); if (t < len * 0.15 || t > len * 0.85) continue; ds.push(v.addScaledVector(u, -t).length()); }
    ds.sort((x, y) => x - y); return ds.length ? ds[Math.floor(ds.length * 0.8)] : 0.06; };
  const cap = (bone, tailBone, r) => { const c = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeCapsule({ offset: new THREE.Vector3(), tail: bone.worldToLocal(W(tailBone)), radius: r })); c.name = `Collider_${bone.name}`; bone.add(c); colliders.push(c); };
  for (const s of ['left', 'right']) {
    const ul = raw(`${s}UpperLeg`), ll = raw(`${s}LowerLeg`), ft = raw(`${s}Foot`); if (!ul || !ll) continue;
    cap(ul, ll, meas(ul, ll, 'Leg')); if (ft) cap(ll, ft, meas(ll, ft, 'Leg') * 0.95);
  }
  for (const s of ['left', 'right']) {          // hands hang beside the skirt: keep the cloth from swinging through them
    const la = raw(`${s}LowerArm`), hd = raw(`${s}Hand`), mid = raw(`${s}MiddleProximal`); if (!la || !hd) continue;
    cap(la, hd, 0.032);
    const c = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ offset: mid ? hd.worldToLocal(W(mid)).multiplyScalar(0.6) : new THREE.Vector3(), radius: 0.045 })); c.name = `Collider_${hd.name}`; hd.add(c); colliders.push(c);
  }
  const hips = raw('hips'), spine = raw('spine'), chest = raw('upperChest') || raw('chest');
  for (const [b, r] of [[hips, 0.11], [spine, 0.1], [chest, 0.11]]) if (b) { const c = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ offset: new THREE.Vector3(0, 0, -0.01), radius: r })); c.name = `Collider_${b.name}`; b.add(c); colliders.push(c); }
  vrm.scene.updateMatrixWorld(true);
  return { name: 'Body', colliders };
}
function fitColliders(group, tips) {
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const c of group.colliders) { const sh = c.shape; c.updateWorldMatrix(true, false); let room = Infinity;
    for (const t of tips) { const tp = t.getWorldPosition(v);
      let d; if (sh.type === 'capsule') { a.copy(sh.offset).applyMatrix4(c.matrixWorld); b.copy(sh.tail).applyMatrix4(c.matrixWorld); const ab = b.clone().sub(a), k = THREE.MathUtils.clamp(tp.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); d = tp.distanceTo(a.addScaledVector(ab, k)); }
      else d = tp.distanceTo(a.copy(sh.offset).applyMatrix4(c.matrixWorld));
      room = Math.min(room, d - 0.022); }
    sh.radius = Math.max(0.015, Math.min(sh.radius, room)); }
}
