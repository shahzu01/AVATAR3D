"""Tiny SDF sculpting kit (numpy). Z up, character faces -Y, metres."""
import numpy as np

def _n(v):
    v = np.asarray(v, float); return v / np.linalg.norm(v)

def frame(d, up=(0, 0, 1)):
    """Rows: x', y', z' where z' = d (main axis)."""
    z = _n(d); u = np.asarray(up, float)
    if abs(np.dot(z, _n(u))) > 0.95: u = np.array([1.0, 0, 0])
    x = _n(np.cross(u, z)); y = np.cross(z, x)
    return np.stack([x, y, z])

def rot(ax, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    x, y, z = _n(ax)
    return np.array([[c + x*x*(1-c), x*y*(1-c) - z*s, x*z*(1-c) + y*s],
                     [y*x*(1-c) + z*s, c + y*y*(1-c), y*z*(1-c) - x*s],
                     [z*x*(1-c) - y*s, z*y*(1-c) + x*s, c + z*z*(1-c)]])

RS = [1.0]   # global radius multiplier (section bulk)

# ---- primitives: each returns (fn(P)->d, bbox lo, bbox hi)
def sphere(c, r):
    r = r * RS[0]
    c = np.asarray(c, float)
    return (lambda P: np.linalg.norm(P - c, axis=1) - r), c - r, c + r

def rcone(a, b, r1, r2):
    """Round cone (iq). Capsule when r1 == r2."""
    a = np.asarray(a, float); b = np.asarray(b, float); r1 *= RS[0]; r2 *= RS[0]
    ba = b - a; l2 = ba @ ba; rr = r1 - r2; a2 = l2 - rr*rr; il2 = 1.0 / l2
    def f(P):
        pa = P - a; y = pa @ ba; z = y - l2
        x2v = pa * l2 - y[:, None] * ba; x2 = np.einsum('ij,ij->i', x2v, x2v)
        y2 = y*y*l2; z2 = z*z*l2
        k = np.sign(rr) * rr*rr*x2
        out = (np.sqrt(x2*a2*il2) + y*rr) * il2 - r1
        m1 = np.sign(z)*a2*z2 > k
        out = np.where(m1, np.sqrt(x2 + z2)*il2 - r2, out)
        m2 = (np.sign(y)*a2*y2 < k) & ~m1
        out = np.where(m2, np.sqrt(x2 + y2)*il2 - r1, out)
        return out
    r = max(r1, r2)
    return f, np.minimum(a, b) - r, np.maximum(a, b) + r

def ellip(c, radii, R=None):
    """Ellipsoid; R rows are the local axes (default world)."""
    c = np.asarray(c, float); rad = np.asarray(radii, float) * RS[0]
    R = np.eye(3) if R is None else np.asarray(R, float)
    def f(P):
        q = (P - c) @ R.T
        k0 = np.linalg.norm(q / rad, axis=1); k1 = np.linalg.norm(q / (rad*rad), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    ext = np.abs(R.T) @ rad
    return f, c - ext, c + ext

def chain(pts, radii):
    """Smooth tube through points (list of round cones)."""
    return [rcone(pts[i], pts[i+1], radii[i], radii[i+1]) for i in range(len(pts) - 1)]

def warp(prim, fn_p, pad=0.0):
    """Apply a point warp (P->P) before evaluating; pad grows the bbox."""
    f, lo, hi = prim
    return (lambda P: f(fn_p(P))), lo - pad, hi + pad

# ---- operations
def smin(a, b, k):
    if k <= 0: return np.minimum(a, b)
    h = np.clip(0.5 + 0.5*(b - a)/k, 0, 1)
    return b + (a - b)*h - k*h*(1 - h)

def smax(a, b, k):
    return -smin(-a, -b, k)

class Scene:
    def __init__(self, lo, hi, vox):
        self.lo = np.asarray(lo, float); self.vox = vox
        self.n = np.ceil((np.asarray(hi) - self.lo) / vox).astype(int) + 1
        self.d = np.full(tuple(self.n), 1.0, np.float32)
        self.ops = 0

    def _block(self, lo, hi):
        i0 = np.clip(np.floor((lo - self.lo) / self.vox).astype(int), 0, self.n - 1)
        i1 = np.clip(np.ceil((hi - self.lo) / self.vox).astype(int) + 1, 0, self.n)
        return i0, i1

    def _apply(self, prim, k, mode):
        if isinstance(prim, list):
            for p in prim: self._apply(p, k, mode)
            return
        f, lo, hi = prim
        if getattr(self, 'xf', None):
            c, sc, t = self.xf; f0 = f
            f = (lambda P, f0=f0, c=c, sc=sc, t=t: f0(c + (P - t - c) / sc) * sc)
            lo = c + (lo - c) * sc + t; hi = c + (hi - c) * sc + t
        pad = 1.5*k + 0.012 + 2*self.vox
        i0, i1 = self._block(lo - pad, hi + pad)
        if np.any(i1 <= i0): return
        ax = [self.lo[j] + self.vox*np.arange(i0[j], i1[j]) for j in range(3)]
        X, Y, Z = np.meshgrid(*ax, indexing='ij')
        P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
        b = f(P).reshape(X.shape).astype(np.float32)
        sl = tuple(slice(i0[j], i1[j]) for j in range(3))
        a = self.d[sl]
        if mode == 'add': self.d[sl] = smin(a, b, k)
        elif mode == 'sub': self.d[sl] = smax(a, -b, k)
        elif mode == 'int': self.d[sl] = smax(a, b, k)
        self.ops += 1

    def add(self, prim, k=0.0, mirror=False):
        self._apply(prim, k, 'add')
        if mirror: self._apply(mirrored(prim), k, 'add')
    def sub(self, prim, k=0.0, mirror=False):
        self._apply(prim, k, 'sub')
        if mirror: self._apply(mirrored(prim), k, 'sub')

    def mesh(self):
        from skimage.measure import marching_cubes
        v, f, _, _ = marching_cubes(self.d, 0.0, spacing=(self.vox,)*3)
        return v + self.lo, f[:, ::-1]

def mirrored(prim):
    if isinstance(prim, list): return [mirrored(p) for p in prim]
    f, lo, hi = prim
    M = np.array([-1.0, 1, 1])
    return (lambda P: f(P * M)), np.minimum(lo*M, hi*M), np.maximum(lo*M, hi*M)
