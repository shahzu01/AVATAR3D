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
  for (const p of ['/', '/tracker.html', '/avatar.html', '/library.html', '/creator.html', '/mixer.html', '/modular/kit.json', '/modular/face_kit.json']) assert.equal((await fetch(BASE + p)).status, 200, p);
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
