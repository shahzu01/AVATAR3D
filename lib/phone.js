// iPhone face tracking (Apple ARKit, the same tech as Face ID): far more accurate than a webcam.
// Supported phone apps:
//   - VMC protocol senders (e.g. waidayo): the phone sends to this Mac, UDP port 39539 (handled in server.js).
//   - iFacialMocap: this Mac asks the phone to stream to UDP port 49983.
//   - VTube Studio (iPhone app): this Mac asks the phone (port 21412) to stream JSON to UDP port 21413.
// Everything is converted into the same frame the avatar page already understands:
//   { type:'frame', source:'vmc', face:{ bs:{ARKit name: 0..1}, head:[x,y,z,w], gaze:{yaw,pitch} } }
import dgram from 'node:dgram';
import os from 'node:os';

export const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft',
  'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft',
  'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft', 'browDownRight', 'browInnerUp',
  'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];
const CANON = new Map(ARKIT.map((n) => [n.toLowerCase(), n]));
const VRM_PRESET = { a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh', blink: 'blink', blink_l: 'blinkLeft', blink_r: 'blinkRight', joy: 'happy', angry: 'angry', sorrow: 'sad', fun: 'relaxed' };
const IFM_MAGIC = 'iFacialMocap_sahuasouryya9218sauhuiayeta91555dy3719';
const PORTS = { ifm: Number(process.env.IFM_PORT || 49983), ifmPhone: Number(process.env.IFM_PHONE_PORT || 49983), vts: Number(process.env.VTS_PORT || 21413), vtsPhone: Number(process.env.VTS_PHONE_PORT || 21412) };

/** Map any sender's blendshape name to the ARKit name ("EyeBlinkLeft", "eyeBlink_L", "eye_blink_left"...). */
export function canonName(raw) {
  let n = String(raw).trim();
  const low = n.toLowerCase();
  if (CANON.has(low)) return CANON.get(low);
  const lr = low.replace(/_l$/, 'left').replace(/_r$/, 'right').replace(/_/g, '');
  if (CANON.has(lr)) return CANON.get(lr);
  if (VRM_PRESET[low]) return VRM_PRESET[low];
  return n;
}
const swapLR = (n) => (n.endsWith('Left') ? n.slice(0, -4) + 'Right' : n.endsWith('Right') ? n.slice(0, -5) + 'Left' : n);

// small quaternion helpers (x, y, z, w)
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
export function eulerYXZ(x, y, z) {           // radians -> quaternion, YXZ order (yaw, then pitch, then roll)
  const c = Math.cos, s = Math.sin, cx = c(x / 2), sx = s(x / 2), cy = c(y / 2), sy = s(y / 2), cz = c(z / 2), sz = s(z / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}
export function gazeFrom(bs) {
  const L = (k) => bs[k] || 0;
  const left = (L('eyeLookOutLeft') + L('eyeLookInRight')) / 2, right = (L('eyeLookInLeft') + L('eyeLookOutRight')) / 2;
  const up = (L('eyeLookUpLeft') + L('eyeLookUpRight')) / 2, down = (L('eyeLookDownLeft') + L('eyeLookDownRight')) / 2;
  return { yaw: (left - right) * 22, pitch: (down - up) * 18 };
}
export function localAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  return out;
}

export class PhoneFace {
  constructor({ emit, getSettings }) {
    this.emit = emit; this.getSettings = getSettings;
    this.last = 0; this.source = null; this.count = 0; this.fps = 0; this.neutral = null; this.lastHead = [0, 0, 0, 1]; this.smoothBs = {};
    setInterval(() => { this.fps = this.count; this.count = 0; }, 1000);
    this.ifm = this.bindSocket(PORTS.ifm, (buf, rinfo) => this.onIFacialMocap(buf.toString('utf8'), rinfo));
    this.vts = this.bindSocket(PORTS.vts, (buf) => this.onVTubeStudio(buf.toString('utf8')));
    this.pullTimer = setInterval(() => this.pull(), Number(process.env.PHONE_PULL_MS || 2000));
  }
  bindSocket(port, onMsg) {
    const s = dgram.createSocket('udp4');
    s.on('message', onMsg);
    s.on('error', (e) => { console.log(`iPhone input on port ${port} unavailable (${e.message})`); });
    s.bind(port);
    return s;
  }
  get active() { return Date.now() - this.last < 1000; }
  status() { return { active: this.active, source: this.active ? this.source : null, fps: this.fps, calibrated: !!this.neutral, addresses: localAddresses() }; }
  calibrate() { this.neutral = this.rawHead ? [...this.rawHead] : null; return !!this.neutral; }
  /** Ask the phone app to (keep) streaming to us. VMC senders need nothing: they push to us. */
  pull() {
    const ph = this.getSettings().phone || {};
    const ip = String(ph.ip || '').trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;
    try {
      if (ph.app === 'ifacialmocap' && (!this.active || this.source !== 'iFacialMocap')) this.ifm.send(Buffer.from(IFM_MAGIC), PORTS.ifmPhone, ip);
      if (ph.app === 'vtubestudio') this.vts.send(Buffer.from(JSON.stringify({ messageType: 'iOSTrackingDataRequest', time: 5, sentBy: 'KaelStudio', ports: [PORTS.vts] })), PORTS.vtsPhone, ip);
    } catch {}
  }
  /** Common path: canonical names, optional mirror, neutral head, light smoothing, broadcast. */
  publish(source, rawBs, headQ) {
    const ph = this.getSettings().phone || {};
    const mirror = !!ph.mirror;
    const bs = {};
    for (const [k, v] of Object.entries(rawBs)) { if (!Number.isFinite(v)) continue; const n = canonName(k); bs[mirror ? swapLR(n) : n] = Math.max(0, Math.min(1, v)); }
    // light smoothing (ARKit is already clean; this just removes 60 Hz sparkle)
    const a = 1 - Math.min(0.85, Math.max(0, Number(ph.smoothing ?? 0.25)));
    for (const [k, v] of Object.entries(bs)) { const p = this.smoothBs[k]; bs[k] = this.smoothBs[k] = p === undefined ? v : p + (v - p) * (k.startsWith('eyeBlink') ? Math.min(1, a * 1.8) : a); }
    let head = null;
    if (headQ) {
      this.rawHead = headQ;
      let q = this.neutral ? qMul(qInv(this.neutral), headQ) : headQ;
      if (mirror) q = [q[0], -q[1], -q[2], q[3]];
      if (ph.flipYaw) q = [q[0], -q[1], q[2], q[3]];
      if (ph.flipPitch) q = [-q[0], q[1], q[2], q[3]];
      head = this.lastHead = qNorm(q);
    }
    this.last = Date.now(); this.source = source; this.count++;
    this.emit({ type: 'frame', source: 'vmc', t: this.last, face: { bs, head: head || this.lastHead, gaze: gazeFrom(bs) }, conf: { face: 1 } });
  }
  // ---- VMC (called from server.js on /VMC/Ext/Blend/Apply)
  onVMC(blend, headQ) { this.publish('VMC (waidayo / other)', blend, headQ); }
  // ---- iFacialMocap: "mouthSmile_R-35|eyeBlink_L-2|...|=head#rx,ry,rz,x,y,z|rightEye#...|leftEye#...|"
  onIFacialMocap(text) {
    const bs = {}; let head = null;
    for (const part of text.split('|')) {
      const item = part.replace(/^=/, '');
      if (item.startsWith('head#')) {
        const [rx, ry, rz] = item.slice(5).split(',').map(Number);
        if ([rx, ry, rz].every(Number.isFinite)) head = eulerYXZ(-rx * Math.PI / 180, ry * Math.PI / 180, -rz * Math.PI / 180);
        continue;
      }
      const m = /^([A-Za-z_]+)[-&](-?[\d.]+)$/.exec(item);
      if (m) bs[m[1]] = Number(m[2]) / 100;
    }
    if (Object.keys(bs).length) this.publish('iFacialMocap', bs, head);
  }
  // ---- VTube Studio iPhone app: JSON with BlendShapes [{k,v}] and Rotation {x,y,z} in degrees
  onVTubeStudio(text) {
    let d; try { d = JSON.parse(text); } catch { return; }
    if (!d || d.FaceFound === false || !Array.isArray(d.BlendShapes)) return;
    const bs = {}; for (const b of d.BlendShapes) if (b && typeof b.k === 'string') bs[b.k] = Number(b.v);
    const r = d.Rotation || {};
    const head = [r.x, r.y, r.z].every(Number.isFinite) ? eulerYXZ(-r.x * Math.PI / 180, r.y * Math.PI / 180, -r.z * Math.PI / 180) : null;
    this.publish('VTube Studio', bs, head);
  }
}
