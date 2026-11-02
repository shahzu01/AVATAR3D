"""Animal heads on the human body: sculpt a species head (SDF) around the human head's own landmarks
(eyes, cranium), then shrink-wrap the human head mesh onto it. Vertex order is kept, so body types and
face expressions still work. Ears are separate meshes (returned by parts())."""
import numpy as np
from scipy.ndimage import map_coordinates
import sdf
from sdf import Scene, sphere, rcone, ellip, frame, rot, warp, _n, mirrored
from body import flat

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

V3 = lambda *a: np.array(a, float)
#            snout len, snout radius base/tip, x-flatten, cranium w, cheek, nose size, tip drop, jaw, brow, ears
SPECIES = {
    'fox':     dict(L=0.105, r0=0.034, r1=0.012, fx=0.80, cran=1.02, cheek=0.050, nose=0.012, drop=0.010, jaw=0.85, brow=0.010, ears='fox'),
    'wolf':    dict(L=0.115, r0=0.038, r1=0.015, fx=0.85, cran=1.04, cheek=0.052, nose=0.014, drop=0.006, jaw=0.95, brow=0.012, ears='wolf'),
    'cat':     dict(L=0.045, r0=0.036, r1=0.020, fx=1.15, cran=1.04, cheek=0.056, nose=0.008, drop=0.004, jaw=0.75, brow=0.006, ears='cat'),
    'tiger':   dict(L=0.060, r0=0.044, r1=0.026, fx=1.20, cran=1.08, cheek=0.062, nose=0.012, drop=0.004, jaw=0.95, brow=0.010, ears='round'),
    'bear':    dict(L=0.080, r0=0.046, r1=0.028, fx=1.10, cran=1.12, cheek=0.062, nose=0.016, drop=0.002, jaw=1.0, brow=0.010, ears='round'),
    'panda':   dict(L=0.055, r0=0.048, r1=0.030, fx=1.15, cran=1.16, cheek=0.068, nose=0.014, drop=0.0, jaw=0.95, brow=0.006, ears='round'),
    'raccoon': dict(L=0.085, r0=0.036, r1=0.014, fx=0.90, cran=1.04, cheek=0.058, nose=0.012, drop=0.006, jaw=0.85, brow=0.008, ears='raccoon'),
    'bunny':   dict(L=0.040, r0=0.036, r1=0.022, fx=1.10, cran=1.04, cheek=0.054, nose=0.008, drop=0.002, jaw=0.70, brow=0.004, ears='bunny'),
}

def landmarks(V, EV, head):
    c, R = head
    eyes = [EV[EV[:, 0] > 0].mean(0), EV[EV[:, 0] < 0].mean(0)]
    er = np.linalg.norm(EV[EV[:, 0] > 0] - eyes[0], axis=1).max()
    M = (eyes[0] + eyes[1]) / 2
    return dict(c=np.asarray(c), R=np.asarray(R), eyes=eyes, er=er, M=M)

def head_sdf(L, p, vox=0.0016):
    c, R, M, er = L['c'], L['R'], L['M'], L['er']
    lo = c - np.array([0.13, 0.13 + p['L'], 0.33]); hi = c + np.array([0.13, 0.13, 0.12])
    s = Scene(lo, hi, vox)
    s.add(ellip(c, R * np.array([p['cran'], 1.0, 1.0])), 0)                                  # cranium
    nr = L.get('neck_r', 0.052); ny = L.get('neck_y', c[1] + 0.01)
    s.add(rcone(V3(0, ny, c[2] - 0.30), V3(0, ny - 0.005, c[2] - 0.06), nr, nr * 0.98), 0.04)      # neck (matches the human neck)
    s.add(ellip(M + V3(0, 0.03, -0.035), V3(0.062, 0.055, 0.055)), 0.03)                       # face mass
    base = M + V3(0, 0.0, -0.032); tip = M + V3(0, -p['L'], -0.036 - p['drop'])
    s.add(flat(rcone(base, tip, p['r0'], p['r1']), (base + tip) / 2, (1, 0, 0), p['fx']), 0.03)   # snout
    s.add(ellip(tip + V3(0, -p['r1'] * 0.55, p['r1'] * 0.25), V3(1.25, 0.9, 0.85) * p['nose']), 0.006)  # nose
    jb = M + V3(0, 0.03, -0.085); jt = M + V3(0, -p['L'] * p['jaw'], -0.06 - p['drop'])
    s.add(flat(rcone(jb, jt, 0.04, p['r1'] * 0.8), (jb + jt) / 2, (1, 0, 0), p['fx']), 0.025)  # lower jaw
    for sg in (1, -1):
        s.add(ellip(M + V3(sg * p['cheek'], 0.02, -0.045), V3(0.042, 0.045, 0.04)), 0.03)         # cheeks
    # eye sockets around the human eyeballs, brows above
    for e in L['eyes']:
        s.sub(ellip(e + V3(0, -er * 0.35, 0), V3(er * 1.1, er * 0.75, er * 0.85)), 0.004)
        s.add(ellip(e + V3(0, -er * 0.25, er * 1.15), V3(er * 1.4, er * 0.55, er * 0.35)), 0.014)  # brow
    return s

class Field:
    def __init__(self, s):
        self.d = s.d; self.lo = s.lo; self.vox = s.vox
        self.g = np.stack(np.gradient(self.d, self.vox), 0)
    def _idx(self, P): return ((P - self.lo) / self.vox).T
    def value(self, P): return map_coordinates(self.d, self._idx(P), order=1, mode='nearest')
    def grad(self, P): return np.stack([map_coordinates(self.g[k], self._idx(P), order=1, mode='nearest') for k in range(3)], 1)
    def project(self, P, it=4):
        for _ in range(it):
            d = self.value(P); g = self.grad(P); n2 = np.maximum((g * g).sum(1), 1e-9)
            P = P - (d / n2)[:, None] * g
        return P

def wrap(V, F, EV, head, name, ears_mask=None, iters=25):
    """Returns per-vertex delta that turns the human head into the species head."""
    p = SPECIES[name]; L = landmarks(V, EV, head); c, M = L['c'], L['M']
    nk = V[(np.abs(V[:, 2] - (c[2] - 0.17)) < 0.005) & (np.abs(V[:, 0]) < 0.1)]   # human neck size at the transition
    L['neck_y'] = (nk[:, 1].min() + nk[:, 1].max()) / 2; L['neck_r'] = (nk[:, 0].max() - nk[:, 0].min()) / 2 * 0.98
    s = head_sdf(L, p); fld = Field(s)
    z = V[:, 2]
    w = ss(c[2] - 0.215, c[2] - 0.14, z)                         # head weight: 0 on the neck, 1 on the head
    w = w * (1 - ss(0.0, 1.0, -(V[:, 1] - c[1]) / 0.4) * 0)       # (kept simple)
    for e in L['eyes']:                                            # keep the eyelids where the eyeballs are
        w = w * ss(L['er'] * 0.98, L['er'] * 1.12, np.linalg.norm(V - e, axis=1))
    if ears_mask is not None: w = np.maximum(w, ears_mask)
    sel = np.where(w > 1e-3)[0]
    X = V.copy()
    # pre-warp: front of the face pulled toward the snout so features keep their order
    front = ss(-0.02, 0.04, -(V[:, 1] - M[1])) * (1 - ss(0.02, 0.06, np.abs(V[:, 0]))) * ss(M[2] - 0.13, M[2] - 0.11, z) * (1 - ss(M[2] - 0.02, M[2] + 0.01, z))
    X[:, 1] -= front * p['L'] * 0.9
    X[:, 0] *= 1 - front * (1 - min(p['fx'], 1)) * 0.6
    # neighbours for smoothing (head region only)
    nb = [[] for _ in range(len(V))]
    for f in F:
        for a in range(len(f)):
            i, j = f[a], f[(a + 1) % len(f)]
            nb[i].append(j); nb[j].append(i)
    import scipy.sparse as sps
    rows = [i for i in sel for _ in nb[i]]; cols = [j for i in sel for j in nb[i]]
    Wm = sps.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(V), len(V)))
    deg = np.maximum(np.asarray(Wm.sum(1)).ravel(), 1); Wm = sps.diags(1 / deg) @ Wm
    for it in range(iters):
        Y = X[sel]; Pp = fld.project(Y)
        X[sel] = Y + (Pp - Y) * w[sel, None]
        if it < iters - 1:
            A = (Wm @ X)[sel]; X[sel] = X[sel] + (A - X[sel]) * 0.5 * w[sel, None]
    D = X - V
    return D, s, L

def parts(L, name, vox=0.0012):
    """Species ears (and other head parts) as a separate mesh in world coordinates."""
    p = SPECIES[name]; c, R = L['c'], L['R']
    s = Scene(c - np.array([0.16, 0.12, 0.08]), c + np.array([0.16, 0.12, 0.24]), vox)
    kind = p['ears']
    for sg in (1, -1):
        if kind in ('fox', 'wolf', 'cat', 'raccoon'):
            size = {'fox': 1.0, 'wolf': 0.95, 'cat': 0.72, 'raccoon': 0.62}[kind]
            b = c + V3(sg * R[0] * 0.62, 0.012, R[2] * 0.62)
            t = b + V3(sg * 0.045, 0.02, 0.115) * size
            n = _n(V3(sg * 0.3, -1.0, 0.15))
            ear = flat(rcone(b, t, 0.045 * size, 0.004), b, n, 0.38)
            s.add(ear, 0.02)
            cav = flat(rcone(b + V3(sg * 0.003, 0, 0.022 * size), t - V3(sg * 0.004, 0, 0.02 * size), 0.031 * size, 0.002), b, n, 0.3)
            s.sub(warp(cav, lambda P, n=n: P + n * 0.011), 0.006)
        elif kind == 'round':
            b = c + V3(sg * R[0] * 0.66, 0.01, R[2] * 0.7)
            s.add(flat(sphere(b + V3(sg * 0.018, 0, 0.03), 0.034), b, (sg * 0.2, -1, 0.1), 0.45), 0.015)
            s.sub(flat(sphere(b + V3(sg * 0.02, -0.012, 0.032), 0.022), b, (sg * 0.2, -1, 0.1), 0.3), 0.006)
        elif kind == 'bunny':
            b = c + V3(sg * R[0] * 0.35, 0.02, R[2] * 0.85)
            pts = [b, b + V3(sg * 0.035, 0.01, 0.07), b + V3(sg * 0.075, 0.02, 0.06), b + V3(sg * 0.10, 0.025, -0.03), b + V3(sg * 0.11, 0.02, -0.13)]
            for i in range(len(pts) - 1):
                r0, r1 = [0.022, 0.03, 0.034, 0.03, 0.016][i], [0.022, 0.03, 0.034, 0.03, 0.016][i + 1]
                s.add(flat(rcone(pts[i], pts[i + 1], r0, r1), pts[i], (sg * 0.9, -0.3, 0), 0.38), 0.02)
    v, f = s.mesh()
    return v, f
