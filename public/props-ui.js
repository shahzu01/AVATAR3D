// Studio · Look: the scene behind the character and the props it holds or wears.
import { BUILTIN_PROPS, BUILTIN_SCENES, ATTACH, POSE_LIST } from '/props.js';
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (url, opts = {}) => { const r = await fetch(url, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; };

let props = [], sceneCfg = { kind: 'none' }, files = [];
let saveT = {};
function save(key) {       // the reply is not copied back: an edit made while a save is on its way is never lost
  clearTimeout(saveT[key]); saveT[key] = setTimeout(() => api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(key === 'props' ? { props } : { scene: sceneCfg }) }).catch((e) => { $('propTip').textContent = `Not saved: ${e.message}`; }), 250);
}
const slider = (label, key, val, min, max, step, data) => `<div class="field" style="grid-template-columns:86px 1fr 44px"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" ${data}="${key}"><output>${(+val).toFixed(step < 1 ? 2 : 0)}</output></div>`;

function renderScene() {
  const s = sceneCfg, cur = s.kind === 'builtin' ? `builtin:${s.key}` : s.kind === 'model' || s.kind === 'image' ? `file:${s.file}` : 'none';
  const own = files.map((f) => `<option value="file:${f.file}" ${cur === `file:${f.file}` ? 'selected' : ''}>${esc(f.name)} (${f.type === 'image' ? 'picture' : '3D'})</option>`).join('');
  $('sceneBox').innerHTML = `<div class="fields"><div class="field"><span>Scene</span><select id="scenePick"><option value="none">None (background colour)</option>
      <optgroup label="Built in">${Object.entries(BUILTIN_SCENES).map(([k, b]) => `<option value="builtin:${k}" ${cur === `builtin:${k}` ? 'selected' : ''}>${b.label}</option>`).join('')}</optgroup>
      ${own ? `<optgroup label="Yours">${own}</optgroup>` : ''}</select></div>
    ${s.kind === 'none' ? '' : slider('Size', 'scale', s.scale ?? 1, 0.3, 3, 0.05, 'data-s') + (s.kind === 'image' ? slider('Up / down', 'y', s.y ?? 0, -2, 2, 0.02, 'data-s') + slider('Distance', 'z', s.z ?? 0, -2, 6, 0.05, 'data-s')
      : slider('Up / down', 'y', s.y ?? 0, -2, 2, 0.02, 'data-s') + slider('Back / front', 'z', s.z ?? 0, -4, 3, 0.05, 'data-s') + slider('Left / right', 'x', s.x ?? 0, -3, 3, 0.05, 'data-s') + slider('Turn', 'rotY', s.rotY ?? 0, -180, 180, 1, 'data-s'))}</div>`;
}
function renderProps() {
  const label = (p) => p.name || (p.src.startsWith('builtin:') ? BUILTIN_PROPS[p.src.slice(8)]?.label : files.find((f) => `file:${f.file}` === p.src)?.name) || 'Prop';
  $('propsBox').innerHTML = props.length ? props.map((p, i) => `<div class="rule ${p.on === false ? 'off' : ''}" data-pi="${i}">
      <div class="row"><input type="checkbox" data-p="on" ${p.on !== false ? 'checked' : ''} title="Show / hide"><b style="flex:1">${esc(label(p))}</b>
        <select data-p="attach">${Object.entries(ATTACH).map(([k, n]) => `<option value="${k}" ${k === p.attach ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button class="ghost x" data-fit title="Back to its starting place">↺</button><button class="ghost x" data-del title="Remove">🗑</button></div>
      <details style="margin-top:6px"><summary class="muted" style="font-size:12px;cursor:pointer">Move, turn, size</summary><div class="fields" style="margin-top:6px">
        ${slider('Left / right', 'pos0', p.pos[0], -0.4, 0.4, 0.005, 'data-p')}${slider('Up / down', 'pos1', p.pos[1], -0.4, 0.4, 0.005, 'data-p')}${slider('Front / back', 'pos2', p.pos[2], -0.4, 0.4, 0.005, 'data-p')}
        ${slider('Tilt', 'rot0', p.rot[0], -180, 180, 1, 'data-p')}${slider('Turn', 'rot1', p.rot[1], -180, 180, 1, 'data-p')}${slider('Roll', 'rot2', p.rot[2], -180, 180, 1, 'data-p')}
        ${slider('Size', 'scale', p.scale ?? 1, 0.2, 5, 0.05, 'data-p')}</div></details>
      <div class="muted" style="font-size:11px;margin-top:4px">id for rules: <code>${esc(p.id)}</code></div></div>`).join('') : '<p class="tip" style="margin:0">No props yet.</p>';
  $('propPick').innerHTML = `<optgroup label="Built in">${Object.entries(BUILTIN_PROPS).map(([k, b]) => `<option value="builtin:${k}">${b.label}</option>`).join('')}</optgroup>`
    + (files.some((f) => f.type === 'model') ? `<optgroup label="Yours">${files.filter((f) => f.type === 'model').map((f) => `<option value="file:${f.file}">${esc(f.name)}</option>`).join('')}</optgroup>` : '');
}
// A built-in scene comes with the lighting that suits it; the Lighting preset menu can change it again afterwards.
function matchLight(name) { const el = $('lightingPreset'); if (!name || !el || el.value === name || ![...el.options].some((o) => o.value === name)) return;
  el.value = name; el.dispatchEvent(new Event('change')); $('propTip').textContent = `Lighting set to "${el.selectedOptions[0].textContent}" to match the scene. You can change it under Lighting.`; }
const fitOf = (src) => { const b = src.startsWith('builtin:') && BUILTIN_PROPS[src.slice(8)]; return b ? { attach: b.fit.bone, pos: [...b.fit.pos], rot: [...b.fit.rot], scale: 1 } : { attach: 'rightHand', pos: [-0.08, 0, 0.03], rot: [0, 0, 0], scale: 1 }; };

document.addEventListener('input', (e) => {
  const t = e.target; if (t.type !== 'range') return;
  if (t.dataset.s) { sceneCfg[t.dataset.s] = Number(t.value); t.nextElementSibling.textContent = Number(t.value).toFixed(t.step < 1 ? 2 : 0); save('scene'); return; }
  const card = t.closest('[data-pi]'); if (!card || !t.dataset.p) return; const p = props[+card.dataset.pi], k = t.dataset.p, v = Number(t.value);
  if (k.startsWith('pos')) p.pos[+k[3]] = v; else if (k.startsWith('rot')) p.rot[+k[3]] = v; else p.scale = v;
  t.nextElementSibling.textContent = v.toFixed(t.step < 1 ? 2 : 0); save('props');
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'scenePick') { const v = t.value; if (v === 'none') sceneCfg = { kind: 'none' }; else if (v.startsWith('builtin:')) { sceneCfg = { kind: 'builtin', key: v.slice(8), scale: 1, x: 0, y: 0, z: 0, rotY: 0 }; matchLight(BUILTIN_SCENES[sceneCfg.key]?.light); }
    else { const f = files.find((q) => `file:${q.file}` === v); sceneCfg = { kind: f.type, file: f.file, scale: 1, x: 0, y: 0, z: 0, rotY: 0 }; } renderScene(); save('scene'); return; }
  const card = t.closest('[data-pi]'); if (!card || !$('propsBox').contains(card)) return; const p = props[+card.dataset.pi];
  if (t.dataset.p === 'on') { p.on = t.checked; card.classList.toggle('off', !t.checked); save('props'); }
  else if (t.dataset.p === 'attach') { p.attach = t.value; save('props'); }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'propAdd') { const src = $('propPick').value; props.push({ id: `p_${Date.now().toString(36)}`, name: '', src, on: true, ...fitOf(src) }); renderProps(); save('props'); return; }
  if (b.id === 'propUploadBtn') { $('propFile').click(); return; }
  const card = b.closest('[data-pi]'); if (!card || !$('propsBox').contains(card)) return; const i = +card.dataset.pi;
  if (b.dataset.del !== undefined) { props.splice(i, 1); renderProps(); save('props'); }
  else if (b.dataset.fit !== undefined) { Object.assign(props[i], fitOf(props[i].src)); renderProps(); save('props'); }
});
$('propFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; $('propTip').textContent = `Uploading ${f.name}…`;
  try {
    const { file } = await api(`/api/props/upload?name=${encodeURIComponent(f.name.replace(/\.[^.]+$/, ''))}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
    files.push(file);
    if (file.type === 'model') { props.push({ id: `p_${Date.now().toString(36)}`, name: file.name, src: `file:${file.file}`, on: true, ...fitOf('file:') }); save('props'); $('propTip').textContent = `${file.name} added as a prop (it can also be picked as a scene).`; }
    else { sceneCfg = { kind: 'image', file: file.file, scale: 1, x: 0, y: 0, z: 0, rotY: 0 }; save('scene'); $('propTip').textContent = `${file.name} is now the scene behind you.`; }
    renderScene(); renderProps();
  } catch (err) { $('propTip').textContent = err.message; }
});

const [st, pf] = await Promise.all([api('/api/settings'), api('/api/props')]);
props = st.props || []; sceneCfg = st.scene || { kind: 'none' }; files = pf.files || [];
renderScene(); renderProps();
// pose: what the body does when you are not moving your arms in front of the camera
const postSet = (o) => api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).catch((e) => { $('propTip').textContent = `Not saved: ${e.message}`; });
$('idlePose').innerHTML = POSE_LIST.map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); $('idlePose').value = st.idlePose || 'relaxed'; $('poseLock').checked = !!st.poseLock;
$('idlePose').onchange = () => postSet({ idlePose: $('idlePose').value }); $('poseLock').onchange = () => postSet({ poseLock: $('poseLock').checked });
