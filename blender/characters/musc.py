"""Muscle definition: small displacement along normals on the rest mesh (meters).
Torso features use (x, z) on front/back surfaces; limb features use cylinder coords along bones."""
import numpy as np

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def bump(u, v, u0, v0, su, sv):
    q = ((u - u0) / su) ** 2 + ((v - v0) / sv) ** 2
    return np.where(q < 1, (1 - q) ** 2, 0.0)

def plateau(u, v, u0, v0, su, sv):
    q = np.sqrt(((u - u0) / su) ** 2 + ((v - v0) / sv) ** 2)
    return ss(1.0, 0.55, q)

def line(px, pz, a, b, w):
    """Falloff around a 2D segment a-b in the (x, z) plane."""
    a = np.asarray(a); b = np.asarray(b); d = b - a; L2 = d @ d
    t = np.clip(((px - a[0]) * d[0] + (pz - a[1]) * d[1]) / L2, 0, 1)
    dist = np.hypot(px - (a[0] + t * d[0]), pz - (a[1] + t * d[1]))
    return np.where(dist < w, (1 - (dist / w) ** 2) ** 2, 0.0)

def limb(P, A, B, front=(0, -1, 0)):
    """Return t (0..1 along A->B), signed angle (rad, 0 = front, + = lateral for left side), radial dist."""
    A = np.asarray(A); B = np.asarray(B); ax = B - A; L = np.linalg.norm(ax); ax = ax / L
    f = np.asarray(front, float); f = f - (f @ ax) * ax; f /= np.linalg.norm(f)
    s = np.cross(ax, f)
    q = P - A; t = q @ ax / L; r = q - np.outer(q @ ax, ax)
    ang = np.arctan2(r @ s, r @ f); rad = np.linalg.norm(r, axis=1)
    return t, ang, rad

def displace(P, N, J, amt=1.0, female=False):
    """P, N: (n,3) rest positions/normals. J: dict bone -> (head, tail). Returns per-vertex offset (n,)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)
    front = ss(0.15, 0.6, -N[:, 1]); back = ss(0.15, 0.6, N[:, 1])
    torso = ss(0.30, 0.2, ax) * ss(0.86, 0.95, z) * ss(1.56, 1.48, z)
    d = np.zeros(len(P))
    zc = J['spine01'][0][2]                               # ~1.327 chest root
    # ---- front torso
    tf = front * torso
    chest = 0.0 if female else 1.0
    d += chest * tf * 0.007 * plateau(ax, z, 0.078, zc + 0.008, 0.09, 0.068)  # pec mass (flat-topped)
    d -= chest * tf * 0.003 * line(ax, z, (0.0, zc + 0.1), (0.0, zc - 0.035), 0.02)       # sternum
    d -= chest * tf * 0.0032 * line(ax, z, (0.01, zc - 0.045), (0.09, zc - 0.058), 0.02)  # pec underline
    d -= chest * tf * 0.0028 * line(ax, z, (0.09, zc - 0.058), (0.15, zc - 0.005), 0.02)
    ax_f = ss(0.3, 0.7, np.abs(N[:, 0])) * ss(-0.1, 0.4, -N[:, 1])                          # front armpit fold
    d += chest * ax_f * 0.004 * line(ax, z, (0.13, zc + 0.03), (0.19, zc + 0.07), 0.025) * ss(0.86, 0.95, z)
    for zz in (zc - 0.085, zc - 0.142, zc - 0.199):                                # six-pack
        d += tf * 0.0048 * bump(ax, z, 0.035, zz, 0.03, 0.029)
    d += tf * 0.003 * bump(ax, z, 0.0, zc - 0.27, 0.05, 0.04)                     # lower abs
    d -= tf * 0.0028 * line(ax, z, (0.0, zc - 0.06), (0.0, zc - 0.25), 0.013)     # linea alba
    d -= tf * 0.0028 * line(ax, z, (0.105, zc - 0.245), (0.065, zc - 0.33), 0.018) # V lines
    d -= tf * 0.0018 * line(ax, z, (0.07, zc - 0.07), (0.072, zc - 0.23), 0.016)  # semilunar
    side = ss(0.4, 0.8, np.abs(N[:, 0])) * torso
    for i, zz in enumerate((zc - 0.03, zc - 0.065, zc - 0.10)):                    # serratus
        d += side * ss(0.0, 0.3, -N[:, 1] + 0.3) * 0.0022 * bump(y, z, -0.04 + 0.008 * i, zz, 0.03, 0.013)
    d += side * 0.003 * bump(y, z, -0.02, zc - 0.2, 0.06, 0.07)                    # obliques
    # ---- back torso
    tb = back * torso
    d -= tb * 0.0035 * line(ax, z, (0.0, 1.0), (0.0, 1.47), 0.02)                  # spine
    d += tb * 0.0055 * bump(ax, z, 0.035, zc - 0.2, 0.03, 0.14)                         # erectors
    d += tb * 0.007 * bump(ax, z, 0.085, zc + 0.07, 0.06, 0.075)                   # scapula
    d += tb * 0.0075 * bump(ax, z, 0.11, zc - 0.04, 0.055, 0.11)                   # lats
    d -= tb * 0.002 * line(ax, z, (0.045, zc + 0.15), (0.13, zc + 0.05), 0.022)    # trap edge
    d += back * 0.004 * bump(ax, z, 0.07, 0.92, 0.07, 0.08) * ss(0.86, 0.95, z)   # glutes
    # ---- limbs (both sides)
    for sd in ('L', 'R'):
        sg = 1 if sd == 'L' else -1
        mside = (x * sg > 0.02)
        def seg(b): return limb(P, J[b][0], J[b][1])
        # upper arm (from shoulder head through upperarm02 tail)
        A = J[f'upperarm01.{sd}'][0]; B = J[f'upperarm02.{sd}'][1]
        t, a, r = limb(P, A, B); a = a * -sg
        m = mside & (t > -0.25) & (t < 1.05)
        w = np.where(m, 1.0, 0.0)
        d += w * 0.006 * bump(t, a, 0.05, 1.6, 0.32, 1.7)                          # deltoid
        d -= w * 0.004 * bump(t, a, 0.33, 1.6, 0.06, 1.2)                          # deltoid insertion
        d += w * 0.005 * bump(t, a, 0.62, 0.0, 0.28, 1.1)                          # biceps
        d += w * 0.0045 * bump(t, a, 0.5, 3.14, 0.35, 1.2)                         # triceps
        d += w * 0.0045 * bump(t, a, 0.5, -3.14, 0.35, 1.2)
        d -= w * 0.003 * bump(t, a, 0.6, 1.55, 0.3, 0.25)                          # lateral groove
        # forearm
        A = J[f'lowerarm01.{sd}'][0]; B = J[f'lowerarm02.{sd}'][1]
        t, a, r = limb(P, A, B); a = a * -sg
        w = np.where(mside & (t > -0.05) & (t < 1.0), 1.0, 0.0)
        d += w * 0.0045 * bump(t, a, 0.22, 0.9, 0.28, 1.0)                         # brachioradialis
        d += w * 0.003 * bump(t, a, 0.25, -1.2, 0.3, 1.0)                          # flexors
        # thigh
        A = J[f'upperleg01.{sd}'][0]; B = J[f'upperleg02.{sd}'][1]
        t, a, r = limb(P, A, B); a = a * -sg
        w = np.where(mside & (t > 0.05) & (t < 1.05) & (z > 0.4), 1.0, 0.0)
        d += w * 0.005 * bump(t, a, 0.5, 0.0, 0.4, 0.55)                           # rectus femoris
        d += w * 0.006 * bump(t, a, 0.55, 1.15, 0.42, 0.65)                        # vastus lateralis
        d += w * 0.006 * bump(t, a, 0.86, -0.75, 0.13, 0.5)                        # vastus medialis
        d -= w * 0.0035 * bump(t, a, 0.6, 0.6, 0.35, 0.18)                         # quad groove lat
        d -= w * 0.003 * bump(t, a, 0.6, -0.5, 0.32, 0.16)                         # quad groove med
        d += w * 0.004 * bump(t, a, 0.5, 3.14, 0.4, 0.8)                           # hamstrings
        d += w * 0.004 * bump(t, a, 0.5, -3.14, 0.4, 0.8)
        d -= w * 0.003 * bump(t, a, 0.3, -1.5, 0.3, 0.3) * 0.0                     # (reserved)
        # calf
        A = J[f'lowerleg01.{sd}'][0]; B = J[f'lowerleg02.{sd}'][1]
        t, a, r = limb(P, A, B); a = a * -sg
        w = np.where(mside & (t > -0.05) & (t < 1.0), 1.0, 0.0)
        d += w * 0.006 * bump(t, a, 0.28, 2.55, 0.25, 0.65)                        # gastrocnemius lat
        d += w * 0.0065 * bump(t, a, 0.25, -2.55, 0.25, 0.65)                      # gastrocnemius med
        d += w * 0.0065 * bump(t, a, 0.25, 3.14, 0.25, 0.5) * 0                    # (between)
        d -= w * 0.003 * bump(t, a, 0.28, 3.14, 0.25, 0.15)                        # groove between heads
        d += w * 0.003 * bump(t, a, 0.35, 0.6, 0.35, 0.4)                          # tibialis
    return d * amt
