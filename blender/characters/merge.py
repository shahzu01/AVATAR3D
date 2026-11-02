import sys, numpy as np
out=sys.argv[1]; V=[]; F=[]; M=[]; n=0
for p in sys.argv[2:]:
    a=np.load(p); V.append(a['v']); F.append(a['f']+n); n+=len(a['v'])
    M.append(a['m'] if 'm' in a else np.zeros(len(a['f']), np.int8))
np.savez_compressed(out, v=np.concatenate(V), f=np.concatenate(F), m=np.concatenate(M))
