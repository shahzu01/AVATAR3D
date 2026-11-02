"""Fox: anthropomorphic, muscular, ~1.85 m, digitigrade. A-pose sculpt."""
import numpy as np
import sdf
from sdf import Scene, sphere, rcone, ellip, chain, frame, rot, warp, _n

V = np.array
def L(a, b, t): return np.asarray(a, float) + (np.asarray(b, float) - np.asarray(a, float)) * t

def flat(prim, c, normal, f):
    """Squash a primitive along `normal` by factor f (<1 = thinner)."""
    fn, lo, hi = prim; c = np.asarray(c, float); n = _n(normal)
    def g(P):
        q = P - c; t = q @ n
        return fn(c + q + np.outer(t * (1/f - 1), n)) * f
    return g, lo, hi

def oriented(c, d, radii, up=(0, 0, 1)):
    """Ellipsoid whose 3rd radius lies along direction d."""
    return ellip(c, radii, frame(d, up))

# --------------------------------------------------------------- landmarks
S  = V([0.205, 0.02, 1.465])   # shoulder joint
E  = V([0.285, 0.05, 1.185])   # elbow
W  = V([0.345, 0.00, 0.945])   # wrist
HP = V([0.098, 0.01, 0.945])   # hip joint
K  = V([0.112, -0.055, 0.565]) # knee
A  = V([0.118, 0.085, 0.235])  # hock
B  = V([0.118, -0.03, 0.05])   # ball of foot

def torso(s):
    s.add(ellip((0, 0.01, 1.335), (0.178, 0.128, 0.19)), 0)          # rib cage
    s.add(ellip((0, 0.025, 1.45), (0.225, 0.115, 0.09)), 0.06)     # shoulder girdle
    s.add(ellip((0, 0.0, 1.13), (0.135, 0.10, 0.16)), 0.07)         # belly
    s.add(ellip((0, 0.015, 0.985), (0.155, 0.11, 0.105)), 0.07)     # pelvis
    s.add(rcone((0, 0.03, 1.48), (0, 0.0, 1.63), 0.105, 0.088), 0.06)  # neck
    # traps
    s.add(oriented((0.09, 0.05, 1.53), (1, 0, -0.5), (0.045, 0.065, 0.1)), 0.045, mirror=True)
    # pecs
    s.add(ellip((0.088, -0.078, 1.375), (0.102, 0.05, 0.075), rot((0, 1, 0), -12)), 0.03, mirror=True)
    # lats + serratus
    s.add(ellip((0.14, 0.06, 1.35), (0.055, 0.065, 0.13), rot((0, 1, 0), 20)), 0.05, mirror=True)
    # abs
    for z, w in ((1.235, 0.034), (1.16, 0.035), (1.085, 0.036)):
        s.add(ellip((0.038, -0.08, z), (w, 0.022, 0.033)), 0.016, mirror=True)
    s.add(ellip((0, -0.083, 1.0), (0.062, 0.02, 0.055)), 0.02)
    # obliques
    s.add(ellip((0.105, -0.035, 1.09), (0.035, 0.055, 0.08), rot((0, 1, 0), 14)), 0.04, mirror=True)
    # back
    s.add(ellip((0.04, 0.095, 1.17), (0.036, 0.034, 0.17)), 0.04, mirror=True)
    s.sub(rcone((0, 0.15, 1.40), (0, 0.14, 1.12), 0.008, 0.008), 0.03)
    # glutes
    s.add(ellip((0.075, 0.085, 0.925), (0.085, 0.07, 0.09), rot((0, 1, 0), 8)), 0.045, mirror=True)
    # neck tendons + ruff
    s.add(rcone((0.03, -0.045, 1.49), (0.045, -0.02, 1.63), 0.02, 0.016), 0.025, mirror=True)

def arm(s):
    d = _n(E - S)
    s.add(rcone(S, E, 0.056, 0.042), 0.05)
    s.add(oriented(S + V([0.028, 0.0, -0.035]), d, (0.07, 0.075, 0.09), up=(0, 1, 0)), 0.035)  # deltoid
    s.add(oriented(L(S, E, 0.55) + V([0.0, -0.028, 0]), d, (0.04, 0.038, 0.095), up=(0, 1, 0)), 0.02)  # biceps
    s.add(oriented(L(S, E, 0.45) + V([0.008, 0.03, 0]), d, (0.043, 0.042, 0.11), up=(0, 1, 0)), 0.022)  # triceps
    d2 = _n(W - E)
    s.add(rcone(E, W, 0.05, 0.036), 0.03)
    s.add(oriented(L(E, W, 0.28) + V([0.012, -0.008, 0]), d2, (0.058, 0.05, 0.10), up=(0, 1, 0)), 0.03)  # forearm
    hand(s, W, d2)

def hand(s, W, d, hs=1.3):
    keep = sdf.RS[0]; sdf.RS[0] = 1.06
    side = V([1.0, 0, 0]); fwd = V([0, -1.0, 0])
    width = _n(np.cross(d, side))  # roughly front/back
    if width @ fwd < 0: width = -width
    pc = W + d * 0.05 * hs
    s.add(ellip(pc, V([0.026, 0.047, 0.054]) * hs, np.stack([side, width, d])), 0.025)  # palm
    for i, off in enumerate((-0.03, -0.01, 0.01, 0.03)):
        base = pc + d * 0.042 * hs + width * off * hs
        ln = V((0.032, 0.026, 0.022) if i in (1, 2) else (0.027, 0.022, 0.018)) * hs
        curl = [0.25, 0.55, 0.85]
        pts = [base]; dd = d.copy()
        for k in range(3):
            dd = _n(d * np.cos(curl[k]) - side * np.sin(curl[k]) * 0.9)
            pts.append(pts[-1] + dd * ln[k])
        r = list(V([0.0115, 0.0105, 0.0095, 0.008]) * hs)
        s.add(chain(pts, r), 0.012)
        tip = pts[-1]; s.add(rcone(tip, tip + (dd * 0.02 - side * 0.009) * hs, 0.006 * hs, 0.0008), 0.002)  # claw
    # thumb
    tb = pc + (width * 0.038 - side * 0.012 - d * 0.01) * hs
    pts = [tb]; dirs = [_n(d * 0.85 + width * 0.35 - side * 0.4), _n(d * 0.8 + width * 0.1 - side * 0.6)]
    for k, ln in enumerate((0.034, 0.026)): pts.append(pts[-1] + dirs[k] * ln * hs)
    s.add(chain(pts, list(V([0.015, 0.012, 0.01]) * hs)), 0.012)
    s.add(rcone(pts[-1], pts[-1] + (dirs[1] * 0.018 - side * 0.007) * hs, 0.006 * hs, 0.0008), 0.002)
    sdf.RS[0] = keep

def leg(s):
    s.add(rcone(HP, K, 0.098, 0.058), 0.06)
    dt = _n(K - HP)
    s.add(oriented(L(HP, K, 0.48) + V([0.0, -0.045, 0]), dt, (0.06, 0.05, 0.17)), 0.03)    # rectus
    s.add(oriented(L(HP, K, 0.5) + V([0.05, -0.012, 0]), dt, (0.05, 0.06, 0.17)), 0.035)   # vastus lat
    s.add(oriented(L(HP, K, 0.8) + V([-0.035, -0.035, 0]), dt, (0.04, 0.042, 0.075)), 0.025)  # vastus med
    s.add(oriented(L(HP, K, 0.45) + V([0.0, 0.045, 0]), dt, (0.062, 0.05, 0.16)), 0.035)   # hamstring
    s.add(oriented(L(HP, K, 0.35) + V([-0.03, 0.0, 0]), dt, (0.04, 0.055, 0.12)), 0.04)   # adductor
    s.add(sphere(K + V([0, -0.02, 0]), 0.045), 0.03)  # knee
    ds = _n(A - K)
    s.add(rcone(K, A, 0.06, 0.046), 0.03)
    s.add(oriented(L(K, A, 0.3) + V([0.0, 0.035, 0]), ds, (0.055, 0.058, 0.12)), 0.03)   # calf
    s.add(sphere(A, 0.046), 0.02)
    s.add(rcone(A, B, 0.045, 0.04), 0.02)
    paw(s, B)

def paw(s, B, ps=1.18):
    s.add(ellip(B + V([0, -0.022, -0.012]) * ps, V([0.054, 0.05, 0.036]) * ps), 0.025)
    for x, y in ((-0.043, -0.062), (-0.016, -0.078), (0.016, -0.078), (0.043, -0.062)):
        c = B + V([x, y, -0.026]) * ps
        s.add(ellip(c, V([0.019, 0.026, 0.02]) * ps, rot((0, 0, 1), -x * 300)), 0.012)
        tip = c + V([x * 0.25, -0.022, 0.004]) * ps
        s.add(rcone(tip, tip + V([x * 0.12, -0.018, -0.017]) * ps, 0.008 * ps, 0.0012), 0.003)
    s.add(sphere(B + V([0, 0.018, -0.016]) * ps, 0.03 * ps), 0.02)

def head(s):
    s.add(ellip((0, 0.008, 1.765), (0.08, 0.076, 0.078)), 0.05)       # cranium
    s.add(ellip((0, -0.042, 1.772), (0.06, 0.05, 0.044)), 0.04)       # forehead
    s.add(flat(rcone((0, -0.06, 1.737), (0, -0.2, 1.713), 0.038, 0.014), (0, -0.1, 1.73), (1, 0, 0), 0.78), 0.035)  # snout
    sd = _n(V([0, -0.13, -0.025]))
    s.add(ellip((0.016, -0.14, 1.704), (0.017, 0.035, 0.013), frame(sd)[[0, 2, 1]]), 0.015, mirror=True)  # whisker pads
    s.add(ellip((0, -0.208, 1.717), (0.0145, 0.011, 0.011)), 0.006)    # nose
    s.add(rcone((0, -0.05, 1.675), (0, -0.18, 1.694), 0.03, 0.009), 0.018)  # jaw
    s.sub(rcone((0.034, -0.09, 1.693), (0.0, -0.188, 1.7025), 0.0026, 0.002), 0.003, mirror=True)  # mouth line
    # cheeks + cheek ruff
    s.add(ellip((0.058, -0.03, 1.712), (0.05, 0.05, 0.045)), 0.035, mirror=True)
    s.add(ellip((0.075, 0.0, 1.69), (0.06, 0.055, 0.05)), 0.03, mirror=True)
    for a, l, z, y in ((8, 0.05, 1.71, -0.01), (28, 0.058, 1.69, 0.0), (50, 0.052, 1.668, 0.012)):
        ar = np.radians(a); dd = _n(V([np.cos(ar), 0.3, -np.sin(ar)]))
        p0 = V([0.085, y, z])
        s.add(flat(rcone(p0, p0 + dd * l, 0.03, 0.009), p0, (0, 0.4, 1), 0.6), 0.025, mirror=True)
    # eyes: shallow socket, ball, stern brow, lower lid
    eye = V([0.043, -0.066, 1.758])
    s.sub(ellip(eye + V([0, -0.006, 0]), (0.025, 0.016, 0.015), rot((0, 1, 0), 12)), 0.008, mirror=True)
    s.add(sphere(eye + V([0.0, 0.004, 0]), 0.019), 0.0015, mirror=True)
    s.add(ellip(eye + V([0.002, -0.011, 0.019]), (0.027, 0.011, 0.007), rot((0, 1, 0), 15)), 0.016, mirror=True)
    s.add(ellip(eye + V([0.002, -0.01, -0.017]), (0.024, 0.01, 0.006), rot((0, 1, 0), 8)), 0.008, mirror=True)
    # neck ruff + throat fluff
    s.add(ellip((0, -0.01, 1.585), (0.1, 0.08, 0.07)), 0.05)
    # ears: broad triangular with a cupped front
    b = V([0.056, 0.03, 1.83]); t = V([0.112, 0.06, 1.97])
    n = _n(V([0.3, -1.0, 0.15]))
    s.add(flat(rcone(b, t, 0.05, 0.005), b, n, 0.4), 0.025, mirror=True)
    cav = flat(rcone(b + V([0.003, 0.0, 0.028]), t + V([-0.005, 0.0, -0.024]), 0.034, 0.002), b, n, 0.3)
    s.sub(warp(cav, lambda P, n=n: P + n * 0.012), 0.008, mirror=True)

def catmull(P, n):
    P = [P[0]] + list(P) + [P[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2*p1) + (-p0 + p2)*t + (2*p0 - 5*p1 + 4*p2 - p3)*t*t + (-p0 + 3*p1 - 3*p2 + p3)*t**3))
    out.append(P[-2]); return out

def tail(s):
    key = [V(p) for p in ((0, 0.10, 0.975), (0, 0.19, 0.88), (0.0, 0.25, 0.70), (0.0, 0.27, 0.50), (0.0, 0.25, 0.32), (0, 0.215, 0.18), (0, 0.19, 0.07))]
    pts = catmull(key, 6)
    u = np.linspace(0, 1, len(pts))
    r = 0.03 + 0.085 * np.sin(np.clip(u * 1.15, 0, 1) * np.pi) ** 0.7 + 0.01 * u
    r[-1] = 0.02; r[-2] = 0.045
    s.add(chain(pts, list(r)), 0.03)

def build(vox=0.006, head_only=False):
    s = Scene((-0.2, -0.24, 1.5), (0.2, 0.14, 2.0), vox) if head_only else Scene((-0.48, -0.28, -0.01), (0.48, 0.52, 2.05), vox)
    sdf.RS[0] = 1.0
    if not head_only: torso(s)
    sdf.RS[0] = 1.0
    # arms/legs: build right side, then mirror by evaluating mirrored primitives
    from sdf import mirrored
    class Mir:
        def __init__(self, s): self.s = s
        def add(self, p, k=0.0, mirror=False): self.s.add(p, k, mirror=True)
        def sub(self, p, k=0.0, mirror=False): self.s.sub(p, k, mirror=True)
    m = Mir(s)
    if not head_only:
        sdf.RS[0] = 1.22; arm(m)
        sdf.RS[0] = 1.14; leg(m)
        sdf.RS[0] = 1.25; tail(s)
        sdf.RS[0] = 1.0
    s.xf = (V([0, -0.01, 1.6]), 1.15, V([0, 0.005, -0.04])); head(s); s.xf = None
    return s

if __name__ == '__main__':
    import sys, time
    t = time.time()
    vox = float(sys.argv[2]) if len(sys.argv) > 2 else 0.006
    s = build(vox, head_only=len(sys.argv) > 3)
    v, f = s.mesh()
    np.savez_compressed(sys.argv[1], v=v.astype(np.float32), f=f.astype(np.int32))
    print('grid', s.n, 'ops', s.ops, 'verts', len(v), 'tris', len(f), '%.1fs' % (time.time() - t))
