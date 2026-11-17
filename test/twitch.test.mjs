// Twitch events + trigger rules, end to end against a fake Twitch (sign-in, API and EventSub WebSocket), so no
// real account is needed. Also unit-tests the rule engine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { TriggerEngine, sanitizeRules, DEFAULT_RULES } from '../lib/triggers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 43000 + Math.floor(Math.random() * 1500), FAKE = PORT + 1600, BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await wait(100); } throw new Error('timed out'); }

// ---------------------------------------------------------------- fake Twitch
const fake = { tokenPolls: 0, subs: [], sockets: [], usersCalls: 0, refreshes: 0, expireNext: false };
let fakeHttp, fakeWss, srv, data;
function startFake() {
  fakeHttp = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; }); req.on('end', () => {
      const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      const f = Object.fromEntries(new URLSearchParams(body));
      if (req.url === '/oauth2/device') return f.client_id === 'abcdefghij0123456789abcd' && /channel:read:redemptions/.test(f.scopes) ? send(200, { device_code: 'DEV', user_code: 'ABCD-EFGH', verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD-EFGH', expires_in: 1800, interval: 1 }) : send(400, { message: 'invalid client' });
      if (req.url === '/oauth2/token' && f.grant_type?.endsWith('device_code')) return ++fake.tokenPolls < 2 ? send(400, { status: 400, message: 'authorization_pending' }) : send(200, { access_token: 'AT1', refresh_token: 'RT1', scope: ['bits:read'] });
      if (req.url === '/oauth2/token' && f.grant_type === 'refresh_token') { fake.refreshes++; return f.refresh_token?.startsWith('RT') ? send(200, { access_token: `AT${fake.refreshes + 1}`, refresh_token: `RT${fake.refreshes + 1}` }) : send(400, { message: 'Invalid refresh token' }); }
      const auth = req.headers.authorization, cid = req.headers['client-id'];
      if (fake.expireNext && auth === 'Bearer AT1') { fake.expireNext = false; return send(401, { message: 'Invalid OAuth token' }); }
      if (!/^Bearer AT\d$/.test(auth || '') || cid !== 'abcdefghij0123456789abcd') return send(401, { message: 'unauthorized' });
      if (req.url === '/helix/users') { fake.usersCalls++; return send(200, { data: [{ id: '4242', login: 'kaelfan', display_name: 'KaelFan' }] }); }
      if (req.url === '/helix/eventsub/subscriptions' && req.method === 'POST') { const b = JSON.parse(body); fake.subs.push(b); if (b.type === 'channel.cheer') return send(403, { message: 'not an affiliate' }); return send(202, { data: [{ id: 's' + fake.subs.length, status: 'enabled' }] }); }
      send(404, {});
    });
  }).listen(FAKE);
  fakeWss = new WebSocketServer({ port: FAKE + 1 });
  fakeWss.on('connection', (ws, req) => { fake.sockets.push(ws); ws.send(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: `sess${fake.sockets.length}`, keepalive_timeout_seconds: 10, reconnect_url: null, path: req.url } } })); });
}
const notify = (type, event) => fake.sockets.at(-1).send(JSON.stringify({ metadata: { message_type: 'notification', subscription_type: type }, payload: { subscription: { type }, event } }));

before(async () => {
  startFake();
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'kael-tw-'));
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), VMC_PORT: String(PORT + 1), KAEL_DATA_DIR: data, PHONE_PULL_MS: '60000',
    TWITCH_ID_BASE: `http://127.0.0.1:${FAKE}`, TWITCH_API_BASE: `http://127.0.0.1:${FAKE}`, TWITCH_EVENTSUB_URL: `ws://127.0.0.1:${FAKE + 1}/ws` }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('server did not start')), 15000); srv.stdout.on('data', (d) => { if (/Kael Studio running/.test(d)) { clearTimeout(t); ok(); } }); });
});
after(() => { srv?.kill(); fakeHttp?.close(); fakeWss?.close(); fs.rmSync(data, { recursive: true, force: true }); });
const api = async (p, opts = {}) => { const r = await fetch(BASE + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } }); return { status: r.status, j: await r.json().catch(() => null) }; };
function listen(role) { const msgs = []; const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=${role}`, { origin: `http://127.0.0.1:${PORT}` }); ws.on('message', (d) => msgs.push(JSON.parse(d))); return { msgs, ws, ready: new Promise((r) => ws.on('open', r)) }; }

// ---------------------------------------------------------------- rule engine
test('rules: matching, bits scaling, cooldowns, sanitizing', () => {
  const sent = []; let t = 0;
  const eng = new TriggerEngine({ getRules: () => sanitizeRules(DEFAULT_RULES), send: (m) => sent.push(m), now: () => t });
  assert.equal(eng.handle({ when: 'redeem', name: 'bonk' }).length, 1, 'redeem names match without caring about capitals');
  assert.equal(eng.handle({ when: 'redeem', name: 'Hydrate' }).length, 0, 'other redeems do not fire the Bonk rule');
  sent.length = 0; eng.handle({ when: 'bits', amount: 350 }); assert.deepEqual(sent.find((m) => m.type === 'throw'), { type: 'throw', item: 'star', count: 3, source: 'rule', from: undefined }, '1 star per 100 bits');
  sent.length = 0; eng.handle({ when: 'bits', amount: 40 }); assert.equal(sent.find((m) => m.type === 'throw').count, 1, 'small cheers still get one');
  sent.length = 0; eng.handle({ when: 'bits', amount: 999999 }); assert.equal(sent.find((m) => m.type === 'throw').count, 30, 'capped at 30');
  assert.equal(eng.handle({ when: 'follow' }).length, 1); assert.equal(eng.handle({ when: 'follow' }).length, 0, 'cooling down'); t += 3100; assert.equal(eng.handle({ when: 'follow' }).length, 1, 'cooldown over');
  const clean = sanitizeRules([{ when: 'nope', match: '!Hug<script>', min: -5, cooldown: 1e9, do: [{ act: 'throw', item: 'anvil', count: 999 }, { act: 'hack' }] }]);
  assert.deepEqual(clean[0], { id: clean[0].id, on: true, when: 'redeem', match: 'Hugscript', min: 0, cooldown: 3600, do: [{ act: 'throw', item: 'heart', count: 30 }] });
  const acts = sanitizeRules([{ when: 'follow', do: [{ act: 'pose', name: 'sit', seconds: 9999 }, { act: 'pose', name: 'moonwalk' }, { act: 'camera', framing: 'head', seconds: 4 }, { act: 'camera', framing: 'drone' }, { act: 'prop', id: 'mic', seconds: 3 }, { act: 'prop', id: '../x' }] }])[0].do;
  assert.deepEqual(acts, [{ act: 'pose', name: 'sit', seconds: 600 }, { act: 'pose', name: 'hips', seconds: 8 }, { act: 'camera', framing: 'head', seconds: 4 }, { act: 'camera', framing: 'head', seconds: 5 }, { act: 'prop', id: 'mic', seconds: 3 }, { act: 'prop', id: '', seconds: 8 }]);
  sent.length = 0; new TriggerEngine({ getRules: () => [{ id: 'r', on: true, when: 'follow', match: '', min: 0, cooldown: 0, do: acts.slice(0, 5) }], send: (m) => sent.push(m), now: () => 0 }).handle({ when: 'follow' });
  assert.deepEqual(sent.map((m) => m.type), ['pose', 'pose', 'camera', 'camera', 'prop'], 'pose, camera and prop actions reach the stream page');
});

test('rules API: save, test, reset; settings cannot smuggle rules in', async () => {
  const avatar = listen('avatar'); await avatar.ready;
  const { j } = await api('/api/triggers'); assert.ok(j.rules.length >= 5 && j.when.redeem && j.items.includes('bonk'));
  const mine = [{ id: 'r_t', on: true, when: 'command', match: 'hug', min: 0, cooldown: 0, do: [{ act: 'expression', name: 'Embarrassed', seconds: 2 }] }];
  assert.equal((await api('/api/triggers', { method: 'PUT', body: JSON.stringify({ rules: mine }) })).j.rules.length, 1);
  const fired = (await api('/api/triggers/test', { method: 'POST', body: JSON.stringify({ when: 'command', name: 'HUG' }) })).j.fired;
  assert.equal(fired.length, 1); await until(() => avatar.msgs.some((m) => m.type === 'trigger' && m.name === 'Embarrassed'));
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ triggers: [{ when: 'follow', do: [{ act: 'light', preset: 'dramatic' }] }] }) });
  assert.equal((await api('/api/triggers')).j.rules[0].id, 'r_t', 'settings POST ignored the rules');
  assert.ok((await api('/api/triggers/reset', { method: 'POST' })).j.rules.length >= 5);
  avatar.ws.close();
});

// ---------------------------------------------------------------- Twitch, against the fake
test('Twitch: sign in, subscribe, events fire rules, reconnect, token refresh, sign out', async () => {
  const avatar = listen('avatar'), control = listen('control'); await Promise.all([avatar.ready, control.ready]);
  assert.equal((await api('/api/twitch/connect', { method: 'POST', body: JSON.stringify({ clientId: 'nope' }) })).status, 400, 'bad Client ID refused');
  const start = (await api('/api/twitch/connect', { method: 'POST', body: JSON.stringify({ clientId: 'abcdefghij0123456789abcd' }) })).j;
  assert.equal(start.pending.userCode, 'ABCD-EFGH'); assert.equal(start.state, 'signing-in');
  const live = await until(async () => { const s = (await api('/api/twitch/status')).j; return s.state === 'live' && s; });
  assert.equal(live.login, 'KaelFan'); assert.equal(live.pending, null);
  assert.equal(live.topics['channel.channel_points_custom_reward_redemption.add'], 'on'); assert.match(live.topics['channel.cheer'], /not available/);
  assert.ok(!JSON.stringify(live).includes('AT1') && !JSON.stringify(live).includes('RT1'), 'tokens never reach the pages');
  const follow = fake.subs.find((s) => s.type === 'channel.follow'); assert.deepEqual(follow.condition, { broadcaster_user_id: '4242', moderator_user_id: '4242' }); assert.equal(follow.version, '2');
  assert.deepEqual(fake.subs.find((s) => s.type === 'channel.raid').condition, { to_broadcaster_user_id: '4242' }); assert.equal(follow.transport.session_id, 'sess1');
  const auth = JSON.parse(fs.readFileSync(path.join(data, 'twitch-auth.json'), 'utf8')); assert.equal(auth.refresh, 'RT1');

  notify('channel.channel_points_custom_reward_redemption.add', { user_name: 'Viewer1', user_input: '', reward: { title: 'Bonk', cost: 500 } });
  await until(() => avatar.msgs.some((m) => m.type === 'throw' && m.item === 'bonk'));
  await until(() => control.msgs.some((m) => m.type === 'streamEvent' && m.event.when === 'redeem' && m.event.user === 'Viewer1' && m.fired.length === 1));
  notify('channel.raid', { from_broadcaster_user_name: 'BigStreamer', viewers: 120 });
  await until(() => avatar.msgs.some((m) => m.type === 'gesture' && m.name === 'wave'));
  notify('channel.subscribe', { user_name: 'Giftee', is_gift: true, tier: '1000' });      // counted by the gift event, not twice
  notify('channel.subscription.gift', { user_name: null, is_anonymous: true, total: 5, tier: '1000' });
  await until(() => control.msgs.some((m) => m.type === 'streamEvent' && m.event.when === 'gift' && m.event.amount === 5 && m.event.user === 'Anonymous'));
  assert.equal(control.msgs.filter((m) => m.type === 'streamEvent' && m.event.when === 'sub').length, 0, 'gifted subs are not counted as new subs');

  // Twitch moves us to another server: connect there, keep the subscriptions, do not subscribe again
  const before = fake.subs.length;
  fake.sockets.at(-1).send(JSON.stringify({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: `ws://127.0.0.1:${FAKE + 1}/ws?moved=1` } } }));
  await until(() => fake.sockets.length === 2); await wait(400);
  assert.equal(fake.subs.length, before, 'no new subscriptions after a reconnect'); assert.equal((await api('/api/twitch/status')).j.state, 'live');
  notify('channel.follow', { user_name: 'NewFriend' }); await until(() => avatar.msgs.some((m) => m.type === 'throw' && m.item === 'heart'));

  // the access token expires: the next API call refreshes it once and carries on
  fake.expireNext = true; fake.sockets.at(-1).close(); await until(() => fake.sockets.length === 3, 12000);
  await until(async () => (await api('/api/twitch/status')).j.state === 'live', 12000);
  assert.ok(fake.refreshes >= 1, 'token refreshed'); assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'twitch-auth.json'), 'utf8')).refresh, `RT${fake.refreshes + 1}`);

  const out = (await api('/api/twitch/disconnect', { method: 'POST' })).j; assert.equal(out.state, 'off'); assert.equal(out.login, null);
  assert.ok(!fs.existsSync(path.join(data, 'twitch-auth.json')), 'sign-in removed from disk');
  avatar.ws.close(); control.ws.close();
});
