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

CHEEK = {'fox': 0.78, 'wolf': 0.82, 'cat': 0.8, 'raccoon': 0.8, 'tiger': 0.95, 'bear': 0.95, 'panda': 1.0, 'bunny': 0.88}

def sculpt(s, name):
    p = P[name]; sn, sw = p['sn'], p['sw']
    s.add(ellip((0, 0.008, 1.765), V(0.08, 0.076, 0.078) * p['cran']), 0.05)          # cranium
    s.add(ellip((0, -0.042, 1.772), (0.06, 0.05, 0.044)), 0.04)                       # forehead
    tip = V(0, -0.06 - 0.14 * sn, 1.737 - 0.024 * sn)
    s.add(flat(rcone((0, -0.06, 1.737), tip, 0.038 * sw, 0.014 * sw + 0.006 * (sw - 1)), (0, -0.1, 1.73), (1, 0, 0), 0.78 * min(sw, 1.3)), 0.035)  # snout
    for sg in (1, -1):
        s.add(ellip((sg * 0.016 * sw, -0.06 - 0.08 * sn, 1.704 + 0.01 * (1 - sn)), (0.017 * sw, 0.03 + 0.008 * sn, 0.014)), 0.015)  # whisker pads
    s.add(ellip(tip + V(0, -0.008, -0.004), V(0.0145, 0.011, 0.011) * p['nose']), 0.006)                     # nose
    nt = tip + V(0, -0.008, -0.004)
    for sg in (1, -1): s.sub(ellip(nt + V(sg * 0.0065, -0.0095, -0.003) * p['nose'], V(0.0035, 0.004, 0.0025) * p['nose']), 0.002)   # nostrils
    s.sub(ellip(V(0, -0.072, 1.758), V(0.012, 0.012, 0.01)), 0.012)                                           # stop between the eyes
    jt = V(0, -0.05 - 0.13 * sn, 1.694 - 0.01 * (1 - sn))
    s.add(rcone((0, -0.05, 1.675), jt, 0.03 * p['jaw'], 0.009 * sw), 0.018)                                   # jaw
    s.add(ellip(jt + V(0, 0.018, -0.006), V(0.016 * sw, 0.014, 0.009)), 0.01)                                 # chin
    s.sub(rcone(nt + V(0, -0.006, -0.008) * p['nose'], jt + V(0, -0.005, 0.012), 0.0016, 0.0016), 0.002)      # philtrum
    for sg in (1, -1):
        corner = V(sg * 0.034 * sw, -0.088, 1.6975); mtip = jt + V(0, -0.004, 0.0085)
        mpts = [corner + V(-sg * 0.004, -0.004, 0.004), corner, corner + (mtip - corner) * 0.4 + V(0, 0, -0.0015), mtip]
        for a_, b_ in zip(mpts[:-1], mpts[1:]): s.sub(rcone(a_, b_, 0.0024, 0.0024), 0.0025)               # curved mouth line, corners turned up
        s.add(ellip(corner + (mtip - corner) * 0.45 + V(0, -0.002, 0.004), V(0.012, 0.03 * max(sn, 0.6), 0.005) * V(sw, 1, 1)), 0.006)  # upper lip overhang
        ck = CHEEK.get(name, 0.85)
        s.add(ellip((sg * 0.055, -0.03, 1.713), V(0.05, 0.05, 0.045) * ck), 0.03)                            # cheeks
        s.add(ellip((sg * 0.06, -0.002, 1.698), V(0.052, 0.055, 0.046) * ck), 0.025)
        if p['tuft']:
            for a, l, z, y in ((15, 0.042, 1.712, -0.004), (35, 0.048, 1.695, 0.006)):
                ar = np.radians(a); dd = _n(V(sg * np.cos(ar), 0.3, -np.sin(ar)))
                p0 = V(sg * 0.075, y, z)
                dd = _n(dd + V(0, 0.45, 0))                                     # swept back, thinner, pointed
                s.add(flat(rcone(p0, p0 + dd * l * p['tuft'] * 0.8, 0.022, 0.003), p0, (0, 0.4, 1), 0.55), 0.02)
        eye = V(sg * EYE[0], EYE[1], EYE[2])
        s.sub(ellip(eye + V(0, -0.006, 0), (0.025, 0.016, 0.015), rot((0, 1, 0), sg * 12)), 0.008)            # socket
        s.add(ellip(eye + V(sg * 0.002, -0.011, 0.019), (0.027, 0.011, 0.007), rot((0, 1, 0), sg * 15)), 0.016)  # brow
        s.add(rcone(eye + V(sg * 0.012, -0.012, 0.02), eye + V(sg * 0.042, 0.01, 0.012), 0.006, 0.003), 0.012)    # brow ridge to the temple
        fwd = _n(V(sg * 0.32, -1, 0.05)); ax1 = _n(np.cross(fwd, V(0, 0, 1))); ax2 = np.cross(ax1, fwd)
        ring = [eye + fwd * 0.0115 + ax1 * np.cos(t) * 0.0215 + ax2 * np.sin(t) * 0.0145 for t in np.linspace(0, 2 * np.pi, 17)]
        for a_, b_ in zip(ring[:-1], ring[1:]): s.add(rcone(a_, b_, 0.0032, 0.0032), 0.0035)                   # eyelid rim (orbital ring)
        s.add(ellip(eye + V(sg * 0.002, -0.01, -0.017), (0.024, 0.01, 0.006), rot((0, 1, 0), sg * 8)), 0.008)
    s.add(rcone((0, 0.0, 1.66), (0, 0.006, 1.57), 0.06, 0.062), 0.03)                                          # short neck stub (blends into the body's neck)
    s.add(ellip((0, 0.0, 1.585), (0.082, 0.074, 0.045)), 0.03)                                                 # neck ruff covers the join
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
