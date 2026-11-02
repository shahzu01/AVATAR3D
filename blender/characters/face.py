"""Eyelashes and eyebrows as fine strand geometry, placed from the MakeHuman eyelid rims."""
import numpy as np
from collections import Counter, defaultdict
from scipy.spatial import cKDTree
from hair import Hair, _n, vnormals

def rims(P, faces, centers):
    """Boundary loops of the body mesh nearest each eye centre -> ordered rim points."""
    cnt = Counter()
    for f in faces:
        for a in range(len(f)):
            e = tuple(sorted((f[a], f[(a + 1) % len(f)]))); cnt[e] += 1
    bnd = [e for e, k in cnt.items() if k == 1]
    adj = defaultdict(list)
    for a, b in bnd: adj[a].append(b); adj[b].append(a)
    seen = set(); loops = []
    for s in adj:
        if s in seen: continue
        loop = [s]; seen.add(s); prev = None; cur = s
        while True:
            nx = [v for v in adj[cur] if v != prev and v not in seen]
            if not nx: break
            prev, cur = cur, nx[0]; loop.append(cur); seen.add(cur)
        loops.append(loop)
    out = []
    for c in centers:
        best = min(loops, key=lambda L: np.linalg.norm(P[L].mean(0) - c))
        out.append(P[best])
    return out

class Strands(Hair):
    def __init__(self, P, T):
        self.P = P; self.N = vnormals(P, T); self.tree = cKDTree(P); self.V = []; self.F = []; self.c = P.mean(0)

    def proj(self, q, off):
        dd, k = self.tree.query(q, k=4); w = 1 / np.maximum(dd, 1e-6); w /= w.sum()
        p = (self.P[k] * w[:, None]).sum(0); n = _n((self.N[k] * w[:, None]).sum(0))
        return q - n * ((q - p) @ n) + n * off

def lashes(S, rim, eye_c, rng, n_up=95, n_lo=18, scale=1.0):
    mid = eye_c[2] + 0.0005
    ctr = rim.mean(0)
    for upper, n, L, curl in ((True, n_up, 0.009, 0.45), (False, n_lo, 0.0038, 0.25)):
        pts = rim[(rim[:, 2] > mid) if upper else (rim[:, 2] <= mid)]
        if len(pts) < 3: continue
        order = np.argsort(pts[:, 0]); pts = pts[order]
        span = np.cumsum(np.r_[0, np.linalg.norm(np.diff(pts, axis=0), axis=1)])
        for i in range(n):
            s = rng.uniform(0.08, 0.95) * span[-1]
            k = np.searchsorted(span, s) - 1; k = np.clip(k, 0, len(pts) - 2)
            t = (s - span[k]) / max(span[k + 1] - span[k], 1e-9); p = pts[k] * (1 - t) + pts[k + 1] * t
            outw = _n(p - eye_c); up = np.array([0, 0, 1.0 if upper else -1.0])
            lat = abs(p[0]) - abs(ctr[0]); outer = np.clip(lat / 0.012, -1, 1)
            Ln = scale * L * (0.65 + 0.45 * (outer + 1) / 2) * rng.uniform(0.85, 1.1)
            fw = np.array([0, -1.0, 0])
            d0 = _n(fw * 1.0 + outw * 0.4 + up * 0.15 + np.array([np.sign(p[0]) * 0.35 * max(outer, 0), 0, 0]))
            q = [p]; d = d0
            for j in range(4):
                d = _n(d + up * curl * 0.35); q.append(q[-1] + d * Ln / 4)
            S.lock(q, 0.00016, 0.00014, bend=0.0, taper=1.2, nseg=8, ring=4, out_hint=outw)

def brows(S, eye_c, side, rng, n=230, female=True):
    """Arched brow of short strands hugging the skin."""
    sx = side; c = eye_c
    def arc(t):               # t 0 inner -> 1 outer
        x = c[0] + sx * (-0.017 + 0.045 * t)
        z = c[2] + 0.017 + 0.006 * np.sin(np.pi * min(t * 1.25, 1)) - 0.004 * t ** 2
        return np.array([x, c[1] - 0.012, z])
    thick = (0.003, 0.0011) if female else (0.0048, 0.0028)
    for i in range(n):
        t = rng.uniform(0, 1) ** 0.9
        a = arc(t); h = thick[0] * (1 - t) + thick[1] * t
        p0 = a + np.array([0, 0, rng.uniform(-h, h)])
        p0 = S.proj(p0, 0.0012)
        d = _n(np.array([sx * (0.25 + 1.2 * t), 0, 1.2 - 1.15 * t]) + rng.normal(0, 0.12, 3))
        L = rng.uniform(0.006, 0.009); q = [p0]
        for j in range(3):
            nx = q[-1] + d * L / 3
            nx = S.proj(nx, 0.0013 + 0.0003 * j)
            q.append(nx); d = _n(d + np.array([sx * 0.15, 0, -0.1]))
        S.lock(q, 0.0005, 0.0003, bend=0.0, taper=1.5, nseg=6, ring=4)

def raytri(o, D, A, B, C):
    """Moller-Trumbore: rays D (m,3) from o against triangles; returns nearest t per ray (inf if none)."""
    e1 = B - A; e2 = C - A
    out = np.full(len(D), np.inf)
    for i, d in enumerate(D):
        pv = np.cross(d, e2); det = np.einsum('ij,ij->i', e1, pv)
        ok = np.abs(det) > 1e-12; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        tv = o - A; u = np.einsum('ij,ij->i', tv, pv) * inv
        qv = np.cross(tv, e1); v = (qv @ d) * inv; t = np.einsum('ij,ij->i', e2, qv) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-5)
        if hit.any(): out[i] = t[hit].min()
    return out

def margin(P, T, ec, nth=64):
    """Eyelid margin: for each angle around the gaze axis, first polar angle where a ray from the eye centre hits skin."""
    cen = P[T].mean(1); near = np.linalg.norm(cen - ec, axis=1) < 0.045
    A, B, C = P[T[near, 0]], P[T[near, 1]], P[T[near, 2]]
    fwd = _n(np.array([0.12 * np.sign(ec[0]), -1, 0])); ax = _n(np.cross([0, 0, 1.0], fwd)); up = np.cross(fwd, ax)
    pts = []
    for th in np.linspace(0, 2 * np.pi, nth, endpoint=False):
        phis = np.radians(np.arange(2, 85, 1.0))
        D = np.array([fwd * np.cos(p) + (ax * np.cos(th) + up * np.sin(th)) * np.sin(p) for p in phis])
        t = raytri(ec, D, A, B, C)
        hit = np.where(np.isfinite(t) & (t < 0.019))[0]
        if len(hit): k = hit[0]; pts.append(ec + D[k] * t[k])
    return np.array(pts)

def build(P, faces, eye_centers, female=True, seed=4):
    rng = np.random.default_rng(seed)
    S = Strands(P, np.array([t for f in faces for t in ([f[0], f[1], f[2]], [f[0], f[2], f[3]] if len(f) == 4 else [])]) if False else _tris(faces))
    R = []
    T = _tris(faces)
    for ec in eye_centers:
        R.append(margin(P, T, ec))
    for rim, ec in zip(R, eye_centers):
        lashes(S, rim, ec, rng, n_up=95 if female else 75, scale=1.0 if female else 0.75)
        brows(S, ec, np.sign(ec[0]), rng, n=230 if female else 320, female=female)
    return np.array(S.V), np.array(S.F)

def _tris(faces):
    out = []
    for f in faces:
        for i in range(1, len(f) - 1): out.append([f[0], f[i], f[i + 1]])
    return np.array(out)

def _main():
    import sys
    sys.path.insert(0, '/home/claude/kael/fox')
    import mh, recipes
    name = sys.argv[2] if len(sys.argv) > 2 else 'female'
    P, faces, used, Q = mh.build(recipes.get(name)); s = recipes.HEIGHT[name] / P[:, 2].max(); P = P * s
    EV, EF = mh.proxy(mh.DATA + '/eyes/high-poly/high-poly.mhclo', mh.build.Praw); EV = mh.conv(EV) * s
    cs = [EV[EV[:, 0] > 0].mean(0), EV[EV[:, 0] < 0].mean(0)]
    build.eye_r = np.linalg.norm(EV[EV[:, 0] > 0] - cs[0], axis=1).max()
    v, f = build(P, faces, cs, female=(name == 'female'))
    np.savez_compressed(sys.argv[1], v=v.astype(np.float32), f=f.astype(np.int32), m=np.full(len(f), 1, np.int8))
    print('face strands', len(f))

if __name__ == '__main__':
    _main()
