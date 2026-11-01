// Kael Studio shared UI: icon set and the top bar used by every page.
const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICON = {
  mark: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16"/><path d="M17 4l-7 8 7 8"/><path d="M13.5 8.2l3.2-1.8" stroke-width="1.6"/></svg>`,
  studio: S('<rect x="3" y="5" width="14" height="12" rx="2.5"/><path d="M17 9.5l4-2.3v9.6l-4-2.3"/><circle cx="10" cy="11" r="2.4"/>'),
  library: S('<rect x="3" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3" y="13" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5v6.5M14 16.75h6.5"/>'),
  creator: S('<path d="M4 20l4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M13.5 7.5l3 3"/><path d="M18 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>'),
  start: S('<path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z"/>'),
  body: S('<circle cx="12" cy="4.8" r="2.2"/><path d="M5 8.5l7 1.3 7-1.3"/><path d="M12 9.8v5.2l-3 6M12 15l3 6"/>'),
  face: S('<path d="M12 3.5c4.4 0 7.5 3.2 7.5 8s-3.4 9-7.5 9-7.5-4.2-7.5-9 3.1-8 7.5-8z"/><path d="M9 11.5h.01M15 11.5h.01" stroke-width="2.6"/><path d="M9.5 15.5c1.4 1.1 3.6 1.1 5 0"/>'),
  eye: S('<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  fur: S('<circle cx="8.5" cy="8" r="2.6"/><circle cx="15.5" cy="8" r="2.6"/><circle cx="5.2" cy="13.2" r="2.2"/><circle cx="18.8" cy="13.2" r="2.2"/><path d="M12 12.5c2.8 0 4.8 2.3 4.8 4.4 0 1.9-1.6 2.8-4.8 2.8s-4.8-.9-4.8-2.8c0-2.1 2-4.4 4.8-4.4z"/>'),
  ears: S('<path d="M4 20V5l6 5"/><path d="M20 20V5l-6 5"/><path d="M7 20c0-3 2.2-5 5-5s5 2 5 5"/>'),
  hair: S('<path d="M5 16c-1-6 2.5-11.5 7-11.5S20 10 19 16"/><path d="M5 16c1.5-3.5 3.5-5.5 6-6.5 1 2 4 3.5 8 6.5"/><path d="M8.5 20l-1-4M15.5 20l1-4"/>'),
  outfit: S('<path d="M8.5 3.5L4 6.5l1.8 4 2.2-1v11h8v-11l2.2 1 1.8-4-4.5-3c-.6 1.6-1.9 2.6-3.5 2.6S9.1 5.1 8.5 3.5z"/>'),
  extras: S('<path d="M3.5 13.5a8.5 8.5 0 0 1 17 0"/><rect x="2.5" y="13" width="4" height="6.5" rx="1.5"/><rect x="17.5" y="13" width="4" height="6.5" rx="1.5"/>'),
  test: S('<path d="M5 4.5v15l14-7.5z"/>'),
  undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: S('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  reset: S('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  save: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  dice: S('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="15.5" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="15.5" cy="8.5" r=".9" fill="currentColor"/><circle cx="8.5" cy="15.5" r=".9" fill="currentColor"/>'),
  full: S('<circle cx="12" cy="4.5" r="2"/><path d="M12 7v8M8 10h8M12 15l-3 6M12 15l3 6"/>'),
  upper: S('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-4 3.3-6.5 7-6.5s6.5 2.5 7 6.5"/>'),
  faceCam: S('<circle cx="12" cy="11" r="6.5"/><path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M17 3h2.5A1.5 1.5 0 0 1 21 4.5V7M21 17v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 21H4.5A1.5 1.5 0 0 1 3 19.5V17"/>'),
  rotate: S('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  import: S('<path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>'),
  panel: S('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>'),
  panelR: S('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>'),
  camera: S('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  phone: S('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  look: S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  spark: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  log: S('<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>'),
  info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01" stroke-width="2.2"/>'),
  trash: S('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  edit: S('<path d="M4 20l4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/>'),
  copy: S('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  download: S('<path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>'),
  star: S('<path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z"/>'),
  live: S('<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>'),
};

/** Render the shared top bar into #topbar. page: 'studio' | 'library' | 'creator'. tools: extra HTML for the right side. */
export function topbar(page, { tools = '' } = {}) {
  const el = document.getElementById('topbar');
  if (!el) return;
  el.className = 'topbar';
  el.innerHTML = `
    <a class="brand" href="/tracker.html" title="Kael Studio"><span class="mark">${ICON.mark}</span><span><b>Kael</b> Studio</span></a>
    <nav class="nav">
      <a href="/tracker.html" class="${page === 'studio' ? 'on' : ''}">${ICON.studio}<span>Studio</span></a>
      <a href="/library.html" class="${page === 'library' ? 'on' : ''}">${ICON.library}<span>Library</span></a>
      <a href="/creator.html" class="${page === 'creator' ? 'on' : ''}">${ICON.creator}<span>Creator</span></a>
    </nav>
    <div class="spacer"></div>
    <div class="tools">${tools}</div>
    <a class="activechip" href="/library.html" id="tbActive" title="Your active avatar (what OBS shows)"><span class="ph"></span><span class="t"><small>On stream</small><span>…</span></span><span class="livedot" id="tbLive" title="OBS connected"></span></a>`;
  refreshActive();
  setInterval(refreshActive, 4000);
}
let lastKey = '';
async function refreshActive() {
  try {
    const [st, lib] = await Promise.all([fetch('/api/status').then((r) => r.json()), fetch('/api/library').then((r) => r.json())]);
    const a = lib.avatars.find((x) => x.id === lib.activeId);
    const obs = Math.max(0, (st.avatars || 0) - (document.querySelector('iframe[src*="avatar.html"]') ? 1 : 0));
    const key = `${a?.id}|${a?.thumbUrl}|${a?.name}|${obs}`;
    if (key === lastKey) return; lastKey = key;
    const chip = document.getElementById('tbActive'); if (!chip) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    chip.querySelector('.ph, img')?.replaceWith(Object.assign(document.createElement(a?.thumbUrl ? 'img' : 'span'), a?.thumbUrl ? { src: a.thumbUrl, alt: '' } : { className: 'ph' }));
    chip.querySelector('.t span').textContent = a ? a.name : 'No avatar yet';
    chip.href = a ? `/library.html#a=${a.id}` : '/library.html';
    const dot = document.getElementById('tbLive'); dot.classList.toggle('on', obs > 0); dot.title = obs ? `OBS connected (${obs})` : 'OBS not connected';
    void esc;
  } catch {}
}

/** Small helper: progress fill for styled range inputs. */
export function paintRange(el) { const min = +el.min || 0, max = +el.max || 1, v = +el.value; el.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`); }
export function wireRanges(root = document) { root.querySelectorAll('input[type=range]').forEach((el) => { paintRange(el); el.addEventListener('input', () => paintRange(el)); }); }

export function toast(text) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
