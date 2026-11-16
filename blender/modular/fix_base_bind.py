"""Repair public/modular/base.vrm: make every joint's inverse bind matrix the exact inverse of its rest transform.

    python3 fix_base_bind.py <repo_public_dir>

The file was exported while the female rig still held a test pose (legs, fingers, thumbs), so the web mixer
showed every kit body with that leftover pose baked in: bent, clawed fingers and thumbs turned under the palm.
"""
import sys, os, json, struct, shutil
import numpy as np
p = os.path.join(sys.argv[1], 'modular', 'base.vrm'); raw = open(p, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]; J = json.loads(raw[20:20 + jl]); bo = 20 + jl + 8; B = bytearray(raw[bo:])
N = J['nodes']; par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
def loc(n):
    M = np.eye(4); x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M[:3, :3] = R * np.array(n.get('scale', [1, 1, 1])); M[:3, 3] = n.get('translation', [0, 0, 0]); return M
def W(i): return (W(par[i]) if i in par else np.eye(4)) @ loc(N[i])
worst = 0.0
for sk in J['skins']:
    a = J['accessors'][sk['inverseBindMatrices']]; bv = J['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    I = np.frombuffer(bytes(B[off:off + a['count'] * 64]), np.float32).reshape(-1, 4, 4).transpose(0, 2, 1)
    out = np.zeros_like(I)
    for k, j in enumerate(sk['joints']):
        Wj = W(j); worst = max(worst, float(np.abs(Wj @ I[k] - np.eye(4)).max())); out[k] = np.linalg.inv(Wj)
    B[off:off + a['count'] * 64] = out.transpose(0, 2, 1).astype(np.float32).tobytes()
if worst > 1e-4:
    shutil.copy(p, p + '.posed-bind.bak'); open(p, 'wb').write(raw[:bo] + bytes(B))
print('largest bind error before the repair: %.3f (0 = clean)' % worst, '-> repaired' if worst > 1e-4 else '-> nothing to do')
