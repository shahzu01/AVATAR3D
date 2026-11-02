"""Hair style library built from lens-section locks over the MakeHuman head.
Each style returns (V, F). Units metres, Z up, face -Y."""
import numpy as np
from scipy.spatial import cKDTree
from hair import Hair, _n, vnormals

class Engine(Hair):
    def __init__(self, P, T, head, seed=3):
        self.c, self.R = np.asarray(head[0]), np.asarray(head[1])
        self.Pb = P; self.Nb = vnormals(P, T)
        sel = P[:, 2] > self.c[2] - 0.6                 # head, neck, shoulders, upper back
        self.P = P[sel]; self.N = self.Nb[sel]; self.tree = cKDTree(self.P)
        self.V = []; self.F = []; self.rng = np.random.default_rng(seed)

    def surf(self, q):
        dd, k = self.tree.query(q, k=6); return self.P[k].mean(0), _n(self.N[k].mean(0)), dd[0]

    def hug(self, q, lo, hi):
        p, n, _ = self.surf(q); h = (q - p) @ n
        return q + n * (np.clip(h, lo, hi) - h)

    def roots(self, n, keep):
        """Fibonacci directions on the cranium ellipsoid projected to the scalp; keep(u) filters."""
        i = np.arange(n) + 0.5; phi = np.arccos(1 - 2 * i / n); th = np.pi * (1 + 5 ** 0.5) * i
        U = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
        out = []
        for u in U:
            if not keep(u): continue
            p, nrm, _ = self.surf(self.c + u * self.R); out.append((p, nrm, u))
        return out

    def hairline(self, u, nape=-0.42, front=0.45):
        qz, qy, qx = u[2], u[1], abs(u[0])
        if qy < -0.5 and qz < front: return False
        if qz < 0.15 and qy < 0.1: return False
        if qx > 0.78 and qz < 0.38: return False
        if qz < nape or (qy > 0.2 and qz < nape + 0.14): return False
        return True

    # ---------- over-scalp flow with free fall below
    def flow(self, n, target, hem, w=(0.016, 0.024), off=0.005, layers=3, step=0.011, waves=0.0, wavelen=0.06,
             fall=True, taper=3.0, th=0.0045, maxlen=80, roots_keep=None, jitter=0.03, guard=True, steps_fn=None, lift_fn=None):
        rng = self.rng; c = self.c
        keep = roots_keep or (lambda u: u[2] > 0.25 and self.hairline(u))
        rs = self.roots(n, keep)
        for idx, (p, nrm, u) in enumerate(rs):
            layer = idx % layers; o = off + 0.0035 * layer
            pts = [p + nrm * 0.002]; d = None; freed = False; ph = rng.uniform(0, 6.28)
            hz = hem(u) + rng.normal(0, 0.006)
            ml = maxlen if steps_fn is None else max(2, int(steps_fn(u) * rng.uniform(0.8, 1.15)))
            lift = 0.0 if lift_fn is None else lift_fn(u)
            for k in range(ml):
                q = pts[-1]; tgt = _n(target(q, u)) if not freed else _n(np.array([0.0, 0.25 if q[1] > c[1] else -0.05, -1.0]))
                sp, sn, dist = self.surf(q)
                rel = q - c
                if guard and rel[1] < -0.03 and q[2] < c[2] + 0.05:     # wrap around the face, never over it
                    tgt = _n(tgt + np.array([np.sign(q[0] + 1e-6) * 1.6, 1.0, 0.0]))
                if not freed:
                    tgt = _n(tgt - sn * (tgt @ sn))
                d = tgt if d is None else _n(d * 0.65 + tgt * 0.35 + rng.normal(0, jitter, 3))
                q2 = q + d * step
                if waves and freed:
                    side = _n(np.cross(d, sn)); q2 = q2 + side * waves * np.cos(ph + k * step / wavelen * 6.28) * step * 3
                sp, sn, dist = self.surf(q2)
                h = (q2 - sp) @ sn
                if not freed:
                    ol = o + lift * np.sin(min(k / max(ml - 1, 1), 1) * np.pi * 0.85)
                    q2 = q2 + sn * (np.clip(h, ol, ol + 0.005) - h)
                    if fall and q2[2] < c[2] - 0.11 and (q2 - c)[1] > -0.05: freed = True
                else:
                    if h < o: q2 = q2 + sn * (o - h)
                pts.append(q2)
                if q2[2] < hz: break
            if len(pts) < 4: continue
            pts = pts[::2] if len(pts) > 10 else pts
            self.lock(pts, rng.uniform(*w), th, bend=0.15, taper=taper)
        return self

    # ---------- gathered locks: from hairline toward a gather point
    def gather(self, G, n=360, w=(0.014, 0.02), off=0.005, layers=3, keep=None, loose=0):
        rng = self.rng
        rs = self.roots(n, keep or self.hairline)
        for idx, (p, nrm, u) in enumerate(rs):
            o = off + 0.003 * (idx % layers); pts = [p + nrm * 0.002]; d = None
            for k in range(60):
                q = pts[-1]; sp, sn, _ = self.surf(q)
                tgt = _n(G - q)
                if (q - self.c)[1] < -0.03 and q[2] < self.c[2] + 0.05: tgt = _n(tgt + np.array([0, 1.2, 1.0]))
                tgt = _n(tgt - sn * (tgt @ sn))
                d = tgt if d is None else _n(d * 0.6 + tgt * 0.4 + rng.normal(0, 0.02, 3))
                q2 = self.hug(q + d * 0.012, o, o + 0.004); pts.append(q2)
                if np.linalg.norm(q2 - G) < 0.018: break
            if len(pts) >= 3: self.lock(pts[::2] if len(pts) > 10 else pts, rng.uniform(*w), 0.004, bend=0.12, taper=2.0)
        return self

    def tie(self, G, axis, r=0.017, tube=0.004):
        a = _n(axis); b = _n(np.cross(a, [0.3, 0.2, 1.0])); cc = np.cross(a, b)
        pts = [G + (b * np.cos(t) + cc * np.sin(t)) * r for t in np.linspace(0, 6.283, 17)]
        self.lock(pts, tube, tube, bend=0, taper=50.0, nseg=32, ring=8, out_hint=a)

    # ---------- bundles
    def tail(self, G, path, n=70, spread=0.02, w=(0.01, 0.016), waves=0.0):
        """Ponytail: n locks following path(t)->point (t 0..1) with a radial spread that fans then narrows."""
        rng = self.rng
        for i in range(n):
            ang = rng.uniform(0, 6.283); rr = spread * np.sqrt(rng.uniform(0, 1)); ph = rng.uniform(0, 6.28)
            L = rng.uniform(0.8, 1.0); pts = []
            for t in np.linspace(0, L, 9):
                p = path(t); tg = _n(path(min(t + 0.02, 1)) - path(max(t - 0.02, 0)))
                a = _n(np.cross(tg, [0.0, 1.0, 0.1])); b = np.cross(tg, a)
                fan = rr * (0.6 + 1.2 * np.sin(np.pi * min(t * 1.2, 1)))
                off = (a * np.cos(ang) + b * np.sin(ang)) * fan
                if waves: off += a * waves * np.sin(ph + t * 18)
                q = p + off
                sp, sn, _ = self.surf(q); h = (q - sp) @ sn
                if h < 0.006: q = q + sn * (0.006 - h)
                pts.append(q)
            self.lock(pts, rng.uniform(*w), 0.0045, bend=0.2, taper=1.5)
        return self

    def braid(self, path, width=0.022, thick=0.016, turns=7, taper_end=0.75):
        """Three-strand braid along path(t)."""
        for k in range(3):
            pts = []; ws = []
            for t in np.linspace(0, 1, 90):
                p = path(t); tg = _n(path(min(t + 0.01, 1)) - path(max(t - 0.01, 0)))
                a = _n(np.cross(tg, [0.0, 1.0, 0.05])); b = np.cross(tg, a)
                s = 1 - max(0, t - taper_end) / (1 - taper_end) * 0.55
                ph = turns * 6.283 * t + k * 6.283 / 3
                pts.append(p + a * np.sin(ph) * width * s + b * np.sin(2 * ph) * width * 0.35 * s)
            self.lock(pts, thick * 0.75, thick * 0.55, bend=0.0, taper=8.0, nseg=120, ring=10)
        return self

    def bun(self, C, r=0.035, n=30, axis=(0, 0.3, 1)):
        rng = self.rng; a = _n(np.asarray(axis, float))
        for i in range(n):
            b = _n(np.cross(a, rng.normal(0, 1, 3))); cc = np.cross(a, b)
            lat = rng.uniform(-0.75, 0.75); pts = []
            rr = r * np.sqrt(1 - lat ** 2)
            for t in np.linspace(0, rng.uniform(4.0, 6.0), 14):
                pts.append(C + a * lat * r + (b * np.cos(t) + cc * np.sin(t)) * rr * rng.uniform(0.95, 1.08))
            self.lock(pts, rng.uniform(0.012, 0.017), 0.006, bend=0.1, taper=3.0, out_hint=None)
        return self

    def curls(self, n=900, L=(0.05, 0.085), coil=0.009, turns=(2.0, 3.5), w=0.0055):
        rng = self.rng; c = self.c
        rs = self.roots(n, lambda u: u[2] > -0.35 and self.hairline(u, nape=-0.4, front=0.4))
        for p, nrm, u in rs:
            out = _n(nrm * 0.75 + _n(p - c) * 0.5 + np.array([0, 0, -0.15]) * (u[2] < 0.3))
            a = _n(np.cross(out, rng.normal(0, 1, 3))); b = np.cross(out, a)
            Ln = rng.uniform(*L); tn = rng.uniform(*turns); ph = rng.uniform(0, 6.28); pts = []
            for t in np.linspace(0, 1, 26):
                ang = ph + t * tn * 6.283
                q = p + out * Ln * t + (a * np.cos(ang) + b * np.sin(ang)) * coil * (0.3 + t)
                pts.append(q)
            self.lock(pts, w, w * 0.8, bend=0.0, taper=3.0, nseg=50, ring=7, out_hint=out)
        return self

    def out(self): return np.array(self.V), np.array(self.F)

# =============================================================== styles
def style(name, P, T, head):
    E = Engine(P, T, head); c, R = E.c, E.R
    top = c[2] + R[2]; brow = c[2] + 0.012; chin = c[2] - 0.13; shoulder = c[2] - 0.27
    down = np.array([0, 0, -1.0])
    def radial(q, u, k=0.35):
        h = q - c; h[2] = 0; return _n(h) * k + down if np.linalg.norm(h) > 1e-6 else down
    def part_flow(px=-0.03, sweep=0.0):
        def f(q, u):
            rel = q - c; fr = -rel[1] / R[1]
            sgn = 1.0 if q[0] >= px else -1.0
            v = np.array([sgn * 0.5, 0.0, -1.0]) + radial(q, u, 0.25)
            if sweep and fr > 0.55 and rel[2] > -0.01: v = np.array([sweep, -0.3, -0.7])
            elif not sweep and fr > 0.45: v = np.array([sgn * 1.0, 0.5, -0.6])
            return v
        return f
    def hem_by(front, side, back):
        return lambda u: front if -u[1] > 0.55 and u[2] > 0.2 else (back if u[1] > 0.3 else side)
    if name == 'Pixie cut':
        E.flow(420, part_flow(-0.035, 1.3), hem_by(brow + 0.018, c[2] - 0.035, c[2] - 0.085), fall=False)
    elif name == 'Bob':
        E.flow(520, part_flow(-0.03), hem_by(chin + 0.02, chin + 0.01, chin + 0.03), taper=6.0, th=0.005,
               roots_keep=lambda u: u[2] > 0.2 and E.hairline(u))
    elif name == 'Long waves':
        E.flow(520, part_flow(0.0), hem_by(shoulder - 0.04, shoulder - 0.06, shoulder - 0.09), waves=0.2, wavelen=0.08, jitter=0.015,
               w=(0.015, 0.022), maxlen=120)
    elif name == 'Bangs & straight':
        def f(q, u):
            rel = q - c
            if -rel[1] / R[1] > 0.5 and rel[2] > -0.02: return np.array([0, -0.55, -0.85])
            return np.array([np.sign(q[0]) * 0.3, 0.0, -1.0]) + radial(q, u, 0.2)
        E.flow(560, f, hem_by(brow + 0.014, shoulder - 0.05, shoulder - 0.06), taper=8.0, th=0.0045, maxlen=120,
               roots_keep=lambda u: u[2] > 0.15 and E.hairline(u))
    elif name in ('High ponytail', 'Braided ponytail'):
        G = c + np.array([0, 0.07, 0.07]) if name == 'High ponytail' else c + np.array([0, 0.095, 0.0])
        E.gather(G, 380)
        E.tie(G, _n(G - c), r=0.018)
        if name == 'High ponytail':
            path = lambda t: G + np.array([0, 0.03 + 0.07 * np.sin(t * 2.0), 0.02 - 0.4 * t ** 1.2])
            E.tail(G + _n(G - c) * 0.01, path, n=130, spread=0.028, w=(0.013, 0.02), waves=0.004)
        else:
            path = lambda t: G + np.array([0.0, 0.03 + 0.02 * t, -0.34 * t])
            E.braid(path, width=0.022, thick=0.032, turns=5)
    elif name == 'Side braid':
        G = c + np.array([0.075, 0.055, -0.065])
        E.gather(G, 380)
        E.tie(G, np.array([0.8, 0.4, -0.3]), r=0.016)
        path = lambda t: G + np.array([0.035 + 0.02 * t, -0.09 * t, -0.3 * t])
        E.braid(path, width=0.021, thick=0.03, turns=5)
    elif name == 'Messy bun':
        G = c + np.array([0, 0.04, 0.105]); E.gather(G, 380)
        E.bun(G + np.array([0, 0.012, 0.022]), r=0.036, n=34)
        for x in (-1, 1):                                    # loose face-framing strands
            for j in range(3):
                p0 = c + np.array([x * 0.065, -0.07 + j * 0.012, 0.035])
                pts = [p0 + np.array([x * 0.01 * k, -0.004 * k, -0.03 * k]) for k in range(6)]
                pts = [E.hug(q, 0.006, 0.02) for q in pts]
                E.lock(pts, 0.006, 0.003, bend=0.1, taper=1.0)
    elif name == 'Double buns':
        Gs = [c + np.array([s * 0.06, 0.02, 0.085]) for s in (-1, 1)]
        def keep_side(sgn): return lambda u: E.hairline(u) and np.sign(u[0] + 1e-6) == sgn
        for s, G in zip((-1, 1), Gs):
            E.gather(G, 380, keep=keep_side(s))
            E.bun(G + _n(G - c) * 0.025, r=0.03, n=26, axis=_n(G - c))
    elif name == 'Afro curls':
        E.flow(300, part_flow(0.0), hem_by(brow + 0.03, c[2] - 0.02, c[2] - 0.07), fall=False, w=(0.012, 0.018))
        E.curls(1000, L=(0.045, 0.07), coil=0.007, w=0.011, turns=(1.5, 2.5))
    return E.out()

def shell(E, T, keep, off=0.0025):
    """Buzz/undercut layer: offset copy of scalp faces."""
    c, R = E.c, E.R; P = E.Pb; N = E.Nb
    u = (P - c) / R; un = u / np.linalg.norm(u, axis=1, keepdims=True)
    ok = np.array([keep(x) for x in un]) & (np.linalg.norm(u, axis=1) < 1.6)
    F = [t for t in T if ok[t].all()]
    used = np.unique(np.array(F)); rm = -np.ones(len(P), int); rm[used] = np.arange(len(used))
    v0 = len(E.V); E.V += list(P[used] + N[used] * off); E.F += [list(rm[t] + v0) for t in F]

def beard(E, T, rng, n=2600):
    c = E.c; P = E.Pb
    cen = P[T].mean(1); rel = cen - c
    def inside(r):
        if not (-0.14 < r[2] < -0.04) or r[1] > 0.03: return False
        if r[2] > -0.058 and abs(r[0]) > 0.05 and r[1] < -0.06: return False          # upper cheeks clear
        if r[2] > -0.062 and abs(r[0]) < 0.03 and not (-0.075 < r[2] < -0.062): return False
        if -0.098 < r[2] < -0.07 and abs(r[0]) < 0.024 and r[1] < -0.07: return False   # lips
        return True
    ok = np.array([inside(r) for r in rel]); idx = np.where(ok)[0]
    area = np.linalg.norm(np.cross(P[T[idx, 1]] - P[T[idx, 0]], P[T[idx, 2]] - P[T[idx, 0]]), axis=1)
    pick = rng.choice(idx, n, p=area / area.sum())
    for t in pick:
        a, b = rng.uniform(0, 1, 2)
        if a + b > 1: a, b = 1 - a, 1 - b
        p = P[T[t, 0]] * (1 - a - b) + P[T[t, 1]] * a + P[T[t, 2]] * b
        _, nrm, _ = E.surf(p)
        d = _n(np.array([0, -0.15, -1.0]) + nrm * 0.45 + rng.normal(0, 0.3, 3))
        L = rng.uniform(0.01, 0.018); pts = [p + nrm * 0.0012]
        for k in range(3):
            q = pts[-1] + d * L / 3; q = E.hug(q, 0.0025 + 0.0025 * k, 0.006 + 0.002 * k); pts.append(q)
            d = _n(d + rng.normal(0, 0.3, 3))
        E.lock(pts, 0.0017, 0.0013, bend=0.0, taper=1.5, nseg=6, ring=5)

def male_style(name, P, T, head):
    E = Engine(P, T, head, seed=9); c, R = E.c, E.R; rng = E.rng
    brow = c[2] + 0.018; shoulder = c[2] - 0.29
    side_short = lambda u: E.hairline(u) and u[2] < 0.55
    def toward_back(q, u):
        rel = q - c; return np.array([0.15 * np.sign(rel[0]), 1.0, -0.35 - 0.6 * max(0, -rel[2] / R[2])])
    if name == 'Buzz cut':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45, front=0.42), 0.0022)
    elif name == 'Short crew cut':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45, front=0.42), 0.002)
        def tg(q, u): rel = q - c; return np.array([0.1 * np.sign(rel[0]), -0.6 if rel[1] < -0.02 else 0.6, 0.2])
        E.flow(900, tg, lambda u: -9, steps_fn=lambda u: 2 + 3 * max(0, u[2]) ** 2, fall=False, w=(0.009, 0.013),
               roots_keep=lambda u: u[2] > 0.45 and E.hairline(u), lift_fn=lambda u: 0.004, taper=1.5, guard=False)
    elif name == 'Classic pompadour':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45), 0.0022)
        E.flow(700, toward_back, lambda u: -9, steps_fn=lambda u: 6 + 9 * max(0, -u[1]), fall=False, w=(0.014, 0.02),
               roots_keep=lambda u: u[2] > 0.5 and E.hairline(u), lift_fn=lambda u: 0.035 * max(0, -u[1]) ** 1.5 + 0.004,
               taper=2.0, guard=False, jitter=0.01)
    elif name == 'Messy textured quiff':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45), 0.0025)
        def tg(q, u):
            rel = q - c
            return np.array([rng.normal(0, 0.4), -0.2, 1.0]) if rel[1] < -0.03 else np.array([rng.normal(0, 0.5), 0.6, 0.2])
        E.flow(650, tg, lambda u: -9, steps_fn=lambda u: 4 + 5 * max(0, -u[1]), fall=False, w=(0.011, 0.016),
               roots_keep=lambda u: u[2] > 0.4 and E.hairline(u), lift_fn=lambda u: 0.02 * max(0, -u[1]) + 0.006,
               taper=1.3, guard=False, jitter=0.08)
    elif name == 'Undercut slick back':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45), 0.0018)
        E.flow(650, toward_back, lambda u: c[2] + 0.02, steps_fn=lambda u: 14, fall=False, w=(0.013, 0.019),
               roots_keep=lambda u: u[2] > 0.58 and E.hairline(u), lift_fn=lambda u: 0.012, taper=3.0, guard=False, jitter=0.01)
    elif name == 'Long wavy + beard':
        def tg(q, u):
            rel = q - c; sgn = np.sign(q[0] + 1e-6); fr = -rel[1] / R[1]
            return np.array([sgn * 1.0, 0.5, -0.6]) if fr > 0.45 else np.array([sgn * 0.4, 0.1, -1.0])
        E.flow(560, tg, lambda u: shoulder - 0.03, waves=0.25, wavelen=0.08, w=(0.015, 0.022), maxlen=120, jitter=0.015)
        beard(E, T, rng)
    elif name == 'Short spiky':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45), 0.0025)
        for p, nrm, u in E.roots(420, lambda u: u[2] > 0.25 and E.hairline(u)):
            d = _n(nrm * 1.0 + np.array([0, 0.15, 0.7]) + rng.normal(0, 0.25, 3) + (np.array([0, -0.4, 0.3]) if u[1] < -0.4 else 0))
            L = rng.uniform(0.035, 0.06) * (0.6 + 0.4 * u[2]); pts = [p + nrm * 0.002]
            for k in range(4): pts.append(pts[-1] + d * L / 4); d = _n(d + np.array([0, 0.1, 0.1]))
            E.lock(pts, rng.uniform(0.008, 0.012), 0.004, bend=0.3, taper=0.9)
    elif name == 'Man bun':
        G = c + np.array([0, 0.065, 0.075]); E.gather(G, 420)
        E.bun(G + _n(G - c) * 0.022, r=0.03, n=26, axis=_n(G - c)); E.tie(G, _n(G - c), r=0.016)
    elif name == 'Curly afro':
        E.flow(300, lambda q, u: np.array([0, 0.5, -1.0]), lambda u: c[2] - 0.03, fall=False, w=(0.012, 0.018))
        E.curls(1700, L=(0.06, 0.1), coil=0.008, w=0.011, turns=(1.5, 2.5))
    elif name == 'Side part comb over':
        shell(E, T, lambda u: E.hairline(u, nape=-0.45), 0.0022)
        px = 0.035
        def tg(q, u):
            rel = q - c
            if q[0] > px: return np.array([1.0, 0.2, -0.6])
            return np.array([-1.0, 0.25 if rel[1] > -0.02 else -0.15, -0.25])
        E.flow(650, tg, lambda u: c[2] - 0.0, steps_fn=lambda u: 9 if u[0] < px / R[0] else 4, fall=False,
               w=(0.013, 0.019), roots_keep=lambda u: u[2] > 0.5 and E.hairline(u), lift_fn=lambda u: 0.012 * max(0, -u[1]) + 0.004,
               taper=2.5, guard=False, jitter=0.012)
    return E.out()

MALE_STYLES = ['Short crew cut', 'Classic pompadour', 'Messy textured quiff', 'Undercut slick back', 'Buzz cut',
               'Long wavy + beard', 'Short spiky', 'Man bun', 'Curly afro', 'Side part comb over']

STYLES = ['Pixie cut', 'Bob', 'Long waves', 'Braided ponytail', 'Afro curls',
          'Messy bun', 'Double buns', 'Bangs & straight', 'Side braid', 'High ponytail']

if __name__ == '__main__':
    import sys
    sys.path.insert(0, '/home/claude/kael/fox')
    import mh, recipes
    P, faces, used, Q = mh.build(recipes.get('female')); P = P * (recipes.HEIGHT['female'] / P[:, 2].max())
    T = mh.tris(faces); head = recipes.headfit(P)
    if len(sys.argv) > 3 and sys.argv[3] == 'male':
        P, faces, used, Q = mh.build(recipes.get('male')); P = P * (recipes.HEIGHT['male'] / P[:, 2].max())
        T = mh.tris(faces); head = recipes.headfit(P); LIST, fn = MALE_STYLES, male_style
    else: LIST, fn = STYLES, style
    names = LIST if len(sys.argv) < 3 or sys.argv[2] == 'all' else [LIST[int(i)] for i in sys.argv[2].split(',')]
    for nm in names:
        v, f = fn(nm, P, T, head)
        i = LIST.index(nm)
        np.savez_compressed(f'{sys.argv[1]}/h{i}.npz', v=v.astype(np.float32), f=f.astype(np.int32))
        print(nm, len(f))
