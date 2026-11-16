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
eyes = {}
for name, mix in EYE.items():
    d = sum(w * eye_unit(u) for u, w in mix.items()); ids = np.nonzero(np.linalg.norm(d, axis=1) > 2e-5)[0]
    eyes[name] = {'ids': base64.b64encode(ids.astype(np.uint16).tobytes()).decode(), 'd': base64.b64encode(d[ids].astype(np.float32).tobytes()).decode(), 'n': int(len(ids)), 'max_mm': round(float(np.linalg.norm(d, axis=1).max() * 1000), 2)}
p = os.path.join(sys.argv[1], 'modular', 'face_kit.json'); json.dump({'version': 1, 'vertexCount': int(len(used)), 'expressions': out, 'eyeShapes': eyes}, open(p, 'w'), separators=(',', ':'))
print('wrote', p, os.path.getsize(p) // 1024, 'kB', {k: (v['n'], v['max_mm']) for k, v in out.items()}, 'body verts', len(used), 'first/last MH index', int(used[0]), int(used[-1]))
