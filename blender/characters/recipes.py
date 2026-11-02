import mh
HEIGHT = {'male': 1.80, 'female': 1.68}
def mirror(prefix_list):
    out = []
    for n, w in prefix_list:
        if '/l-' in n or n.split('/')[-1].startswith('l-'):
            out += [(n, w), (n.replace('/l-', '/r-'), w)]
        else: out.append((n, w))
    return out
def get(name):
    if name == 'male':
        t = mh.macro(gender=1, age=0.45, muscle=0.85, weight=0.25, height=0.6, proportions=1.0)
        t += mirror([
            ('torso/torso-vshape-incr', 0.6), ('torso/torso-muscle-pectoral-incr', 0.9), ('torso/torso-muscle-dorsi-incr', 0.4),
            ('stomach/stomach-pregnant-decr', 0.5), ('measure/measure-waist-circ-decr', 0.3), ('measure/measure-shoulder-dist-incr', 0.25),
            ('armslegs/l-upperarm-muscle-incr', 0.9), ('armslegs/l-lowerarm-muscle-incr', 0.7),
            ('armslegs/l-upperleg-muscle-incr', 0.3), ('armslegs/l-lowerleg-muscle-incr', 0.9),
            ('measure/measure-thigh-circ-decr', 0.2), ('measure/measure-calf-circ-incr', 0.3), ('measure/measure-hips-circ-decr', 0.3), ('measure/measure-upperarm-circ-incr', 0.35),
            ('armslegs/l-upperarm-shoulder-muscle-incr', 0.4),
            ('eyes/l-eye-scale-incr', 0.35), ('nose/nose-scale-horiz-decr', 0.3), ('nose/nose-point-width-decr', 0.3),
            ('nose/nose-volume-decr', 0.25), ('mouth/mouth-scale-horiz-decr', 0.15), ('chin/chin-width-decr', 0.25),
            ('head/head-invertedtriangular', 0.35), ('chin/chin-prominent-incr', 0.2), ('cheek/l-cheek-volume-decr', 0.3),
            ('head/head-fat-decr', 0.3), ('neck/neck-scale-horiz-incr', 0.2),
        ])
        return t
    if name == 'female':
        g = dict(gender=0, age=0.5, muscle=0.62, weight=0.42)
        t = mh.macro(height=0.5, proportions=1.0, **g) + mh.breast(size=0.72, firm=0.75, **g)
        t += mirror([
            ('measure/measure-waist-circ-decr', 0.35), ('stomach/stomach-pregnant-decr', 0.4), ('stomach/stomach-tone-incr', 0.3),
            ('buttocks/buttocks-volume-incr', 0.25), ('measure/measure-thigh-circ-incr', 0.1),
            ('armslegs/l-lowerleg-muscle-incr', 0.3), ('armslegs/l-upperarm-muscle-incr', 0.2),
            ('chin/chin-width-decr', 0.15), ('nose/nose-scale-horiz-decr', 0.15), ('nose/nose-point-width-decr', 0.2),
            ('eyes/l-eye-scale-incr', 0.15), ('cheek/l-cheek-bones-incr', 0.3), ('mouth/mouth-upperlip-volume-incr', 0.2),
            ('head/head-oval', 0.4), ('neck/neck-scale-horiz-decr', 0.1), ('breast/breast-point-decr', 1.0),
        ])
        return t

import numpy as np
def bra(P, N, J):
    zb = J['breast.L'][1][2]; zc = J['spine01'][0][2]; x, y, z = P.T; ax = np.abs(x)
    fr = N[:, 1] < 0.15; bk = ~fr
    top = zb + 0.035 + 0.05 * np.clip(ax / 0.07, 0, 1) ** 2
    band = (z > zb - 0.075) & (((z < top) & fr) | ((z < zb + 0.045) & bk))
    strap = fr & (ax > 0.05) & (ax < 0.1) & (z > zb) & (z < zc + 0.14)
    back = bk & (ax < 0.032 + (z - zb).clip(0) * 0.12) & (z > zb) & (z < zc + 0.13)
    return band | strap | back

def shorts(P, N, J, length=0.17):
    zr = J['root'][0][2]; zh = J['upperleg02.L'][0][2]; z = P[:, 2]
    return (z < zr + 0.025) & (z > zh - length)

GARMENTS = {'female': [('bra', bra, 0.004, 0.0025, 140), ('shorts', lambda P, N, J: shorts(P, N, J, 0.1), 0.0035)],
            'male': [('shorts', lambda P, N, J: shorts(P, N, J, 0.2), 0.0035)]}
ARMS = {'female': 8, 'male': 30}
MUSCLE = {'female': 0.35, 'male': 1.0}
HAIR = {'male': 'male_messy', 'female': 'female_pixie'}
def headfit(P):
    """Ellipsoid (centre, radii) of the cranium from head vertices."""
    top = P[:, 2].max(); h = P[P[:, 2] > top - 0.2]
    zc = top - 0.1
    band = h[np.abs(h[:, 2] - zc) < 0.01]
    cx = 0.0; rx = band[:, 0].max() * 0.95
    y0, y1 = band[:, 1].min(), band[:, 1].max()
    return (np.array([cx, (y0 + y1) / 2, zc]), np.array([rx, (y1 - y0) / 2, top - zc]))

# ---------------- female body shape presets
FEMALE_SHAPES = {
    #  name: (height m, macro overrides, breast(size,firm), extra targets)
    'Hourglass':        (1.68, dict(weight=0.5, muscle=0.5), (0.8, 0.65), [('measure/measure-waist-circ-decr', 0.9), ('measure/measure-hips-circ-incr', 0.75), ('buttocks/buttocks-volume-incr', 0.5), ('measure/measure-thigh-circ-incr', 0.25)]),
    'Pear':             (1.66, dict(weight=0.5, muscle=0.45), (0.45, 0.6), [('measure/measure-hips-circ-incr', 0.8), ('measure/measure-thigh-circ-incr', 0.5), ('measure/measure-shoulder-dist-decr', 0.4), ('buttocks/buttocks-volume-incr', 0.5)]),
    'Apple':            (1.66, dict(weight=0.68, muscle=0.45), (0.7, 0.5), [('measure/measure-waist-circ-incr', 0.9), ('measure/measure-underbust-circ-incr', 0.4), ('measure/measure-thigh-circ-decr', 0.3), ('measure/measure-hips-circ-decr', 0.2)]),
    'Apple/Round':      (1.65, dict(weight=0.85, muscle=0.4), (0.8, 0.45), [('measure/measure-waist-circ-incr', 1.0), ('measure/measure-underbust-circ-incr', 0.6), ('stomach/stomach-pregnant-incr', 0.15)]),
    'Rectangle':        (1.68, dict(weight=0.42, muscle=0.5), (0.4, 0.6), [('measure/measure-waist-circ-incr', 0.3), ('measure/measure-hips-circ-decr', 0.3)]),
    'Inverted triangle':(1.68, dict(weight=0.45, muscle=0.6), (0.6, 0.65), [('measure/measure-shoulder-dist-incr', 0.7), ('torso/torso-vshape-incr', 0.5), ('measure/measure-hips-circ-decr', 0.5)]),
    'Tall':             (1.82, dict(weight=0.42, muscle=0.55, height=0.9), (0.55, 0.65), [('measure/measure-waist-circ-decr', 0.3)]),
    'Slender':          (1.70, dict(weight=0.12, muscle=0.4), (0.35, 0.65), [('measure/measure-waist-circ-decr', 0.2)]),
    'Athletic':         (1.70, dict(weight=0.3, muscle=0.95), (0.45, 0.8), [('torso/torso-vshape-incr', 0.4), ('stomach/stomach-pregnant-decr', 0.5), ('armslegs/l-upperleg-muscle-incr', 0.6), ('armslegs/l-lowerleg-muscle-incr', 0.6), ('armslegs/l-upperarm-muscle-incr', 0.5)]),
    'Petite':           (1.52, dict(weight=0.35, muscle=0.5, height=0.15), (0.45, 0.7), []),
    'Curvy / Plus':     (1.68, dict(weight=1.0, muscle=0.45), (0.95, 0.45), [('measure/measure-hips-circ-incr', 0.5), ('buttocks/buttocks-volume-incr', 0.4)]),
    'Tall / Long torso':(1.80, dict(weight=0.4, muscle=0.55, height=0.85), (0.55, 0.65), [('torso/torso-scale-vert-incr', 0.6), ('measure/measure-upperleg-height-decr', 0.4), ('measure/measure-lowerleg-height-decr', 0.3)]),
}
FACE_F = [('chin/chin-width-decr', 0.15), ('nose/nose-scale-horiz-decr', 0.15), ('nose/nose-point-width-decr', 0.2),
          ('eyes/l-eye-scale-incr', 0.15), ('cheek/l-cheek-bones-incr', 0.3), ('mouth/mouth-upperlip-volume-incr', 0.2), ('head/head-oval', 0.4), ('breast/breast-point-decr', 1.0)]
def female_shape(name):
    h, mo, (bs, bf), extra = FEMALE_SHAPES[name]
    g = dict(gender=0, age=0.5, muscle=0.6, weight=0.42); g.update({k: v for k, v in mo.items() if k != 'height'})
    t = mh.macro(height=mo.get('height', 0.5), proportions=1.0, **g) + mh.breast(size=bs, firm=bf, **g)
    return t + mirror(extra + FACE_F), h

# ---------------- male body type presets: (height, macro, extra targets, muscle definition)
MALE_TYPES = {
    'Ectomorph':     (1.80, dict(weight=0.12, muscle=0.4, height=0.6), [('measure/measure-shoulder-dist-decr', 0.2)], 0.45),
    'Slim runner':   (1.78, dict(weight=0.18, muscle=0.68), [('armslegs/l-lowerleg-muscle-incr', 0.6)], 0.75),
    'Average':       (1.77, dict(weight=0.5, muscle=0.5), [], 0.3),
    'Athletic':      (1.80, dict(weight=0.3, muscle=0.88), [('torso/torso-vshape-incr', 0.4), ('stomach/stomach-pregnant-decr', 0.4)], 1.0),
    'Swimmer':       (1.86, dict(weight=0.28, muscle=0.82, height=0.75), [('measure/measure-shoulder-dist-incr', 0.6), ('torso/torso-vshape-incr', 0.9), ('measure/measure-waist-circ-decr', 0.35), ('torso/torso-muscle-dorsi-incr', 0.8)], 0.95),
    'Hero':          (1.88, dict(weight=0.38, muscle=1.0, height=0.8), [('measure/measure-shoulder-dist-incr', 0.9), ('torso/torso-vshape-incr', 1.0), ('torso/torso-muscle-pectoral-incr', 1.0), ('armslegs/l-upperarm-muscle-incr', 0.9), ('measure/measure-waist-circ-decr', 0.4), ('neck/neck-scale-horiz-incr', 0.5), ('head/head-scale-horiz-decr', 0.1)], 1.1),
    'Bodybuilder':   (1.80, dict(weight=0.62, muscle=1.0), [('torso/torso-muscle-pectoral-incr', 1.0), ('torso/torso-muscle-dorsi-incr', 1.0), ('armslegs/l-upperarm-muscle-incr', 1.0), ('armslegs/l-lowerarm-muscle-incr', 1.0), ('armslegs/l-upperleg-muscle-incr', 1.0), ('armslegs/l-lowerleg-muscle-incr', 1.0), ('measure/measure-upperarm-circ-incr', 0.8), ('measure/measure-neck-circ-incr', 0.8), ('armslegs/l-upperarm-shoulder-muscle-incr', 1.0), ('torso/torso-vshape-incr', 0.8)], 1.35),
    'Stocky':        (1.65, dict(weight=0.78, muscle=0.7, height=0.12), [('torso/torso-scale-horiz-incr', 0.5), ('measure/measure-neck-circ-incr', 0.5), ('measure/measure-upperleg-height-decr', 0.3)], 0.35),
    'Endomorph':     (1.75, dict(weight=0.92, muscle=0.35), [('stomach/stomach-pregnant-incr', 0.3)], 0.0),
    'Heavyweight':   (1.88, dict(weight=1.0, muscle=0.92, height=0.8), [('torso/torso-scale-horiz-incr', 0.4), ('measure/measure-neck-circ-incr', 0.8), ('measure/measure-upperarm-circ-incr', 0.5), ('measure/measure-shoulder-dist-incr', 0.4)], 0.4),
}
FACE_M = [('nose/nose-scale-horiz-decr', 0.2), ('nose/nose-point-width-decr', 0.2), ('eyes/l-eye-scale-incr', 0.2),
          ('chin/chin-prominent-incr', 0.25), ('cheek/l-cheek-volume-decr', 0.2)]
def male_type(name):
    h, mo, extra, md = MALE_TYPES[name]
    g = dict(gender=1, age=0.45, muscle=0.5, weight=0.5); g.update({k: v for k, v in mo.items() if k != 'height'})
    t = mh.macro(height=mo.get('height', 0.5), proportions=1.0, **g)
    return t + mirror(extra + FACE_M), h, md
