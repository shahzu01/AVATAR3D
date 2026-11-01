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
};
let settings = { ...DEFAULT_SETTINGS };
try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch {}
function saveSettings() { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); }

// ------------------------------------------------------------------ static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.vrm': 'application/octet-stream', '.task': 'application/octet-stream', '.map': 'application/json' };
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
    vmcActive: Date.now() - lastVmc < 1000, twitch: twitchState, settings };
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
  if (p === '/api/avatars') return ok({ avatars: fs.readdirSync(AVATAR_DIR).filter(f => f.toLowerCase().endsWith('.vrm')) });
  if (p === '/api/settings' && req.method === 'GET') return ok(settings);
  if (p === '/api/settings' && req.method === 'POST') {
    let body = ''; req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const patch = JSON.parse(body);
        settings = { ...settings, ...patch }; saveSettings();
        broadcast({ type: 'settings', settings });
        if ('twitchChannel' in patch) connectTwitch(settings.twitchChannel);
        ok(settings);
      } catch (e) { res.writeHead(400); res.end(String(e)); }
    });
    return;
  }
  if (p === '/api/avatar' && req.method === 'POST') {           // upload a .vrm (raw body), ?name=file.vrm
    const name = path.basename(url.searchParams.get('name') || 'avatar.vrm').replace(/[^\w.\- ]/g, '_');
    if (!name.toLowerCase().endsWith('.vrm')) { res.writeHead(400); res.end('must be .vrm'); return; }
    const out = fs.createWriteStream(path.join(AVATAR_DIR, name));
    let size = 0;
    req.on('data', d => { size += d.length; if (size > 300e6) { req.destroy(); out.destroy(); } });
    req.pipe(out).on('finish', () => { settings.avatar = name; saveSettings(); broadcast({ type: 'settings', settings }); ok({ saved: name, bytes: size }); });
    return;
  }
  serveStatic(req, res, p);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 });
wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'http://x').searchParams.get('role') || 'avatar';
  const client = { ws, role }; clients.add(client);
  ws.send(JSON.stringify({ type: 'settings', settings }));
  broadcast({ type: 'status', status: status() }, ['control']);
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (msg.type === 'frame' && role === 'tracker') broadcast(data.toString(), ['avatar']);    // hot path: relay as-is
    else if (['trigger', 'throw', 'gesture', 'calibrated'].includes(msg.type)) broadcast(msg);
  });
  ws.on('close', () => { clients.delete(client); broadcast({ type: 'status', status: status() }, ['control']); });
});
setInterval(() => broadcast({ type: 'status', status: status() }, ['control']), 2000);

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
const udp = dgram.createSocket('udp4');
udp.on('message', (buf) => {
  const msgs = []; try { oscMessage(buf, msgs); } catch { return; }
  for (const [addr, a] of msgs) {
    if (addr === '/VMC/Ext/Blend/Val' && a.length >= 2) vmcBlend[a[0]] = a[1];
    else if (addr === '/VMC/Ext/Bone/Pos' && a[0] === 'Head' && a.length >= 8) vmcHead = [a[4], -a[5], -a[6], a[7]];  // Unity(LH) -> three(RH)
    else if (addr === '/VMC/Ext/Blend/Apply') {
      lastVmc = Date.now();
      broadcast({ type: 'frame', source: 'vmc', t: lastVmc, face: { bs: { ...vmcBlend }, head: vmcHead }, conf: { face: 1 } }, ['avatar']);
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
  console.log(`  Stream Deck example:                http://localhost:${PORT}/api/trigger/joy`);
  console.log(`  iPhone VMC input (UDP):             port ${VMC_PORT}\n`);
});
