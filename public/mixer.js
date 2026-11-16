// Part Mixer: pick a body for every part, a fit for every part, and see the stitched character live.
import { AvatarViewer } from '/viewer.js';
import { topbar, toast } from '/ui.js';
import { loadKit, defaultModular, PART_ROWS, OUTFITS, defaultOutfit, hairChoices, outfitGroup, ACCESSORIES, accessoriesOf, FACE_SHAPES, faceShapeGroup, faceShapeOf, EYE_SHAPES, eyeShapeGroup, eyeShapeOf } from '/modular.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search); const editId = q.get('id');
import { ensureBaked } from '/autobake.js';
let savedId = editId, dirty = false;      // the library character this page is editing, and whether it has unsaved changes
topbar('mixer');
const viewer = new AvatarViewer($('viewer')); viewer.setGrid(false); window.viewer = viewer;
const kit = await loadKit();
let recipe = defaultModular('anime_female'); recipe.hair = 'Bob';
let view = 'front-full', seq = 0, first = true;
const bodies = Object.entries(kit.bodies);
const FITS = [['own', 'Own size'], ['match', 'Match']];
const STARTS = [
  ['Anime Female', () => ({ ...defaultModular('anime_female'), hair: 'Bob' })],
  ['Anime Male', () => ({ ...defaultModular('anime_male'), hair: 'Side part comb over' })],
  ...(kit.bodies.mika_female ? [['Mika Female', () => ({ ...defaultModular('mika_female'), hair: 'High ponytail' })]] : []),
  ['Human Female', () => ({ ...defaultModular('female'), hair: 'Bob' })], ['Human Male', () => ({ ...defaultModular('male'), hair: 'Short crew cut' })],
  ...Object.entries(kit.heads || {}).map(([k, h]) => [`${h.label} head`, () => ({ ...defaultModular(kit.bodies.mika_female ? 'mika_female' : 'anime_female'), headModel: k, skin: h.skin || '#ecc4ad', clothing: '#26262e', accent: '#f08a24' })]),
  ['Anime head, human body', () => { const r = defaultModular('female'); r.parts.Head = 'anime_female'; r.hair = 'High ponytail'; return r; }],
  ['Male body, female arms', () => { const r = defaultModular('male'); for (const p of ['Arm_L', 'Arm_R', 'Hand_L', 'Hand_R']) { r.parts[p] = 'female'; r.fit[p] = 'match'; } return r; }],
];

function setStatus(t, kind = '') { $('status').textContent = t; $('status').className = `status ${kind}`; }
function hairOptions() {
  if (recipe.headModel) { $('hair').innerHTML = '<option>Comes with this head</option>'; $('hair').disabled = true; $('hair').title = 'This head has its own hair'; $('hairColor').disabled = true; return; }
  $('hairColor').disabled = false;
  const list = hairChoices(kit, recipe.parts.Head);
  if (recipe.hair !== 'None' && !list.some((h) => h.name === recipe.hair)) recipe.hair = list[0]?.name || 'None';      // a head never goes bald just because it was swapped
  $('hair').innerHTML = ['None', ...list.map((h) => h.name)].map((n) => `<option ${n === recipe.hair ? 'selected' : ''}>${n}</option>`).join('');
  $('hair').disabled = !list.length; $('hair').title = list.length ? '' : 'This head has no hairstyles in the kit yet';
}
function faceShapeOptions() {
  const el = $('faceShape'), g = faceShapeGroup(kit, recipe.parts.Head), cur = faceShapeOf(kit, recipe)[0], GN = { female: 'Female face', male: 'Male face', cartoon: 'Cartoon face' };
  el.disabled = !!recipe.headModel; el.title = recipe.headModel ? 'This head keeps its own face' : '';
  el.innerHTML = recipe.headModel ? '<option>Comes with this head</option>' : `<optgroup label="${GN[g]}">` + FACE_SHAPES[g].map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${n}</option>`).join('') + '</optgroup>';
}
function eyeShapeOptions() {
  const el = $('eyeShape'), g = recipe.headModel ? null : eyeShapeGroup(kit, recipe.parts.Head), cur = eyeShapeOf(kit, recipe)?.[0];
  el.disabled = !g; el.title = g ? '' : 'This head keeps its own eyes';
  el.innerHTML = g ? `<optgroup label="${({ anime: 'Anime girl eyes', female: 'Female eyes', male: 'Male eyes', animeMale: 'Anime boy eyes' })[g]}">` + EYE_SHAPES[g].map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${n}</option>`).join('') + '</optgroup>' : '<option>Not available for this head</option>';
}
function render() {
  $('starts').innerHTML = STARTS.map(([n], i) => `<button data-start="${i}">${n}</button>`).join('');
  $('parts').innerHTML = PART_ROWS.map(([label, ps]) => {
    const isHead = label === 'Head', cur = isHead && recipe.headModel ? `model:${recipe.headModel}` : recipe.parts[ps[0]], fit = recipe.fit[ps[0]] ?? 'own';
    const extra = isHead ? Object.entries(kit.heads || {}).map(([k, h]) => `<option value="model:${k}" ${cur === `model:${k}` ? 'selected' : ''}>${h.label} (complete head)</option>`).join('') : '';
    return `<div class="prow"><span class="k">${label}</span>
      <select data-part="${label}">${bodies.map(([k, b]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${b.label}</option>`).join('')}${extra}</select>
      ${ps[0] === 'Torso' ? '<span></span>' : `<select data-fit="${label}" title="Own size keeps the part as it is. Match scales it to what it attaches to.">${FITS.map(([v, n]) => `<option value="${v}" ${v === fit ? 'selected' : ''}>${n}</option>`).join('')}</select>`}</div>`;
  }).join('');
  hairOptions(); faceShapeOptions(); eyeShapeOptions();
  $('hairColor').value = recipe.hairColor; $('skin').value = recipe.skin; $('outline').checked = recipe.outline !== false; $('eyeColor').value = recipe.eyeColor || (kit.bodies[recipe.parts.Head]?.base === 'male' ? '#2f8f8a' : '#4f7396'); $('clothing').value = recipe.clothing; $('accent').value = recipe.accent || '#f2efe9'; $('name').value = recipe.name;
  const cur = recipe.outfit || defaultOutfit(kit, recipe.parts.Torso);
  const grp = outfitGroup(kit, recipe.parts.Torso), GN = { male: 'For male characters', female: 'For female characters', anime: 'For anime characters', premium: 'Premium (female & anime)', premiumMale: 'Premium (male)', any: 'Basics' }, order = grp === 'male' ? ['male', 'premiumMale', 'anime', 'female', 'premium', 'any'] : [grp, 'premium', ...['anime', 'female', 'male'].filter((g) => g !== grp), 'premiumMale', 'any'];
  $('outfit').innerHTML = order.map((g) => `<optgroup label="${GN[g]}">${Object.entries(OUTFITS).filter(([, o]) => o.group === g).map(([k, o]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${o.label}</option>`).join('')}</optgroup>`).join('') + `<option value="none" ${cur === 'none' ? 'selected' : ''}>None</option>`;
  const worn = accessoriesOf(kit, recipe); $('acc').innerHTML = Object.entries(ACCESSORIES).map(([k, n]) => `<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-acc="${k}" ${worn.includes(k) ? 'checked' : ''}>${n}</label>`).join('');
}
// undo / redo: every change is a snapshot of the recipe
const hist = []; let hpos = -1, fromHistory = false;
const histButtons = () => { $('undo').disabled = hpos <= 0; $('redo').disabled = hpos >= hist.length - 1; };
function remember() { const s = JSON.stringify(recipe); if (hist[hpos] === s) return; hist.splice(hpos + 1); hist.push(s); if (hist.length > 80) hist.shift(); hpos = hist.length - 1; histButtons(); }
function travel(d) { const p = hpos + d; if (p < 0 || p >= hist.length) return; hpos = p; const keep = recipe.name; recipe = JSON.parse(hist[p]); recipe.name = keep; fromHistory = true; render(); refresh(); histButtons(); }
// a random character: a start, then hair, face, eyes, outfit and colours picked from what that head and body offer
const PALETTE = ['#24315e', '#7a1c26', '#2b3f73', '#ff5fa2', '#1c1a22', '#2d6a4f', '#f2efe9', '#ffd166', '#5b6bd6', '#8e2a2a', '#3a3a46', '#e0566d', '#2f8f8a', '#c97b3a'];
const HAIR = ['#2b2220', '#4a2f22', '#6b4226', '#a0522d', '#d9b26a', '#1c1c24', '#b03a48', '#5c7cfa', '#e8e2d6', '#f2a7c3'];
const EYES = ['#4f7396', '#2f8f8a', '#6b4226', '#5a8a3c', '#8a4fb8', '#c0392b', '#3c6e9e', '#d4a017'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function surprise() {
  const starts = STARTS.filter(([n]) => !/body, |arms/.test(n)), keep = recipe.name; recipe = pick(starts)[1](); recipe.name = keep; render();
  const opt = (id) => [...$(id).querySelectorAll('option')].filter((o) => !o.disabled && o.value && !/Comes with|Not available/.test(o.textContent)).map((o) => o.value);
  if (!$('hair').disabled) recipe.hair = pick(opt('hair').filter((v) => v !== 'None')) || recipe.hair;
  if (!$('faceShape').disabled) recipe.faceShape = pick(opt('faceShape'));
  if (!$('eyeShape').disabled) recipe.eyeShape = pick(opt('eyeShape'));
  const grp = outfitGroup(kit, recipe.parts.Torso), ok = Object.entries(OUTFITS).filter(([, o]) => o.group === grp || o.group === (grp === 'male' ? 'premiumMale' : 'premium'));
  const [ok0, o] = pick(ok); recipe.outfit = ok0; recipe.accessories = null;
  if (o.colors && Math.random() < 0.5) Object.assign(recipe, o.colors); else { recipe.clothing = pick(PALETTE); recipe.accent = pick(PALETTE.filter((c) => c !== recipe.clothing)); }
  if (!recipe.headModel) { recipe.hairColor = pick(HAIR); recipe.eyeColor = pick(EYES); }
  render(); refresh();
}
let refreshes = 0;
async function refresh() {
  if (refreshes++) dirty = true;
  if (!fromHistory) remember(); fromHistory = false;
  const my = ++seq; $('busy').classList.add('on');
  try {
    await viewer.loadCreated(JSON.parse(JSON.stringify(recipe)), { keepCamera: !first });
    if (my !== seq) return;
    if (first) { viewer.frame(view); first = false; }
    const n = viewer.vrm?.userData?.modularNotes || [], h = viewer.vrm?.userData?.modularHeight;
    $('notes').innerHTML = `<b>Height ${h ? h.toFixed(2) : '?'} m.</b> ` + (n.length ? n.map((x) => x.replace(/^(\w+):/, '<b>$1</b>:')).join('<br>') : 'All parts come from one body, so there are no seams to blend.');
    document.title = 'READY Character Maker · Kael Studio';
  } catch (e) { console.error(e); setStatus(e.message, 'err'); document.title = 'ERROR ' + e.message; }
  finally { if (my === seq) $('busy').classList.remove('on'); }
}
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.part === 'Head' && t.value.startsWith('model:')) {      // a complete head: sits where the anime head would, brings its own skin tone
    recipe.headModel = t.value.slice(6); if (kit.bodies[recipe.parts.Head]?.style !== 'anime') recipe.parts.Head = 'anime_female';
    const h = kit.heads[recipe.headModel]; if (h?.skin) { recipe.skin = h.skin; $('skin').value = h.skin; } hairOptions(); faceShapeOptions(); eyeShapeOptions();
  }
  else if (t.dataset.part) { for (const p of PART_ROWS.find((r) => r[0] === t.dataset.part)[1]) recipe.parts[p] = t.value; if (t.dataset.part === 'Head') { recipe.headModel = null; hairOptions(); faceShapeOptions(); eyeShapeOptions(); } }
  else if (t.dataset.fit) { for (const p of PART_ROWS.find((r) => r[0] === t.dataset.fit)[1]) recipe.fit[p] = t.value; }
  else if (t.id === 'hair') recipe.hair = t.value;
  else if (t.id === 'faceShape') recipe.faceShape = t.value;
  else if (t.id === 'eyeShape') recipe.eyeShape = t.value;
  else if (t.id === 'outline') recipe.outline = t.checked;
  else if (t.dataset.acc) recipe.accessories = [...document.querySelectorAll('[data-acc]')].filter((c) => c.checked).map((c) => c.dataset.acc);
  else if (t.id === 'outfit') { recipe.outfit = t.value; recipe.accessories = null; const c = OUTFITS[t.value]?.colors; if (c) Object.assign(recipe, c); render(); }      // premium outfits start in their signature colours       // a new outfit brings its own accessories
  else if (['hairColor', 'skin', 'clothing', 'accent', 'eyeColor'].includes(t.id)) recipe[t.id] = t.value;
  else if (t.id === 'name') { recipe.name = t.value; return; }
  else return;
  refresh();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.start) { const keep = recipe.name; recipe = STARTS[+b.dataset.start][1](); recipe.name = keep; document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === view));
render(); refresh(); }
  if (b.id === 'undo') return travel(-1);
  if (b.id === 'redo') return travel(1);
  if (b.id === 'surprise') return surprise();
  if (b.dataset.motion) { const on = !b.classList.contains('on'); b.classList.toggle('on', on); viewer.setMotion(on ? b.dataset.motion : 'idle'); return; }
  if (b.dataset.view) { view = b.dataset.view; document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); viewer.frame(view); }
});
$('save').addEventListener('click', async () => {
  recipe.name = $('name').value.trim() || 'Mixed character'; setStatus('Saving…');
  try {
    let thumbnail = null; try { thumbnail = viewer.thumbnail(); } catch { /* preview only */ }
    const url = savedId ? `/api/library/${savedId}/recipe` : '/api/library/create';
    const r = await fetch(url, { method: savedId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipe, name: recipe.name, thumbnail }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not save');
    if (!savedId) { savedId = j.avatar.id; const u = new URL(location.href); u.searchParams.set('id', savedId); history.replaceState(null, '', u); }      // later saves update this character instead of adding copies
    dirty = false;
    if ($('bakeLive').checked) await fetch(`/api/library/${savedId}/activate`, { method: 'POST' });
    toast?.('Saved to your library');
    // optimize it for the stream right away (the stream builds it live until this finishes)
    setStatus('Saved. Optimizing it for the stream…', 'ok');
    const id = savedId, rec = await ensureBaked(id, { onStep: (s) => { if (savedId === id && !dirty) setStatus(`Saved. Optimizing for the stream: ${s}…`, 'ok'); } });
    if (savedId === id && !dirty) setStatus(`Saved and optimized for the stream${rec.bakeNotes ? `: ${rec.bakeNotes.slice(0, 2).join(' · ')}` : ''}.${$('bakeLive').checked ? ' It is on stream now.' : ''}`, 'ok');
  } catch (err) { setStatus(err.message, 'err'); }
});
$('bake').addEventListener('click', async () => {        // a .vrm to keep or use in other VTuber apps
  const name = $('name').value.trim() || recipe.name || 'Mixed character', btn = $('bake'); btn.disabled = true; $('bakeDl').classList.add('hidden');
  try {
    let blob, note = '';
    if (savedId && !dirty) { const rec = await ensureBaked(savedId, { onStep: (s) => setStatus(`Baking: ${s}…`) }); blob = await (await fetch(`/api/library/${savedId}/baked`)).blob(); note = rec.bakeNotes ? ` ${rec.bakeNotes.join(' · ')}.` : ''; }
    else { const { bakeVRM } = await import('/bake.js'); const res = await bakeVRM(JSON.parse(JSON.stringify(recipe)), { name, onStep: (s) => setStatus(`Baking: ${s}…`) }); blob = new Blob([res.file]); note = ` ${res.notes.join(' · ')}.`; }
    const file = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'character', dl = $('bakeDl');
    if (dl.href) URL.revokeObjectURL(dl.href); dl.href = URL.createObjectURL(blob); dl.download = `${file}.vrm`; dl.classList.remove('hidden');
    setStatus(`Your .vrm is ready (${(blob.size / 1048576).toFixed(1)} MB).${note}`, 'ok');
  } catch (err) { console.error(err); setStatus(`Bake failed: ${err.message}`, 'err'); }
  btn.disabled = false;
});
if (editId) {
  try { const rec = await fetch(`/api/library/${editId}/file`).then((r) => r.json()); if (rec.kind === 'modular') recipe = { ...defaultModular(), ...rec }; } catch { /* start fresh */ }
}
if (q.get('start')) recipe = { ...STARTS[+q.get('start')][1](), name: recipe.name };
if (q.get('outfit')) { recipe.outfit = q.get('outfit'); if (OUTFITS[recipe.outfit]?.colors) Object.assign(recipe, OUTFITS[recipe.outfit].colors); }
if (q.get('outline')) recipe.outline = q.get('outline') !== '0';
if (q.get('acc') !== null) recipe.accessories = q.get('acc').split(',').filter(Boolean);
for (const k of ['clothing', 'accent', 'hairColor', 'hair', 'eyeColor', 'face', 'faceShape', 'eyeShape']) if (q.get(k)) recipe[k] = q.get(k);
if (q.get('light')) viewer.setLighting(q.get('light'));
if (q.get('view')) view = q.get('view');
document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === view));
render(); refresh();

document.addEventListener('keydown', (e) => {      // ⌘Z / ⇧⌘Z (Ctrl on other keyboards), not while typing a name
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || /input|select|textarea/i.test(document.activeElement?.tagName || '') && document.activeElement.type === 'text') return;
  e.preventDefault(); travel(e.shiftKey ? 1 : -1);
});
