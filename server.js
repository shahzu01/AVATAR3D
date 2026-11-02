// Kael Studio server
// - serves the web pages and vendored libraries
// - relays tracking frames from the Tracker page (or an iPhone VMC app) to every Avatar page
// - HTTP trigger API for Stream Deck: GET /api/trigger/<name>, /api/throw/<item>, /api/gesture/<name>
// - optional Twitch chat reader (anonymous, read-only): !heart !star !bonk !joy ...
// - stores settings (look, camera, chat channel) so the OBS page picks them up on reload
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Library, UserError, pickLook, LOOK_KEYS } from './lib/library.js';
import { PhoneFace } from './lib/phone.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3939);
const VMC_PORT = Number(process.env.VMC_PORT || 39539);
const SETTINGS_FILE = path.join(ROOT, 'settings.json');
const AVATAR_DIR = path.join(ROOT, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

// ------------------------------------------------------------------ settings
const DEFAULT_SETTINGS = {
  avatar: 'Kael.vrm',
  background: 'transparent',          // transparent | green | blue | color
  backgroundColor: '#202028',
  camera: 'bust',                     // head | bust | half | full
  cameraOffset: { x: 0, y: 0, zoom: 1 },
  lightColor: '#ffffff', lightIntensity: 1.0, rimColor: '#a35cff', rimIntensity: 0.6,
  mirror: false,                      // false = puppet (your left = avatar's left); true = mirror
  idleMotion: true,
  twitchChannel: '',
  chatCommands: true,
  commandCooldownMs: 1500,
  phone: { app: 'vmc', ip: '', mirror: false, smoothing: 0.25, flipYaw: false, flipPitch: false, webcamFaceOff: true },
};
let settings = { ...DEFAULT_SETTINGS };
try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch {}
function saveSettings() { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); }

// ------------------------------------------------------------------ avatar library
const library = new Library(ROOT, { legacyDir: AVATAR_DIR, limits: settings.importLimits });
const canGoLive = (r) => r && (r.sourceType === 'created' || (r.format.type === 'VRM' && r.suitability?.tracking));
function ensureActive() {
  if (library.get(settings.activeAvatarId) && canGoLive(library.get(settings.activeAvatarId))) return;
  const list = library.list().filter(canGoLive);
  const pick = list.find((r) => r.originalFilename === settings.avatar) || list[0];
  settings.activeAvatarId = pick ? pick.id : null;
  if (pick) settings.avatar = pick.originalFilename;
  saveSettings();
}
ensureActive();
function activeInfo() {
  const r = library.get(settings.activeAvatarId);
  if (!r) return null;
  return { id: r.id, name: r.name, kind: r.sourceType === 'created' ? 'created' : 'vrm', url: library.publicRecord(r).fileUrl, transform: r.presentation.transform, tracking: r.presentation.tracking };
}
const publicSettings = () => ({ ...settings, active: activeInfo() });
function activate(id) {
  const r = library.get(id);
  if (!r) throw new UserError('Avatar not found.', 404);
  if (!canGoLive(r)) throw new UserError('This avatar can be previewed but not used live (it has no complete VRM humanoid rig).');
  const prev = library.get(settings.activeAvatarId);
  if (prev && prev.id !== r.id) library.setPresentation(prev.id, { look: pickLook(settings) });   // remember the old avatar's look
  settings.activeAvatarId = r.id; settings.avatar = r.originalFilename;
  if (r.presentation.look) Object.assign(settings, r.presentation.look); else library.setPresentation(r.id, { look: pickLook(settings) });
  saveSettings(); broadcast({ type: 'settings', settings: publicSettings() });
  return r;
}
function readJson(req, max = 4e6) {
  return new Promise((resolve, reject) => {
    let body = ''; req.on('data', (d) => { body += d; if (body.length > max) { reject(new UserError('Request too large.', 413)); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new UserError('Invalid request.')); } });
  });
}
function sendFile(res, file, type, extra = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'The stored file is missing. Re-import or replace this avatar.' })); return; }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', ...extra });
    fs.createReadStream(file).pipe(res);
  });
}
async function libraryApi(req, res, url) {
  const p = url.pathname, M = req.method;
  const json = (obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const pub = (r) => library.publicRecord(r);
  let m;
  try {
    if (p === '/api/library' && M === 'GET') return json({ avatars: library.list().map(pub), activeId: settings.activeAvatarId, limits: { maxFileMB: library.limits.maxFileMB } });
    if (p === '/api/library/rescan' && M === 'POST') { const added = library.scanLegacy(); ensureActive(); return json({ added: added.map(pub) }); }
    if (p === '/api/library/create' && M === 'POST') {       // save a character made in the creator
      const body = await readJson(req, 4e6);
      const rec = library.createFromRecipe(body.recipe, { name: body.name, thumbnail: body.thumbnail });
      if (body.makeActive) activate(rec.id);
      return json({ avatar: pub(rec), activeId: settings.activeAvatarId });
    }
    if (p === '/api/library/import' && M === 'POST') {
      const r = await library.receiveUpload(req, url.searchParams.get('filename') || 'avatar.vrm');
      if (r.error) return json({ error: r.error }, 413);
      if (!r.tmpId) return json({ error: r.report.errors[0], report: r.report }, 422);
      return json({ tmpId: r.tmpId, report: r.report, previewUrl: `/api/library/import/${r.tmpId}/file` });
    }
    if ((m = p.match(/^\/api\/library\/import\/([a-f0-9]{24})(\/file|\/confirm)?$/))) {
      const [, tmpId, sub] = m;
      if (sub === '/file' && M === 'GET') { const pend = library.pending(tmpId); if (!pend) return json({ error: 'Import expired.' }, 404); return sendFile(res, pend.file, 'application/octet-stream'); }
      if (sub === '/confirm' && M === 'POST') {
        const body = await readJson(req);
        let rec;
        if (body.replaceId) rec = library.replace(body.replaceId, tmpId); else rec = library.confirm(tmpId, { name: body.name });
        if (body.thumbnail) library.setThumbnail(rec, body.thumbnail);
        if (body.name && body.replaceId) library.rename(rec.id, body.name);
        if (body.makeActive || (body.replaceId && rec.id === settings.activeAvatarId)) { if (canGoLive(rec)) activate(rec.id); else if (rec.id === settings.activeAvatarId) { ensureActive(); broadcast({ type: 'settings', settings: publicSettings() }); } }
        return json({ avatar: pub(rec), activeId: settings.activeAvatarId });
      }
      if (!sub && M === 'DELETE') { library.cancel(tmpId); return json({ cancelled: true }); }
    }
    if ((m = p.match(/^\/api\/library\/([a-f0-9]{16})(\/[a-z]+)?$/))) {
      const [, id, sub = ''] = m;
      const rec = library.get(id); if (!rec) return json({ error: 'Avatar not found.' }, 404);
      if (!sub && M === 'GET') return json({ avatar: pub(rec) });
      if (sub === '/file' && M === 'GET') return sendFile(res, library.filePath(rec), rec.sourceType === 'created' ? 'application/json' : 'application/octet-stream');
      if (sub === '/recipe' && M === 'PUT') {
        const body = await readJson(req, 4e6);
        library.updateRecipe(id, body.recipe, { thumbnail: body.thumbnail });
        if (id === settings.activeAvatarId) broadcast({ type: 'settings', settings: publicSettings() });
        return json({ avatar: pub(library.get(id)) });
      }
      if (sub === '/thumb' && M === 'GET') return rec.thumbnail ? sendFile(res, library.thumbPath(rec), 'image/png') : json({ error: 'No thumbnail.' }, 404);
      if (sub === '/download' && M === 'GET') return sendFile(res, library.filePath(rec), 'application/octet-stream', { 'Content-Disposition': `attachment; filename="${rec.originalFilename.replace(/"/g, '')}"` });
      if (!sub && M === 'PATCH') {
        const body = await readJson(req);
        if ('name' in body) library.rename(id, body.name);
        if (body.presentation) library.setPresentation(id, body.presentation);
        if (id === settings.activeAvatarId) {
          if (body.presentation?.look) { Object.assign(settings, pickLook(body.presentation.look)); saveSettings(); }
          broadcast({ type: 'settings', settings: publicSettings() });
        }
        return json({ avatar: pub(library.get(id)) });
      }
      if (sub === '/thumbnail' && M === 'POST') { const body = await readJson(req); if (!library.setThumbnail(rec, body.thumbnail)) return json({ error: 'Thumbnail must be a PNG under 2 MB.' }, 400); return json({ avatar: pub(rec) }); }
      if (sub === '/duplicate' && M === 'POST') return json({ avatar: pub(library.duplicate(id)) });
      if (sub === '/activate' && M === 'POST') { activate(id); return json({ avatar: pub(library.get(id)), activeId: settings.activeAvatarId }); }
      if (!sub && M === 'DELETE') {
        const wasActive = id === settings.activeAvatarId;
        const out = library.remove(id);
        if (wasActive) { settings.activeAvatarId = null; ensureActive(); broadcast({ type: 'settings', settings: publicSettings() }); }
        return json({ ...out, activeId: settings.activeAvatarId });
      }
    }
    return json({ error: 'Not found.' }, 404);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.code);
    console.error(e); return json({ error: 'Something went wrong while handling the avatar. Details are in the log.' }, 500);
  }
}

// ------------------------------------------------------------------ static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.vrm': 'application/octet-stream', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.task': 'application/octet-stream', '.map': 'application/json' };
const MOUNTS = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
  ['/vendor/three-vrm/', path.join(ROOT, 'node_modules/@pixiv/three-vrm/lib/')],
  ['/vendor/tasks-vision/', path.join(ROOT, 'node_modules/@mediapipe/tasks-vision/')],
  ['/models/', path.join(ROOT, 'models/')],
  ['/avatars/', AVATAR_DIR + '/'],
  ['/', path.join(ROOT, 'public/')],
];
function serveStatic(req, res, urlPath) {
  for (const [prefix, dir] of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(path.normalize(dir))) break;                 // no path traversal
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
}

// ------------------------------------------------------------------ websocket hub
const clients = new Set();     // { ws, role }
function broadcast(msg, roles = ['avatar', 'control']) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const c of clients) if (roles.includes(c.role) && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}
function status() {
  const count = r => [...clients].filter(c => c.role === r).length;
  return { trackers: count('tracker'), avatars: count('avatar'), controls: count('control'),
    vmcActive: phone.active, phone: phone.status(), twitch: twitchState, settings: publicSettings() };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const ok = (obj) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); };
  // Stream Deck friendly endpoints (GET so a "web request" button works)
  let m;
  if ((m = p.match(/^\/api\/trigger\/([\w-]+)$/))) {
    const msg = { type: 'trigger', name: m[1], intensity: Number(url.searchParams.get('i') || 1), duration: Number(url.searchParams.get('d') || 2.5), source: 'api' };
    broadcast(msg); return ok({ sent: msg });
  }
  if ((m = p.match(/^\/api\/throw\/([\w-]+)$/))) { const msg = { type: 'throw', item: m[1], count: Number(url.searchParams.get('n') || 1), source: 'api' }; broadcast(msg); return ok({ sent: msg }); }
  if ((m = p.match(/^\/api\/gesture\/([\w-]+)$/))) { const msg = { type: 'gesture', name: m[1], source: 'api' }; broadcast(msg); return ok({ sent: msg }); }
  if (p === '/api/status') return ok(status());
  if (p === '/api/phone') return ok(phone.status());
  if (p === '/api/phone/calibrate' && req.method === 'POST') return ok({ calibrated: phone.calibrate(), status: phone.status() });
  if (p.startsWith('/api/library')) { libraryApi(req, res, url); return; }
  if (p === '/api/avatars') return ok({ avatars: library.list().filter(canGoLive).map((r) => ({ id: r.id, name: r.name })), activeId: settings.activeAvatarId });
  if (p === '/api/settings' && req.method === 'GET') return ok(publicSettings());
  if (p === '/api/settings' && req.method === 'POST') {
    let body = ''; req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const patch = JSON.parse(body);
        delete patch.active;
        const nextActive = patch.activeAvatarId; delete patch.activeAvatarId;
        if (patch.phone) patch.phone = { ...DEFAULT_SETTINGS.phone, ...settings.phone, ...patch.phone };
        settings = { ...settings, ...patch }; saveSettings();
        if (nextActive && nextActive !== settings.activeAvatarId) activate(nextActive);
        else if (LOOK_KEYS.some((k) => k in patch) && library.get(settings.activeAvatarId)) library.setPresentation(settings.activeAvatarId, { look: pickLook(settings) });
        broadcast({ type: 'settings', settings: publicSettings() });
        if ('twitchChannel' in patch) connectTwitch(settings.twitchChannel);
        ok(publicSettings());
      } catch (e) { res.writeHead(400); res.end(e instanceof UserError ? e.message : 'invalid settings'); }
    });
    return;
  }
  if (p === '/api/avatar' && req.method === 'POST') {           // older Studio upload button: import, save and activate in one go
    library.receiveUpload(req, url.searchParams.get('name') || 'avatar.vrm').then((r) => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (!r.tmpId) return send(422, { error: r.error || r.report.errors[0] });
      const rec = library.confirm(r.tmpId, {});
      try { activate(rec.id); } catch (e) { return send(200, { saved: rec.name, id: rec.id, warning: e.message }); }
      send(200, { saved: rec.name, id: rec.id });
    });
    return;
  }
  serveStatic(req, res, p);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 });
wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'http://x').searchParams.get('role') || 'avatar';
  const client = { ws, role }; clients.add(client);
  ws.send(JSON.stringify({ type: 'settings', settings: publicSettings() }));
  broadcast({ type: 'status', status: status() }, ['control']);
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (msg.type === 'frame' && role === 'tracker') broadcast(data.toString(), ['avatar']);    // hot path: relay as-is
    else if (['trigger', 'throw', 'gesture', 'calibrated'].includes(msg.type)) broadcast(msg);
  });
  ws.on('close', () => { clients.delete(client); broadcast({ type: 'status', status: status() }, ['control']); });
});
setInterval(() => broadcast({ type: 'status', status: status() }, ['control']), 2000);
setInterval(() => library.cleanupTmp(), 10 * 60e3);     // abandoned imports are removed after an hour

// ------------------------------------------------------------------ VMC protocol input (iPhone apps such as waidayo)
// /VMC/Ext/Blend/Val <name> <value>, /VMC/Ext/Blend/Apply, /VMC/Ext/Bone/Pos <name> px py pz qx qy qz qw (Unity coords)
let lastVmc = 0;
const vmcBlend = {};
let vmcHead = null;
function oscString(buf, i) { const end = buf.indexOf(0, i); const s = buf.toString('utf8', i, end); return [s, (end + 4) & ~3]; }
function oscMessage(buf, out) {
  let [addr, i] = oscString(buf, 0);
  if (addr === '#bundle') {
    i = 16;
    while (i + 4 <= buf.length) { const n = buf.readInt32BE(i); oscMessage(buf.subarray(i + 4, i + 4 + n), out); i += 4 + n; }
    return;
  }
  let tags; [tags, i] = oscString(buf, i);
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 's') { let s; [s, i] = oscString(buf, i); args.push(s); }
    else if (t === 'f') { args.push(buf.readFloatBE(i)); i += 4; }
    else if (t === 'i') { args.push(buf.readInt32BE(i)); i += 4; }
    else break;
  }
  out.push([addr, args]);
}
const phone = new PhoneFace({ emit: (frame) => broadcast(frame, ['avatar']), getSettings: () => settings });
const udp = dgram.createSocket('udp4');
udp.on('message', (buf) => {
  const msgs = []; try { oscMessage(buf, msgs); } catch { return; }
  for (const [addr, a] of msgs) {
    if (addr === '/VMC/Ext/Blend/Val' && a.length >= 2) vmcBlend[a[0]] = a[1];
    else if (addr === '/VMC/Ext/Bone/Pos' && a[0] === 'Head' && a.length >= 8) vmcHead = [a[4], -a[5], -a[6], a[7]];  // Unity(LH) -> three(RH)
    else if (addr === '/VMC/Ext/Blend/Apply') {
      lastVmc = Date.now();
      phone.onVMC({ ...vmcBlend }, vmcHead);
    }
  }
});
udp.on('error', (e) => console.log(`VMC input disabled (${e.message})`));
udp.bind(VMC_PORT);

// ------------------------------------------------------------------ Twitch chat (anonymous read-only IRC over websocket)
let twitch = null, twitchState = 'off';
const lastCommand = new Map();
const CHAT = {
  heart: { type: 'throw', item: 'heart' }, star: { type: 'throw', item: 'star' }, tomato: { type: 'throw', item: 'tomato' },
  bonk: { type: 'throw', item: 'bonk' }, gift: { type: 'throw', item: 'gift' }, pizza: { type: 'throw', item: 'pizza' },
  joy: { type: 'trigger', name: 'joy' }, laugh: { type: 'trigger', name: 'Laughing' }, angry: { type: 'trigger', name: 'angry' },
  sad: { type: 'trigger', name: 'sad' }, wow: { type: 'trigger', name: 'surprised' }, smug: { type: 'trigger', name: 'Smug' },
  blush: { type: 'trigger', name: 'Embarrassed' }, wink: { type: 'trigger', name: 'Wink_L' },
  wave: { type: 'gesture', name: 'wave' }, nod: { type: 'gesture', name: 'nod' }, dance: { type: 'gesture', name: 'dance' },
};
function connectTwitch(channel) {
  if (twitch) { try { twitch.close(); } catch {} twitch = null; }
  channel = (channel || '').trim().toLowerCase().replace(/^#/, '');
  if (!channel) { twitchState = 'off'; return; }
  twitchState = 'connecting';
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); twitch = ws;
  ws.on('open', () => { ws.send('PASS SCHMOOPIIE'); ws.send(`NICK justinfan${Math.floor(Math.random() * 80000 + 1000)}`); ws.send(`JOIN #${channel}`); twitchState = `joined #${channel}`; });
  ws.on('message', (raw) => {
    for (const line of raw.toString().split('\r\n')) {
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
      const m = line.match(/^:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/);
      if (!m || !settings.chatCommands) continue;
      const [, user, text] = m;
      const cmd = text.trim().toLowerCase().match(/^!(\w+)/)?.[1];
      if (!cmd || !CHAT[cmd]) continue;
      const key = `${user}:${cmd}`, now = Date.now();
      if (now - (lastCommand.get(key) || 0) < settings.commandCooldownMs) continue;
      lastCommand.set(key, now);
      broadcast({ ...CHAT[cmd], from: user, source: 'chat' });
    }
  });
  ws.on('close', () => { if (twitch === ws) { twitchState = 'disconnected - retrying'; setTimeout(() => twitch === ws && connectTwitch(channel), 5000); } });
  ws.on('error', () => {});
}
connectTwitch(settings.twitchChannel);

server.listen(PORT, () => {
  console.log(`\nKael Studio running`);
  console.log(`  Studio + tracker (open in Chrome):  http://localhost:${PORT}/tracker.html`);
  console.log(`  Avatar for OBS Browser Source:      http://localhost:${PORT}/avatar.html`);
  console.log(`  Avatar library:                     http://localhost:${PORT}/library.html`);
  console.log(`  Stream Deck example:                http://localhost:${PORT}/api/trigger/joy`);
  console.log(`  iPhone VMC input (UDP):             port ${VMC_PORT}\n`);
});
