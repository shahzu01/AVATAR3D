"""Cut the head (face, hair, ears, neck stub) out of a finished one-piece VRM so the Part Mixer can put it on any kit body.

    python3 extract_head_part.py <in.vrm> <out.vrm> <heads.json> <key> <label> <cut_height> <chin x,y,z>

cut_height and chin are in the file's own axes (metres, Y up, +Z front): where the neck is cut, and the tip of the chin.

No Blender needed: the file is edited directly, so the materials, face expressions and hair/ear sway of the
original are kept exactly. Everything outside the head is dropped from the triangle list, the neck stub is
re-weighted to the head bone, and body-only sway chains (tail) are removed.
"""
import sys, json, struct, io, os
import numpy as np

src, dst, heads_json, key, label = sys.argv[1:6]
CUT = float(sys.argv[6]) if len(sys.argv) > 6 else None
CHIN = [float(v) for v in sys.argv[7].split(',')] if len(sys.argv) > 7 else None
raw = open(src, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]; J = json.loads(raw[20:20 + jl])
bo = 20 + jl + 8; RB = raw[bo:bo + struct.unpack('<I', raw[20 + jl:24 + jl])[0]]; BIN = bytearray(RB)   # RB: read-only views, BIN: output
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def view(ai):
    a = J['accessors'][ai]; bv = J['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0)
    assert not stride or stride == dt.itemsize * n, 'interleaved buffers are not supported'
    return np.frombuffer(RB, dt, a['count'] * n, off).reshape(a['count'], n) if n > 1 else np.frombuffer(RB, dt, a['count'], off)

nodes = J['nodes']; name2node = {n.get('name'): i for i, n in enumerate(nodes)}
hb = J['extensions']['VRMC_vrm']['humanoid']['humanBones']; head_node = hb['head']['node']; neck_node = hb['neck']['node']
sub = set(); st = [head_node]
while st:
    x = st.pop(); sub.add(x); st += nodes[x].get('children', [])
# rest-pose world positions of nodes
parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
def wpos(i):
    p = np.zeros(3)
    while i is not None:
        n = nodes[i]
        p = p + np.array(n.get('translation', [0, 0, 0])); i = parent.get(i)
    return p
def wmat(i):
    M = np.eye(4)
    while i is not None:
        n = nodes[i]; T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); x, y, z, w = q
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        T[:3, :3] = R * np.array(n.get('scale', [1, 1, 1])); M = T @ M; i = parent.get(i)
    return M
head_w = wmat(head_node)[:3, 3]; neck_w = wmat(neck_node)[:3, 3]

report = {'source': os.path.basename(src), 'meshes': {}}
skin_colors = []
for mi, mesh in enumerate(J['meshes']):
    for prim in mesh['primitives']:
        at = prim['attributes']; P = view(at['POSITION']); idx = view(prim['indices']).astype(np.int64).reshape(-1, 3)
        node = next(n for n in nodes if n.get('mesh') == mi); joints = J['skins'][node['skin']]['joints']
        Jn = view(at['JOINTS_0']); Wt = view(at['WEIGHTS_0']).astype(np.float64)
        wsum = Wt.sum(1); wsum[wsum == 0] = 1
        in_sub = np.isin(np.array(joints)[Jn], list(sub))
        hw = (Wt * in_sub).sum(1) / wsum
        if prim.get('targets'):                       # face layer: keep whole
            keep = np.ones(len(idx), bool)
        else:
            cut = CUT if CUT is not None else neck_w[1]
            ax = (head_w + neck_w) / 2
            r = np.hypot(P[:, 0] - ax[0], P[:, 2] - ax[2])
            stub = (P[:, 1] > cut) & (r < 0.085)
            keep = (hw[idx].mean(1) > 0.5) | (stub[idx].all(1) & (hw[idx].max(1) < 0.5) ) | (stub[idx].all(1))
            # skin tone under the chin, for matching the kit body
            try:
                from PIL import Image
                mat = J['materials'][prim['material']]; img = J['images'][J['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
                bv = J['bufferViews'][img['bufferView']]; im = Image.open(io.BytesIO(bytes(RB[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]))).convert('RGB')
                UV = view(at['TEXCOORD_0']); cy = (CHIN[1] if CHIN else head_w[1]) + 0.03
                m = (hw > 0.5) & (np.abs(P[:, 1] - cy) < 0.02) & (np.abs(np.abs(P[:, 0] - head_w[0]) - 0.045) < 0.02) & (P[:, 2] > head_w[2] + 0.03)
                px = np.array(im)[np.clip((UV[m, 1] % 1 * im.size[1]).astype(int), 0, im.size[1] - 1), np.clip((UV[m, 0] % 1 * im.size[0]).astype(int), 0, im.size[0] - 1)].astype(float)
                lum = px.sum(1); px = px[lum >= np.percentile(lum, 60)]; skin_colors.append(np.median(px, 0)); report['skin_samples'] = int(len(px))
            except Exception as e: report['skin_error'] = str(e)
        new_idx = idx[keep]; used = np.unique(new_idx)
        # the part hangs off the head bone only: move every other influence to the head joint
        hj = joints.index(head_node); Jw = Jn.copy(); Jw[~in_sub] = hj
        a = J['accessors'][at['JOINTS_0']]; off = J['bufferViews'][a['bufferView']].get('byteOffset', 0) + a.get('byteOffset', 0); BIN[off:off + Jw.nbytes] = Jw.tobytes()
        # new index buffer appended to the binary chunk
        ia = J['accessors'][prim['indices']]; dt = np.uint32 if len(P) > 65535 else np.uint16; data = new_idx.astype(dt).tobytes()
        while len(BIN) % 4: BIN.append(0)
        J['bufferViews'].append({'buffer': 0, 'byteOffset': len(BIN), 'byteLength': len(data), 'target': 34963}); BIN += data
        ia.update({'bufferView': len(J['bufferViews']) - 1, 'byteOffset': 0, 'componentType': 5125 if dt == np.uint32 else 5123, 'count': int(new_idx.size)})
        Pu = P[used]
        report['meshes'][mesh['name']] = {'triangles_kept': int(len(new_idx)), 'triangles_total': int(len(idx)), 'min': Pu.min(0).round(4).tolist(), 'max': Pu.max(0).round(4).tolist()}
        if not prim.get('targets'):
            body_P, body_used, body_hw, body_stub, body_r = P, used, hw, stub, r

# sway: keep chains that live on the head, drop colliders tied to the dropped body
sb = J['extensions'].get('VRMC_springBone')
if sb:
    sb['springs'] = [s for s in sb.get('springs', []) if all(j['node'] in sub for j in s['joints'])]
    report['sway'] = [s.get('name') for s in sb['springs']]
J['extensions']['VRMC_vrm'].pop('lookAt', None)

# anchors (glTF axes: Y up, +Z front), measured on the kept body triangles
P = body_P[body_used]; ax = (head_w + neck_w) / 2
face = P[(np.abs(P[:, 0] - head_w[0]) < 0.02) & (body_hw[body_used] > 0.5)]
stubP = body_P[body_used][body_stub[body_used]]
# chin: lowest point of the face front (largest z) between neck and head-bone height + 2 cm
prof = []
for y in np.arange(neck_w[1], head_w[1] + 0.06, 0.004):
    m = (np.abs(body_P[:, 1] - y) < 0.004) & (np.abs(body_P[:, 0] - head_w[0]) < 0.02) & (body_r < 0.2) & (body_P[:, 2] > ax[2])
    if m.any(): prof.append((float(y), float(body_P[m, 2].max())))
report['front_profile'] = [(round(a, 3), round(b, 3)) for a, b in prof]
info = {'label': label, 'neckFit': 0.72, 'file': os.path.basename(dst), 'chin': CHIN or head_w.round(5).tolist(), 'headBone': head_w.round(5).tolist(), 'neckBone': neck_w.round(5).tolist(),
        'stubBottom': float(stubP[:, 1].min()), 'top': float(P[:, 1].max()), 'skin': '#%02x%02x%02x' % tuple(int(v) for v in (np.mean(skin_colors, 0) if skin_colors else (236, 196, 173))),
        'expressions': sorted(k for k, v in J['extensions']['VRMC_vrm'].get('expressions', {}).get('preset', {}).items() if v.get('morphTargetBinds')), 'sway': report.get('sway', [])}
report['info'] = info

js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
while len(BIN) % 4: BIN.append(0)
J['buffers'][0]['byteLength'] = len(BIN); js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(BIN)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(BIN), b'BIN\0') + bytes(BIN)
open(dst, 'wb').write(out)
heads = json.load(open(heads_json)) if os.path.exists(heads_json) else {}
info['kb'] = len(out) // 1024; heads[key] = info; json.dump(heads, open(heads_json, 'w'), indent=1)
print(json.dumps(report, indent=1))
