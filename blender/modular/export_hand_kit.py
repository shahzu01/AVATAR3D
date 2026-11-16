"""Write the master hand for the Part Mixer: public/modular/hand_master.json (no Blender needed).

    python3 export_hand_kit.py <repo_public_dir>
"""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hand_master as HM
h = HM.build(); bones = sorted({b for w in h['weights'] for b in w})
W = []
for w in h['weights']:
    it = sorted(w.items(), key=lambda t: -t[1])[:4]; s = sum(x for _, x in it); W.append([[bones.index(b), round(x / s, 4)] for b, x in it])
out = {'version': 1, 'frame': 'left hand: wrist centre at origin, +X fingers, -Y thumb side (front of the character in T-pose), +Z back of hand; metres',
       'verts': [round(float(x), 5) for x in h['verts'].ravel()], 'quads': [int(i) for i in h['quads'].ravel()], 'bones': bones, 'weights': W,
       'joints': {k: [round(float(x), 5) for x in v] for k, v in h['joints'].items()}, 'wristLoop': h['wrist_loop'], 'baseLength': 0.143}
p = os.path.join(sys.argv[1], 'modular', 'hand_master.json'); json.dump(out, open(p, 'w'), separators=(',', ':')); print('wrote', p, os.path.getsize(p) // 1024, 'kB', len(h['verts']), 'verts')
