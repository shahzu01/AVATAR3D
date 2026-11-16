// Studio · Interact: Twitch sign-in for channel events, and the rule editor ("when this happens, do that").
import { POSE_LIST } from '/props.js';
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const log = (t) => { const el = $('log'); if (!el) return; el.innerHTML = `${new Date().toLocaleTimeString()}  ${esc(t)}<br>` + el.innerHTML.slice(0, 6000); };
const api = async (url, opts = {}) => { const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; };

let meta = null, rules = [], tv = null, propList = [];
const PROP_NAMES = { 'builtin:mic': 'Microphone', 'builtin:mug': 'Coffee mug', 'builtin:lightstick': 'Lightstick', 'builtin:plush': 'Plushie', 'builtin:sign': '"Thank you!" sign', 'builtin:crown': 'Crown' };
const propLabel = (p) => p.name || PROP_NAMES[p.src] || p.id;
const WHEN_ICON = { redeem: '🎁', bits: '💎', sub: '⭐', resub: '🔁', gift: '🎉', follow: '💜', raid: '🚀', command: '💬' };
const TOPIC_NAME = { 'channel.channel_points_custom_reward_redemption.add': 'Redeems', 'channel.cheer': 'Bits', 'channel.subscribe': 'Subs', 'channel.subscription.gift': 'Gift subs', 'channel.subscription.message': 'Resubs', 'channel.follow': 'Follows', 'channel.raid': 'Raids' };

// ---------------------------------------------------------------- Twitch sign-in
function renderTwitch() {
  const s = tv || { state: 'off' }, box = $('tvBox');
  if (s.state === 'signing-in' && s.pending) {
    box.innerHTML = `<div class="tv"><b>Approve Kael Studio on Twitch</b><ol><li>Open <a href="${esc(s.pending.verificationUri)}" target="_blank" rel="noopener">twitch.tv/activate</a></li><li>Enter this code:</li></ol><div class="big">${esc(s.pending.userCode)}</div><div class="muted">Waiting… this page updates by itself. <button class="ghost x" id="tvCancel">Cancel</button></div></div>`;
    $('tvCancel').onclick = () => api('/api/twitch/disconnect', { method: 'POST' }).then(setTv); return;
  }
  if (s.login) {
    const topics = Object.entries(s.topics || {}).map(([k, v]) => `<span class="${v === 'on' ? 'on' : ''}" title="${esc(v)}">${TOPIC_NAME[k] || k}${v === 'on' ? '' : ' ✕'}</span>`).join('');
    const last = s.lastEvent ? `<div class="muted" style="margin-top:6px">Last: ${WHEN_ICON[s.lastEvent.when] || ''} ${esc(s.lastEvent.when)} from ${esc(s.lastEvent.user || 'someone')}</div>` : '';
    box.innerHTML = `<div class="tv"><div style="display:flex;gap:8px;align-items:center"><span class="chip ${s.state === 'live' ? 'on' : ''}">${s.state === 'live' ? 'live' : esc(s.state)}</span><b style="flex:1">${esc(s.login)}</b><button class="ghost x" id="tvOut">Sign out</button></div>
      <div class="muted" style="margin-top:4px">${esc(s.detail || '')}</div><div class="topics">${topics}</div>${last}
      <div class="muted" style="margin-top:6px;font-size:11.5px">✕ = Twitch did not allow it for this channel (bits and subs need Affiliate or Partner).</div></div>`;
    $('tvOut').onclick = () => api('/api/twitch/disconnect', { method: 'POST' }).then(setTv); return;
  }
  box.innerHTML = `<div class="tv"><ol>
      <li>Open the <a href="https://dev.twitch.tv/console/apps/create" target="_blank" rel="noopener">Twitch developer console</a> and register an application: any name, OAuth Redirect URL <code>http://localhost</code>, category <i>Broadcaster Suite</i>, client type <b>Public</b>.</li>
      <li>Copy its <b>Client ID</b> here and press Connect. (Once only: Kael Studio remembers it.)</li></ol>
    <div style="display:flex;gap:6px;margin-top:6px"><input type="text" id="tvClient" placeholder="Client ID" style="flex:1" value="${esc(s.clientId || '')}"><button class="primary" id="tvGo">Connect</button></div>
    ${s.detail ? `<div class="muted" style="margin-top:6px">${esc(s.detail)}</div>` : ''}</div>`;
  $('tvGo').onclick = async () => { try { setTv(await api('/api/twitch/connect', { method: 'POST', body: JSON.stringify({ clientId: $('tvClient').value }) })); } catch (e) { tv = { ...(tv || {}), detail: e.message }; renderTwitch(); } };
}
function setTv(s) { tv = s; renderTwitch(); }

// ---------------------------------------------------------------- rules
const opts = (list, cur, label = (v) => v) => list.map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label(v))}</option>`).join('');
function actionRow(a, ri, ai) {
  const kind = `<select data-a="act" data-r="${ri}" data-i="${ai}">${opts(Object.keys(meta.acts), a.act, (k) => meta.acts[k])}</select>`;
  let rest = '';
  if (a.act === 'throw') rest = `<select data-a="item" data-r="${ri}" data-i="${ai}">${opts(meta.items, a.item)}</select> ×<input type="number" min="1" max="30" value="${a.count}" data-a="count" data-r="${ri}" data-i="${ai}">`
    + (['bits', 'gift', 'raid'].includes(rules[ri].when) ? ` <label class="muted" style="font-size:11.5px"><input type="checkbox" data-a="perOn" data-r="${ri}" data-i="${ai}" ${a.per ? 'checked' : ''}> per</label>${a.per ? `<input type="number" min="1" value="${a.per}" data-a="per" data-r="${ri}" data-i="${ai}"><span class="muted" style="font-size:11.5px">${rules[ri].when === 'bits' ? 'bits' : rules[ri].when === 'gift' ? 'gifts' : 'raiders'}</span>` : ''}` : '');
  else if (a.act === 'expression') rest = `<select data-a="name" data-r="${ri}" data-i="${ai}">${opts(meta.expressions, a.name)}</select> for <input type="number" min="0.5" max="20" step="0.5" value="${a.seconds}" data-a="seconds" data-r="${ri}" data-i="${ai}"> s`;
  else if (a.act === 'camera') rest = `<select data-a="framing" data-r="${ri}" data-i="${ai}">${Object.entries({ head: 'Close-up (head)', bust: 'Bust', half: 'Half body', full: 'Full body' }).map(([k, l]) => `<option value="${k}" ${k === a.framing ? 'selected' : ''}>${l}</option>`).join('')}</select> for <input type="number" min="1" max="120" value="${a.seconds}" data-a="seconds" data-r="${ri}" data-i="${ai}"> s`;
  else if (a.act === 'pose') rest = `<select data-a="name" data-r="${ri}" data-i="${ai}">${POSE_LIST.map(([k, l]) => `<option value="${k}" ${k === a.name ? 'selected' : ''}>${l}</option>`).join('')}</select> for <input type="number" min="1" max="600" value="${a.seconds}" data-a="seconds" data-r="${ri}" data-i="${ai}"> s`;
  else if (a.act === 'prop') rest = propList.length ? `<select data-a="id" data-r="${ri}" data-i="${ai}">${propList.map((p) => `<option value="${esc(p.id)}" ${p.id === a.id ? 'selected' : ''}>${esc(propLabel(p))}</option>`).join('')}</select> for <input type="number" min="1" max="600" value="${a.seconds}" data-a="seconds" data-r="${ri}" data-i="${ai}"> s` : '<span class="muted" style="font-size:12px">Add a prop in Look first</span>';
  else if (a.act === 'gesture') rest = `<select data-a="name" data-r="${ri}" data-i="${ai}">${opts(meta.gestures, a.name)}</select>`;
  else rest = `<select data-a="preset" data-r="${ri}" data-i="${ai}">${opts(meta.presets, a.preset)}</select>`;
  return `<div class="act">${kind}${rest}<span style="flex:1"></span><button class="ghost x" data-del-act="${ai}" data-r="${ri}" title="Remove this action">✕</button></div>`;
}
function renderRules() {
  $('rulesBox').innerHTML = rules.map((r, ri) => { const W = meta.when[r.when];
    return `<div class="rule ${r.on ? '' : 'off'}">
      <div class="row"><input type="checkbox" data-f="on" data-r="${ri}" ${r.on ? 'checked' : ''} title="On / off"><span class="k">When</span>
        <select data-f="when" data-r="${ri}">${opts(Object.keys(meta.when), r.when, (k) => `${WHEN_ICON[k]} ${meta.when[k].label}`)}</select></div>
      ${W.match ? `<div class="row"><input type="text" data-f="match" data-r="${ri}" value="${esc(r.match)}" placeholder="${esc(W.match)}" style="flex:1" title="${esc(W.match)}"></div>` : ''}
      ${W.min ? `<div class="row"><span class="muted" style="font-size:12px">${esc(W.min)}</span><input type="number" min="0" data-f="min" data-r="${ri}" value="${r.min}"></div>` : ''}
      <div class="row"><span class="k">Do</span></div>
      <div class="row">${r.do.map((a, ai) => actionRow(a, ri, ai)).join('') || '<span class="muted" style="font-size:12px">Nothing yet: add an action.</span>'}</div>
      <div class="foot"><button class="ghost x" data-add-act="${ri}">＋ Action</button><span class="muted" style="font-size:11.5px">wait</span><input type="number" min="0" max="3600" data-f="cooldown" data-r="${ri}" value="${r.cooldown}" title="Seconds before this rule can fire again"><span class="muted" style="font-size:11.5px">s</span>
        <span class="grow"></span><button class="x" data-test="${ri}" title="Pretend this just happened on stream">▶ Test</button><button class="ghost x" data-del="${ri}" title="Delete this rule">🗑</button></div></div>`; }).join('');
}
let saveT = null;
// saves quietly in the background; the reply is not copied back, so an edit made while a save is on its way is never lost
function save() { clearTimeout(saveT); saveT = setTimeout(async () => { try { await api('/api/triggers', { method: 'PUT', body: JSON.stringify({ rules }) }); } catch (e) { log(`rules not saved: ${e.message}`); } }, 350); }
const DEF_ACT = { throw: { act: 'throw', item: 'heart', count: 3 }, expression: { act: 'expression', name: 'Joy', seconds: 2.5 }, gesture: { act: 'gesture', name: 'wave' }, light: { act: 'light', preset: 'cute' }, pose: { act: 'pose', name: 'hips', seconds: 8 }, camera: { act: 'camera', framing: 'head', seconds: 5 }, get prop() { return { act: 'prop', id: propList[0]?.id || '', seconds: 8 }; } };
document.addEventListener('change', (e) => {
  const t = e.target, ri = +t.dataset.r; if (Number.isNaN(ri) || !rules[ri]) return;
  const r = rules[ri];
  if (t.dataset.f) { const f = t.dataset.f; r[f] = f === 'on' ? t.checked : ['min', 'cooldown'].includes(f) ? Number(t.value) || 0 : t.value; if (f === 'when' || f === 'on') renderRules(); save(); return; }
  if (t.dataset.a) { const a = r.do[+t.dataset.i], k = t.dataset.a;
    if (k === 'act') r.do[+t.dataset.i] = { ...DEF_ACT[t.value] };
    else if (k === 'perOn') { if (t.checked) a.per = r.when === 'bits' ? 100 : 1; else delete a.per; }
    else a[k] = ['count', 'seconds', 'per'].includes(k) ? Number(t.value) || 0 : t.value;
    if (k === 'act' || k === 'perOn') renderRules(); save(); }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b || !$('rulesBox').contains(b) && !['ruleAdd', 'ruleReset'].includes(b.id)) return;
  if (b.id === 'ruleAdd') { rules.push({ id: `r_${Date.now().toString(36)}`, on: true, when: 'redeem', match: '', min: 0, cooldown: 0, do: [{ ...DEF_ACT.throw }] }); renderRules(); save(); return; }
  if (b.id === 'ruleReset') { if (!confirmReset()) return; rules = (await api('/api/triggers/reset', { method: 'POST' })).rules; renderRules(); return; }
  const ri = +b.dataset.r;
  if (b.dataset.addAct !== undefined) { rules[+b.dataset.addAct].do.push({ ...DEF_ACT.expression }); renderRules(); save(); }
  else if (b.dataset.delAct !== undefined) { rules[ri].do.splice(+b.dataset.delAct, 1); renderRules(); save(); }
  else if (b.dataset.del !== undefined) { rules.splice(+b.dataset.del, 1); renderRules(); save(); }
  else if (b.dataset.test !== undefined) {
    const r = rules[+b.dataset.test]; clearTimeout(saveT); await api('/api/triggers', { method: 'PUT', body: JSON.stringify({ rules }) });
    const amount = { bits: Math.max(r.min, 500), gift: Math.max(r.min, 5), raid: Math.max(r.min, 25), resub: Math.max(r.min, 6) }[r.when] || 0;
    const { fired } = await api('/api/triggers/test', { method: 'POST', body: JSON.stringify({ when: r.when, name: r.match, amount, user: 'Test viewer' }) });
    b.textContent = fired.length ? '✓ Sent' : 'Nothing fired'; setTimeout(() => { b.textContent = '▶ Test'; }, 1600);
  }
});
let resetArmed = 0;
function confirmReset() { const now = Date.now(); if (now - resetArmed < 3000) return true; resetArmed = now; $('ruleReset').textContent = 'Press again to reset'; setTimeout(() => { $('ruleReset').textContent = 'Reset to starter rules'; }, 3000); return false; }      // no browser pop-ups

// ---------------------------------------------------------------- live updates
const ws = new WebSocket(`ws://${location.host}/ws?role=control`);
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.type === 'twitchEvents') setTv(m.status);
  else if (m.type === 'settings') { const had = JSON.stringify(propList.map((p) => [p.id, p.name, p.src])); propList = m.settings.props || []; if (had !== JSON.stringify(propList.map((p) => [p.id, p.name, p.src])) && rules.some((r) => r.do.some((a) => a.act === 'prop'))) renderRules(); }
  else if (m.type === 'streamEvent') { const ev = m.event; log(`${WHEN_ICON[ev.when] || ''} ${ev.source === 'test' ? 'test ' : ''}${ev.when}${ev.name ? ` "${ev.name}"` : ''}${ev.amount ? ` ×${ev.amount}` : ''} from ${ev.user || 'someone'} → ${m.fired.length ? m.fired.map((f) => f.did.join(', ')).join(' | ') : 'no rule matched'}`); }
};
propList = (await api('/api/settings')).props || [];
meta = await api('/api/triggers'); rules = meta.rules; renderRules();
setTv(await api('/api/twitch/status'));
