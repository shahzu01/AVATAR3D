import sys, numpy as np
import bpy
from bodies import bake_part, cloth_of
from PIL import Image
style = sys.argv[-1]
rows = []
for name in ('torso','arm','leg','palm','foot'):
    base, build, chest = bake_part(name, style)
    ims = []
    for a in (base, cloth_of(base), build, chest):
        n = np.clip(a / 0.3, -1, 1)
        rgb = np.stack([np.clip(n,0,1), np.zeros_like(n)+0.15, np.clip(-n,0,1)], -1)
        im = Image.fromarray((rgb[::-1]*255).astype(np.uint8)).resize((200, 160), Image.NEAREST)
        ims.append(im)
    row = Image.new('RGB', (820, 160)); [row.paste(im, (i*205, 0)) for i, im in enumerate(ims)]
    rows.append(row)
    print(name, 'base max %.3f min %.3f p95 %.3f' % (base.max(), base.min(), np.percentile(base, 95)))
out = Image.new('RGB', (820, 165*len(rows))); [out.paste(r, (0, i*165)) for i, r in enumerate(rows)]
out.save(f'/tmp/claude-0/cr/bmap_{style}.png')
