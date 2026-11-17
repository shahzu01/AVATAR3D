// Kael Studio smoke tests: `npm test`. Runs a real server on a spare port with a scratch data folder, so your own
// library and settings are never touched. Checks that the app starts and serves its pages, that the safety lock holds,
// that every outfit / accessory / face and eye shape survives saving, that the face kit is complete, and the bake API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 41000 + Math.floor(Math.random() * 2000), BASE = `http://127.0.0.1:${PORT}`;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let srv, data;
const api = async (p, opts = {}) => { const r = await fetch(BASE + p, { ...opts, headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', Origin: `http://127.0.0.1:${PORT}`, ...(opts.headers || {}) } }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; };

before(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'kael-test-'));
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), VMC_PORT: String(PORT + 1), KAEL_DATA_DIR: data, PHONE_PULL_MS: '60000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('server did not start')), 15000); srv.stdout.on('data', (d) => { if (/Kael Studio running/.test(d)) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => fail(new Error(`server exited (${c})`))); });
});
after(() => { srv?.kill(); fs.rmSync(data, { recursive: true, force: true }); });

test('every script parses', () => {
  const files = ['server.js', ...fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js')).map((f) => `lib/${f}`), ...fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.js')).map((f) => `public/${f}`)];
  for (const f of files) { const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, `${f}: ${r.stderr}`); }
});

test('pages load', async () => {
  for (const p of ['/', '/tracker.html', '/avatar.html', '/library.html', '/characters.html', '/creator.html', '/mixer.html', '/modular/kit.json', '/modular/face_kit.json']) assert.equal((await fetch(BASE + p)).status, 200, p);
});

test('safety lock: only this Mac and Kael Studio pages', async () => {
  assert.equal((await fetch(`${BASE}/api/trigger/joy`)).status, 200, 'Stream Deck style request');
  const hostStatus = await new Promise((ok) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/library', headers: { Host: 'evil.example' } }, (r) => { r.resume(); ok(r.statusCode); }));      // fetch() will not send a custom Host
  assert.equal(hostStatus, 403, 'foreign Host (DNS rebinding)');
  assert.equal((await fetch(`${BASE}/api/settings`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' }, body: '{}' })).status, 403, 'other website');
  assert.equal((await fetch(`${BASE}/api/throw/bonk`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403, 'cross-site image');
  assert.equal((await api('/api/library')).status, 200, 'own page');
});

const keysOf = (src, re) => [...src.matchAll(re)].map((m) => m[1]);
test('every outfit, accessory, face shape and eye shape survives saving', async () => {
  const outfits = keysOf(read('public/outfits.js'), /^ {2}(\w+): \{ group:/gm), acc = Object.keys(JSON.parse(read('public/accessories.js').match(/export const ACCESSORIES = (\{[^}]*\})/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')));
  const face = read('public/face.js'), faceShapes = keysOf(face, /\['([fmc]_[a-z]+)'/g), eyeShapes = keysOf(face, /\['((?:hf|ag|hm|am)_[a-z]+)'/g);
  assert.ok(outfits.length >= 20 && acc.length >= 8 && faceShapes.length >= 15 && eyeShapes.length >= 20, 'lists found');
  for (const outfit of outfits) {
    const { status, j } = await api('/api/library/create', { method: 'POST', body: JSON.stringify({ recipe: { kind: 'modular', name: outfit, outfit, accessories: acc, faceShape: faceShapes[outfits.indexOf(outfit) % faceShapes.length], eyeShape: eyeShapes[outfits.indexOf(outfit) % eyeShapes.length] } }) });
    assert.equal(status, 200, `${outfit}: ${j?.error}`);
    const saved = await (await fetch(`${BASE}/api/library/${j.avatar.id}/file`)).json();
    assert.equal(saved.outfit, outfit, `outfit ${outfit} was dropped when saving`);
    assert.deepEqual(saved.accessories, acc, 'accessories were dropped');
    assert.ok(saved.faceShape && saved.eyeShape, `face/eye shape dropped (${outfit})`);
  }
});

test('face kit: iPhone shapes, presets and every human eye shape', () => {
  const fk = JSON.parse(read('public/modular/face_kit.json')), ex = Object.keys(fk.expressions);
  for (const n of ['blink', 'blinkLeft', 'blinkRight', 'aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'surprised', 'relaxed']) assert.ok(ex.includes(n), `preset ${n}`);
  const arkit = ex.filter((n) => /^(eye|brow|jaw|mouth|cheek|nose)[A-Z]/.test(n)); assert.ok(arkit.length >= 43, `ARKit shapes: ${arkit.length}`);
  for (const k of keysOf(read('public/face.js'), /\['((?:hf|hm)_[a-z]+)', '[^']+', \{ k:/g)) assert.ok(fk.eyeShapes[k], `eye shape ${k} missing from face_kit.json`);
});

test('kit files are all there', () => {
  const kit = JSON.parse(read('public/modular/kit.json')), want = new Set(['base.vrm']);
  for (const e of Object.values(kit.extras || {})) { if (e.head) want.add(e.head); for (const h of e.hair || []) want.add(h.file); }
  for (const h of Object.values(kit.heads || {})) if (h.file) want.add(h.file);
  for (const f of want) assert.ok(fs.existsSync(path.join(ROOT, 'public/modular', f)), `missing public/modular/${f}`);
});

test('baked stream file: fingerprint and file checks', async () => {
  const { j } = await api('/api/library/create', { method: 'POST', body: JSON.stringify({ recipe: { kind: 'modular', name: 'Bake test' } }) });
  const id = j.avatar.id; assert.equal(j.avatar.bake.state, 'none');
  const put = (hash, body) => fetch(`${BASE}/api/library/${id}/baked?hash=${hash}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Sec-Fetch-Site': 'same-origin' }, body });
  assert.equal((await put('0000', Buffer.from('x'))).status, 409, 'stale fingerprint refused');
  assert.equal((await put(j.avatar.bake.hash, Buffer.from('not a vrm at all'))).status, 422, 'non-VRM refused');
  assert.equal((await fetch(`${BASE}/api/library/${id}/baked`)).status, 404, 'nothing stored');
});

test('props and scenes: upload checks, sanitizing, and deleting removes every use', async () => {
  const glb = (json) => { const j = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' ')); const h = Buffer.alloc(20); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + j.length, 8); h.writeUInt32LE(j.length, 12); h.writeUInt32LE(0x4e4f534a, 16); return Buffer.concat([h, j]); };
  const up = (buf, name = 'x') => api(`/api/props/upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf });
  assert.equal((await up(Buffer.from('MZ not a model at all'))).status, 422, 'random bytes are refused');
  assert.equal((await up(glb({ asset: { version: '2.0' }, buffers: [{ uri: 'file:///etc/passwd', byteLength: 4 }] }))).status, 422, 'a model pointing at outside files is refused');
  const ok = await up(glb({ asset: { version: '2.0' } }), 'Desk <b>lamp</b>');
  assert.equal(ok.status, 200); const f = ok.j.file; assert.match(f.file, /^[a-f0-9]{16}\.glb$/); assert.equal(f.name, 'Desk blamp/b', 'names are cleaned');
  assert.equal((await fetch(`${BASE}/userprops/${f.file}`)).status, 200); assert.equal((await fetch(`${BASE}/userprops/..%2Fsettings.json`)).status, 404);
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ props: [{ id: 'a', src: `file:${f.file}`, attach: 'nose', scale: 999 }, { id: 'b', src: 'builtin:mic' }, { src: 'builtin:bomb' }, { src: 'file:../x.glb' }], scene: { kind: 'model', file: f.file, scale: -3 } }) });
  let s = (await api('/api/settings')).j;
  assert.deepEqual(s.props.map((p) => [p.id, p.attach, p.scale]), [['a', 'rightHand', 20], ['b', 'rightHand', 1]], 'unknown props dropped, values clamped');
  assert.equal(s.scene.kind, 'model'); assert.equal(s.scene.scale, 0.1);
  assert.equal((await api(`/api/props/${f.id}`, { method: 'DELETE' })).status, 200);
  s = (await api('/api/settings')).j;
  assert.deepEqual(s.props.map((p) => p.id), ['b'], 'deleting the file removes the prop'); assert.equal(s.scene.kind, 'none', 'and the scene that used it');
  for (const key of ['gaming', 'cafe', 'city', 'park', 'starry']) { await api('/api/settings', { method: 'POST', body: JSON.stringify({ scene: { kind: 'builtin', key } }) }); assert.equal((await api('/api/settings')).j.scene.key, key, `built-in scene ${key} is kept`); }
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ scene: { kind: 'builtin', key: 'moon-base' } }) }); assert.equal((await api('/api/settings')).j.scene.kind, 'none', 'unknown built-in scenes are dropped');
});

test('pose and camera settings are checked', async () => {
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ idlePose: 'sit', poseLock: 'yes', cameraMotion: 'drift' }) });
  let s = (await api('/api/settings')).j; assert.deepEqual([s.idlePose, s.poseLock, s.cameraMotion], ['sit', true, 'drift']);
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ idlePose: 'backflip', cameraMotion: 'shake' }) });
  s = (await api('/api/settings')).j; assert.deepEqual([s.idlePose, s.cameraMotion], ['relaxed', 'still']);
  const poses = read('public/avatar.js').match(/^export const POSES = \{([\s\S]*?)\n\};/m)[1].match(/^  (\w+):/gm).map((x) => x.trim().slice(0, -1));
  const listed = [...read('public/props.js').match(/POSE_LIST = \[(.*)\];/)[1].matchAll(/\['(\w+)'/g)].map((m) => m[1]);
  const { POSE_NAMES } = await import('../lib/triggers.js');
  assert.deepEqual(listed, poses, 'Studio list matches the stream page'); assert.deepEqual(POSE_NAMES, poses, 'rules list matches the stream page');
});

test('animal ears and tails are saved; ready-made characters all have pictures', async () => {
  const { sanitizeRecipe } = await import('../lib/recipe.js');
  const r = sanitizeRecipe({ kind: 'modular', parts: {}, ears: 'fox', tail: 'wolf', furColor: '#aabbcc', furTip: 'red' });
  assert.deepEqual([r.ears, r.tail, r.furColor, r.furTip], ['fox', 'wolf', '#aabbcc', null]);
  const bad = sanitizeRecipe({ kind: 'modular', parts: {}, ears: 'dragon', tail: '<b>' }); assert.deepEqual([bad.ears, bad.tail], ['none', 'none']);
  const src = read('public/animal.js'), keys = (name) => Object.keys(eval(`(${src.match(new RegExp(`export const ${name} = (\\{[^}]*\\})`))[1]})`)).filter((k) => k !== 'none');
  assert.deepEqual(keys('EARS'), ['cat', 'fox', 'wolf', 'bunny', 'bear', 'elf'], 'the server keeps every ear the maker offers');
  assert.deepEqual(keys('TAILS'), ['cat', 'fox', 'wolf', 'bunny', 'bear'], 'and every tail');
  const ready = [...read('public/readymade.js').matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
  assert.ok(ready.length >= 8);
  for (const k of ready) assert.equal((await fetch(`${BASE}/readymade/${k}.png`)).status, 200, `picture for ${k}`);
});

test('picture cards: stored once, only JPEGs, only known names', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Origin: BASE, 'Sec-Fetch-Site': 'same-origin' }, body });
  assert.equal((await post('/api/thumbs/face/c_round', jpeg)).status, 200);
  assert.equal((await fetch(`${BASE}/api/thumbs/face/c_round`)).status, 200);
  assert.ok((await api('/api/thumbs')).j.have.includes('face/c_round'));
  assert.equal((await post('/api/thumbs/face/x', Buffer.from('<svg onload=alert(1)>'))).status, 400, 'not a JPEG');
  assert.equal((await post('/api/thumbs/secrets/x', jpeg)).status, 404, 'unknown kind of card');
  assert.equal((await post('/api/thumbs/face/..%2F..%2Fsettings', jpeg)).status, 404, 'no paths');
  assert.equal((await fetch(`${BASE}/api/thumbs/face/c_round`, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: jpeg })).status, 403, 'other websites cannot write');
});

test('mixed outfits and body proportions are saved safely', async () => {
  const { sanitizeRecipe } = await import('../lib/recipe.js');
  const r = sanitizeRecipe({ kind: 'modular', parts: {}, outfit: 'custom', custom: { top: { from: 'p_maid', main: '#112233', accent: 'red' }, bottom: { from: '../../x' }, shoes: { from: 'p_idol' } }, body: { height: 3, legs: 0.9, hips: 'wide', waist: -0.4 }, fit: { Head: 1.2, Arm_L: 9 } });
  assert.equal(r.outfit, 'custom');
  assert.deepEqual(r.custom.top, { from: 'p_maid', main: '#112233', accent: null });
  assert.equal(r.custom.bottom.from, 'none', 'odd names are dropped'); assert.equal(r.custom.legs.from, 'none');
  assert.deepEqual(r.body, { height: 1.15, legs: 0.9, shoulders: 0, waist: -0.4, hips: 0 });
  assert.equal(r.fit.Head, 1.2); assert.equal(r.fit.Arm_L, 1.6, 'sizes are clamped');
  assert.equal(sanitizeRecipe({ kind: 'modular', parts: {}, outfit: 'p_maid', custom: { top: { from: 'x' } } }).custom, null, 'pieces only apply to a mixed outfit');
});

test('built hair: every part the maker offers is kept when saving', async () => {
  const { sanitizeRecipe } = await import('../lib/recipe.js');
  const src = read('public/hairgen.js'), block = src.match(/export const HAIR_PARTS = \{([\s\S]*?)\n\};/)[1];
  const parts = Object.fromEntries([...block.matchAll(/^\s*(\w+): \{([^}]*)\}/gm)].map(([, slot, body]) => [slot, [...body.matchAll(/(\w+): '/g)].map((m) => m[1])]));
  assert.deepEqual(Object.keys(parts), ['front', 'back', 'side', 'ext', 'extra']);
  for (const [slot, keys] of Object.entries(parts)) for (const k of keys) assert.equal(sanitizeRecipe({ kind: 'modular', parts: {}, hair: 'Custom', hairParts: { [slot]: k } }).hairParts[slot], k, `${slot} ${k}`);
  const r = sanitizeRecipe({ kind: 'modular', parts: {}, hair: 'Custom', hairParts: { front: '<img>', ext: 'twin' } });
  assert.equal(r.hair, 'Custom'); assert.equal(r.hairParts.front, 'straight', 'unknown parts fall back'); assert.equal(r.hairParts.ext, 'twin');
});
