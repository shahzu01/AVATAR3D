"""Animal species as a shape of the human head: snout, cranium and cheeks pushed out with smooth fields,
eye sockets kept in place, human ears folded away. Separate ear and tail meshes come from parts.py.
Keeps the vertex order, so face expressions and body types still work on top."""
import numpy as np

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# snout length, width, height scale, nose lift, cranium width, cheek puff, jaw/chin forward, brow
SPECIES = {
    'fox':     dict(L=0.085, wide=0.030, tall=0.85, lift=0.010, cran=1.04, cheek=0.010, chin=0.6, brow=0.004, drop=0.02),
    'wolf':    dict(L=0.095, wide=0.034, tall=0.95, lift=0.008, cran=1.05, cheek=0.010, chin=0.7, brow=0.006, drop=0.02),
    'cat':     dict(L=0.030, wide=0.036, tall=0.80, lift=0.004, cran=1.06, cheek=0.012, chin=0.5, brow=0.002, drop=0.00),
    'tiger':   dict(L=0.045, wide=0.044, tall=0.95, lift=0.004, cran=1.10, cheek=0.016, chin=0.6, brow=0.005, drop=0.00),
    'bear':    dict(L=0.060, wide=0.046, tall=1.00, lift=0.002, cran=1.14, cheek=0.016, chin=0.8, brow=0.006, drop=0.01),
    'panda':   dict(L=0.040, wide=0.050, tall=1.00, lift=0.002, cran=1.18, cheek=0.022, chin=0.6, brow=0.003, drop=0.00),
    'raccoon': dict(L=0.060, wide=0.030, tall=0.85, lift=0.008, cran=1.06, cheek=0.014, chin=0.6, brow=0.004, drop=0.01),
    'bunny':   dict(L=0.025, wide=0.034, tall=0.85, lift=0.002, cran=1.06, cheek=0.014, chin=0.4, brow=0.000, drop=0.00),
}

def landmarks(V, EV, head):
    c, R = head
    eyes = [EV[EV[:, 0] > 0].mean(0), EV[EV[:, 0] < 0].mean(0)]
    er = np.linalg.norm(EV[EV[:, 0] > 0] - eyes[0], axis=1).max()
    mid = (eyes[0] + eyes[1]) / 2
    front = V[(np.abs(V[:, 0]) < 0.004) & (V[:, 2] > mid[2] - 0.12) & (V[:, 2] < mid[2] - 0.02)]
    tip = front[np.argmin(front[:, 1])]                     # nose tip (most forward point below the eyes)
    return dict(c=c, R=R, eyes=eyes, er=er, mid=mid, nose=tip)

def delta(V, N, EV, head, name, ears_mask=None):
    p = SPECIES[name]; L = landmarks(V, EV, head); c, R = L['c'], L['R']; mid = L['mid']; nose = L['nose']
    x, y, z = V.T; ax = np.abs(x)
    D = np.zeros_like(V)
    fwd = ss(-0.1, 0.45, -N[:, 1])                          # front-facing
    headreg = ss(c[2] - 0.20, c[2] - 0.14, z)               # head only (not the neck/body)
    # --- snout: a soft box around nose and mouth, pulled forward
    zt, zb = mid[2] - 0.012, mid[2] - 0.115                 # from just under the eyes to the chin
    wx = 1 - ss(p['wide'] * 0.75, p['wide'] * 1.6, ax)
    wz = ss(zb - 0.01, zb + 0.03, z) * (1 - ss(zt - 0.01, zt + 0.025, z))
    wy = ss(mid[1] + 0.06, mid[1] - 0.005, y)               # only the front of the face
    w = wx * wz * wy * headreg
    for e in L['eyes']:                                      # never move the eyes and lids
        w *= ss(L['er'] * 1.15, L['er'] * 2.2, np.linalg.norm(V - e, axis=1))
    rel_z = (z - (zt + zb) / 2) / ((zt - zb) / 2)            # -1 chin .. +1 under eyes
    length = p['L'] * (0.75 + 0.25 * np.clip(1 - rel_z ** 2, 0, 1)) * (1 - 0.45 * ss(0.3, 1.1, -rel_z) * (1 - p['chin']))
    D[:, 1] -= w * length
    D[:, 0] -= w * x * 0.35 * (p['wide'] < 0.04)             # narrow snouts
    D[:, 2] += w * (p['lift'] * ss(0, 1, rel_z) - p['drop'] * ss(0.2, 1, -rel_z) * 0.5)
    D[:, 2] += w * (z - (zt + zb) / 2) * (p['tall'] - 1)
    # bridge from the brow to the snout top (fills the step between the eyes)
    br = (1 - ss(0.008, 0.03, ax)) * ss(mid[2] - 0.02, mid[2] + 0.0, z) * (1 - ss(mid[2] + 0.02, mid[2] + 0.05, z)) * wy * headreg
    D[:, 1] -= br * p['L'] * 0.55 * (1 - w)
    # --- cranium: wider, a little flatter on top; cheeks puff out
    cr = headreg * ss(c[2] - 0.12, c[2] - 0.05, z)
    D[:, 0] += cr * x * (p['cran'] - 1)
    ch = headreg * ss(0.035, 0.065, ax) * (1 - ss(0.07, 0.1, ax)) * ss(mid[2] - 0.09, mid[2] - 0.05, z) * (1 - ss(mid[2] - 0.01, mid[2] + 0.01, z))
    D += N * (ch * p['cheek'])[:, None]
    D[:, 1] -= headreg * p['brow'] * (1 - ss(0.0, 0.05, np.abs(z - (mid[2] + 0.022)))) * ss(-0.1, 0.4, -N[:, 1]) * (1 - ss(0.04, 0.06, ax))
    # --- fold the human ears into the head
    if ears_mask is not None:
        rr = (V - c) / R; n = np.linalg.norm(rr, axis=1, keepdims=True)
        on = c + rr / n * R * 0.985
        D += (on - V) * ears_mask[:, None]
    return D
