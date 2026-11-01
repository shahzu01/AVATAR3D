// Drawn toon face. Painted onto a canvas that is mapped onto the front of the head.
// Driven every frame by expression weights (ARKit 52 "Perfect Sync" names, VRM presets, visemes and emotes) and gaze.
import * as THREE from 'three';

export const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft',
  'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft',
  'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft', 'browDownRight', 'browInnerUp',
  'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];
export const PRESETS = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft', 'blinkRight', 'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'neutral'];
export const EMOTES = ['Laughing', 'Embarrassed', 'Smug', 'Wink_L', 'Wink_R', 'Thinking', 'HeartEyes', 'StarEyes', 'Crying', 'Sweat', 'Sleepy', 'Dizzy', 'Pout', 'Shocked'];
export const ALL_EXPRESSIONS = [...ARKIT, ...PRESETS, ...EMOTES];

const LINER = '#17141c', MOUTH_IN = '#5c1a24', TONGUE = '#e0708a';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

export class FaceDrawer {
  constructor(recipe, body, region, sp, size = 1024) {
    this.recipe = recipe; this.body = body; this.region = region; this.sp = sp;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.anisotropy = 4;
    this.lastKey = '';
    const { rx, ry } = body.head, f = recipe.face || {};
    const animal = sp.style === 'animal';
    const muz = sp.muzzle * (0.4 + 1.2 * (f.muzzle ?? 0.5));
    // layout in metres, relative to the head centre
    this.L = {
      rx, ry,
      eyeX: rx * (0.27 + 0.16 * (f.eyeSpacing ?? 0.5)),
      eyeY: ry * ((animal ? 0.06 : -0.1) + 0.24 * ((f.eyeHeight ?? 0.5) - 0.5)),
      eyeH: ry * 0.27 * (0.7 + 0.65 * (f.eyeSize ?? 0.5)) * (animal ? 0.95 : 1.22),
      tilt: ((f.eyeTilt ?? 0.5) - 0.5) * 0.6,
      noseY: animal ? -ry * (0.17 + 0.05 * muz) : -ry * 0.26,
      mouthY: animal ? -ry * (0.36 + 0.06 * muz) : -ry * 0.47,
      mouthW: rx * (animal ? 0.2 : 0.17),
    };
  }
  // metres (head-relative) -> canvas transform
  begin() {
    const { canvas, ctx, region, body } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = canvas.width / (region.x1 - region.x0), sy = canvas.height / (region.y1 - region.y0);
    ctx.setTransform(sx, 0, 0, -sy, -region.x0 * sx, region.y1 * sy);
    ctx.translate(0, body.headC.y);
    this.px = 1 / sx;      // one canvas pixel in metres
  }
  /** Combine raw expression weights into drawing parameters. */
  derive(v, gaze) {
    const g = (k) => v[k] || 0, mx = Math.max;
    const happy = g('happy'), laugh = g('Laughing'), angry = g('angry'), sad = g('sad'), surprised = mx(g('surprised'), g('Shocked')), relaxed = g('relaxed');
    const smug = g('Smug'), think = g('Thinking'), sleepy = g('Sleepy');
    const d = {};
    d.blinkL = clamp01(mx(g('eyeBlinkLeft'), g('blinkLeft'), g('blink'), g('Wink_L'), laugh * 0.0, g('Crying') * 0.9));
    d.blinkR = clamp01(mx(g('eyeBlinkRight'), g('blinkRight'), g('blink'), g('Wink_R'), g('Crying') * 0.9));
    d.happyEyes = clamp01(mx(laugh, happy * 0.75 - surprised, g('Embarrassed') * 0.6));
    d.lidL = clamp01(mx(g('eyeSquintLeft') * 0.5, relaxed * 0.4, smug * 0.45, sleepy * 0.55, g('cheekSquintLeft') * 0.3));
    d.lidR = clamp01(mx(g('eyeSquintRight') * 0.5, relaxed * 0.4, smug * 0.45, sleepy * 0.55, g('cheekSquintRight') * 0.3));
    d.wide = clamp01(mx((g('eyeWideLeft') + g('eyeWideRight')) / 2, surprised));
    d.browUpL = clamp01(g('browOuterUpLeft') + g('browInnerUp') * 0.5 + surprised * 0.8 + think * 0.9);
    d.browUpR = clamp01(g('browOuterUpRight') + g('browInnerUp') * 0.5 + surprised * 0.8);
    d.browDownL = clamp01(g('browDownLeft') + angry); d.browDownR = clamp01(g('browDownRight') + angry);
    d.browInner = clamp01(g('browInnerUp') * 0.7 + sad + g('Crying') * 0.6 + g('Pout') * 0.3);
    const vis = mx(g('aa'), g('oh') * 0.75, g('ou') * 0.45, g('ee') * 0.35, g('ih') * 0.3);
    d.jaw = clamp01(mx(g('jawOpen') * 1.05, vis, surprised * 0.55, laugh * 0.75, g('Shocked') * 0.8) - g('mouthClose') * 0.5);
    d.smileL = clamp01(g('mouthSmileLeft') + happy * 0.8 + laugh + smug * 0.9 + g('mouthDimpleLeft') * 0.3);
    d.smileR = clamp01(g('mouthSmileRight') + happy * 0.8 + laugh + smug * 0.15 + g('mouthDimpleRight') * 0.3);
    d.frown = clamp01((g('mouthFrownLeft') + g('mouthFrownRight')) / 2 + sad * 0.8 + angry * 0.35 + g('Pout') * 0.5);
    d.round = clamp01(mx(g('mouthFunnel'), g('mouthPucker'), g('ou'), g('oh') * 0.6, g('Pout') * 0.7));
    d.wideMouth = clamp01((g('mouthStretchLeft') + g('mouthStretchRight')) / 2 + g('ee') * 0.6 + g('ih') * 0.4);
    d.shift = Math.max(-1, Math.min(1, g('mouthRight') - g('mouthLeft') + (g('jawRight') - g('jawLeft')) * 0.5 + think * 0.5));
    d.tongue = clamp01(g('tongueOut'));
    d.blush = clamp01(mx(g('Embarrassed'), g('cheekPuff') * 0.4, this.recipe.face?.markings === 'blush' ? 0.55 : 0, laugh * 0.3));
    d.heart = g('HeartEyes'); d.star = g('StarEyes'); d.tears = g('Crying'); d.sweat = g('Sweat'); d.dizzy = g('Dizzy'); d.vein = clamp01(angry - 0.35);
    d.gx = Math.max(-1, Math.min(1, (gaze?.yaw || 0) / 25 + (g('eyeLookOutLeft') - g('eyeLookInLeft')) * 0.0)) ; d.gy = Math.max(-1, Math.min(1, (gaze?.pitch || 0) / 20));
    if (!gaze) { d.gx = Math.max(-1, Math.min(1, g('lookLeft') - g('lookRight'))); d.gy = Math.max(-1, Math.min(1, g('lookUp') - g('lookDown'))); }
    return d;
  }
  update(values, gaze) {
    const d = this.derive(values, gaze);
    const key = Object.values(d).map((x) => Math.round(x * 40)).join(',');
    if (key === this.lastKey) return false;
    this.lastKey = key; this.draw(d); this.texture.needsUpdate = true;
    return true;
  }

  // ---------------------------------------------------------------- drawing
  draw(d) {
    this.begin();
    const { ctx, L } = this, f = this.recipe.face || {};
    this.markings(f.markings, f, true);
    if (d.blush > 0.01) this.blush(d.blush);
    for (const s of [1, -1]) this.eye(s, d, f);
    this.brows(d, f);
    this.nose(f);
    this.mouth(d, f);
    this.markings(f.markings, f, false);
    this.effects(d);
    void ctx; void L;
  }
  markings(m, f, under) {
    const { ctx, L } = this, c = this.recipe.colors;
    if (!m || m === 'none') return;
    ctx.save();
    if (under && m === 'mask') {
      ctx.fillStyle = c.fur3 || '#2b2c33';
      ctx.beginPath();
      const w = L.eyeX + L.eyeH * 1.25, y = L.eyeY, h = L.eyeH;
      ctx.moveTo(-w * 1.08, y + h * 0.15);
      ctx.bezierCurveTo(-w * 0.9, y + h * 1.0, -L.eyeX * 0.35, y + h * 0.95, 0, y + h * 0.35);
      ctx.bezierCurveTo(L.eyeX * 0.35, y + h * 0.95, w * 0.9, y + h * 1.0, w * 1.08, y + h * 0.15);
      ctx.bezierCurveTo(w * 0.95, y - h * 0.9, L.eyeX * 0.5, y - h * 1.0, 0, y - h * 0.55);
      ctx.bezierCurveTo(-L.eyeX * 0.5, y - h * 1.0, -w * 0.95, y - h * 0.9, -w * 1.08, y + h * 0.15);
      ctx.fill();
    }
    if (under && m === 'patches') {
      ctx.fillStyle = c.fur3 || '#24242a';
      for (const s of [1, -1]) { ctx.save(); ctx.translate(s * L.eyeX * 1.02, L.eyeY - L.eyeH * 0.12); ctx.rotate(s * 0.55); ctx.beginPath(); ctx.ellipse(0, 0, L.eyeH * 0.95, L.eyeH * 1.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    if (!under) {
      if (m === 'freckles') { ctx.fillStyle = 'rgba(150,80,50,0.55)'; for (const s of [1, -1]) for (const [x, y] of [[0.9, -1.2], [1.25, -1.05], [1.05, -1.5], [1.45, -1.4], [0.7, -1.55]]) { ctx.beginPath(); ctx.arc(s * L.eyeX * x * 0.95, L.eyeY + L.eyeH * y * 0.75, L.eyeH * 0.07, 0, Math.PI * 2); ctx.fill(); } }
      if (m === 'cheeks') { ctx.strokeStyle = c.fur3 || '#5a3a26'; ctx.lineWidth = L.eyeH * 0.09; ctx.lineCap = 'round'; for (const s of [1, -1]) for (let i = 0; i < 2; i++) { const y = L.eyeY - L.eyeH * (1.25 + i * 0.32); ctx.beginPath(); ctx.moveTo(s * L.eyeX * 1.05, y); ctx.lineTo(s * L.eyeX * 1.5, y - L.eyeH * 0.08); ctx.stroke(); } }
      if (m === 'whiskers') { ctx.fillStyle = c.fur3 || '#555'; for (const s of [1, -1]) for (const [x, y] of [[0.42, 0.02], [0.55, -0.05], [0.47, -0.13]]) { ctx.beginPath(); ctx.arc(s * L.rx * x, L.noseY + L.ry * y - L.ry * 0.05, L.eyeH * 0.055, 0, Math.PI * 2); ctx.fill(); } }
      if (m === 'star') { ctx.fillStyle = '#ffcf3f'; this.starPath(L.eyeX * 1.1, L.eyeY - L.eyeH * 1.15, L.eyeH * 0.22, 5); ctx.fill(); }
      if (m === 'scar') { ctx.strokeStyle = 'rgba(160,60,70,0.8)'; ctx.lineWidth = L.eyeH * 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-L.eyeX + L.eyeH * 0.3, L.eyeY + L.eyeH * 1.3); ctx.lineTo(-L.eyeX - L.eyeH * 0.15, L.eyeY - L.eyeH * 1.1); ctx.stroke();
        ctx.lineWidth = L.eyeH * 0.05; for (const t of [0.25, 0.55, 0.8]) { const x = lerp(-L.eyeX + L.eyeH * 0.3, -L.eyeX - L.eyeH * 0.15, t), y = lerp(L.eyeY + L.eyeH * 1.3, L.eyeY - L.eyeH * 1.1, t); ctx.beginPath(); ctx.moveTo(x - L.eyeH * 0.15, y - 0.004); ctx.lineTo(x + L.eyeH * 0.15, y + 0.004); ctx.stroke(); } }
    }
    ctx.restore();
  }
  blush(a) {
    const { ctx, L } = this;
    ctx.save(); ctx.globalAlpha = 0.55 * a;
    for (const s of [1, -1]) {
      const x = s * L.eyeX * 1.1, y = L.eyeY - L.eyeH * 1.05;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, L.eyeH * 0.75); gr.addColorStop(0, '#ff7f9b'); gr.addColorStop(1, 'rgba(255,127,155,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, L.eyeH * 0.8, L.eyeH * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7 * a; ctx.strokeStyle = '#ff6d8c'; ctx.lineWidth = L.eyeH * 0.045; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * L.eyeH * 0.22 - L.eyeH * 0.06, y - L.eyeH * 0.12); ctx.lineTo(x + i * L.eyeH * 0.22 + L.eyeH * 0.06, y + L.eyeH * 0.12); ctx.stroke(); }
      ctx.globalAlpha = 0.55 * a;
    }
    ctx.restore();
  }
  starPath(x, y, r, n = 5, inner = 0.45) {
    const { ctx } = this; ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  heartPath(x, y, r) {
    const { ctx } = this; ctx.beginPath();
    ctx.moveTo(x, y - r * 0.9);
    ctx.bezierCurveTo(x + r * 1.3, y - r * 0.05, x + r * 0.8, y + r * 1.0, x, y + r * 0.4);
    ctx.bezierCurveTo(x - r * 0.8, y + r * 1.0, x - r * 1.3, y - r * 0.05, x, y - r * 0.9);
    ctx.closePath();
  }

  eye(s, d, f) {
    const { ctx, L } = this, style = f.eyes || 'round';
    const blink = s > 0 ? d.blinkL : d.blinkR, lid = s > 0 ? d.lidL : d.lidR;
    const S = {
      round: { w: 1.0, h: 1.0, top: 1.0, bot: 0.95, iris: 0.5, irisH: 1.0, liner: 0.16 },
      anime: { w: 0.95, h: 1.3, top: 0.75, bot: 1.05, iris: 0.55, irisH: 1.25, liner: 0.2 },
      sharp: { w: 1.25, h: 0.72, top: 0.9, bot: 0.55, iris: 0.42, irisH: 1.05, liner: 0.2, tilt: 0.28 },
      sleepy: { w: 1.05, h: 0.85, top: 0.55, bot: 0.95, iris: 0.5, irisH: 1.0, liner: 0.18, lid: 0.35 },
      cat: { w: 1.15, h: 0.95, top: 0.95, bot: 0.8, iris: 0.62, irisH: 1.0, liner: 0.17, tilt: 0.18, slit: true },
      sparkle: { w: 1.0, h: 1.15, top: 0.9, bot: 1.0, iris: 0.56, irisH: 1.15, liner: 0.16, sparkle: true },
      dot: { dot: true, w: 0.42, h: 0.62 },
      gentle: { w: 1.05, h: 0.9, top: 0.8, bot: 1.1, iris: 0.52, irisH: 1.0, liner: 0.13 },
      fierce: { w: 1.25, h: 0.7, top: 0.7, bot: 0.6, iris: 0.45, irisH: 1.0, liner: 0.26, tilt: 0.35, lid: 0.1 },
    }[style] || {};
    const H = L.eyeH, W = H * S.w, cx = s * L.eyeX, cy = L.eyeY;
    const tilt = s * (L.tilt + (S.tilt || 0));
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const irisCol = f.eyeColor || '#c8211f';
    // closed / happy eyes
    const open = clamp01((1 - blink) * (1 - (S.lid || 0) - lid * 0.6) * (1 + d.wide * 0.25));
    if (d.dizzy > 0.5) {
      ctx.strokeStyle = LINER; ctx.lineWidth = H * 0.1; ctx.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.2) { const r = (a / (Math.PI * 6)) * H * 0.55; ctx.lineTo(Math.cos(a * s) * r, Math.sin(a * s) * r); }
      ctx.stroke(); ctx.restore(); return;
    }
    if (d.happyEyes > 0.5 && blink < 0.9 && d.heart < 0.5 && d.star < 0.5) {
      ctx.strokeStyle = LINER; ctx.lineWidth = H * 0.16;
      ctx.beginPath(); ctx.moveTo(-W * 0.48, -H * 0.12); ctx.quadraticCurveTo(0, H * 0.55, W * 0.48, -H * 0.12); ctx.stroke();
      ctx.restore(); return;
    }
    if (open < 0.12) {
      ctx.strokeStyle = LINER; ctx.lineWidth = H * 0.13;
      ctx.beginPath(); ctx.moveTo(-W * 0.5, H * 0.02); ctx.quadraticCurveTo(0, -H * 0.22, W * 0.5, H * 0.02); ctx.stroke();
      if (f.lashes && style !== 'dot') { ctx.beginPath(); ctx.moveTo(s * W * 0.45, 0); ctx.lineTo(s * W * 0.62, H * 0.1); ctx.stroke(); }
      ctx.restore(); return;
    }
    if (S.dot) {
      ctx.fillStyle = LINER; ctx.beginPath(); ctx.ellipse(d.gx * W * 0.25 * s * 0 + d.gx * W * 0.25, d.gy * H * 0.12, W * 0.5, H * 0.5 * open, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d.gx * W * 0.25 - W * 0.15, d.gy * H * 0.12 + H * 0.2 * open, W * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); return;
    }
    const top = H * 0.5 * S.top * open, bot = H * 0.5 * S.bot * Math.min(1, open * 1.4);
    const shape = () => {
      ctx.beginPath(); ctx.moveTo(-W * 0.5, 0);
      ctx.bezierCurveTo(-W * 0.42, top * 1.25, W * 0.42, top * 1.25, W * 0.5, s > 0 ? H * 0.04 : H * 0.04);
      ctx.bezierCurveTo(W * 0.4, -bot * 1.25, -W * 0.4, -bot * 1.25, -W * 0.5, 0);
      ctx.closePath();
    };
    shape(); ctx.fillStyle = '#fbfbfd'; ctx.fill();
    ctx.save(); shape(); ctx.clip();
    // iris
    const ir = H * S.iris * 0.5 * 2, gx = d.gx * W * 0.22 * (1), gy = d.gy * H * 0.16;
    const ix = gx, iy = gy - H * 0.02;
    if (d.heart > 0.5) { ctx.fillStyle = '#ff4f86'; this.heartPath(ix, iy, ir * 0.85); ctx.fill(); }
    else if (d.star > 0.5) { ctx.fillStyle = '#ffc53d'; this.starPath(ix, iy, ir * 1.0, 5, 0.5); ctx.fill(); }
    else {
      const gr = ctx.createLinearGradient(0, iy + ir * S.irisH, 0, iy - ir * S.irisH);
      gr.addColorStop(0, shade(irisCol, -0.45)); gr.addColorStop(0.55, irisCol); gr.addColorStop(1, shade(irisCol, 0.35));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(ix, iy, ir * 0.82, ir * S.irisH * 0.82 * 1.0, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(irisCol, -0.6); ctx.lineWidth = H * 0.035; ctx.stroke();
      ctx.fillStyle = '#16121a';
      ctx.beginPath();
      if (S.slit) ctx.ellipse(ix, iy, ir * 0.14 * (1 + d.wide), ir * 0.68, 0, 0, Math.PI * 2);
      else ctx.ellipse(ix, iy, ir * 0.36 * (1 - d.wide * 0.3), ir * S.irisH * 0.38 * (1 - d.wide * 0.3), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ix - ir * 0.32, iy + ir * 0.38, ir * 0.22, ir * 0.27, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ix + ir * 0.3, iy - ir * 0.36, ir * 0.1, 0, Math.PI * 2); ctx.fill();
      if (S.sparkle) { this.starPath(ix + ir * 0.35, iy + ir * 0.3, ir * 0.18, 4, 0.35); ctx.fill(); this.starPath(ix - ir * 0.25, iy - ir * 0.4, ir * 0.1, 4, 0.35); ctx.fill(); }
    }
    // upper-lid shadow
    ctx.fillStyle = 'rgba(40,30,60,0.18)'; ctx.fillRect(-W, top * 0.55, W * 2, top);
    ctx.restore();
    // liner and lashes
    ctx.strokeStyle = LINER; ctx.lineWidth = H * S.liner;
    ctx.beginPath(); ctx.moveTo(-W * 0.52, -H * 0.01); ctx.bezierCurveTo(-W * 0.42, top * 1.27, W * 0.42, top * 1.27, W * 0.53, H * 0.05); ctx.stroke();
    if (f.lashes) {
      ctx.lineWidth = H * 0.09;
      const ox = s * W * 0.5;
      for (const [dx, dy] of [[0.16, 0.18], [0.1, 0.3]]) { ctx.beginPath(); ctx.moveTo(ox, H * 0.06 + top * 0.25); ctx.lineTo(ox + s * W * dx, top * 0.4 + H * dy); ctx.stroke(); }
    }
    ctx.lineWidth = H * 0.05; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(-W * 0.3, -bot * 0.98); ctx.quadraticCurveTo(0, -bot * 1.02, W * 0.38, -bot * 0.9); ctx.stroke();
    ctx.restore();
  }

  brows(d, f) {
    const { ctx, L } = this, style = f.brows || 'soft';
    if (style === 'none') return;
    ctx.save(); ctx.fillStyle = f.browColor || '#2b2c33'; ctx.strokeStyle = f.browColor || '#2b2c33'; ctx.lineCap = 'round';
    for (const s of [1, -1]) {
      const up = s > 0 ? d.browUpL : d.browUpR, down = s > 0 ? d.browDownL : d.browDownR;
      const H = L.eyeH;
      const y = L.eyeY + H * (0.98 + 0.35 * up - 0.28 * down) + H * 0.1 * d.wide;
      const x = s * L.eyeX;
      const rot = s * (0.12 * down * 2.2 - d.browInner * 0.5 + (style === 'angled' ? 0.28 : 0)) * -1 + s * L.tilt * 0.5;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const w = H * 1.05;
      if (style === 'dots') { ctx.beginPath(); ctx.ellipse(-s * w * 0.2, 0, H * 0.18, H * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); continue; }
      const th = { soft: 0.12, thick: 0.22, angled: 0.17, thin: 0.07, bushy: 0.26 }[style] || 0.12;
      ctx.beginPath();
      ctx.moveTo(-s * w * 0.5, -H * th * 0.3);
      ctx.quadraticCurveTo(0, H * (0.16 + th * 0.5), s * w * 0.5, H * 0.02);
      ctx.quadraticCurveTo(0, H * (0.16 - th * 0.6), -s * w * 0.5, -H * th * 0.3 - H * th);
      ctx.closePath(); ctx.fill();
      if (style === 'bushy') for (let i = 0; i < 5; i++) { const t = i / 4 - 0.5; ctx.beginPath(); ctx.arc(s * t * w * 0.9, H * (0.1 - Math.abs(t) * 0.1), H * 0.1, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }

  nose(f) {
    const { ctx, L } = this;
    let type = f.nose || 'auto';
    if (type === 'auto') type = this.sp.nose;
    ctx.save(); ctx.strokeStyle = shade(this.recipe.colors.nose || '#a0605a', -0.15); ctx.fillStyle = ctx.strokeStyle; ctx.lineCap = 'round';
    if (type === 'dot') { ctx.beginPath(); ctx.ellipse(0, L.noseY, L.eyeH * 0.08, L.eyeH * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
    if (type === 'line') { ctx.lineWidth = L.eyeH * 0.06; ctx.beginPath(); ctx.moveTo(L.eyeH * 0.05, L.noseY + L.eyeH * 0.25); ctx.lineTo(L.eyeH * 0.12, L.noseY); ctx.lineTo(-L.eyeH * 0.02, L.noseY - L.eyeH * 0.03); ctx.stroke(); }
    if (type === 'animal') {      // philtrum line from the 3D nose to the mouth
      ctx.strokeStyle = LINER; ctx.lineWidth = L.eyeH * 0.075; ctx.beginPath(); ctx.moveTo(0, L.noseY - L.ry * 0.05); ctx.lineTo(0, L.mouthY + L.ry * 0.015); ctx.stroke();
    }
    ctx.restore();
  }

  mouth(d, f) {
    const { ctx, L } = this, style = f.mouth || 'simple';
    const W = L.mouthW * ({ small: 0.65, grin: 1.3, cat: 0.95, teeth: 1.0 }[style] || 1) * (1 + d.wideMouth * 0.35 - d.round * 0.45);
    const cx = d.shift * L.mouthW * 0.35, cy = L.mouthY;
    const smL = d.smileL - d.frown, smR = d.smileR - d.frown;
    const yl = cy + L.eyeH * 0.42 * smL, yr = cy + L.eyeH * 0.42 * smR;
    ctx.save(); ctx.translate(cx, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = LINER; ctx.lineWidth = L.eyeH * 0.085;
    const open = d.jaw;
    if (open < 0.07) {
      ctx.beginPath();
      if (style === 'cat') {
        ctx.moveTo(-W * 0.55, yl + L.eyeH * 0.08);
        ctx.quadraticCurveTo(-W * 0.28, cy - L.eyeH * 0.32, 0, cy + L.eyeH * 0.02);
        ctx.quadraticCurveTo(W * 0.28, cy - L.eyeH * 0.32, W * 0.55, yr + L.eyeH * 0.08);
      } else if (style === 'smirk') {
        ctx.moveTo(-W * 0.45, cy - L.eyeH * 0.02); ctx.quadraticCurveTo(W * 0.1, cy - L.eyeH * 0.12, W * 0.5, yr + L.eyeH * 0.22);
      } else {
        const sag = L.eyeH * (0.2 * (smL + smR) / 2 + 0.06) * (style === 'grin' ? 1.6 : 1);
        ctx.moveTo(-W * 0.5, yl); ctx.quadraticCurveTo(0, cy - sag, W * 0.5, yr);
      }
      ctx.stroke();
      if (style === 'fang') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(W * 0.18, cy - L.eyeH * 0.05); ctx.lineTo(W * 0.3, cy - L.eyeH * 0.04); ctx.lineTo(W * 0.24, cy - L.eyeH * 0.24); ctx.closePath(); ctx.fill(); ctx.lineWidth = L.eyeH * 0.03; ctx.stroke(); }
      if (style === 'teeth') { ctx.fillStyle = '#fff'; ctx.lineWidth = L.eyeH * 0.03; for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(s > 0 ? 0 : -W * 0.16, cy - L.eyeH * 0.3, W * 0.16, L.eyeH * 0.25); ctx.fill(); ctx.stroke(); } }
      ctx.restore(); return;
    }
    // open mouth
    const depth = L.eyeH * (0.25 + 1.25 * open) * (1 + d.round * 0.3);
    const ww = W * (1 + open * 0.55) * (1 - d.round * 0.4);
    ctx.beginPath();
    if (style === 'cat' && d.round < 0.5) {
      ctx.moveTo(-ww * 0.55, yl + L.eyeH * 0.06);
      ctx.quadraticCurveTo(-ww * 0.28, cy - L.eyeH * 0.12, 0, cy + L.eyeH * 0.04);
      ctx.quadraticCurveTo(ww * 0.28, cy - L.eyeH * 0.12, ww * 0.55, yr + L.eyeH * 0.06);
    } else {
      ctx.moveTo(-ww * 0.5, yl); ctx.quadraticCurveTo(0, cy + L.eyeH * 0.06 * (1 - d.round), ww * 0.5, yr);
    }
    const lowY = cy - depth;
    ctx.bezierCurveTo(ww * (0.5 - 0.15 * d.round), lowY + depth * 0.15, ww * 0.3, lowY, 0, lowY);
    ctx.bezierCurveTo(-ww * 0.3, lowY, -ww * (0.5 - 0.15 * d.round), lowY + depth * 0.15, -ww * 0.5, yl);
    ctx.closePath();
    ctx.fillStyle = MOUTH_IN; ctx.fill();
    ctx.save(); ctx.clip();
    if (style === 'teeth' || style === 'grin' || style === 'fang') { ctx.fillStyle = '#ffffff'; ctx.fillRect(-ww, cy - L.eyeH * 0.16, ww * 2, L.eyeH * 0.4); }
    ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.ellipse(0, lowY + depth * 0.18, ww * 0.32, depth * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.stroke();
    if (style === 'fang') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ww * 0.2, cy + L.eyeH * 0.02); ctx.lineTo(ww * 0.34, cy + L.eyeH * 0.02); ctx.lineTo(ww * 0.27, cy - L.eyeH * 0.2); ctx.closePath(); ctx.fill(); ctx.lineWidth = L.eyeH * 0.03; ctx.stroke(); }
    if (d.tongue > 0.2) { ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.ellipse(0, lowY - depth * 0.1 * d.tongue, ww * 0.26, L.eyeH * 0.35 * d.tongue, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = L.eyeH * 0.05; ctx.stroke(); }
    ctx.restore();
  }

  effects(d) {
    const { ctx, L } = this;
    ctx.save(); ctx.lineCap = 'round';
    if (d.tears > 0.05) {
      ctx.globalAlpha = Math.min(1, d.tears * 1.4); ctx.fillStyle = 'rgba(120,200,255,0.9)';
      for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(s * (L.eyeX - L.eyeH * 0.35), L.eyeY - L.eyeH * 0.2); ctx.lineTo(s * (L.eyeX + L.eyeH * 0.15), L.eyeY - L.eyeH * 0.2); ctx.lineTo(s * (L.eyeX + L.eyeH * 0.05), L.eyeY - L.eyeH * 2.4); ctx.lineTo(s * (L.eyeX - L.eyeH * 0.3), L.eyeY - L.eyeH * 2.2); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (d.sweat > 0.05) {
      ctx.globalAlpha = Math.min(1, d.sweat * 1.4); ctx.fillStyle = '#9fdcff'; ctx.strokeStyle = '#4a9fd6'; ctx.lineWidth = L.eyeH * 0.04;
      const x = L.rx * 0.74, y = L.eyeY + L.eyeH * 0.75;
      ctx.beginPath(); ctx.moveTo(x, y + L.eyeH * 0.55); ctx.quadraticCurveTo(x + L.eyeH * 0.32, y - L.eyeH * 0.05, x, y - L.eyeH * 0.18); ctx.quadraticCurveTo(x - L.eyeH * 0.32, y - L.eyeH * 0.05, x, y + L.eyeH * 0.55); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (d.vein > 0.05) {
      ctx.globalAlpha = Math.min(1, d.vein * 2); ctx.strokeStyle = '#e0333f'; ctx.lineWidth = L.eyeH * 0.09;
      const x = -L.rx * 0.7, y = L.eyeY + L.eyeH * 1.05, r = L.eyeH * 0.32;
      for (const [a, b] of [[[-1, 0.3], [-0.25, 0.25]], [[0.25, 0.25], [1, 0.3]], [[-1, -0.3], [-0.25, -0.25]], [[0.25, -0.25], [1, -0.3]]]) { ctx.beginPath(); ctx.moveTo(x + a[0] * r, y + a[1] * r); ctx.quadraticCurveTo(x, y + (a[1] > 0 ? r * 0.05 : -r * 0.05), x + b[0] * r, y + b[1] * r); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

function shade(hex, amt) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt * (amt > 0 ? 1 - hsl.l : hsl.l))));
  return '#' + c.getHexString();
}
