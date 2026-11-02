"""Messy anime-realistic short hair built from lens-section locks (explicit mesh)."""
import numpy as np
from scipy.spatial import cKDTree

def _n(v): return v / np.linalg.norm(v)

def vnormals(P, T):
    N = np.zeros_like(P)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3): np.add.at(N, T[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

def spline(C, n):
    C = [C[0]] + list(C) + [C[-1]]; out = []
    for i in range(1, len(C) - 2):
        p0, p1, p2, p3 = C[i - 1], C[i], C[i + 1], C[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(C[-2]); return np.array(out)

class Hair:
    def __init__(self, P, T, c=(0, -0.055, 1.70)):
        self.c = np.asarray(c); sel = P[:, 2] > self.c[2] - 0.12
        self.idx = np.where(sel)[0]; self.P = P[sel]; self.N = vnormals(P, T)[sel]
        self.tree = cKDTree(self.P); self.V = []; self.F = []

    def push(self, q, off):
        for _ in range(3):
            dd, k = self.tree.query(q, k=6)
            p = self.P[k].mean(0); n = _n(self.N[k].mean(0))
            h = (q - p) @ n
            if h >= off: break
            q = q + n * (off - h)
        return q

    def lock(self, pts, w0, th0, bend=0.35, nseg=14, ring=10, out_hint=None, taper=1.0):
        st_taper = taper
        path = spline(pts, max(2, nseg // (len(pts) - 1)))
        m = len(path); V0 = len(self.V)
        for i in range(m):
            t = i / (m - 1)
            tg = _n(path[min(i + 1, m - 1)] - path[max(i - 1, 0)])
            nrm = _n(path[i] - self.c) if out_hint is None else out_hint
            sd = _n(np.cross(tg, nrm)); nr = np.cross(sd, tg)
            w = w0 * (1 - t ** st_taper) ** 0.9 + 0.0006; th = th0 * (1 - 0.85 * t) + 0.0004
            for j in range(ring):
                a = 2 * np.pi * j / ring
                x = np.cos(a) * w; y = np.sin(a) * th - bend * w * (np.cos(a) ** 2 - 0.5) * 0.5
                self.V.append(path[i] + sd * x + nr * y)
        for i in range(m - 1):
            for j in range(ring):
                a = V0 + i * ring + j; b = V0 + i * ring + (j + 1) % ring
                self.F += [[a, b, b + ring], [a, b + ring, a + ring]]
        tip = V0 + (m - 1) * ring; self.V.append(path[-1] + _n(path[-1] - path[-2]) * 0.004); e = len(self.V) - 1
        for j in range(ring): self.F.append([tip + j, tip + (j + 1) % ring, e])
        base = V0; self.V.append(path[0] - _n(path[1] - path[0]) * 0.002); s0 = len(self.V) - 1
        for j in range(ring): self.F.append([base + (j + 1) % ring, base + j, s0])

STYLES = {
    'male_messy': dict(c=(0, -0.055, 1.70), R=(0.08, 0.104, 0.102), sweep=-0.35, noise=1.0, fringe=(0.075, 0.11), top=(0.09, 0.13),
                       under=(0.07, 0.1), side=0.7, lift=(0.08, 0.3), w=(0.01, 0.014), n=(700, 360), zmin=(1.698, 1.735), bend=(0.25, 0.35)),
    'female_pixie': dict(sweep=-0.9, noise=0.2, fringe=(0.09, 0.12), top=(0.09, 0.12), under=(0.06, 0.085), side=0.8,
                         lift=(0.02, 0.07), w=(0.022, 0.03), n=(420, 200), zmin=(0.006, 0.03), bend=(0.15, 0.2), taper=2.5),
}

def build(P, T, seed=11, style='male_messy', head=None):
    st = dict(STYLES['male_messy']); st.update(STYLES[style])
    rng = np.random.default_rng(seed)
    if head is not None: st['c'], st['R'] = head
    H = Hair(P, T, st['c']); c = H.c
    R = np.array(st['R'])
    whorl = c + np.array([0.01, 0.045, 0.1]) * R / np.array([0.08, 0.104, 0.102])
    zrel = lambda a: c[2] + a if a < 0.5 else a
    def roots(n):
        i = np.arange(n) + 0.5; phi = np.arccos(1 - 2 * i / n); th = np.pi * (1 + 5 ** 0.5) * i
        U = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
        out = []
        for u in U:
            qz, qy, qx = u[2], u[1], abs(u[0])
            if qy < -0.5 and qz < 0.45: continue
            if qz < 0.15 and qy < 0.1: continue
            if qx > 0.78 and qz < 0.38: continue
            if qz < -0.42 or (qy > 0.2 and qz < -0.28): continue
            p = c + u * R; _, k = H.tree.query(p); out.append((H.P[k], H.N[k], u))
        return out
    def grow(p, n, u, L, lift, layer):
        front = -u[1]
        flow = p - whorl; flow -= n * (flow @ n); flow = _n(flow + np.array([0, 0, -0.2]))
        fringe = front > 0.3 and u[2] > 0.2
        if fringe:
            flow = _n(np.array([u[0] * 0.6 + st['sweep'], -0.7, -0.8]) + rng.normal(0, 0.2 * st['noise'], 3))
        elif u[2] < 0.25:
            flow = _n(flow + np.array([0, 0.15, -1.0]) + rng.normal(0, 0.12 * st['noise'], 3))
        else:
            flow = _n(flow + np.array([st['sweep'] * 0.3, 0, 0]) + rng.normal(0, 0.2 * st['noise'], 3))
        pts = [p + n * 0.002]; d = _n(flow + n * lift); zmin = zrel(rng.uniform(*st['zmin']))
        if u[2] < 0.25 and not fringe: L *= st['side']
        if fringe: L = rng.uniform(*st['fringe'])
        off = 0.009 + 0.012 * layer
        for k in range(4):
            d = _n(d + flow * 0.35 + np.array([0, 0, -0.18 * k]) + rng.normal(0, 0.12 * st['noise'], 3))
            q = pts[-1] + d * L / 4
            q = H.push(q, off * (1 - 0.15 * k))
            if fringe and q[2] < zmin: q[2] = zmin + (q[2] - zmin) * 0.25
            pts.append(q)
        return pts
    w0, w1 = st['w']
    for p, n, u in roots(st['n'][0]):                           # under layer: flat cover
        H.lock(grow(p, n, u, rng.uniform(*st['under']), st['lift'][0], 0), rng.uniform(w0, w0 * 1.3), 0.0042, bend=st['bend'][0], taper=st.get('taper', 1.0))
    for p, n, u in roots(st['n'][1]):                           # outer layer: volume
        if rng.random() < 0.15: continue
        H.lock(grow(p, n, u, rng.uniform(*st['top']), st['lift'][1], 1), rng.uniform(w0, w1), 0.0048, bend=st['bend'][1], taper=st.get('taper', 1.0))
    return np.array(H.V), np.array(H.F)

def _main():
    import sys
    sys.path.insert(0, '/home/claude/kael/fox')
    import mh, recipes
    name = sys.argv[2] if len(sys.argv) > 2 else 'male'
    P, faces, used, Q = mh.build(recipes.get(name)); P = P * (recipes.HEIGHT[name] / P[:, 2].max())
    if recipes.HAIR[name] == 'female_pixie': v, f = build_flow(P, mh.tris(faces), recipes.headfit(P))
    else: v, f = build(P, mh.tris(faces), style=recipes.HAIR[name], head=recipes.headfit(P))
    np.savez_compressed(sys.argv[1], v=v.astype(np.float32), f=f.astype(np.int32))
    print('hair tris', len(f))

def build_flow(P, T, head, seed=5, n=420, part=-0.035, sweep=1.3, hem=(0.03, -0.035, -0.085),
               w=(0.016, 0.024), off=0.006, layers=3):
    """Sleek style: long locks from the crown/part flowing over the scalp to a hem line."""
    rng = np.random.default_rng(seed); c, R = head; H = Hair(P, T, c)
    crown = c + np.array([part * 0.6, 0.02, R[2] * 0.98])
    for i in range(n):
        layer = i % layers
        # root near the part line / crown
        t = rng.uniform(0, 1)
        root_dir = _n(np.array([rng.uniform(-0.95, 0.95), -0.9 + 1.7 * t, rng.uniform(0.55, 1.1)]))
        p0 = c + root_dir * R; _, k = H.tree.query(p0); p = H.P[k]
        side = np.sign(p[0] - part) if abs(p[0] - part) > 0.004 else rng.choice([-1, 1])
        az = np.arctan2(p[1] - c[1], p[0] - c[0])
        pts = [p + H.N[k] * 0.002]; d = None
        for step in range(40):
            q = pts[-1]; rel = q - c
            front = -rel[1] / R[1]
            if front > 0.55 and rel[2] > -0.01:        # fringe sweeps across the forehead
                target = np.array([-side * 0 + sweep * np.sign(part) * -1, -0.4, -0.75])
            else:
                horiz = np.array([rel[0], rel[1], 0.0]); horiz = _n(horiz) if np.linalg.norm(horiz) > 1e-6 else np.array([0, 1.0, 0])
                target = horiz * 0.35 + np.array([0, 0.0, -1.0])
            dd, kk = H.tree.query(q, k=6); nrm = _n(H.N[kk].mean(0))
            tgt = _n(target); tgt = _n(tgt - nrm * (tgt @ nrm))
            d = tgt if d is None else _n(d * 0.6 + tgt * 0.4 + rng.normal(0, 0.03, 3))
            q2 = q + d * 0.011; o = off + 0.004 * layer
            for _ in range(2):
                dd2, k2 = H.tree.query(q2, k=6); sp = H.P[k2].mean(0); sn = _n(H.N[k2].mean(0))
                h = (q2 - sp) @ sn
                q2 = q2 + sn * (np.clip(h, o, o + 0.005) - h)
            pts.append(q2)
            fr = -(q2 - c)[1] / R[1]; bk = (q2 - c)[1] / R[1]
            hz = c[2] + (hem[0] if fr > 0.55 else (hem[2] if bk > 0.3 else hem[1])) + rng.normal(0, 0.006)
            if q2[2] < hz: break
        if len(pts) < 4: continue
        pts = pts[::2] if len(pts) > 8 else pts
        H.lock(pts, rng.uniform(*w), 0.0045, bend=0.15, taper=3.0)
    return np.array(H.V), np.array(H.F)

if __name__ == '__main__':
    _main()
