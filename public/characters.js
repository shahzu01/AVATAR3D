// Characters home: your characters (made here or imported), Create New, and the sample models. Laid out like VRoid Studio's
// start screen. Details, import and file tools still live on the library page (/library.html), linked from each card's menu.
import { topbar, toast } from '/ui.js';
import { READY } from '/readymade.js';
import { allJobs, makeMissing, thumbUrl } from '/thumbmaker.js';

topbar('characters');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const api = async (p, o = {}) => { const r = await fetch(p, { headers: { 'Content-Type': 'application/json' }, ...o }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
const isMixed = (a) => a.format?.type === 'Kael Studio mixed character', isMade = (a) => a.sourceType === 'created';
const editUrl = (a) => `${isMixed(a) ? '/mixer.html' : '/creator.html'}?id=${a.id}`;
const openUrl = (a) => (isMade(a) ? editUrl(a) : `/library.html#a=${a.id}`);
let lib = { avatars: [], activeId: null };

async function load() {
  try { lib = await api('/api/library'); } catch (e) { toast?.(e.message); }
  const cards = [...lib.avatars].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')).map((a) => `
    <div class="card" data-open="${a.id}">
      ${a.id === lib.activeId ? '<span class="live">On stream</span>' : ''}
      <div class="pic">${a.thumbnail ? `<img src="/api/library/${a.id}/thumb?v=${encodeURIComponent(a.updatedAt || '')}" alt="" loading="lazy">` : '<span class="ph">☺</span>'}</div>
      <div class="row"><span class="nm" title="${esc(a.name)}">${esc(a.name)}</span><button class="more" data-menu="${a.id}" title="More">⋯</button></div>
      <div class="sub">${isMixed(a) ? 'Made in Kael Studio' : isMade(a) ? 'Made in the old Animal Maker' : a.format?.type === 'glTF' ? '3D model (not trackable)' : `Imported ${esc(a.format?.type || '')}`}</div>
    </div>`).join('');
  $('mine').innerHTML = $('createCard').outerHTML + cards;
}
const sampleCards = (group) => READY.filter((r) => r.group === group).map((r) => `<a class="card" href="/mixer.html?ready=${r.key}"><div class="pic"><img src="/readymade/${r.key}.png" alt="" loading="lazy"></div><div class="row"><span class="nm">${esc(r.label)}</span></div></a>`).join('');
// Premium skins: only on this computer (the server lists premium/); the row stays hidden when there are none.
fetch('/api/premium').then((r) => r.json()).then(({ skins = [] }) => {
  if (!skins.length) return;
  $('premium').innerHTML = skins.map((k) => `<div class="card prem" data-prem="${esc(k.id)}" title="Stream ${esc(k.name)}"><div class="pic" style="background:${esc(k.accent)}22">${k.cardUrl ? `<img src="${esc(k.cardUrl)}" alt="" loading="lazy">` : ''}<span class="badge">PREMIUM</span></div>
    <div class="row"><span class="nm">${esc(k.name)}${k.tagline ? `<span class="tag">${esc(k.tagline)}</span>` : ''}</span></div></div>`).join('');
  $('premiumSec').hidden = false;
  $('premium').addEventListener('click', async (e) => {
    const c = e.target.closest('[data-prem]'); if (!c || c.classList.contains('busy')) return; c.classList.add('busy');
    const r = await fetch(`/api/premium/${c.dataset.prem}/use`, { method: 'POST' }).then((x) => x.json()).catch((er) => ({ error: er.message }));
    c.classList.remove('busy'); if (r.error) { alert(r.error); return; }
    location.href = '/tracker.html';
  });
}).catch(() => {});
$('samples').innerHTML = sampleCards('stream'); $('samplesAnimal').innerHTML = sampleCards('animal');

function closeMenu() { document.querySelector('.menu')?.remove(); }
function menu(a, at) {
  closeMenu(); const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = `${isMade(a) ? `<a href="${editUrl(a)}">Edit</a>` : ''}
    ${a.id === lib.activeId ? '' : '<button data-act="activate">Put on stream</button>'}
    <a href="/library.html#a=${a.id}">Details, presentation and files</a>
    <button data-act="rename">Rename</button><button data-act="duplicate">Duplicate</button>
    <button data-act="delete" class="danger">Delete…</button>`;
  document.body.append(m); const r = at.getBoundingClientRect(); m.style.left = `${Math.min(innerWidth - 210, r.left - 150)}px`; m.style.top = `${Math.min(innerHeight - m.offsetHeight - 10, r.bottom + 4)}px`;
  m.addEventListener('click', async (e) => { const act = e.target.dataset.act; if (!act) return; closeMenu();
    try {
      if (act === 'activate') { await api(`/api/library/${a.id}/activate`, { method: 'POST' }); toast?.(`${a.name} is on stream`); }
      if (act === 'rename') { const n = prompt('New name', a.name); if (!n?.trim()) return; await api(`/api/library/${a.id}`, { method: 'PATCH', body: JSON.stringify({ name: n.trim() }) }); }
      if (act === 'duplicate') await api(`/api/library/${a.id}/duplicate`, { method: 'POST' });
      if (act === 'delete') { if (!confirm(`Delete “${a.name}”? It moves to the library's trash folder, so it can be recovered.`)) return; await api(`/api/library/${a.id}`, { method: 'DELETE' }); }
      load();
    } catch (err) { toast?.(err.message); } });
}
document.addEventListener('click', (e) => {
  const mb = e.target.closest('[data-menu]'); if (mb) { e.stopPropagation(); menu(lib.avatars.find((a) => a.id === mb.dataset.menu), mb); return; }
  if (!e.target.closest('.menu')) closeMenu();
  const c = e.target.closest('[data-open]'); if (c) { location.href = openUrl(lib.avatars.find((a) => a.id === c.dataset.open)); return; }
  if (e.target.closest('#createCard') || e.target.closest('#newBtn')) $('baseModal').classList.remove('hidden');
  if (e.target.id === 'closeModal' || e.target.id === 'baseModal') $('baseModal').classList.add('hidden');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('baseModal').classList.add('hidden'); closeMenu(); } });
if (location.hash === '#new') $('baseModal').classList.remove('hidden');
load();
for (const img of document.querySelectorAll('[data-base]')) img.src = thumbUrl('base', img.dataset.base);
allJobs(['base']).then((j) => makeMissing(j, (cat, key, url) => { for (const img of document.querySelectorAll(`[data-base="${key}"]`)) img.src = url; }));
