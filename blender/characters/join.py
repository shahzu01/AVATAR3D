import sys
from PIL import Image
out=sys.argv[1]; ims=[Image.open(p) for p in sys.argv[2:]]
H=max(i.height for i in ims); ims=[i.resize((int(i.width*H/i.height),H)) for i in ims]
im=Image.new('RGB',(sum(i.width for i in ims),H),(30,30,34)); x=0
for i in ims: im.paste(i,(x,0)); x+=i.width
im.save(out)
