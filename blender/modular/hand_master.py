"""Master hand, built from rules (see the VTuber Master Hand Topology guide).

Canonical LEFT hand, metres: wrist centre at the origin, fingers along +X, thumb side (radial) toward -Y,
back of the hand +Z, palm -Z. All quads. The wrist loop has 20 vertices, the same count as the kit's wrist
socket ring, so the hand welds onto any kit forearm. build() returns plain arrays; no Blender needed.

Topology: the palm is a 20-sided tube (8 quads across the back, 8 across the palm, 2 on each edge).
Each finger grows from a 2x2 patch of the tube's end, so neighbouring fingers share one edge column at the
web; the thumb grows from a 2x2 patch on the radial edge. Fingers and thumb are 8-sided tubes with three loops
at every joint (before, on, after) and a 4-quad rounded tip.
"""
import numpy as np

FING = ['Index', 'Middle', 'Ring', 'Little']
P = dict(
    palm_x=[0.0, 0.011, 0.024, 0.040, 0.056, 0.068, 0.078],            # palm loops, wrist -> knuckles
    half_w=[0.0185, 0.0235, 0.0290, 0.0320, 0.0335, 0.0335, 0.0330],
    thick=[0.0150, 0.0190, 0.0230, 0.0240, 0.0225, 0.0200, 0.0180],
    slot=[0.0178, 0.0174, 0.0164, 0.0144],                             # knuckle width given to each finger (sums to 2*half_w[-1])
    knuckle=[-0.0035, 0.0, -0.003, -0.0105],                           # knuckle arc: how far each finger root sits back from the middle one
    vis=[0.057, 0.063, 0.058, 0.046],                                  # finger length beyond the web
    rad=[0.0074, 0.0076, 0.0072, 0.0064],
    splay=[-3.0, 0.0, 2.5, 6.0], curl=(6.0, 9.0, 7.0),                 # degrees: rest splay per finger, rest curl per joint
    mcp_in=0.011, web=0.004, d=0.0034,
    thumb_len=(0.027, 0.026, 0.022), thumb_rad=0.0100, thumb_dir=(0.74, -0.60, -0.27), thumb_cmc=(0.017, -0.019, -0.0035),
)

def _rot(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a); x, y, z = axis / np.linalg.norm(axis)
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s], [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s], [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])

def build(p=P):
    V, Q, W = [], [], []                       # vertices, quads, weights (dict bone -> w)
    def add(co, w): V.append(np.asarray(co, float)); W.append(dict(w)); return len(V) - 1
    nr = len(p['palm_x']); ring = []           # ring[i] = 20 ids: top j=0..8 (radial->ulnar), ulnar mid, bottom j=8..0, radial mid
    edges = np.concatenate([[0], np.cumsum(p['slot'])]); cols_end = np.interp(np.arange(9), [0, 2, 4, 6, 8], edges) - p['half_w'][-1]
    kn_col = np.interp(np.arange(9), [1, 3, 5, 7], p['knuckle'])
    for i in range(nr):
        x, hw, t = p['palm_x'][i], p['half_w'][i], p['thick'][i]; f = i / (nr - 1); ids = []
        ys = (1 - f ** 2) * np.linspace(-hw, hw, 9) + f ** 2 * cols_end
        w = {'Hand': 1.0} if i > 1 else ({'Hand': 0.8, 'LowerArm': 0.2} if i == 1 else {'Hand': 0.5, 'LowerArm': 0.5})
        for side in (1, -1):
            for j in (range(9) if side == 1 else range(8, -1, -1)):
                u = j / 8 * 2 - 1; edge = abs(u) ** 2.2
                z = side * t / 2 * (1 - 0.42 * edge * (1 - 0.72 * f ** 2))
                if side == 1: z += 0.0015 * (1 - u * u) * np.sin(np.pi * f)                       # gentle arch over the back
                else:
                    z -= 0.0052 * np.exp(-((u + 0.62) / 0.33) ** 2 - ((x - 0.026) / 0.019) ** 2)   # thenar mound (thumb side of the palm)
                    z -= 0.0026 * np.exp(-((u - 0.70) / 0.30) ** 2 - ((x - 0.030) / 0.024) ** 2)   # heel of the hand on the little-finger side
                    z += 0.0020 * np.exp(-(u / 0.35) ** 2 - ((x - 0.045) / 0.018) ** 2)            # hollow of the palm
                    z -= 0.0012 * np.exp(-((x - 0.070) / 0.008) ** 2)                              # pads under the knuckles
                xx = x + (kn_col[j] * f ** 3)
                ww = dict(w)
                if side == -1 and u < -0.3 and 0.012 < x < 0.05: ww = {'Hand': 0.7, 'ThumbMetacarpal': 0.3}
                ids.append(add([xx, ys[j] * (1 - 0.035 * edge), z], ww))
            ym = (hw if side == 1 else -hw) if i < nr - 1 else (cols_end[8] if side == 1 else cols_end[0])
            ids.append(add([x + (kn_col[8 if side == 1 else 0] * f ** 3), ym * 1.0, 0.0], w))
        ring.append(ids)
    top = lambda i, j: ring[i][j]; bot = lambda i, j: ring[i][18 - j]; um = lambda i: ring[i][9]; rm = lambda i: ring[i][19]
    thumb_patch = {(1, 2)}                      # radial edge, between loops 1..3: both quads removed, thumb grows here
    for i in range(nr - 1):
        a, b = ring[i], ring[i + 1]
        for k in range(20):
            k2 = (k + 1) % 20
            if i in (1, 2) and k in (18, 19): continue      # radial edge quads: (bottom j0 -> radial mid) and (radial mid -> top j0)
            Q.append([a[k], a[k2], b[k2], b[k]])
    joints = {'Hand': np.zeros(3)}
    # fingers
    xk = p['palm_x'][-1]; webs = {}
    for c in (2, 4, 6): webs[c] = add([xk + kn_col[c] + p['web'], cols_end[c], 0.0], {'Hand': 0.8, FING[c // 2 - 1] + 'Proximal': 0.1, FING[c // 2] + 'Proximal': 0.1})
    for f, name in enumerate(FING):
        c = 2 * f; L = nr - 1
        left = rm(L) if f == 0 else webs[c]; right = um(L) if f == 3 else webs[c + 2]
        root = [top(L, c), top(L, c + 1), top(L, c + 2), right, bot(L, c + 2), bot(L, c + 1), bot(L, c), left]
        for v in root:
            if 'Hand' in W[v] and len(W[v]) == 1: W[v] = {'Hand': 0.72, name + 'Proximal': 0.28}
        cy = (cols_end[c] + cols_end[c + 2]) / 2; r0 = p['rad'][f]; T = p['vis'][f] + p['mcp_in'] + p['web']
        vis = p['vis'][f]; L1, L2, L3 = p['mcp_in'] + p['web'] + 0.37 * vis, 0.345 * vis, 0.285 * vis; d = p['d']
        mcp = np.array([xk + kn_col[c + 1] - p['mcp_in'], cy, 0.0])
        R0 = _rot(np.array([0, 0, 1.0]), p['splay'][f]); Rs = [R0 @ _rot(np.array([0, 1.0, 0]), p['curl'][0])]
        Rs.append(Rs[0] @ _rot(np.array([0, 1.0, 0]), p['curl'][1])); Rs.append(Rs[1] @ _rot(np.array([0, 1.0, 0]), p['curl'][2]))
        pip = mcp + Rs[0] @ [L1, 0, 0]; dip = pip + Rs[1] @ [L2, 0, 0]; tip = dip + Rs[2] @ [L3, 0, 0]
        joints[name + 'Proximal'], joints[name + 'Intermediate'], joints[name + 'Distal'], joints[name + '_tip'] = mcp, pip, dip, tip
        bn = [name + 'Proximal', name + 'Intermediate', name + 'Distal']
        s0 = p['mcp_in'] + p['web'] + 0.0030
        plan = [(s0, 0, None, {bn[0]: 0.9, 'Hand': 0.1}, 1.03), ((s0 + L1 - d) / 2, 0, None, {bn[0]: 1.0}, 0.985),
                (L1 - d, 0, None, {bn[0]: 0.82, bn[1]: 0.18}, 1.0), (L1, 0, 1, {bn[0]: 0.5, bn[1]: 0.5}, 1.045), (L1 + d, 1, None, {bn[0]: 0.18, bn[1]: 0.82}, 1.0),
                (L1 + L2 / 2, 1, None, {bn[1]: 1.0}, 0.97),
                (L1 + L2 - d, 1, None, {bn[1]: 0.82, bn[2]: 0.18}, 0.985), (L1 + L2, 1, 2, {bn[1]: 0.5, bn[2]: 0.5}, 1.03), (L1 + L2 + d, 2, None, {bn[1]: 0.18, bn[2]: 0.82}, 0.985),
                (L1 + L2 + (d + L3 - 1.05 * r0) / 2, 2, None, {bn[2]: 1.0}, 1.0), (T - 1.05 * r0, 2, None, {bn[2]: 1.0}, 0.98), (T - 0.52 * r0, 2, None, {bn[2]: 1.0}, 0.84), (T - 0.14 * r0, 2, None, {bn[2]: 1.0}, 0.50)]
        prev = root
        for s, seg, joint, w, bulge in plan:
            base = [mcp, pip, dip][seg]; off = s - [0, L1, L1 + L2][seg]; R = Rs[seg]
            if joint is not None:                                  # loop on the joint: lies in the plane that halves the bend
                base = [mcp, pip, dip][joint]; off = 0.0; Ra, Rb = Rs[joint - 1], Rs[joint]; M = Ra + Rb; U, _, Vt = np.linalg.svd(M); R = U @ Vt
            cen = base + R @ [off, 0, 0]; r = r0 * (1 - 0.15 * s / T) * bulge; cur = []
            for k in range(8):
                a = np.radians(135 - 45 * k); zr = r * (0.94 if np.sin(a) > 0 else 1.0)      # slightly flatter on the back, fuller pad underneath
                cur.append(add(cen + R @ [0, r * np.cos(a), zr * np.sin(a)], w))
            for k in range(8): Q.append([prev[k], prev[(k + 1) % 8], cur[(k + 1) % 8], cur[k]])
            prev = cur
        ct = add(tip, {bn[2]: 1.0})
        for k in range(0, 8, 2): Q.append([prev[k], prev[(k + 1) % 8], prev[(k + 2) % 8], ct])
    # thumb
    a = np.array(p['thumb_dir'], float); a /= np.linalg.norm(a); up = np.array([0, 0, 1.0]); up -= up.dot(a) * a; up /= np.linalg.norm(up); v = np.cross(up, a); v *= np.sign(v[0]) or 1
    root = [top(1, 0), top(2, 0), top(3, 0), rm(3), bot(3, 0), bot(2, 0), bot(1, 0), rm(1)]
    for q in root: W[q] = {'Hand': 0.62, 'ThumbMetacarpal': 0.38}
    cmc = np.array(p['thumb_cmc'], float); M1, M2, M3 = p['thumb_len']; T = M1 + M2 + M3; r0 = p['thumb_rad']; d = p['d']
    mcp = cmc + a * M1; ip = mcp + a * M2; tip = ip + a * M3
    joints['ThumbMetacarpal'], joints['ThumbProximal'], joints['ThumbDistal'], joints['Thumb_tip'] = cmc, mcp, ip, tip
    bn = ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal']
    plan = [(0.009, {bn[0]: 0.85, 'Hand': 0.15}, 1.06), (0.018, {bn[0]: 1.0}, 1.05), (M1 - d, {bn[0]: 0.82, bn[1]: 0.18}, 1.06), (M1, {bn[0]: 0.5, bn[1]: 0.5}, 1.08), (M1 + d, {bn[0]: 0.18, bn[1]: 0.82}, 1.02),
            (M1 + M2 / 2, {bn[1]: 1.0}, 0.97), (M1 + M2 - d, {bn[1]: 0.82, bn[2]: 0.18}, 0.98), (M1 + M2, {bn[1]: 0.5, bn[2]: 0.5}, 1.03), (M1 + M2 + d, {bn[1]: 0.18, bn[2]: 0.82}, 0.99),
            (M1 + M2 + (d + M3 - 1.05 * r0) / 2, {bn[2]: 1.0}, 1.02), (T - 1.05 * r0, {bn[2]: 1.0}, 1.0), (T - 0.52 * r0, {bn[2]: 1.0}, 0.86), (T - 0.14 * r0, {bn[2]: 1.0}, 0.50)]
    flex = np.cross(a, up); flex /= np.linalg.norm(flex)                 # thumb joints hinge about this axis (set so a positive turn closes toward the palm)
    if (_rot(flex, 10) @ a)[2] > a[2]: flex = -flex
    Rt = [np.eye(3), _rot(flex, p.get('thumb_curl', (10, 12))[0]), _rot(flex, sum(p.get('thumb_curl', (10, 12))))]
    mcp = cmc + a * M1; ip = mcp + Rt[1] @ a * M2; tip = ip + Rt[2] @ a * M3
    joints['ThumbProximal'], joints['ThumbDistal'], joints['Thumb_tip'] = mcp, ip, tip
    prev = root
    for s, w, bulge in plan:
        seg = 0 if s < M1 - 1e-9 else 1 if s < M1 + M2 - 1e-9 else 2
        if abs(s - M1) < 1e-9: Rr = np.linalg.svd(Rt[0] + Rt[1]); Rr = Rr[0] @ Rr[2]; cen = mcp
        elif abs(s - M1 - M2) < 1e-9: Rr = np.linalg.svd(Rt[1] + Rt[2]); Rr = Rr[0] @ Rr[2]; cen = ip
        else: Rr = Rt[seg]; cen = [cmc, mcp, ip][seg] + Rr @ a * (s - [0, M1, M1 + M2][seg])
        r = r0 * (1 - 0.14 * s / T) * bulge; cur = []
        for k in range(8):
            ang = np.radians(135 - 45 * k); cur.append(add(cen + Rr @ (r * np.cos(ang) * v + r * 0.92 * np.sin(ang) * up), w))
        if prev is root:
            for k, e in enumerate((0.55, 0.60, 0.78, 0.84, 0.78, 0.60, 0.55, 0.50)): V[root[k]] = V[root[k]] + e * (V[cur[k]] - V[root[k]])     # saddle: the palm edge is drawn out along the thumb, most on the side facing the index finger (the web)
        for k in range(8): Q.append([prev[k], prev[(k + 1) % 8], cur[(k + 1) % 8], cur[k]])
        prev = cur
    ct = add(tip, {bn[2]: 1.0})
    for k in range(0, 8, 2): Q.append([prev[k], prev[(k + 1) % 8], prev[(k + 2) % 8], ct])
    V = np.array(V); Q = np.array(Q); used = np.zeros(len(V), bool); used[Q.ravel()] = True; remap = np.cumsum(used) - 1      # drop the patch centre the thumb replaced
    return {'verts': V[used], 'quads': remap[Q], 'weights': [w for w, u in zip(W, used) if u], 'joints': joints, 'wrist_loop': [int(remap[i]) for i in ring[0]], 'thumb_axis': a, 'thumb_up': up, 'thumb_flex': flex}

if __name__ == '__main__':
    h = build(); V, Q = h['verts'], h['quads']
    from collections import Counter
    ec = Counter(tuple(sorted((q[k], q[(k + 1) % 4]))) for q in Q for k in range(4))
    print('verts', len(V), 'quads', len(Q), 'boundary edges', sum(1 for c in ec.values() if c == 1), 'non-manifold', sum(1 for c in ec.values() if c > 2), 'unused verts', len(V) - len(set(Q.ravel())))
    print('bbox', V.min(0).round(3), V.max(0).round(3)); print({k: v.round(3).tolist() for k, v in h['joints'].items() if 'tip' in k})
