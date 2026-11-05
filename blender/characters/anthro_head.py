"""Anthro heads (fox template, generalised by species), sculpted in the fox model's frame then fitted to the
human head's eye positions. The head is its own mesh: it replaces the human head on animal characters."""
import numpy as np
import sdf
from sdf import Scene, sphere, rcone, ellip, frame, rot, warp, _n
from body import flat

V = lambda *a: np.array(a, float)
# template frame (the original Fox sculpt): eyes at (+-0.043, -0.066, 1.758)
EYE = V(0.043, -0.066, 1.758)
P = {   # sn: snout length scale, sw: snout width, nose, ear: kind, es: ear size, tuft: cheek ruff, cran: cranium scale, brow
    'fox':     dict(sn=1.0, sw=1.0, nose=1.0, ear='fox', es=1.0, tuft=1.0, cran=1.0, jaw=1.0),
    'wolf':    dict(sn=1.12, sw=1.12, nose=1.15, ear='fox', es=0.9, tuft=1.2, cran=1.05, jaw=1.1),
    'cat':     dict(sn=0.45, sw=1.25, nose=0.7, ear='cat', es=0.72, tuft=0.6, cran=1.05, jaw=0.8),
    'tiger':   dict(sn=0.6, sw=1.45, nose=1.0, ear='round', es=0.8, tuft=1.3, cran=1.12, jaw=1.1),
    'bear':    dict(sn=0.75, sw=1.45, nose=1.35, ear='round', es=0.9, tuft=0.0, cran=1.18, jaw=1.15),
    'panda':   dict(sn=0.55, sw=1.5, nose=1.2, ear='round', es=0.95, tuft=0.0, cran=1.25, jaw=1.05),
    'raccoon': dict(sn=0.85, sw=1.05, nose=1.0, ear='raccoon', es=0.75, tuft=1.0, cran=1.02, jaw=0.95),
    'bunny':   dict(sn=0.4, sw=1.2, nose=0.65, ear='bunny', es=1.0, tuft=0.5, cran=1.05, jaw=0.75),
}

def sculpt(s, name):
    p = P[name]; sn, sw = p['sn'], p['sw']
    s.add(ellip((0, 0.008, 1.765), V(0.08, 0.076, 0.078) * p['cran']), 0.05)          # cranium
    s.add(ellip((0, -0.042, 1.772), (0.06, 0.05, 0.044)), 0.04)                       # forehead
    tip = V(0, -0.06 - 0.14 * sn, 1.737 - 0.024 * sn)
    s.add(flat(rcone((0, -0.06, 1.737), tip, 0.038 * sw, 0.014 * sw + 0.006 * (sw - 1)), (0, -0.1, 1.73), (1, 0, 0), 0.78 * min(sw, 1.3)), 0.035)  # snout
    for sg in (1, -1):
        s.add(ellip((sg * 0.016 * sw, -0.06 - 0.08 * sn, 1.704 + 0.01 * (1 - sn)), (0.017 * sw, 0.03 + 0.008 * sn, 0.014)), 0.015)  # whisker pads
    s.add(ellip(tip + V(0, -0.008, -0.004), V(0.0145, 0.011, 0.011) * p['nose']), 0.006)                     # nose
    jt = V(0, -0.05 - 0.13 * sn, 1.694 - 0.01 * (1 - sn))
    s.add(rcone((0, -0.05, 1.675), jt, 0.03 * p['jaw'], 0.009 * sw), 0.018)                                   # jaw
    for sg in (1, -1):
        s.sub(rcone((sg * 0.034 * sw, -0.09, 1.693), jt + V(0, -0.004, 0.0085), 0.0026, 0.002), 0.003)       # mouth line
        s.add(ellip((sg * 0.058, -0.03, 1.712), (0.05, 0.05, 0.045)), 0.035)                                  # cheeks
        s.add(ellip((sg * 0.075, 0.0, 1.69), (0.06, 0.055, 0.05)), 0.03)
        if p['tuft']:
            for a, l, z, y in ((8, 0.05, 1.71, -0.01), (28, 0.058, 1.69, 0.0), (50, 0.052, 1.668, 0.012)):
                ar = np.radians(a); dd = _n(V(sg * np.cos(ar), 0.3, -np.sin(ar)))
                p0 = V(sg * 0.085, y, z)
                dd = _n(dd + V(0, 0.45, 0))                                     # swept back, thinner, pointed
                s.add(flat(rcone(p0, p0 + dd * l * p['tuft'] * 0.8, 0.022, 0.003), p0, (0, 0.4, 1), 0.55), 0.02)
        eye = V(sg * EYE[0], EYE[1], EYE[2])
        s.sub(ellip(eye + V(0, -0.006, 0), (0.025, 0.016, 0.015), rot((0, 1, 0), sg * 12)), 0.008)            # socket
        s.add(ellip(eye + V(sg * 0.002, -0.011, 0.019), (0.027, 0.011, 0.007), rot((0, 1, 0), sg * 15)), 0.016)  # brow
        s.add(ellip(eye + V(sg * 0.002, -0.01, -0.017), (0.024, 0.01, 0.006), rot((0, 1, 0), sg * 8)), 0.008)
    s.add(rcone((0, 0.0, 1.66), (0, 0.006, 1.57), 0.06, 0.062), 0.03)                                          # short neck stub (blends into the body's neck)
    ears(s, p)

def ears(s, p):
    for sg in (1, -1):
        k = p['ear']; es = p['es']
        if k in ('fox', 'cat', 'raccoon'):
            b = V(sg * 0.056, 0.03, 1.83); t = b + V(sg * 0.056, 0.03, 0.14) * es * (0.85 if k == 'raccoon' else 1)
            n = _n(V(sg * 0.3, -1.0, 0.15))
            s.add(flat(rcone(b, t, 0.05 * (0.85 + 0.15 * es), 0.005), b, n, 0.4), 0.025)
            cav = flat(rcone(b + V(sg * 0.003, 0.0, 0.028 * es), t - V(sg * 0.005, 0.0, 0.024 * es), 0.034 * es, 0.002), b, n, 0.3)
            s.sub(warp(cav, lambda Q, n=n: Q + n * 0.012), 0.008)
        elif k == 'round':
            b = V(sg * 0.064, 0.02, 1.825)
            s.add(flat(sphere(b + V(sg * 0.012, 0, 0.022), 0.036 * es), b, (sg * 0.2, -1, 0.1), 0.45), 0.015)
            s.sub(flat(sphere(b + V(sg * 0.014, -0.013, 0.024), 0.024 * es), b, (sg * 0.2, -1, 0.1), 0.3), 0.006)
        elif k == 'bunny':
            b = V(sg * 0.035, 0.03, 1.84)
            pts = [b, b + V(sg * 0.035, 0.01, 0.07), b + V(sg * 0.075, 0.02, 0.06), b + V(sg * 0.10, 0.025, -0.03), b + V(sg * 0.11, 0.02, -0.13)]
            rr = [0.022, 0.03, 0.034, 0.03, 0.016]
            for i in range(len(pts) - 1):
                s.add(flat(rcone(pts[i], pts[i + 1], rr[i], rr[i + 1]), pts[i], (sg * 0.9, -0.3, 0), 0.38), 0.02)

def build(name, eyes, vox=0.0014, widen=1.15, k=None):
    """eyes: human eye centres [(+x), (-x)]. Returns (verts, faces, eye centres in world, scale, map fn)."""
    eyes = [np.asarray(e) for e in eyes]
    M = (eyes[0] + eyes[1]) / 2; sp = np.linalg.norm(eyes[0] - eyes[1])
    k = k or sp * widen / (2 * EYE[0]); tM = V(0, EYE[1], EYE[2])
    fwd = lambda Q: (Q - tM) * k + M                             # template -> world
    s = Scene(V(-0.24, -0.38, 1.36), V(0.24, 0.16, 2.05), vox)
    s.xf = None
    sculpt(s, name)
    v, f = s.mesh()
    v = fwd(v)
    ec = [fwd(V(EYE[0], EYE[1] + 0.004, EYE[2])), fwd(V(-EYE[0], EYE[1] + 0.004, EYE[2]))]
    return v, f, ec, k, fwd
