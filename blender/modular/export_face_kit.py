"""Face movement for the kit heads: blink, mouth shapes and expressions, written as public/modular/face_kit.json.

    MH_DATA=<makehuman data dir> python3 export_face_kit.py <repo_public_dir>

The kit bodies keep MakeHuman's vertex order, so MakeHuman's CC0 expression units (data/targets/expression/units)
apply directly. Each VRM expression below is a mix of those units, stored sparsely as offsets in metres
(kit axes: X = character's left, -Y = front, Z = up) for the neutral head size; the app scales them per head.
"""
import sys, os, json, base64
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'characters'))
import mh
P, faces, used, Q = mh.build({}); used = np.array(used)
U = lambda n: mh.target('expression/units/caucasian/' + n)
def unit(n):
    ids, dv = U(n); d = np.zeros((len(mh.build.Praw), 3)); d[ids] = dv
    d = d[used]; return np.stack([d[:, 0], -d[:, 2], d[:, 1]], 1) * 0.1
MIX = {
  'blinkLeft': {'eye-left-closure': 1.0}, 'blinkRight': {'eye-right-closure': 1.0}, 'blink': {'eye-left-closure': 1.0, 'eye-right-closure': 1.0},
  'aa': {'mouth-open': 0.85}, 'ih': {'mouth-open': 0.28, 'mouth-retraction': 0.7}, 'ou': {'mouth-open': 0.22, 'mouth-pursing': 0.9, 'mouth-protusion': 0.4},
  'ee': {'mouth-open': 0.2, 'mouth-part-later': 0.8, 'mouth-retraction': 0.4}, 'oh': {'mouth-open': 0.55, 'mouth-pursing': 0.55},
  'happy': {'mouth-corner-puller': 0.9, 'eye-left-slit': 0.45, 'eye-right-slit': 0.45, 'eyebrows-left-up': 0.2, 'eyebrows-right-up': 0.2},
  'angry': {'eyebrows-left-down': 1.0, 'eyebrows-right-down': 1.0, 'mouth-compression': 0.6, 'mouth-depression': 0.4, 'nose-compression': 0.4},
  'sad': {'eyebrows-left-inner-up': 1.0, 'eyebrows-right-inner-up': 1.0, 'mouth-depression': 0.8, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25},
  'surprised': {'eyebrows-left-up': 1.0, 'eyebrows-right-up': 1.0, 'eye-left-opened-up': 0.9, 'eye-right-opened-up': 0.9, 'mouth-open': 0.4},
  '_smile': {'mouth-corner-puller': 0.3},       # not an expression: a gentle resting smile the app bakes into the neutral face
  'relaxed': {'mouth-corner-puller': 0.35, 'eye-left-slit': 0.5, 'eye-right-slit': 0.5},
}
# eye shapes for the human heads: MakeHuman eye targets (both sides), applied to the skin around the eyes
EYE = {
  'hf_round': {'eye-height1-incr': 0.9, 'eye-height3-incr': 0.8, 'eye-corner1-down': 0.25},
  'hf_upturned': {'eye-corner1-up': 1.0, 'eye-eyefold-angle-up': 0.6, 'eye-corner2-down': 0.3},
  'hf_downturned': {'eye-corner1-down': 1.0, 'eye-corner2-up': 0.35, 'eye-height3-incr': 0.3},
  'hf_hooded': {'eye-eyefold-down': 0.95, 'eye-height1-decr': 0.45},
}
def eye_unit(n):
    d = 0
    for side in ('l', 'r'):
        ids, dv = mh.target(f'eyes/{side}-{n}'); full = np.zeros((len(mh.build.Praw), 3)); full[ids] = dv; full = full[used]; d = d + np.stack([full[:, 0], -full[:, 2], full[:, 1]], 1) * 0.1
    return d
cache = {}; out = {}
for name, mix in MIX.items():
    d = sum(w * cache.setdefault(u, unit(u)) for u, w in mix.items()); ids = np.nonzero(np.linalg.norm(d, axis=1) > 2e-5)[0]
    out[name] = {'ids': base64.b64encode(ids.astype(np.uint16).tobytes()).decode(), 'd': base64.b64encode(d[ids].astype(np.float32).tobytes()).decode(), 'n': int(len(ids)), 'max_mm': round(float(np.linalg.norm(d, axis=1).max() * 1000), 2)}
# ---- Perfect Sync: the 52 ARKit face inputs an iPhone sends (eye direction and tongue excepted: the eyes turn by bone,
# and the kit has no tongue). Built from the same MakeHuman units: one-sided shapes are the unit faded across the face's
# centre line, lip shapes are split into upper and lower lip, and the few movements MakeHuman lacks (jaw and mouth
# sideways, jaw forward, cheek puff) are made from region masks taken from its units.
def sm(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
X = P[:, 0]
SIDE = {'L': sm((X + 0.004) / 0.008)[:, None], 'R': sm((-X + 0.004) / 0.008)[:, None]}
def u(n): return cache.setdefault(n, unit(n))
dO = u('mouth-open'); lowW = np.clip(-dO[:, 2] / (0.25 * (-dO[:, 2]).max()), 0, 1)[:, None]
lipW = np.clip(np.linalg.norm(u('mouth-pursing'), axis=1) / (0.3 * np.linalg.norm(u('mouth-pursing'), axis=1).max()), 0, 1)[:, None]
jawW = np.clip(np.linalg.norm(dO, axis=1) / (0.3 * np.linalg.norm(dO, axis=1).max()), 0, 1)[:, None]
LOW, UP = lowW, (1 - lowW) * lipW
# normals of the neutral face, for the cheek puff
N = np.zeros_like(P)
for fc in faces:
    fc = list(fc)
    for k in range(1, len(fc) - 1):
        a_, b_, c_ = P[fc[0]], P[fc[k]], P[fc[k + 1]]; n = np.cross(b_ - a_, c_ - a_); N[fc[0]] += n; N[fc[k]] += n; N[fc[k + 1]] += n
N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
corner = np.argmax(np.linalg.norm(u('mouth-corner-puller'), axis=1) * (X > 0)); cx, cy, cz = P[corner]
def cheek(sgn): c = np.array([sgn * (abs(cx) + 0.012), cy + 0.004, cz + 0.014]); g = np.exp(-np.sum((P - c) ** 2, 1) / (2 * 0.014 ** 2))[:, None]; return g * N * 0.0065
shift = lambda w, v: w * np.array(v)[None, :]
ARKIT = {
  'eyeBlinkLeft': u('eye-left-closure'), 'eyeBlinkRight': u('eye-right-closure'),
  'eyeSquintLeft': u('eye-left-slit') * 0.8, 'eyeSquintRight': u('eye-right-slit') * 0.8,
  'eyeWideLeft': u('eye-left-opened-up'), 'eyeWideRight': u('eye-right-opened-up'),
  'browDownLeft': u('eyebrows-left-down'), 'browDownRight': u('eyebrows-right-down'),
  'browInnerUp': u('eyebrows-left-inner-up') + u('eyebrows-right-inner-up'),
  'browOuterUpLeft': u('eyebrows-left-extern-up'), 'browOuterUpRight': u('eyebrows-right-extern-up'),
  'jawOpen': dO, 'jawForward': shift(jawW * LOW, [0, -0.006, 0]), 'jawLeft': shift(jawW * LOW, [0.007, 0, 0]), 'jawRight': shift(jawW * LOW, [-0.007, 0, 0]),
  'mouthClose': -dO * lipW * 0.6,
  'mouthFunnel': u('mouth-pursing') * 0.6 + u('mouth-protusion') * 0.4 + dO * 0.12 * lipW,
  'mouthPucker': u('mouth-pursing') + u('mouth-protusion') * 0.5,
  'mouthLeft': shift(lipW, [0.006, 0, 0]), 'mouthRight': shift(lipW, [-0.006, 0, 0]),
  'mouthRollLower': -u('mouth-eversion') * LOW, 'mouthRollUpper': -u('mouth-eversion') * UP,
  'mouthShrugLower': u('mouth-elevation') * LOW, 'mouthShrugUpper': u('mouth-upward-retraction') * UP * 0.6,
  'cheekPuff': cheek(1) + cheek(-1),
  'noseSneerLeft': u('nose-left-elevation'), 'noseSneerRight': u('nose-right-elevation'),
}
for S, nm in (('L', 'Left'), ('R', 'Right')):
  w = SIDE[S]
  ARKIT.update({
    f'mouthSmile{nm}': u('mouth-corner-puller') * w, f'mouthFrown{nm}': u('mouth-depression') * w,
    f'mouthDimple{nm}': u('mouth-retraction') * 0.6 * w, f'mouthStretch{nm}': u('mouth-part-later') * 0.55 * w,
    f'mouthPress{nm}': u('mouth-compression') * w, f'mouthLowerDown{nm}': u('mouth-depression-retraction') * LOW * w,
    f'mouthUpperUp{nm}': u('mouth-upward-retraction') * UP * w,
    f'cheekSquint{nm}': u(f'eye-{"left" if S == "L" else "right"}-slit') * 0.35 * (P[:, 2] < P[corner, 2] + 0.05)[:, None] * w + u('mouth-corner-puller') * 0.25 * w * (P[:, 2] > cz + 0.008)[:, None],
  })
for name, d in ARKIT.items():
    ids = np.nonzero(np.linalg.norm(d, axis=1) > 2e-5)[0]
    out[name] = {'ids': base64.b64encode(ids.astype(np.uint16).tobytes()).decode(), 'd': base64.b64encode(d[ids].astype(np.float32).tobytes()).decode(), 'n': int(len(ids)), 'max_mm': round(float(np.linalg.norm(d, axis=1).max() * 1000), 2) if len(ids) else 0}
eyes = {}
for name, mix in EYE.items():
    d = sum(w * eye_unit(u) for u, w in mix.items()); ids = np.nonzero(np.linalg.norm(d, axis=1) > 2e-5)[0]
    eyes[name] = {'ids': base64.b64encode(ids.astype(np.uint16).tobytes()).decode(), 'd': base64.b64encode(d[ids].astype(np.float32).tobytes()).decode(), 'n': int(len(ids)), 'max_mm': round(float(np.linalg.norm(d, axis=1).max() * 1000), 2)}
p = os.path.join(sys.argv[1], 'modular', 'face_kit.json'); json.dump({'version': 1, 'vertexCount': int(len(used)), 'expressions': out, 'eyeShapes': eyes}, open(p, 'w'), separators=(',', ':'))
print('wrote', p, os.path.getsize(p) // 1024, 'kB', {k: (v['n'], v['max_mm']) for k, v in out.items()}, 'body verts', len(used), 'first/last MH index', int(used[0]), int(used[-1]))
