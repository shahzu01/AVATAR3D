// Avatar Library page: browse avatars, import VRM/GLB with validation and 3D preview, inspect capabilities,
// manage files and per-avatar stream presentation.
import { AvatarViewer, LIGHT_PRESETS } from '/viewer.js';
import { ICON, topbar, wireRanges, toast } from '/ui.js';
topbar('library');
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICON[el.dataset.icon] || ''; });
const stageViewer = (id) => { const v = new AvatarViewer($(id)); v.setGrid(false); v.setBackground('transparent'); $(id).classList.remove('checker'); return v; };

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : undefined });
  const j = await r.json().catch(() => ({ error: 'Unexpected response from Kael Studio.' }));
  if (!r.ok) { const e = new Error(j.error || 'Request failed.'); e.report = j.report; throw e; }
  return j;
}
const LEVEL = { full: 'Full tracking (Perfect Sync)', standard: 'Standard tracking', basic: 'Basic tracking', 'preview-only': 'Preview only', unsupported: 'Unsupported' };
const SOURCE = { 'imported-vrm': 'Imported VRM', 'imported-gltf': 'Imported GLB', created: 'Created in Kael Studio' };
const LOOK_PRESETS = {
  studio: { lightColor: '#ffffff', lightIntensity: 1, rimColor: '#a35cff', rimIntensity: 0.6 },
  soft: { lightColor: '#fff6ec', lightIntensity: 0.8, rimColor: '#ffffff', rimIntensity: 0.3 },
  warm: { lightColor: '#ffd2a1', lightIntensity: 1, rimColor: '#ff7a45', rimIntensity: 0.7 },
  cool: { lightColor: '#cfe3ff', lightIntensity: 1, rimColor: '#3aa0ff', rimIntensity: 0.8 },
  neon: { lightColor: '#ffffff', lightIntensity: 0.8, rimColor: '#ff2bd6', rimIntensity: 1.4 },
};
let lib = { avatars: [], activeId: null, limits: { maxFileMB: 300 } };

// ------------------------------------------------------------------ modal
function ask({ title, text, ok = 'OK', danger = false, input = null }) {
  return new Promise((resolve) => {
    $('mTitle').textContent = title; $('mText').textContent = text || '';
    $('mInput').classList.toggle('hidden', input === null); if (input !== null) { $('mInput').value = input; setTimeout(() => $('mInput').select(), 30); }
    $('mOk').textContent = ok; $('mOk').className = danger ? 'danger' : 'primary';
    $('modal').classList.add('open');
    const done = (v) => { $('modal').classList.remove('open'); $('mOk').onclick = $('mCancel').onclick = null; resolve(v); };
    $('mOk').onclick = () => done(input !== null ? $('mInput').value : true);
    $('mCancel').onclick = () => done(false);
    $('mInput').onkeydown = (e) => { if (e.key === 'Enter') $('mOk').click(); };
  });
}

// ------------------------------------------------------------------ routing
let viewers = {};
function show(view) {
  for (const v of ['vLibrary', 'vImport', 'vDetail']) $(v).classList.toggle('hidden', v !== view);
}
async function route() {
  const h = location.hash;
  if (h === '#import') { show('vImport'); resetImport(replaceTarget); replaceTarget = null; }
  else if (h.startsWith('#a=')) { show('vDetail'); openDetail(h.slice(3)); }
  else { show('vLibrary'); await refresh(); }
}
addEventListener('hashchange', route);

// ------------------------------------------------------------------ home: avatar strip + stage + info
let selectedId = null;
async function refresh() {
  lib = await api('/api/library');
  $('limitNote').textContent = `VRM 1.0 / 0.x or GLB, up to ${lib.limits.maxFileMB} MB. The file stays on this Mac.`;
  $('libEmpty').style.display = lib.avatars.length ? 'none' : 'block';
  $('libCount').textContent = lib.avatars.length ? `· ${lib.avatars.length}` : '';
  if (!lib.avatars.some((a) => a.id === selectedId)) selectedId = lib.activeId || lib.avatars[0]?.id || null;
  $('libGrid').innerHTML = lib.avatars.map((a) => `
    <div class="card ${a.id === selectedId ? 'sel' : ''}" data-id="${a.id}" title="${esc(a.name)} (double-click for details)">
      ${a.id === lib.activeId ? '<span class="live">Active</span>' : ''}
      <div class="thumb">${a.thumbUrl ? `<img src="${a.thumbUrl}" alt="">` : '🧍'}</div>
      <div class="body"><div class="name">${esc(a.name)}</div><div class="sub">${SOURCE[a.sourceType] || a.sourceType}</div></div>
    </div>`).join('');
  for (const c of $('libGrid').querySelectorAll('[data-id]')) { c.onclick = () => select(c.dataset.id); c.ondblclick = () => { location.hash = `a=${c.dataset.id}`; }; }
  makeMissingThumbnails();
  select(selectedId, true);
}
let homeLoaded = null;
async function select(id, quiet = false) {
  selectedId = id;
  $('libGrid').querySelectorAll('[data-id]').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
  const a = lib.avatars.find((x) => x.id === id);
  renderHomeInfo(a);
  if (!a) { $('homeOverlay').textContent = 'Create your first avatar, or import a VRM you already own.'; viewers.home?.unload(); homeLoaded = null; return; }
  if (homeLoaded === `${a.id}|${a.updatedAt}`) return;
  homeLoaded = `${a.id}|${a.updatedAt}`;
  if (!viewers.home) { viewers.home = stageViewer('homeViewer'); viewers.home.setShift(-82); }
  $('homeOverlay').textContent = 'Loading…';
  try {
    await viewers.home.load(a.fileUrl, { kind: a.sourceType === 'created' ? 'created' : undefined });
    if (selectedId !== a.id) return;
    $('homeOverlay').textContent = ''; viewers.home.frame('front'); viewers.home.setMotion('idle');
  } catch (e) { if (selectedId === a.id) $('homeOverlay').textContent = `Could not show this avatar: ${e.message}`; }
  void quiet;
}
function renderHomeInfo(a) {
  if (!a) { $('homeInfo').innerHTML = `<h2>Welcome</h2><p class="hint">Your avatars live here. Make one with the creator or bring a VRM you already own. The one marked <b>Active</b> is what OBS shows.</p>`; return; }
  const c = a.capabilities, active = a.id === lib.activeId;
  const fmt = a.sourceType === 'created' ? 'Made in the creator' : `${a.format.type}${a.format.vrmVersion ? ' ' + a.format.vrmVersion : ''}`;
  $('homeInfo').innerHTML = `
    <div><div class="badges" style="margin-bottom:8px">${active ? '<span class="badge active">Active · on stream</span>' : ''}<span class="badge ${a.suitability.level}">${LEVEL[a.suitability.level]}</span></div><h2>${esc(a.name)}</h2><div class="muted">${esc(a.originalFilename)} · ${mb(a.fileSize)}</div></div>
    <div class="facts">
      <div class="fact"><small>Type</small><span>${esc(fmt)}</span></div>
      <div class="fact"><small>Face tracking</small><span>${a.sourceType === 'created' || c.expressions.perfectSync ? 'Perfect Sync' : c.expressions.blink ? 'Basic' : 'None'}</span></div>
      <div class="fact"><small>Fingers</small><span>${c.humanoid.fingers ? `${c.humanoid.fingers} bones` : 'No'}</span></div>
      <div class="fact"><small>Sway</small><span>${c.springBones ? `${c.springBones} group(s)` : 'None'}</span></div>
    </div>
    <div class="btns">
      <button class="primary" id="homeActivate" ${active || !a.suitability.tracking ? 'disabled' : ''}>${active ? 'Already on stream' : a.suitability.tracking ? 'Put on stream' : 'Cannot be used live'}</button>
      ${a.sourceType === 'created' ? `<a class="btnlink" href="/creator.html?id=${a.id}" style="justify-content:center">${ICON.edit} Edit in creator</a>` : ''}
      <button id="homeDetails">${ICON.info} Details, stream setup and file</button>
    </div>
    <p class="tip">Tip: double-click an avatar to open its details. Drag the stage to turn it, scroll to zoom.</p>`;
  $('homeDetails').onclick = () => { location.hash = `a=${a.id}`; };
  const act = $('homeActivate');
  if (act && !act.disabled) act.onclick = async () => { try { await api(`/api/library/${a.id}/activate`, { method: 'POST' }); toast(`${a.name} is now on stream`); await refresh(); } catch (e) { toast(e.message); } };
}
// Avatars without a picture (for example ones dropped into the avatars folder) get one, one at a time in the background.
let thumbBusy = false;
async function makeMissingThumbnails() {
  if (thumbBusy) return; thumbBusy = true;
  try {
    for (const a of lib.avatars.filter((x) => !x.thumbUrl)) {
      const card = $('libGrid').querySelector(`[data-id="${a.id}"] .thumb`); if (!card) continue;
      card.innerHTML = '<span class="muted" style="font-size:12px">making preview…</span>';
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-2000px;top:0;width:384px;height:384px';
      document.body.appendChild(host);
      const v = new AvatarViewer(host);
      try {
        await v.load(a.fileUrl, { kind: a.sourceType === 'created' ? 'created' : undefined });
        const o = await api(`/api/library/${a.id}/thumbnail`, { method: 'POST', body: JSON.stringify({ thumbnail: v.thumbnail() }) });
        a.thumbUrl = o.avatar.thumbUrl;
        const el = $('libGrid').querySelector(`[data-id="${a.id}"] .thumb`); if (el) el.innerHTML = `<img src="${a.thumbUrl}" alt="">`;
      } catch { const el = $('libGrid').querySelector(`[data-id="${a.id}"] .thumb`); if (el) el.textContent = '🧍'; }
      finally { v.dispose(); host.remove(); }
    }
  } finally { thumbBusy = false; }
}
$('importCard').onclick = () => { location.hash = 'import'; };

// ------------------------------------------------------------------ shared: viewer controls and capability report
function viewerControls(row, viewer, info) {
  const views = [['front', 'Upper'], ['front-full', 'Full'], ['face', 'Face'], ['threequarter', '¾'], ['side', 'Side'], ['back', 'Back']];
  row.innerHTML = `
    <div class="line"><span class="k">View</span><span class="seg">${views.map(([k, l]) => `<button data-view="${k}">${l}</button>`).join('')}<span class="div"></span><button data-zoom="0.8" title="Zoom in">＋</button><button data-zoom="1.25" title="Zoom out">－</button></span>
      <span style="flex:1"></span><label>Light <select data-k="light">${LIGHT_PRESETS.map((p) => `<option>${p}</option>`).join('')}</select></label>
      <label>Background <select data-k="bg"><option value="stage">Stage</option><option value="dark">Dark</option><option value="light">Light</option><option value="green">Green</option><option value="transparent">Checker</option></select></label></div>
    <div class="line"><span class="k">Motion</span><span class="pills small" data-k="motions"></span></div>
    <div class="line"><span class="k">Expressions</span><span class="pills small" data-k="exprs"></span></div>`;
  row.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { viewer.frame(b.dataset.view); row.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); }));
  row.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => viewer.zoom(Number(b.dataset.zoom))));
  row.querySelector('[data-k=light]').onchange = (e) => viewer.setLighting(e.target.value);
  row.querySelector('[data-k=bg]').onchange = (e) => { const v = e.target.value; viewer.setBackground(v === 'stage' ? 'transparent' : v); if (v === 'stage') viewer.el.classList.remove('checker'); };
  const motions = viewer.vrm ? [['idle', 'Idle'], ['wave', 'Wave'], ['nod', 'Nod'], ['look', 'Look around'], ['blink', 'Blink'], ['tpose', 'Rest pose']] : (info.animations || []).map((a) => [a, a]);
  const mBox = row.querySelector('[data-k=motions]');
  mBox.innerHTML = motions.length ? motions.map(([k, l]) => `<button data-m="${esc(k)}">${esc(l)}</button>`).join('') : '<span class="muted">None (no humanoid rig or embedded animations)</span>';
  mBox.querySelectorAll('button').forEach((b) => (b.onclick = () => { mBox.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); viewer.setMotion(b.dataset.m); }));
  mBox.querySelector('button')?.click();
  const eBox = row.querySelector('[data-k=exprs]'), names = info.expressions || [];
  eBox.innerHTML = names.length ? `<button data-e="" class="on">Neutral</button>` + names.map((n) => `<button data-e="${esc(n)}">${esc(n)}</button>`).join('') : '<span class="muted">This model has no VRM expressions.</span>';
  eBox.querySelectorAll('button').forEach((b) => (b.onclick = () => { eBox.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); viewer.setExpression(b.dataset.e || null); }));
}
const yn = (v, yes = 'Yes', no = 'No') => (v ? `<span class="yes">${yes}</span>` : `<span class="no">${no}</span>`);
function capsHtml(src, checks) {
  const c = src.capabilities, s = src.stats, f = src.format;
  const hum = c.humanoid.ok ? yn(true, `Yes (${c.humanoid.bones} bones)`) : c.humanoid.upperBodyOk ? `<span class="part">Upper body only (missing ${esc(c.humanoid.missing.join(', '))})</span>` : c.humanoid.bones ? `<span class="no">Incomplete (missing ${esc(c.humanoid.missing.join(', '))})</span>` : yn(false, '', 'No humanoid rig');
  const ex = c.expressions;
  const issues = [
    ...(src.validation?.warnings || src.warnings || []).map((t) => ({ level: 'warn', text: t })),
    ...(checks?.issues || []),
    ...(src.suitability.reasons || []).map((t) => ({ level: src.suitability.tracking ? 'warn' : 'error', text: t })),
  ];
  return `
    <div class="badges" style="margin-bottom:8px"><span class="badge ${src.suitability.level}">${LEVEL[src.suitability.level]}</span>
      ${src.suitability.tracking ? '<span class="badge full">Can be used live</span>' : '<span class="badge preview-only">Cannot be used live</span>'}</div>
    <table class="kv">
      <tr><td>Format</td><td>${f.type === 'Kael Studio character' ? 'Made in the Kael Studio creator' : f.type === 'Kael Studio realistic human' ? 'Realistic human made in the Kael Studio creator' : `${esc(f.type)}${f.vrmVersion ? ' ' + esc(f.vrmVersion) : ''} (${esc(f.container)}${f.specVersion ? `, spec ${esc(f.specVersion)}` : ''})`}</td></tr>
      <tr><td>Model name</td><td>${esc(src.meta?.name || '—')}${src.meta?.authors?.length ? ` by ${esc(src.meta.authors.join(', '))}` : ''}</td></tr>
      <tr><td>Humanoid rig</td><td>${hum}</td></tr>
      <tr><td>Fingers</td><td>${c.humanoid.fingers ? yn(true, `${c.humanoid.fingers} finger bones`) : yn(false)}</td></tr>
      <tr><td>Expressions</td><td>${ex.count ? `${ex.count}${ex.emotions ? `, ${ex.emotions} emotion presets` : ''}` : yn(false, '', 'None')}</td></tr>
      <tr><td>Face tracking (Perfect Sync)</td><td>${src.sourceType === 'created' ? yn(true, 'Yes (all 52 face-tracking inputs drive the drawn face)') : ex.perfectSync ? yn(true, `Yes (${ex.arkitShapes}/52 ARKit shapes)`) : ex.arkitShapes ? `<span class="part">Partial (${ex.arkitShapes}/52)</span>` : yn(false, '', 'No (uses basic presets)')}</td></tr>
      <tr><td>Blinking</td><td>${yn(ex.blink)}</td></tr>
      <tr><td>Mouth / lip sync</td><td>${ex.mouth ? yn(true, `Yes${ex.visemes ? ` (${ex.visemes}/5 visemes)` : ''}`) : yn(false)}</td></tr>
      <tr><td>Eye / gaze control</td><td>${c.lookAt.supported ? yn(true, `Yes (${esc(c.lookAt.type)})`) : yn(false)}</td></tr>
      <tr><td>Spring bones (hair/cloth sway)</td><td>${c.springBones ? yn(true, `${c.springBones} group(s)`) : '<span class="muted">None</span>'}</td></tr>
      <tr><td>Animation</td><td>${c.animations.builtInMotions ? yn(true, 'Built-in motions + live tracking') : ''}${c.animations.embedded ? ` ${c.animations.embedded} embedded` : ''}${!c.animations.builtInMotions && !c.animations.embedded ? '<span class="muted">None</span>' : ''}</td></tr>
      <tr><td>Materials</td><td>${c.materials.total}${c.materials.mtoon ? ` (${c.materials.mtoon} MToon toon shading)` : ''}</td></tr>
      <tr><td>Textures</td><td>${s.textures}${s.maxTextureSize ? `, up to ${s.maxTextureSize}px` : ''}${checks ? ` · ${checks.info.texturesLoaded} loaded in preview` : ''}</td></tr>
      <tr><td>Complexity</td><td>${src.sourceType === 'created' ? 'Generated live from the character recipe (about 15–25k triangles)' : `${s.triangles.toLocaleString()} triangles · ${s.meshes} meshes · ${s.skins} skins`}</td></tr>
      ${checks ? `<tr><td>Size &amp; orientation</td><td>${checks.info.height} m tall · facing ${esc(checks.info.facing)}</td></tr>` : ''}
    </table>
    <ul class="issues">${issues.length ? issues.map((i) => `<li class="${i.level}">${esc(i.text)}</li>`).join('') : '<li class="ok">No problems found.</li>'}</ul>`;
}

// ------------------------------------------------------------------ import
let imp = null;          // { file, tmpId, report, checks, replaceId }
function resetImport(replaceFor = null) {
  if (imp?.tmpId && !imp.saved) fetch(`/api/library/import/${imp.tmpId}`, { method: 'DELETE' });
  imp = { replaceId: replaceFor?.id || null };
  $('impTitle').textContent = replaceFor ? `Replace the file of “${replaceFor.name}”` : 'Import my 3D avatar';
  $('drop').classList.remove('hidden'); $('impInfo').classList.add('hidden'); $('impSave').classList.add('hidden'); $('impAgain').classList.add('hidden');
  $('impReport').innerHTML = ''; $('impViewRow').innerHTML = ''; $('impOverlay').textContent = 'Choose a file to preview it here.'; $('impOverlay').classList.remove('hidden');
  $('impSaveBtn').textContent = replaceFor ? 'Replace file' : 'Save to library';
  viewers.imp?.unload();
  if (lib.limits) $('limitNote').textContent = `VRM 1.0 / 0.x or GLB, up to ${lib.limits.maxFileMB} MB. The file stays on this Mac.`;
}
function impStatus(text, kind = '') { $('impStatus').textContent = text; $('impStatus').className = `status ${kind}`; }
$('pick').onclick = () => $('file').click();
$('file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) startImport(f); };
const drop = $('drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) startImport(f); };
$('impAgain').onclick = () => resetImport(imp?.replaceId ? lib.avatars.find((a) => a.id === imp.replaceId) : null);
$('impCancel').onclick = async () => {
  if (imp?.tmpId) await fetch(`/api/library/import/${imp.tmpId}`, { method: 'DELETE' });
  const back = imp?.replaceId; imp = null; location.hash = back ? `a=${back}` : '';
};

async function preCheck(file) {
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  if (!['vrm', 'glb'].includes(ext)) return `“${file.name}” is not a .vrm or .glb file.`;
  if (file.size > lib.limits.maxFileMB * 1e6) return `The file is ${mb(file.size)}; the limit is ${lib.limits.maxFileMB} MB.`;
  if (file.size < 20) return 'The file is empty.';
  const head = new DataView(await file.slice(0, 12).arrayBuffer());
  if (head.getUint32(0, true) !== 0x46546c67) return 'This does not look like a VRM/GLB file (wrong file header). It may be damaged or a different format renamed.';
  return null;
}
function upload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/library/import?filename=${encodeURIComponent(file.name)}`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} if (x.status === 200) resolve(j); else { const e = new Error(j.error || 'Import failed.'); e.report = j.report; reject(e); } };
    x.onerror = () => reject(new Error('Kael Studio is not responding. Is it still running?'));
    x.send(file);
  });
}
async function startImport(file) {
  if (!viewers.imp) viewers.imp = stageViewer('impViewer');
  $('drop').classList.add('hidden'); $('impInfo').classList.remove('hidden'); $('impSave').classList.add('hidden'); $('impAgain').classList.add('hidden');
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '?').toUpperCase();
  $('fileinfo').innerHTML = `<span>File</span><span>${esc(file.name)}</span><span>Size</span><span>${mb(file.size)}</span><span>Format</span><span id="fiFormat">${esc(ext)} (checking…)</span>`;
  $('impReport').innerHTML = ''; $('bar').style.width = '0';
  impStatus('Checking the file…');
  const bad = await preCheck(file);
  if (bad) { impStatus(bad, 'error'); $('impAgain').classList.remove('hidden'); return; }
  let res;
  try {
    impStatus('Uploading to Kael Studio on this Mac…');
    res = await upload(file, (p) => { $('bar').style.width = `${(p * 60).toFixed(0)}%`; });
  } catch (e) {
    $('bar').style.width = '0';
    impStatus(e.message, 'error');
    if (e.report) { $('fiFormat').textContent = e.report.format?.type ? `${e.report.format.type} ${e.report.format.vrmVersion || ''}` : ext; }
    $('impAgain').classList.remove('hidden'); return;
  }
  imp = { ...imp, file, tmpId: res.tmpId, report: res.report };
  const r = res.report;
  $('fiFormat').textContent = `${r.format.type}${r.format.vrmVersion ? ' ' + r.format.vrmVersion : ''} (${r.format.container})`;
  impStatus('File is valid. Loading the 3D preview…');
  $('impOverlay').textContent = 'Loading preview…';
  try {
    const checks = await viewers.imp.load(res.previewUrl, { onProgress: (p) => { $('bar').style.width = `${(60 + p * 40).toFixed(0)}%`; } });
    imp.checks = checks;
    $('bar').style.width = '100%'; $('impOverlay').classList.add('hidden');
    viewerControls($('impViewRow'), viewers.imp, checks.info);
    const hardFail = checks.issues.some((i) => i.level === 'error');
    impStatus(hardFail ? 'The preview loaded, but the model has serious problems (see below). You can still save it for reference.' : 'Preview loaded. Inspect the avatar, then name and save it.', hardFail ? 'error' : 'ok');
  } catch (e) {
    $('impOverlay').textContent = 'The preview could not be shown.';
    imp.checks = { issues: [{ level: 'error', text: `The 3D preview failed: ${e.message}` }], info: { height: '?', facing: '?', texturesLoaded: 0 } };
    impStatus('The file passed validation but could not be displayed. Saving it is not recommended.', 'error');
  }
  $('impReport').innerHTML = capsHtml(r, imp.checks);
  $('impName').value = (imp.replaceId ? lib.avatars.find((a) => a.id === imp.replaceId)?.name : null) || r.meta?.name || file.name.replace(/\.[^.]+$/, '');
  $('impActive').checked = r.suitability.tracking && !imp.replaceId && !lib.activeId;
  $('impActive').disabled = !r.suitability.tracking;
  $('impActive').parentElement.classList.toggle('hidden', !!imp.replaceId);
  $('impSave').classList.remove('hidden'); $('impAgain').classList.remove('hidden');
}
$('impSaveBtn').onclick = async () => {
  if (!imp?.tmpId) return;
  const name = $('impName').value.trim();
  if (!name) { impStatus('Please give the avatar a name.', 'error'); $('impName').focus(); return; }
  if (imp.replaceId) {
    const target = lib.avatars.find((a) => a.id === imp.replaceId);
    const yes = await ask({ title: 'Replace this avatar’s file?', text: `“${target?.name}” will use ${imp.file.name} from now on. Its settings are kept. The previous file is moved to the library’s trash folder, not destroyed.`, ok: 'Replace file' });
    if (!yes) return;
  }
  $('impSaveBtn').disabled = true; impStatus('Saving…');
  try {
    let thumbnail = null; try { thumbnail = viewers.imp.model ? viewers.imp.thumbnail() : null; } catch {}
    const out = await api(`/api/library/import/${imp.tmpId}/confirm`, { method: 'POST', body: JSON.stringify({ name, thumbnail, makeActive: $('impActive').checked && !$('impActive').disabled, replaceId: imp.replaceId }) });
    imp.saved = true; imp = null;
    location.hash = `a=${out.avatar.id}`;
  } catch (e) { impStatus(e.message, 'error'); }
  finally { $('impSaveBtn').disabled = false; }
};

// ------------------------------------------------------------------ avatar detail
let cur = null;
function dStatus(t, kind = '') { $('dStatus').textContent = t; $('dStatus').className = `status ${kind}`; }
async function openDetail(id) {
  dStatus('');
  let rec;
  try { lib = await api('/api/library'); rec = (await api(`/api/library/${id}`)).avatar; } catch (e) { dStatus(e.message, 'error'); $('dOverlay').textContent = e.message; return; }
  cur = rec;
  renderDetailHeader();
  if (!viewers.d) viewers.d = stageViewer('dViewer');
  $('dOverlay').textContent = 'Loading…'; $('dOverlay').classList.remove('hidden'); $('dViewRow').innerHTML = '';
  $('tab-caps').innerHTML = capsHtml(rec, null);
  renderFileTab(); renderPresentTab();
  try {
    const checks = await viewers.d.load(rec.fileUrl, { kind: rec.sourceType === 'created' ? 'created' : undefined });
    if (cur?.id !== rec.id) return;
    $('dOverlay').classList.add('hidden');
    viewerControls($('dViewRow'), viewers.d, checks.info);
    $('tab-caps').innerHTML = capsHtml(rec, checks);
    if (!rec.thumbnail) { try { const t = viewers.d.thumbnail(); const o = await api(`/api/library/${rec.id}/thumbnail`, { method: 'POST', body: JSON.stringify({ thumbnail: t }) }); cur = o.avatar; } catch {} }
  } catch (e) {
    $('dOverlay').textContent = `Could not load this avatar's file: ${e.message}. It may have been moved or deleted. Use “Replace file…” to fix it.`;
  }
}
function renderDetailHeader() {
  const a = cur, active = a.id === lib.activeId;
  $('dName').textContent = a.name;
  $('dBadges').innerHTML = `${active ? '<span class="badge active">Active</span>' : ''}<span class="badge">${SOURCE[a.sourceType] || a.sourceType}${a.format.vrmVersion ? ' ' + a.format.vrmVersion : ''}</span><span class="badge ${a.suitability.level}">${LEVEL[a.suitability.level]}</span>`;
  $('dActivate').disabled = active || !a.suitability.tracking;
  $('dActivate').textContent = active ? 'Active avatar' : 'Set as active avatar';
  $('dActivate').title = a.suitability.tracking ? '' : 'This model cannot be driven by tracking (no complete VRM humanoid rig).';
  $('dDownload').href = `/api/library/${a.id}/download`;
  const created = a.sourceType === 'created';
  $('dEdit').classList.toggle('hidden', !created); $('dEdit').href = `/creator.html?id=${a.id}`;
  $('dReplace').classList.toggle('hidden', created);
  $('dDownload').textContent = created ? 'Download character file' : 'Download original';
}
$('dBack').onclick = () => { location.hash = ''; };
$('dTabs').onclick = (e) => {
  const t = e.target.dataset?.tab; if (!t) return;
  $('dTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  for (const k of ['caps', 'present', 'file']) $(`tab-${k}`).classList.toggle('hidden', k !== t);
};
$('dActivate').onclick = async () => {
  try { await api(`/api/library/${cur.id}/activate`, { method: 'POST' }); lib.activeId = cur.id; renderDetailHeader(); renderPresentTab(); dStatus(`${cur.name} is now your active avatar. OBS and the Studio switch to it automatically.`, 'ok'); }
  catch (e) { dStatus(e.message, 'error'); }
};
$('dRename').onclick = async () => {
  const name = await ask({ title: 'Rename avatar', text: 'Only the name in Kael Studio changes. The file is not modified.', ok: 'Rename', input: cur.name });
  if (name === false) return;
  if (!name.trim()) { dStatus('The name cannot be empty.', 'error'); return; }
  try { cur = (await api(`/api/library/${cur.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })).avatar; renderDetailHeader(); dStatus('Renamed.', 'ok'); } catch (e) { dStatus(e.message, 'error'); }
};
$('dDuplicate').onclick = async () => {
  try { const o = await api(`/api/library/${cur.id}/duplicate`, { method: 'POST' }); location.hash = `a=${o.avatar.id}`; } catch (e) { dStatus(e.message, 'error'); }
};
$('dDelete').onclick = async () => {
  const shared = lib.avatars.filter((a) => a.fileId && a.fileId === cur.fileId).length > 1;
  const yes = await ask({ title: `Delete “${cur.name}”?`, text: `It will be removed from your library. ${shared ? 'Its file is kept because another avatar entry uses it.' : 'Its file is moved to the library’s trash folder (KaelStudio/library/trash), so it can still be recovered by hand.'} Other avatars are not affected.`, ok: 'Delete', danger: true });
  if (!yes) return;
  try { await api(`/api/library/${cur.id}`, { method: 'DELETE' }); viewers.d?.unload(); cur = null; location.hash = ''; } catch (e) { dStatus(e.message, 'error'); }
};
let replaceTarget = null;
$('dReplace').onclick = () => { replaceTarget = cur; location.hash = 'import'; };

function renderFileTab() {
  const a = cur, m = a.meta || {};
  const row = (k, v) => (v === null || v === undefined || v === '' ? '' : `<tr><td>${k}</td><td>${esc(v)}</td></tr>`);
  $('tab-file').innerHTML = `<table class="kv">
    ${row('Original filename', a.originalFilename)}${row('File size', mb(a.fileSize))}${row('Stored in', a.location === 'library' ? 'KaelStudio/library (original kept unchanged)' : 'KaelStudio/avatars (linked, left in place)')}
    ${row('Imported', new Date(a.importedAt).toLocaleString())}${a.replacedAt ? row('File replaced', new Date(a.replacedAt).toLocaleString()) : ''}
    ${row('Validation', `${a.validation.status.replace(/-/g, ' ')} (checked ${new Date(a.validation.checkedAt).toLocaleDateString()})`)}
    ${row('Avatar ID', a.id)}${row('Owner', a.ownerId === 'local' ? 'You (this Mac)' : a.ownerId)}
    ${row('Model name', m.name)}${row('Version', m.version)}${row('Authors', (m.authors || []).join(', '))}${row('Contact', m.contact)}${row('Copyright', m.copyright)}
    ${row('Licence', m.license)}${row('Other licence', m.otherLicense)}${row('Who may use it', m.avatarPermission)}${row('Commercial use', m.commercialUsage)}
    ${row('Redistribution', m.allowRedistribution === null || m.allowRedistribution === undefined ? null : m.allowRedistribution ? 'Allowed' : 'Not allowed')}${row('Modification', m.modification)}${row('Credit', m.creditNotation)}
  </table>
  <p class="muted">“Download original” gives back the exact file you imported. Follow the model’s licence before sharing it with anyone.</p>`;
}

function renderPresentTab() {
  const a = cur, pr = a.presentation, active = a.id === lib.activeId;
  const look = { camera: 'bust', background: 'transparent', ...(pr.look || {}) };
  const tr = pr.transform, tk = pr.tracking;
  const slider = (k, label, min, max, step, val, unit = '') => `<label>${label} <input type="range" data-p="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="muted" data-v="${k}">${val}${unit}</span></label>`;
  const presetNow = Object.entries(LOOK_PRESETS).find(([, v]) => v.lightColor === look.lightColor && v.rimColor === look.rimColor)?.[0] || '';
  $('tab-present').innerHTML = `
    ${a.suitability.tracking ? '' : '<ul class="issues"><li class="error">This model cannot be used live, so these settings have no effect until it is replaced with a VRM that has a humanoid rig.</li></ul>'}
    <h2 class="sec" style="margin-top:4px">Position in the stream</h2>
    <div class="row">${slider('transform.x', 'Left / right', -1, 1, 0.01, tr.x)}${slider('transform.y', 'Up / down', -1, 1, 0.01, tr.y)}</div>
    <div class="row">${slider('transform.rotY', 'Turn', -180, 180, 1, tr.rotY, '°')}${slider('transform.scale', 'Size', 0.25, 3, 0.01, tr.scale, '×')}</div>
    <h2 class="sec">Camera, background and light</h2>
    <div class="row">
      <label>Framing <select data-look="camera">${['head', 'bust', 'half', 'full'].map((c) => `<option value="${c}" ${look.camera === c ? 'selected' : ''}>${{ head: 'Head', bust: 'Bust', half: 'Half body', full: 'Full body' }[c]}</option>`).join('')}</select></label>
      <label>Background <select data-look="background">${[['transparent', 'Transparent (OBS)'], ['green', 'Green screen'], ['blue', 'Blue screen'], ['color', 'Solid color']].map(([v, l]) => `<option value="${v}" ${look.background === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Light preset <select data-look="preset"><option value="">Custom</option>${Object.keys(LOOK_PRESETS).map((p) => `<option ${presetNow === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    </div>
    <h2 class="sec">Face and tracking</h2>
    <div class="row"><label class="inline"><input type="checkbox" data-p="tracking.blink" ${tk.blink ? 'checked' : ''} ${a.capabilities.expressions.blink ? '' : 'disabled'}> Blinking${a.capabilities.expressions.blink ? '' : ' (not supported by this model)'}</label></div>
    <div class="row">${slider('tracking.gaze', 'Eye movement', 0, 2, 0.05, tk.gaze, '×')}${slider('tracking.mouth', 'Mouth movement', 0, 3, 0.05, tk.mouth, '×')}${slider('tracking.expressions', 'Face expression strength', 0, 2, 0.05, tk.expressions, '×')}</div>
    <p class="muted">${a.capabilities.lookAt.supported ? '' : 'This model has no eye controls, so eye movement has no effect. '}Material editing is not offered: imported avatars keep their original look. Hair, body and clothing editing needs a model built from Kael Studio parts.</p>
    <h2 class="sec">Live stream preview</h2>
    ${active ? '<iframe class="stream" src="/avatar.html?preview=1"></iframe>' : '<p class="muted">Set this avatar as active to see it in the live stream preview.</p>'}`;
  wireRanges($('tab-present'));
  let timer;
  let queued = {};
  const save = (patch) => {           // changes made in quick succession are merged into one request
    queued = { ...queued, presentation: { ...(queued.presentation || {}), ...patch.presentation } };
    clearTimeout(timer);
    timer = setTimeout(async () => { const body = queued; queued = {}; try { cur = (await api(`/api/library/${cur.id}`, { method: 'PATCH', body: JSON.stringify(body) })).avatar; } catch (e) { dStatus(e.message, 'error'); } }, 150);
  };
  const pending = { transform: { ...tr }, tracking: { ...tk } };
  $('tab-present').querySelectorAll('[data-p]').forEach((el) => (el.oninput = () => {
    const [grp, k] = el.dataset.p.split('.');
    const v = el.type === 'checkbox' ? el.checked : Number(el.value);
    pending[grp][k] = v;
    const lbl = $('tab-present').querySelector(`[data-v="${el.dataset.p}"]`); if (lbl) lbl.textContent = `${v}${k === 'rotY' ? '°' : k === 'x' || k === 'y' ? '' : '×'}`;
    save({ presentation: { [grp]: pending[grp] } });
  }));
  $('tab-present').querySelectorAll('[data-look]').forEach((el) => (el.onchange = () => {
    const lk = { ...look };
    if (el.dataset.look === 'preset') { if (!el.value) return; Object.assign(lk, LOOK_PRESETS[el.value]); } else lk[el.dataset.look] = el.value;
    Object.assign(look, lk);
    save({ presentation: { look: lk } });
  }));
}

// ------------------------------------------------------------------ start
refresh().then(route);
window.__lib = { get imp() { return imp; }, get cur() { return cur; }, viewers };      // for automated tests
