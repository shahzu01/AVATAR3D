// Twitch channel events (channel-point redeems, bits, subs, gift subs, resubs, follows, raids) through Twitch EventSub.
//
// Sign-in uses Twitch's Device Code flow, made for apps like this one that run on your own computer: no password or
// secret is ever typed into Kael Studio. You make a free Twitch "application" once (dev.twitch.tv/console, client type
// Public) and paste its Client ID; Kael Studio then shows a short code to enter at twitch.tv/activate.
// The sign-in (access + refresh token) is stored in twitch-auth.json next to settings.json, never sent to the pages.
// Base URLs can be overridden (TWITCH_ID_BASE, TWITCH_API_BASE, TWITCH_EVENTSUB_URL) so the tests can use a fake Twitch.
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

const ID = process.env.TWITCH_ID_BASE || 'https://id.twitch.tv';
const API = process.env.TWITCH_API_BASE || 'https://api.twitch.tv';
const WS_URL = process.env.TWITCH_EVENTSUB_URL || 'wss://eventsub.wss.twitch.tv/ws';
export const SCOPES = ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions', 'moderator:read:followers'];
// EventSub subscription -> our event. Conditions are filled with the signed-in channel's user id.
const TOPICS = [
  { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', cond: (u) => ({ broadcaster_user_id: u }), map: (e) => ({ when: 'redeem', name: e.reward?.title, user: e.user_name, text: e.user_input, amount: e.reward?.cost }) },
  { type: 'channel.cheer', version: '1', cond: (u) => ({ broadcaster_user_id: u }), map: (e) => ({ when: 'bits', amount: e.bits, user: e.is_anonymous ? 'Anonymous' : e.user_name, text: e.message }) },
  { type: 'channel.subscribe', version: '1', cond: (u) => ({ broadcaster_user_id: u }), map: (e) => (e.is_gift ? null : { when: 'sub', user: e.user_name, amount: 1, name: e.tier }) },      // gifted ones are counted by channel.subscription.gift
  { type: 'channel.subscription.gift', version: '1', cond: (u) => ({ broadcaster_user_id: u }), map: (e) => ({ when: 'gift', amount: e.total, user: e.is_anonymous ? 'Anonymous' : e.user_name, name: e.tier }) },
  { type: 'channel.subscription.message', version: '1', cond: (u) => ({ broadcaster_user_id: u }), map: (e) => ({ when: 'resub', amount: e.cumulative_months, user: e.user_name, text: e.message?.text }) },
  { type: 'channel.follow', version: '2', cond: (u) => ({ broadcaster_user_id: u, moderator_user_id: u }), map: (e) => ({ when: 'follow', user: e.user_name }) },
  { type: 'channel.raid', version: '1', cond: (u) => ({ to_broadcaster_user_id: u }), map: (e) => ({ when: 'raid', amount: e.viewers, user: e.from_broadcaster_user_name }) },
];
const form = (o) => new URLSearchParams(o).toString();

export class TwitchEvents {
  constructor({ dataDir, onEvent, log = console.log, onStatus = () => {} }) {
    this.file = path.join(dataDir, 'twitch-auth.json'); this.onEvent = onEvent; this.log = log; this.onStatus = onStatus;
    this.auth = null; this.state = 'off'; this.detail = ''; this.topics = {}; this.pending = null; this.ws = null; this.lastEvent = null;
    try { this.auth = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    if (this.auth?.refresh) this.connect().catch((e) => this.set('error', e.message));
  }
  set(state, detail = '') { this.state = state; this.detail = detail; this.onStatus(this.status()); }
  status() {
    return { state: this.state, detail: this.detail, login: this.auth?.login || null, clientId: this.auth?.clientId || this.pending?.clientId || null, topics: this.topics, lastEvent: this.lastEvent,
      pending: this.pending ? { userCode: this.pending.userCode, verificationUri: this.pending.verificationUri, expiresAt: this.pending.expiresAt } : null };
  }
  save() { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.auth, null, 2), { mode: 0o600 }); fs.renameSync(tmp, this.file); }

  // ---- sign-in (Device Code flow)
  async startSignIn(clientId) {
    clientId = String(clientId || '').trim(); if (!/^[a-z0-9]{20,40}$/i.test(clientId)) throw new Error('That does not look like a Twitch Client ID.');
    this.stop(); clearTimeout(this.pollTimer);
    const r = await fetch(`${ID}/oauth2/device`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: clientId, scopes: SCOPES.join(' ') }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.device_code) throw new Error(j.message ? `Twitch said: ${j.message}` : 'Twitch did not accept that Client ID (is the application set to "Public"?)');
    this.pending = { clientId, deviceCode: j.device_code, userCode: j.user_code, verificationUri: j.verification_uri, interval: Math.max(1, j.interval || 5), expiresAt: Date.now() + (j.expires_in || 1800) * 1000 };
    this.set('signing-in', 'Waiting for you to approve Kael Studio on Twitch');
    const poll = async () => {
      const p = this.pending; if (!p) return;
      if (Date.now() > p.expiresAt) { this.pending = null; return this.set('off', 'The sign-in code expired. Press Connect again.'); }
      try {
        const t = await fetch(`${ID}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: p.clientId, scopes: SCOPES.join(' '), device_code: p.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) });
        const tj = await t.json().catch(() => ({}));
        if (t.ok && tj.access_token) { this.pending = null; this.auth = { clientId: p.clientId, access: tj.access_token, refresh: tj.refresh_token, scopes: tj.scope || SCOPES }; await this.whoAmI(); this.save(); this.log(`Twitch: signed in as ${this.auth.login}`); return this.connect(); }
        if (/pending|slow_down/i.test(tj.message || '')) { this.pollTimer = setTimeout(poll, p.interval * 1000 * (/slow/i.test(tj.message) ? 2 : 1)); return; }
        this.pending = null; this.set('off', `Sign-in did not finish (${tj.message || t.status}). Press Connect again.`);
      } catch (e) { this.pollTimer = setTimeout(poll, p.interval * 1000); }
    };
    this.pollTimer = setTimeout(poll, this.pending.interval * 1000);
    return this.status();
  }
  async refresh() {
    const r = await fetch(`${ID}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: this.auth.clientId, grant_type: 'refresh_token', refresh_token: this.auth.refresh }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) { this.auth.refresh = null; this.save(); throw new Error('Twitch sign-in expired. Press Connect to sign in again.'); }
    this.auth.access = j.access_token; this.auth.refresh = j.refresh_token || this.auth.refresh; this.save();
  }
  async api(method, url, body, retry = true) {
    const r = await fetch(`${API}${url}`, { method, headers: { Authorization: `Bearer ${this.auth.access}`, 'Client-Id': this.auth.clientId, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && retry) { await this.refresh(); return this.api(method, url, body, false); }
    const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j };
  }
  async whoAmI() { const { ok, j } = await this.api('GET', '/helix/users'); if (!ok || !j.data?.[0]) throw new Error('Could not read your Twitch account.'); Object.assign(this.auth, { userId: j.data[0].id, login: j.data[0].display_name || j.data[0].login }); }

  // ---- live events (EventSub over WebSocket)
  async connect(url = WS_URL, reconnecting = false) {
    if (!this.auth?.refresh && !this.auth?.access) return;
    if (!this.auth.userId) await this.whoAmI();
    this.set('connecting', `Connecting to Twitch as ${this.auth.login}`);
    const ws = new WebSocket(url); const old = this.ws; this.ws = ws; let welcomed = false;
    ws.on('message', async (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      const type = m.metadata?.message_type; this.alive(m.payload?.session?.keepalive_timeout_seconds);
      if (type === 'session_welcome') {
        welcomed = true; if (old && old !== ws) { try { old.close(); } catch {} }
        if (reconnecting) return this.set('live', `Live as ${this.auth.login}`);      // Twitch moved us to a new server: the subscriptions came along
        await this.subscribe(m.payload.session.id);
      } else if (type === 'session_reconnect') this.connect(m.payload.session.reconnect_url, true).catch((e) => this.set('error', e.message));
      else if (type === 'notification') {
        const topic = TOPICS.find((t) => t.type === m.metadata.subscription_type), ev = topic?.map(m.payload.event || {});
        if (ev) { this.lastEvent = { ...ev, at: Date.now() }; this.onEvent(ev); }
      } else if (type === 'revocation') { this.topics[m.payload.subscription.type] = `stopped (${m.payload.subscription.status})`; this.onStatus(this.status()); }
    });
    ws.on('close', (code) => { if (this.ws !== ws || this.stopped) return; void welcomed; clearTimeout(this.aliveTimer); this.set('connecting', `Connection lost (${code}); reconnecting`); this.retry(); });
    ws.on('error', () => {});
    this.stopped = false;
  }
  alive(sec) { clearTimeout(this.aliveTimer); if (sec) this.keepalive = sec; const ms = ((this.keepalive || 10) + 5) * 1000; this.aliveTimer = setTimeout(() => { if (this.ws) { try { this.ws.terminate(); } catch {} } }, ms); }
  retry() { clearTimeout(this.retryTimer); this.retryTimer = setTimeout(() => this.connect().catch((e) => { this.set('error', e.message); this.retry(); }), 5000); }
  async subscribe(sessionId) {
    this.topics = {}; let okCount = 0;
    for (const t of TOPICS) {
      const { ok, status, j } = await this.api('POST', '/helix/eventsub/subscriptions', { type: t.type, version: t.version, condition: t.cond(this.auth.userId), transport: { method: 'websocket', session_id: sessionId } }).catch((e) => ({ ok: false, j: { message: e.message } }));
      this.topics[t.type] = ok ? 'on' : (status === 403 ? 'not available for this channel' : `off (${j?.message || status})`); if (ok) okCount++;
    }
    this.topicsDone = true;
    this.set(okCount ? 'live' : 'error', okCount ? `Live as ${this.auth.login}` : 'Twitch accepted none of the event types. Check the sign-in.');
  }
  stop() { this.stopped = true; clearTimeout(this.aliveTimer); clearTimeout(this.retryTimer); if (this.ws) { try { this.ws.close(); } catch {} } this.ws = null; }
  disconnect() { this.stop(); clearTimeout(this.pollTimer); this.pending = null; this.auth = null; this.topics = {}; try { fs.rmSync(this.file, { force: true }); } catch {} this.set('off', 'Signed out of Twitch'); }
}
