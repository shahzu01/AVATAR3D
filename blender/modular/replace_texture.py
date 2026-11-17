"""Swap one embedded texture of a .vrm/.glb for a corrected picture, leaving everything else untouched.

    python3 replace_texture.py <in.vrm> <out.vrm> <image index> <new picture>
"""
import sys, json, struct, io
from PIL import Image
src, dst, idx, pic = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
raw = open(src, 'rb').read(); jl = struct.unpack('<I', raw[12:16])[0]; J = json.loads(raw[20:20 + jl])
bo = 20 + jl + 8; BIN = bytearray(raw[bo:bo + struct.unpack('<I', raw[20 + jl:24 + jl])[0]])
img = J['images'][idx]; buf = io.BytesIO(); im = Image.open(pic)
if img.get('mimeType') == 'image/png': im.save(buf, 'PNG')
else: im.convert('RGB').save(buf, 'JPEG', quality=93, subsampling=0)
data = buf.getvalue()
old = J['bufferViews'][img['bufferView']]; o0 = old.get('byteOffset', 0); o1 = o0 + old['byteLength']; o1 += -o1 % 4
o1 = min(o1, len(BIN)); pad = data + b'\0' * (-len(data) % 4); shift = len(pad) - (o1 - o0)      # put the new picture where the old one was
assert not any(o0 < v.get('byteOffset', 0) < o1 for v in J['bufferViews'] if v is not old), 'picture bytes are shared'
BIN[o0:o1] = pad; old['byteLength'] = len(data)
for v in J['bufferViews']:
    if v is not old and v.get('byteOffset', 0) >= o1: v['byteOffset'] += shift
J['buffers'][0]['byteLength'] = len(BIN)
js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(BIN)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(BIN), b'BIN\0') + bytes(BIN))
print('wrote', dst, len(data) // 1024, 'kB picture')
