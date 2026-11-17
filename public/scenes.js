// More built-in scenes for the stream (see BUILTIN_SCENES in public/props.js): a gaming room, a café, a neon street,
// a cherry blossom park and a starry stage. Like the others they are made from simple shapes and painted textures,
// so they need no files. A scene may set group.userData.tick(t) to move a little (LEDs, petals, spotlights);
// `light` is the lighting preset (public/light-presets.js) that suits it.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
const glow = (color, k = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const box = (w, h, d, mat, x, y, z) => M(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const flat = (w, d, mat, x = 0, y = 0, z = 0) => { const m = M(new THREE.PlaneGeometry(w, d), mat, x, y, z); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.castShadow = false; return m; };
const rng = (s) => () => (s = (s * 9301 + 49297) % 233280) / 233280;
function tex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; }
/** A picture that shows its own colours (sky, screens, signs): not shaded, not tone mapped. */
const picture = (map, o = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...o });
const plane = (w, h, mat, x, y, z) => { const m = M(new THREE.PlaneGeometry(w, h), mat, x, y, z); m.castShadow = false; return m; };
/** A glowing neon word or shape on a see-through board. */
function neon(w, h, color, draw) {
  const t = tex(Math.round(w * 400), Math.round(h * 400), (g, cw, ch) => { g.lineCap = g.lineJoin = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [blur, col, lw] of [[40, color, 1], [18, color, 1], [0, '#ffffff', 0.45]]) { g.shadowColor = color; g.shadowBlur = blur; g.strokeStyle = g.fillStyle = col; draw(g, cw, ch, lw); } });
  const m = plane(w, h, picture(t, { transparent: true, depthWrite: false }), 0, 0, 0); m.renderOrder = 2; return m;
}
const word = (text, size) => (g, w, h, lw) => { g.font = `bold ${size}px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`; g.lineWidth = 10 * lw; g.strokeText(text, w / 2, h / 2 + size * 0.04); };
const heartPath = (g, cx, cy, r) => { g.beginPath(); g.moveTo(cx, cy + r * 0.9); g.bezierCurveTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.45); g.bezierCurveTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r * 0.9); g.closePath(); };
const starPath = (g, cx, cy, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
function skyTex(stops, extra) { return tex(1024, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([p, c]) => gr.addColorStop(p, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); extra?.(g, w, h); }); }

// ---------------------------------------------------------------- gaming room
function gaming() {
  const g = new THREE.Group(), r = rng(11);
  const wallT = tex(256, 256, (c, w, h) => { c.fillStyle = '#1d1630'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(160,120,255,.07)'; c.lineWidth = 2; const s = 32;
    for (let y = 0; y < h + s; y += s * 0.87) for (let x = (Math.round(y / (s * 0.87)) % 2) * s / 2; x < w + s; x += s) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5); } c.closePath(); c.stroke(); } }, [6, 3]);
  g.add(plane(10, 5, std('#ffffff', { map: wallT, roughness: 0.95 }), 0, 2.5, -2), flat(10, 5, std('#191524', { roughness: 0.5, metalness: 0.15 }), 0, 0, 0.5));
  const rug = M(new THREE.CircleGeometry(1.3, 64), std('#ffffff', { map: tex(512, 512, (c, w) => { [['#2a1e48', 1], ['#ff5fa2', 0.93], ['#2a1e48', 0.9], ['#3fd0ff', 0.6], ['#2a1e48', 0.57]].forEach(([col, k]) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, w / 2, w / 2 * k, 0, 7); c.fill(); }); }), roughness: 0.95 }), 0, 0.004, 0.1);
  rug.rotation.x = -Math.PI / 2; rug.castShadow = false; rug.receiveShadow = true; g.add(rug);
  // RGB light strips along the ceiling and the floor of the back wall: the colours run along them
  const leds = [];
  for (const y of [2.55, 0.03]) for (let i = 0; i < 40; i++) { const m = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff00ff', emissiveIntensity: 2.4 }), s = box(0.25, 0.03, 0.03, m, -4.9 + i * 0.25, y, -1.97); s.castShadow = false; leds.push([m, i / 40]); g.add(s); }
  // desk on the right with two screens, keyboard and mouse
  const dark = std('#24202e', { roughness: 0.4, metalness: 0.3 }), pink = std('#ff6fae', { roughness: 0.45 });
  g.add(box(1.9, 0.05, 0.7, dark, 2.15, 0.75, -1.55), ...[[1.3, -1.82], [3.0, -1.82], [1.3, -1.28], [3.0, -1.28]].map(([x, z]) => box(0.05, 0.75, 0.05, dark, x, 0.375, z)));
  const game = tex(512, 288, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a7dff'); gr.addColorStop(0.6, '#ffb1d6'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6a4fc0'; c.beginPath(); c.moveTo(0, h * 0.75); for (let x = 0; x <= w; x += 32) c.lineTo(x, h * (0.55 + 0.15 * Math.sin(x / 50) + 0.05 * Math.sin(x / 13))); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#3b2a6e'; c.fillRect(0, h * 0.86, w, h * 0.14); c.fillStyle = '#ffe066'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(80 + i * 70, h * 0.62 - (i % 2) * 30, 9, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(14, 12, 170, 20); c.fillStyle = '#7fff9e'; c.fillRect(17, 15, 120, 14); c.fillStyle = '#fff'; c.font = 'bold 26px Arial'; c.textAlign = 'right'; c.fillText('12 450', w - 16, 34); });
  const chat = tex(256, 288, (c, w, h) => { c.fillStyle = '#16141f'; c.fillRect(0, 0, w, h); const cols = ['#ff7ab8', '#7fd8ff', '#ffd166', '#9dff9d', '#c59bff']; const q = rng(5);
    for (let i = 0; i < 11; i++) { c.fillStyle = cols[i % 5]; c.fillRect(12, 14 + i * 25, 30 + q() * 30, 10); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(50 + q() * 20, 14 + i * 25, 60 + q() * 120, 10); } });
  for (const [x, w, t, rot] of [[1.65, 0.95, game, 0.1], [2.5, 0.62, chat, -0.2]]) { const s = new THREE.Group(); s.add(box(w + 0.04, w * 0.6 + 0.04, 0.03, dark, 0, 0, 0), plane(w, w * 0.6, picture(t), 0, 0, 0.017), box(0.05, 0.25, 0.05, dark, 0, -w * 0.3 - 0.12, -0.02)); s.position.set(x, 0.78 + w * 0.3 + 0.24, -1.68); s.rotation.y = rot; g.add(s); }
  g.add(box(0.5, 0.025, 0.16, dark, 2.0, 0.79, -1.35), box(0.48, 0.006, 0.02, glow('#3fd0ff', 2), 2.0, 0.805, -1.28), box(0.07, 0.02, 0.1, pink, 2.45, 0.785, -1.33));
  // gaming chair, turned towards the desk
  const chair = new THREE.Group(), seatM = std('#2a2533', { roughness: 0.7 });
  chair.add(box(0.55, 0.1, 0.52, seatM, 0, 0.5, 0), box(0.55, 0.8, 0.1, seatM, 0, 0.95, 0.25), box(0.3, 0.6, 0.11, pink, 0, 0.95, 0.25), box(0.36, 0.14, 0.12, seatM, 0, 1.42, 0.25), M(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), dark, 0, 0.25, 0), box(0.6, 0.04, 0.06, dark, 0, 0.03, 0), box(0.06, 0.04, 0.6, dark, 0, 0.03, 0));
  chair.position.set(2.95, 0, -0.95); chair.rotation.y = -Math.PI * 0.62; g.add(chair);
  // shelf with little figures, and a neon sign on the left
  const shelf = std('#2f2840'); g.add(box(1.2, 0.04, 0.25, shelf, -2.2, 1.0, -1.86), box(1.2, 0.04, 0.25, shelf, -2.2, 1.45, -1.86));
  ['#ff6fae', '#7fd8ff', '#ffd166', '#b28dff', '#8de0a8'].forEach((c, i) => { const x = -2.65 + i * 0.22, y = 1.02 + (i % 2) * 0.45; g.add(M(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 14), std(c), x, y + 0.06, -1.86), M(new THREE.SphereGeometry(0.045, 14, 10), std(c), x, y + 0.16, -1.86)); });
  const sign = neon(1.4, 0.7, '#ff4fb0', (c, w, h, lw) => { c.font = `bold 150px "Arial Rounded MT Bold", Arial, sans-serif`; c.lineWidth = 9 * lw; c.strokeText('GG', w * 0.4, h * 0.52); c.lineWidth = 8 * lw; heartPath(c, w * 0.8, h * 0.5, 60); c.stroke(); });
  sign.position.set(-2.1, 2.05, -1.95); g.add(sign);
  // hexagon sound panels above the desk
  for (const [x, y, c] of [[1.5, 2.05, '#3a2c66'], [1.85, 2.25, '#ff6fae'], [2.2, 2.05, '#3a2c66'], [2.55, 2.25, '#3fd0ff'], [1.85, 1.85, '#4a3a80'], [2.55, 1.85, '#3a2c66']]) { const h = M(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6), std(c, { roughness: 0.95 }), x, y, -1.96); h.rotation.x = Math.PI / 2; g.add(h); }
  const col = new THREE.Color();
  g.userData.tick = (t) => { for (const [m, u] of leds) m.emissive.copy(col.setHSL((u - t * 0.08) % 1 + 1, 0.95, 0.55)); };
  return g;
}

// ---------------------------------------------------------------- café
function cafe() {
  const g = new THREE.Group(), r = rng(3);
  const wallT = tex(256, 256, (c, w, h) => { c.fillStyle = '#f4e4cf'; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(150,110,70,${r() * 0.05})`; c.fillRect(r() * w, r() * h, 6, 6); } }, [4, 2]);
  const plank = tex(256, 256, (c, w, h) => { for (let x = 0; x < w; x += 32) { c.fillStyle = ['#8a5a3b', '#93623f', '#7f5235'][x / 32 % 3]; c.fillRect(x, 0, 32, h); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, 0, 2, h); } }, [8, 1]);
  const floorT = tex(256, 256, (c, w, h) => { for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { c.fillStyle = (x + y) / 32 % 2 ? '#e9dcc8' : '#5b4436'; c.fillRect(x, y, 32, 32); } }, [10, 5]);
  g.add(plane(10, 5, std('#ffffff', { map: wallT, roughness: 0.95 }), 0, 2.5, -2), box(10, 1.0, 0.04, std('#ffffff', { map: plank, roughness: 0.8 }), 0, 0.5, -1.98), box(10, 0.05, 0.08, std('#6b4329'), 0, 1.02, -1.96), flat(10, 5, std('#ffffff', { map: floorT, roughness: 0.55 }), 0, 0, 0.5));
  // window to a sunny street
  const street = tex(512, 420, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fd2ff'); gr.addColorStop(1, '#fff1d8'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2c7a6'; c.fillRect(0, h * 0.35, w * 0.55, h); c.fillStyle = '#d9a3a8'; c.fillRect(w * 0.6, h * 0.25, w * 0.4, h); c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.fillRect(30 + i * 85, h * 0.42 + j * 70, 50, 45);
    c.fillStyle = '#4f9a62'; for (const [x, y, rr] of [[120, 300, 70], [200, 330, 60], [420, 310, 80]]) { c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); } c.fillStyle = '#c9c2b8'; c.fillRect(0, h * 0.88, w, h); });
  const frame = std('#6b4329');
  g.add(plane(1.5, 1.1, picture(street), -2.0, 1.68, -1.97), ...[[1.6, 0.07, -2.0, 1.12], [1.6, 0.07, -2.0, 2.24], [0.07, 1.18, -2.78, 1.68], [0.07, 1.18, -1.22, 1.68], [0.04, 1.1, -2.0, 1.68]].map(([w, h, x, y]) => box(w, h, 0.06, frame, x, y, -1.95)));
  const awning = tex(256, 64, (c, w, h) => { for (let x = 0; x < w; x += 32) { c.fillStyle = x / 32 % 2 ? '#ffffff' : '#e86a7a'; c.fillRect(x, 0, 32, h); } });
  const aw = box(1.7, 0.05, 0.35, std('#ffffff', { map: awning }), -2.0, 2.38, -1.8); aw.rotation.x = 0.35; g.add(aw);
  // chalkboard menu
  const menu = tex(640, 420, (c, w, h) => { c.fillStyle = '#25332c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a7774f'; c.lineWidth = 26; c.strokeRect(0, 0, w, h);
    c.fillStyle = '#fdfaf2'; c.textAlign = 'center'; c.font = 'bold 54px "Chalkboard SE", "Comic Sans MS", "Trebuchet MS", sans-serif'; c.fillText("Today's menu", w / 2, 82);
    c.font = '38px "Chalkboard SE", "Comic Sans MS", "Trebuchet MS", sans-serif'; c.textAlign = 'left';
    [['Latte', '4'], ['Matcha', '5'], ['Hot cocoa', '4'], ['Strawberry cake', '6']].forEach(([a, b], i) => { c.fillStyle = ['#ffd7e6', '#c9f2c9', '#fdfaf2', '#ffd7e6'][i]; c.fillText(a, 60, 160 + i * 62); c.textAlign = 'right'; c.fillText(b, w - 60, 160 + i * 62); c.textAlign = 'left'; });
    c.strokeStyle = '#fdfaf2'; c.lineWidth = 4; heartPath(c, w - 90, 70, 22); c.stroke(); });
  g.add(plane(1.25, 0.82, std('#ffffff', { map: menu, roughness: 0.9 }), 2.0, 1.95, -1.96));
  // counter with a coffee machine and cups
  const wood = std('#ffffff', { map: plank, roughness: 0.75 }), top = std('#f3efe9', { roughness: 0.3 }), steel = std('#c9ccd3', { metalness: 0.8, roughness: 0.3 });
  g.add(box(2.0, 0.95, 0.6, wood, 2.2, 0.475, -1.5), box(2.1, 0.05, 0.7, top, 2.2, 0.975, -1.5), box(0.45, 0.42, 0.35, steel, 2.55, 1.21, -1.6), box(0.38, 0.12, 0.05, std('#2b2b30'), 2.55, 1.32, -1.42),
    ...[0, 1].map((i) => M(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 10), std('#2b2b30'), 2.47 + i * 0.16, 1.1, -1.42)));
  ['#ffffff', '#ffd7e6', '#c9f2c9'].forEach((c, i) => g.add(M(new THREE.CylinderGeometry(0.045, 0.038, 0.1, 18), std(c), 1.55 + i * 0.16, 1.05, -1.4)));
  const cake = new THREE.Group(); cake.add(M(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 24), std('#fff4ea'), 0, 0.05, 0), M(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 24), std('#ff9ab8'), 0, 0.1, 0), M(new THREE.SphereGeometry(0.025, 12, 8), std('#e8304f'), 0, 0.13, 0)); cake.position.set(1.95, 1.0, -1.55); g.add(cake);
  // hanging lamps
  const shade = std('#2f3a35', { roughness: 0.5, side: THREE.DoubleSide });
  for (const x of [-0.95, 0.95]) { const l = new THREE.Group(); l.add(M(new THREE.CylinderGeometry(0.005, 0.005, 0.8, 6), std('#222'), 0, 0.4, 0), M(new THREE.ConeGeometry(0.2, 0.18, 24, 1, true), shade, 0, 0, 0), M(new THREE.SphereGeometry(0.06, 16, 10), glow('#ffd59a', 3), 0, -0.07, 0)); l.position.set(x, 2.5, -1.7); g.add(l); }
  // a little table with drinks, and a plant
  g.add(M(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 32), top, -1.7, 0.72, -1.0), M(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 10), std('#2b2b30'), -1.7, 0.36, -1.0), M(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 24), std('#2b2b30'), -1.7, 0.01, -1.0),
    M(new THREE.CylinderGeometry(0.045, 0.038, 0.1, 18), std('#ffffff'), -1.8, 0.785, -0.95), M(new THREE.CylinderGeometry(0.04, 0.035, 0.16, 18), std('#c9f2c9', { roughness: 0.2 }), -1.58, 0.815, -1.05));
  g.add(M(new THREE.CylinderGeometry(0.18, 0.14, 0.34, 24), std('#d98b5f'), -3.0, 0.17, -1.5)); for (let i = 0; i < 8; i++) g.add(M(new THREE.SphereGeometry(0.19, 14, 10), std('#4f9a62', { roughness: 0.85 }), -3.0 + Math.sin(i * 2.4) * 0.15, 0.5 + i * 0.08, -1.5 + Math.cos(i * 2.4) * 0.1));
  return g;
}

// ---------------------------------------------------------------- neon street at night
function city() {
  const g = new THREE.Group();
  const far = skyTex([[0, '#070920'], [0.55, '#261650'], [1, '#ff5f9e']], (c, w, h) => { const q = rng(21); for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + q() * 0.6})`; c.fillRect(q() * w, q() * h * 0.45, 2, 2); }
    for (let x = 0; x < w;) { const bw = 30 + q() * 60, bh = 100 + q() * 230; c.fillStyle = '#1a1035'; c.fillRect(x, h - bh, bw, bh); for (let y = h - bh + 8; y < h - 6; y += 12) for (let xx = x + 5; xx < x + bw - 6; xx += 10) if (q() < 0.35) { c.fillStyle = q() < 0.5 ? '#ffd166' : '#ff9fd0'; c.fillRect(xx, y, 4, 5); } x += bw + 3; } });
  g.add(plane(14, 7, picture(far), 0, 3.0, -7));
  // two buildings frame the street; the sky and skyline show between them, behind the character
  const facade = (seed, base) => tex(512, 1024, (c, w, h) => { const q = rng(seed); c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let y = 30; y < h * 0.76; y += 44) for (let x = 24; x < w - 40; x += 52) { c.fillStyle = q() < 0.5 ? (q() < 0.5 ? '#ffd88a' : '#9fe6ff') : '#191428'; c.fillRect(x, y, 30, 26); }
    c.fillStyle = '#100c1c'; c.fillRect(0, h * 0.8, w, h * 0.2); const sg = c.createLinearGradient(0, h * 0.83, 0, h); sg.addColorStop(0, '#ffcf8a'); sg.addColorStop(1, '#ff8a6a'); c.fillStyle = sg; c.fillRect(40, h * 0.83, w - 80, h * 0.14);
    for (let x = 40; x < w - 40; x += 36) { c.fillStyle = x / 36 % 2 ? '#e8456a' : '#fff1f4'; c.fillRect(x, h * 0.8, 36, h * 0.03); } c.fillStyle = 'rgba(60,30,40,.55)'; for (let x = 70; x < w - 70; x += 90) c.fillRect(x, h * 0.85, 8, h * 0.12); });
  for (const [x, w, h, z, seed, base] of [[-3.2, 2.6, 6, -2.6, 4, '#2b2045'], [3.3, 2.8, 6.5, -2.4, 9, '#251d3d']]) { const b = box(w, h, 2, std('#1a1428', { roughness: 0.9 }), x, h / 2, z - 1); b.material = [b.material, b.material, b.material, b.material, picture(facade(seed, base)), b.material]; g.add(b); }
  const ramen = neon(0.45, 1.3, '#ff4f7a', (c, w, h, lw) => { c.font = 'bold 96px Arial'; c.lineWidth = 7 * lw; 'RAMEN'.split('').forEach((ch, i) => c.strokeText(ch, w / 2, 85 + i * 98)); c.lineWidth = 7 * lw; c.strokeRect(14, 14, w - 28, h - 28); });
  ramen.position.set(-1.95, 1.85, -1.55); ramen.rotation.y = Math.PI / 2 * 0.5;
  const arcade = neon(1.3, 0.42, '#3fe0ff', word('ARCADE', 110)); arcade.position.set(1.85, 2.12, -1.38);
  const heart = neon(0.6, 0.55, '#ff6fd8', (c, w, h, lw) => { c.lineWidth = 9 * lw; heartPath(c, w / 2, h / 2, 85); c.stroke(); }); heart.position.set(2.55, 1.75, -1.38);
  const open = neon(0.9, 0.38, '#ffd166', word('24 / 7', 95)); open.position.set(-2.45, 1.5, -1.58);
  g.add(ramen, arcade, heart, open);
  // vending machine and a street lamp
  const vend = tex(256, 512, (c, w, h) => { c.fillStyle = '#e8f6ff'; c.fillRect(0, 0, w, h * 0.62); const cols = ['#ff6f8a', '#5fb8ff', '#ffd166', '#7fe0a8', '#c59bff'];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) { c.fillStyle = cols[(r + i) % 5]; c.fillRect(18 + i * 46, 20 + r * 75, 30, 55); c.fillStyle = '#ffffff'; c.fillRect(24 + i * 46, 30 + r * 75, 18, 8); }
    c.fillStyle = '#d23b5a'; c.fillRect(0, h * 0.62, w, h * 0.38); c.fillStyle = '#1c1c22'; c.fillRect(30, h * 0.8, w - 60, h * 0.12); });
  g.add(box(0.8, 1.8, 0.6, [std('#d23b5a'), std('#d23b5a'), std('#d23b5a'), std('#d23b5a'), picture(vend), std('#d23b5a')], 1.85, 0.9, -1.75));
  const pole = std('#2a2836', { metalness: 0.6, roughness: 0.4 });
  g.add(M(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 12), pole, -1.5, 1.6, -1.3), box(0.5, 0.05, 0.05, pole, -1.3, 3.2, -1.3), M(new THREE.SphereGeometry(0.1, 16, 10), glow('#fff0c8', 3), -1.08, 3.12, -1.3));
  // wet street: dark, shiny, with the signs' colours smeared in the puddles
  const road = tex(1024, 512, (c, w, h) => { c.fillStyle = '#16131f'; c.fillRect(0, 0, w, h); const q = rng(2);
    for (const [x, col] of [[200, '#ff4f7a'], [790, '#3fe0ff'], [700, '#ff6fd8'], [120, '#ffd166']]) { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.28; c.fillStyle = gr; c.fillRect(x - 40, 0, 80, h); }
    c.globalAlpha = 0.9; c.fillStyle = '#d9d6e6'; for (let i = 0; i < 6; i++) c.fillRect(220 + i * 100, h * 0.62, 55, h * 0.3); c.globalAlpha = 1;
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,255,255,${q() * 0.05})`; c.fillRect(q() * w, q() * h, 3, 3); } });
  g.add(flat(10, 6, std('#ffffff', { map: road, roughness: 0.15, metalness: 0.45 }), 0, 0, 0.0));
  g.userData.tick = (t) => { const f = Math.sin(t * 37) > 0.93 || (t % 6 > 5.6 && t % 6 < 5.75) ? 0.35 : 1; open.material.opacity = f; };
  return g;
}

// ---------------------------------------------------------------- cherry blossom park
function park() {
  const g = new THREE.Group();
  const sky = skyTex([[0, '#7fbfff'], [0.6, '#cfe6ff'], [1, '#ffe2ee']], (c, w, h) => { c.fillStyle = 'rgba(255,255,255,.9)'; for (const [x, y, rr] of [[150, 110, 34], [190, 100, 44], [235, 115, 30], [700, 80, 30], [740, 70, 40], [785, 85, 28]]) { c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); }
    c.fillStyle = '#a9d39a'; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 16) c.lineTo(x, h * (0.72 + 0.06 * Math.sin(x / 120) + 0.03 * Math.sin(x / 47))); c.lineTo(w, h); c.fill();
    c.fillStyle = '#8cc47f'; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 16) c.lineTo(x, h * (0.84 + 0.04 * Math.sin(x / 90 + 2))); c.lineTo(w, h); c.fill();
    c.fillStyle = '#ffc9dc'; const q = rng(8); for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(q() * w, h * (0.78 + q() * 0.1), 10 + q() * 16, 0, 7); c.fill(); } });
  g.add(plane(16, 8, picture(sky), 0, 3.2, -8));
  const grass = tex(256, 256, (c, w, h) => { c.fillStyle = '#93c977'; c.fillRect(0, 0, w, h); const q = rng(4); for (let i = 0; i < 900; i++) { c.fillStyle = q() < 0.5 ? '#86bd6a' : '#a3d684'; c.fillRect(q() * w, q() * h, 3, 5); } for (let i = 0; i < 40; i++) { c.fillStyle = '#ffd1e2'; c.fillRect(q() * w, q() * h, 4, 3); } }, [10, 6]);
  g.add(flat(18, 12, std('#ffffff', { map: grass, roughness: 0.95 }), 0, 0, -2));
  const path = flat(1.6, 10, std('#e9dcc6', { roughness: 0.9 }), 0, 0.003, -3.5); path.scale.set(1, 1, 1); g.add(path);
  const bark = std('#6b4a3a', { roughness: 0.9 }), blossom = ['#ffc4da', '#ffb0cc', '#ffd8e6', '#ff9fc2'].map((c) => std(c, { roughness: 0.85 }));
  const tree = (x, z, s, seed) => { const q = rng(seed), t = new THREE.Group();
    t.add(M(new THREE.CylinderGeometry(0.09, 0.14, 1.9, 10), bark, 0, 0.95, 0));
    for (const [a, l] of [[0.7, 0.8], [-0.6, 0.7], [0.1, 0.6]]) { const b = M(new THREE.CylinderGeometry(0.04, 0.07, l, 8), bark, Math.sin(a) * l / 2, 1.75 + Math.cos(a) * l / 2, 0); b.rotation.z = -a; t.add(b); }
    for (let i = 0; i < 26; i++) { const a = q() * Math.PI * 2, rr = q() * 0.95; t.add(M(new THREE.SphereGeometry(0.28 + q() * 0.2, 14, 10), blossom[i % 4], Math.cos(a) * rr, 2.15 + q() * 0.75, Math.sin(a) * rr * 0.7)); }
    t.position.set(x, 0, z); t.scale.setScalar(s); return t; };
  g.add(tree(-2.6, -2.3, 1.05, 3), tree(2.8, -2.8, 1.15, 7), tree(-1.2, -5.5, 0.9, 12), tree(1.6, -6.2, 0.85, 17), tree(-4.2, -4.5, 1, 22));
  // bench and lamp
  const wood = std('#b07a4a', { roughness: 0.8 }), iron = std('#2f3a35', { metalness: 0.5, roughness: 0.5 }), bench = new THREE.Group();
  for (let i = 0; i < 3; i++) bench.add(box(1.3, 0.04, 0.1, wood, 0, 0.45, -0.12 + i * 0.12)); for (let i = 0; i < 2; i++) bench.add(box(1.3, 0.1, 0.03, wood, 0, 0.62 + i * 0.14, -0.2));
  for (const x of [-0.55, 0.55]) bench.add(box(0.05, 0.45, 0.4, iron, x, 0.225, -0.02), box(0.05, 0.45, 0.04, iron, x, 0.68, -0.21));
  bench.position.set(1.9, 0, -1.4); bench.rotation.y = -0.25; g.add(bench);
  g.add(M(new THREE.CylinderGeometry(0.04, 0.06, 2.6, 12), iron, -1.7, 1.3, -1.6), M(new THREE.SphereGeometry(0.13, 16, 12), glow('#fff6dc', 1.2), -1.7, 2.68, -1.6));
  // falling petals
  const petals = [], pm = new THREE.MeshStandardMaterial({ color: '#ffc1d6', roughness: 0.8, side: THREE.DoubleSide }), pg = new THREE.CircleGeometry(0.022, 6); pg.scale(1, 0.6, 1);
  const q = rng(31); for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(pg, pm); m.castShadow = false; m.userData.p = [q() * 8 - 4, q() * 4, -q() * 3.5 + 0.8, q() * 6.28, 0.25 + q() * 0.25]; petals.push(m); g.add(m); }
  g.userData.tick = (t) => { for (const m of petals) { const [x, y0, z, ph, sp] = m.userData.p, y = 4 - ((4 - y0 + t * sp) % 4); m.position.set(x + Math.sin(t * 0.8 + ph) * 0.3 + (4 - y) * 0.15, y, z + Math.cos(t * 0.6 + ph) * 0.15); m.rotation.set(t * 1.3 + ph, t * 0.9 + ph, ph); } };
  return g;
}

// ---------------------------------------------------------------- starry stage
function starry() {
  const g = new THREE.Group();
  const sky = skyTex([[0, '#05061a'], [0.55, '#1c1650'], [1, '#5a2f86']], (c, w, h) => { const q = rng(17);
    c.filter = 'blur(18px)'; c.globalAlpha = 0.1; c.fillStyle = '#b9a8ff'; for (let i = 0; i < 60; i++) { c.beginPath(); c.ellipse(w * 0.15 + i * 13 + q() * 30, h * 0.15 + i * 4 + q() * 40, 40 + q() * 40, 14 + q() * 14, -0.3, 0, 7); c.fill(); } c.globalAlpha = 1; c.filter = 'none';
    for (let i = 0; i < 380; i++) { const s = q() < 0.08 ? 3 : 1.6; c.fillStyle = `rgba(255,255,255,${0.35 + q() * 0.65})`; c.beginPath(); c.arc(q() * w, q() * h * 0.9, s, 0, 7); c.fill(); }
    const moon = document.createElement('canvas'); moon.width = moon.height = 160; const mc = moon.getContext('2d'); mc.fillStyle = '#fff6d8'; mc.shadowColor = '#fff2c0'; mc.shadowBlur = 30; mc.beginPath(); mc.arc(80, 80, 40, 0, 7); mc.fill(); mc.shadowBlur = 0;
    mc.globalCompositeOperation = 'destination-out'; mc.beginPath(); mc.arc(64, 69, 38, 0, 7); mc.fill(); c.drawImage(moon, 620, 170); });
  g.add(plane(18, 9, picture(sky), 0, 3.4, -8));
  // round stage with a glowing edge, on a dark shiny floor
  const top = M(new THREE.CylinderGeometry(2.3, 2.4, 0.22, 64), std('#2a2350', { roughness: 0.25, metalness: 0.4 }), 0, -0.11, 0); top.receiveShadow = true; top.castShadow = false;
  const edge = M(new THREE.TorusGeometry(2.31, 0.025, 8, 96), glow('#9fe6ff', 2.5), 0, 0, 0); edge.rotation.x = Math.PI / 2; edge.castShadow = false;
  const floor = flat(30, 20, std('#07060f', { roughness: 0.35, metalness: 0.3 }), 0, -0.22, -4);
  const steps = M(new THREE.CylinderGeometry(2.6, 2.7, 0.11, 64), std('#211b40', { roughness: 0.3, metalness: 0.3 }), 0, -0.165, 0); steps.castShadow = false; steps.receiveShadow = true;
  g.add(floor, steps, top, edge);
  // an arch of bulbs behind the character and two glowing stars
  const bulbs = [], bulbGeo = new THREE.SphereGeometry(0.045, 12, 8);
  for (let i = 0; i <= 30; i++) { const a = Math.PI * i / 30, m = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe7a8', emissiveIntensity: 2.5 }), b = M(bulbGeo, m, Math.cos(a) * 2.7, 0.3 + Math.sin(a) * 3.0, -2.4); b.castShadow = false; bulbs.push([m, i]); g.add(b); }
  for (const x of [-2.7, 2.7]) { const s = neon(1.0, 1.0, '#ff7ad9', (c, w, h, lw) => { c.lineWidth = 10 * lw; starPath(c, w / 2, h / 2 + 10, 170); c.stroke(); }); s.position.set(x, 3.35, -2.35); g.add(s); }
  // two soft spotlight beams that sway
  const beams = [];
  for (const [x, col] of [[-1.9, '#9fd8ff'], [1.9, '#ffb3e6']]) { const geo = new THREE.ConeGeometry(0.6, 5, 32, 1, true); geo.translate(0, -2.5, 0);
    const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    b.position.set(x, 4.6, -1.0); b.userData.side = Math.sign(x); beams.push(b); g.add(b); }
  // sparkles floating up
  const spark = [], sm = new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, toneMapped: false }), sgeo = new THREE.OctahedronGeometry(0.025, 0), q = rng(41);
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(sgeo, sm); m.castShadow = false; m.userData.p = [q() * 6 - 3, q() * 3.5, -1.2 - q() * 2, q() * 6.28, 0.1 + q() * 0.15]; spark.push(m); g.add(m); }
  g.userData.tick = (t) => {
    for (const [m, i] of bulbs) m.emissiveIntensity = 1.4 + 1.4 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.6));
    for (const b of beams) b.rotation.z = -b.userData.side * (0.25 + 0.1 * Math.sin(t * 0.7 + b.userData.side));
    for (const m of spark) { const [x, y0, z, ph, sp] = m.userData.p, y = (y0 + t * sp) % 3.5; m.position.set(x + Math.sin(t + ph) * 0.1, y, z); m.rotation.y = t * 2 + ph; m.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 2 + ph))); }
  };
  return g;
}

export const MORE_SCENES = {
  gaming: { label: 'Gaming room', light: 'gaming', make: gaming },
  cafe: { label: 'Cozy café', light: 'cafe', make: cafe },
  city: { label: 'Neon street at night', light: 'gaming', make: city },
  park: { label: 'Cherry blossom park', light: 'daylight', make: park },
  starry: { label: 'Starry stage', light: 'moonlight', make: starry },
};
