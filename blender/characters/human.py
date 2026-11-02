"""Human male base: lean athletic, ~1.80 m, 8 heads. A-pose sculpt. Faces -Y."""
import numpy as np, sys, time
import sdf
from sdf import Scene, sphere, rcone, ellip, chain, frame, rot, warp, _n
from body import flat, oriented, L, V

S  = V([0.178, 0.015, 1.445])   # shoulder
E  = V([0.245, 0.04, 1.165])    # elbow
W  = V([0.292, 0.0, 0.925])     # wrist
HP = V([0.088, 0.0, 0.925])     # hip
K  = V([0.098, -0.012, 0.505])  # knee
AN = V([0.1, 0.022, 0.085])     # ankle

def torso(s):
    s.add(ellip((0, 0.005, 1.32), (0.145, 0.105, 0.175)), 0)        # rib cage
    s.add(ellip((0, 0.02, 1.43), (0.185, 0.09, 0.072)), 0.05)        # shoulder girdle
    s.add(ellip((0, 0.0, 1.11), (0.118, 0.086, 0.15)), 0.07)         # belly
    s.add(ellip((0, 0.012, 0.97), (0.142, 0.098, 0.1)), 0.07)        # pelvis
    s.add(oriented((0.072, 0.04, 1.49), (1, 0, -0.5), (0.03, 0.045, 0.07)), 0.04, mirror=True)  # traps
    s.add(ellip((0.07, -0.066, 1.355), (0.082, 0.036, 0.058), rot((0, 1, 0), -10)), 0.026, mirror=True)  # pecs
    s.add(ellip((0.122, 0.045, 1.31), (0.04, 0.055, 0.11), rot((0, 1, 0), 14)), 0.045, mirror=True)  # lats
    for i, z in enumerate((1.3, 1.26, 1.22)):                                                        # serratus
        s.add(ellip((0.122, -0.04 + 0.006 * i, z), (0.014, 0.022, 0.012), rot((1, 0, 0), 30)), 0.014, mirror=True)
    for z, w in ((1.218, 0.03), (1.152, 0.031), (1.088, 0.032)):                                       # abs
        s.add(ellip((0.034, -0.074, z), (w, 0.018, 0.029)), 0.013, mirror=True)
    s.add(ellip((0, -0.076, 1.005), (0.055, 0.017, 0.05)), 0.02)
    s.sub(sphere((0, -0.096, 1.045), 0.006), 0.006)                                                  # navel
    s.add(ellip((0.098, -0.034, 1.08), (0.03, 0.05, 0.075), rot((0, 1, 0), 14)), 0.035, mirror=True)  # obliques
    s.add(ellip((0.036, 0.085, 1.16), (0.028, 0.026, 0.15)), 0.035, mirror=True)                    # erectors
    s.sub(rcone((0, 0.115, 1.42), (0, 0.112, 1.03), 0.007, 0.007), 0.02)                             # spine
    s.add(ellip((0.065, 0.078, 0.92), (0.074, 0.06, 0.08), rot((0, 1, 0), 8)), 0.04, mirror=True)   # glutes
    s.add(ellip((0.0, -0.04, 0.89), (0.05, 0.04, 0.05)), 0.04)                                      # groin (smooth)
    # neck
    s.add(rcone((0, 0.012, 1.47), (0, 0.0, 1.61), 0.066, 0.055), 0.04)
    s.add(rcone((0.052, 0.012, 1.63), (0.016, -0.05, 1.5), 0.014, 0.013), 0.02, mirror=True)       # SCM
    s.add(ellip((0, -0.048, 1.56), (0.012, 0.01, 0.012)), 0.012)                                    # adam's apple
    s.add(rcone((0.02, -0.06, 1.505), (0.15, -0.03, 1.495), 0.012, 0.01), 0.02, mirror=True)       # collarbone

def arm(s):
    d = _n(E - S)
    s.add(rcone(S, E, 0.046, 0.035), 0.04)
    s.add(oriented(S + V([0.024, 0.0, -0.03]), d, (0.054, 0.058, 0.075), up=(0, 1, 0)), 0.03)   # deltoid
    s.add(oriented(L(S, E, 0.58) + V([0, -0.022, 0]), d, (0.032, 0.03, 0.08), up=(0, 1, 0)), 0.018)  # biceps
    s.add(oriented(L(S, E, 0.45) + V([0.006, 0.024, 0]), d, (0.034, 0.034, 0.095), up=(0, 1, 0)), 0.02)  # triceps
    d2 = _n(W - E)
    s.add(rcone(E, W, 0.04, 0.026), 0.025)
    s.add(oriented(L(E, W, 0.27) + V([0.01, -0.006, 0]), d2, (0.043, 0.036, 0.08), up=(0, 1, 0)), 0.025)  # forearm
    hand(s, W, d2)

def hand(s, W, d):
    side = V([1.0, 0, 0]); fwd = V([0, -1.0, 0])
    width = _n(np.cross(d, side))
    if width @ fwd < 0: width = -width
    pc = W + d * 0.048
    s.add(ellip(pc, (0.017, 0.042, 0.048), np.stack([side, width, d])), 0.018)     # palm
    for i, off in enumerate((-0.027, -0.009, 0.009, 0.026)):
        base = pc + d * 0.042 + width * off
        ln = [(0.042, 0.026, 0.02), (0.046, 0.029, 0.022), (0.044, 0.028, 0.021), (0.034, 0.021, 0.018)][i]
        curl = [0.18, 0.4, 0.55]
        pts = [base]
        for k in range(3):
            dd = _n(d * np.cos(curl[k]) - side * np.sin(curl[k]))
            pts.append(pts[-1] + dd * ln[k])
        r = [0.0092, 0.0082, 0.0074, 0.0064] if i < 3 else [0.0082, 0.0072, 0.0065, 0.0056]
        s.add(chain(pts, r), 0.006)
    tb = pc + width * 0.033 - side * 0.01 - d * 0.02
    dirs = [_n(d * 0.75 + width * 0.45 - side * 0.35), _n(d * 0.8 + width * 0.15 - side * 0.55)]
    pts = [tb]
    for k, ln in enumerate((0.036, 0.028)): pts.append(pts[-1] + dirs[k] * ln)
    s.add(chain(pts, [0.0125, 0.0098, 0.0082]), 0.01)

def leg(s):
    s.add(rcone(HP, K, 0.086, 0.05), 0.05)
    dt = _n(K - HP)
    s.add(oriented(L(HP, K, 0.47) + V([0, -0.04, 0]), dt, (0.05, 0.042, 0.16)), 0.025)     # rectus
    s.add(oriented(L(HP, K, 0.5) + V([0.043, -0.01, 0]), dt, (0.042, 0.05, 0.16)), 0.03)    # vastus lat
    s.add(oriented(L(HP, K, 0.8) + V([-0.03, -0.03, 0]), dt, (0.035, 0.036, 0.07)), 0.022)  # vastus med
    s.add(oriented(L(HP, K, 0.45) + V([0, 0.04, 0]), dt, (0.05, 0.044, 0.15)), 0.03)       # hamstring
    s.add(oriented(L(HP, K, 0.3) + V([-0.035, 0, 0]), dt, (0.035, 0.05, 0.12)), 0.035)     # adductor
    s.add(ellip(K + V([0, -0.03, 0]), (0.03, 0.02, 0.03)), 0.02)                          # kneecap
    ds = _n(AN - K)
    s.add(rcone(K, AN, 0.046, 0.026), 0.025)
    s.add(oriented(L(K, AN, 0.25) + V([0.018, 0.03, 0]), ds, (0.03, 0.036, 0.1)), 0.02)   # gastrocnemius lat
    s.add(oriented(L(K, AN, 0.22) + V([-0.016, 0.032, 0]), ds, (0.032, 0.038, 0.1)), 0.02) # gastrocnemius med
    s.add(oriented(L(K, AN, 0.3) + V([0.028, -0.01, 0]), ds, (0.022, 0.025, 0.13)), 0.025) # tibialis
    s.add(sphere(AN + V([0.018, 0, 0]), 0.019), 0.012)                                   # ankle bones
    s.add(sphere(AN + V([-0.016, 0, 0.006]), 0.019), 0.012)
    foot(s, AN)

def foot(s, A):
    s.add(sphere(A + V([0, 0.035, -0.05]), 0.033), 0.02)                                 # heel
    s.add(ellip(A + V([0.004, -0.06, -0.058]), (0.042, 0.1, 0.03), rot((1, 0, 0), -8)), 0.03)  # foot body
    toes = [(-0.026, 0.027, 0.0125, 0.03), (-0.005, 0.024, 0.009, 0.024), (0.012, 0.02, 0.0085, 0.021),
            (0.027, 0.014, 0.008, 0.018), (0.04, 0.006, 0.0075, 0.015)]
    for x, fy, r, ln in toes:
        p0 = A + V([x, -0.14 + fy - 0.02, -0.07]); p1 = p0 + V([x * 0.1, -ln, -0.006])
        s.add(rcone(p0, p1, r, r * 0.9), 0.006)

def head(s):
    s.add(ellip((0, 0.012, 1.715), (0.074, 0.094, 0.086)), 0)          # cranium
    s.add(ellip((0, -0.035, 1.67), (0.064, 0.06, 0.075)), 0.04)        # face mass
    s.add(rcone((0.06, 0.02, 1.64), (0.018, -0.07, 1.588), 0.022, 0.017), 0.03, mirror=True)  # jaw
    s.add(ellip((0, -0.076, 1.59), (0.024, 0.018, 0.02)), 0.02)         # chin
    s.add(ellip((0.05, -0.058, 1.68), (0.026, 0.02, 0.015)), 0.02, mirror=True)   # cheekbones
    s.add(ellip((0, -0.08, 1.716), (0.06, 0.016, 0.014)), 0.02)         # brow
    eye = V([0.032, -0.084, 1.697])
    s.sub(ellip(eye + V([0, -0.004, 0]), (0.019, 0.012, 0.0115)), 0.007, mirror=True)
    s.add(sphere(eye + V([0, 0.004, 0]), 0.0125), 0.001, mirror=True)
    s.add(ellip(eye + V([0, -0.005, 0.007]), (0.016, 0.008, 0.0045)), 0.004, mirror=True)   # upper lid
    s.add(ellip(eye + V([0, -0.004, -0.0085]), (0.014, 0.006, 0.0035)), 0.004, mirror=True) # lower lid
    s.add(rcone((0, -0.086, 1.702), (0, -0.104, 1.659), 0.0075, 0.009), 0.012)  # nose bridge
    s.add(ellip((0, -0.106, 1.656), (0.0095, 0.009, 0.0085)), 0.006)           # nose tip
    s.add(ellip((0.0095, -0.098, 1.651), (0.0085, 0.0075, 0.0058)), 0.005, mirror=True)  # nostrils
    s.sub(sphere((0.006, -0.1, 1.646), 0.003), 0.002, mirror=True)
    s.add(ellip((0, -0.093, 1.629), (0.021, 0.0075, 0.0055)), 0.006)           # upper lip
    s.add(ellip((0, -0.091, 1.618), (0.018, 0.0075, 0.0058)), 0.006)           # lower lip
    s.sub(rcone((0.021, -0.088, 1.624), (0, -0.1, 1.6238), 0.0014, 0.0014), 0.0015, mirror=True)
    # ears
    ec = V([0.076, 0.008, 1.688])
    s.add(ellip(ec, (0.011, 0.02, 0.03), rot((0, 0, 1), -18)), 0.01, mirror=True)
    s.sub(ellip(ec + V([0.007, -0.002, -0.002]), (0.006, 0.013, 0.021), rot((0, 0, 1), -18)), 0.004, mirror=True)

def build(vox=0.003, head_only=False):
    if head_only: s = Scene((-0.12, -0.14, 1.52), (0.12, 0.12, 1.83), vox)
    else: s = Scene((-0.42, -0.24, -0.01), (0.42, 0.2, 1.83), vox)
    class Mir:
        def __init__(self, s): self.s = s
        def add(self, p, k=0.0, mirror=False): self.s.add(p, k, mirror=True)
        def sub(self, p, k=0.0, mirror=False): self.s.sub(p, k, mirror=True)
    if not head_only:
        torso(s); m = Mir(s); arm(m); leg(m)
    head(s)
    return s

if __name__ == '__main__':
    t = time.time(); vox = float(sys.argv[2]) if len(sys.argv) > 2 else 0.003
    s = build(vox, head_only=len(sys.argv) > 3)
    v, f = s.mesh()
    np.savez_compressed(sys.argv[1], v=v.astype(np.float32), f=f.astype(np.int32))
    print('grid', s.n, 'tris', len(f), '%.1fs' % (time.time() - t))
