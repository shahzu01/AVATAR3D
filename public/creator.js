// Character creator page.
import { AvatarViewer } from '/viewer.js';
import { SPECIES, OPTIONS, SWATCHES, PRESETS, ACCESSORY_LIMIT, defaultRecipe, randomRecipe, withSpecies } from '/creator/catalog.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const EMOJI = { human: '🧑', elf: '🧝', cat: '🐱', fox: '🦊', wolf: '🐺', raccoon: '🦝', bear: '🐻', panda: '🐼', bunny: '🐰', tiger: '🐯', mouse: '🐭' };
const params = new URLSearchParams(location.search);
const editId = /^[a-f0-9]{16}$/.test(params.get('id') || '') ? params.get('id') : null;

let recipe = clone(PRESETS[0]);
let history = [], future = [], dirty = false, tab = 'start';
const viewer = new AvatarViewer($('viewer'));

// ------------------------------------------------------------------ live preview (rebuilt shortly after each change)
let pending = null, building = false, firstBuild = true;
function rebuild() {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    pending = null;
    if (building) { rebuild(); return; }
    building = true; $('busy').classList.add('on');
    try { await viewer.loadCreated(clone(recipe), { keepCamera: !firstBuild }); if (firstBuild) viewer.frame('front'); firstBuild = false; restoreTest(); }
    catch (e) { console.error(e); setStatus(`Preview problem: ${e.message}`, 'error'); }
    finally { building = false; $('busy').classList.remove('on'); }
  }, 90);
}
function change(fn, { rebuildNow = true } = {}) {
  history.push(clone(recipe)); if (history.length > 80) history.shift(); future = [];
  fn(recipe); dirty = true; updateUndo();
  if (rebuildNow) rebuild();
  renderTab();
}
function updateUndo() { $('undo').disabled = !history.length; $('redo').disabled = !future.length; }
$('undo').onclick = () => { if (!history.length) return; future.push(clone(recipe)); recipe = history.pop(); dirty = true; updateUndo(); rebuild(); renderTab(); $('name').value = recipe.name; };
$('redo').onclick = () => { if (!future.length) return; history.push(clone(recipe)); recipe = future.pop(); dirty = true; updateUndo(); rebuild(); renderTab(); $('name').value = recipe.name; };
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target.tagName === 'INPUT') return;
  e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click();
});
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ------------------------------------------------------------------ viewer controls and test buttons
document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => viewer.frame(b.dataset.view)));
document.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => viewer.zoom(Number(b.dataset.zoom))));
$('bg').onchange = (e) => viewer.setBackground(e.target.value);
const MOTIONS = [['idle', 'Idle'], ['wave', 'Wave'], ['nod', 'Nod'], ['look', 'Look around'], ['blink', 'Blink'], ['talk', 'Talk'], ['tpose', 'Rest pose']];
const TEST_EXPR = [['', 'Neutral'], ['happy', 'Happy'], ['Laughing', 'Laugh'], ['angry', 'Angry'], ['sad', 'Sad'], ['surprised', 'Surprised'], ['Embarrassed', 'Blush'], ['Smug', 'Smug'], ['Wink_L', 'Wink'], ['Thinking', 'Thinking'], ['HeartEyes', 'Heart eyes'], ['StarEyes', 'Star eyes'], ['Crying', 'Crying'], ['Sweat', 'Sweat'], ['Dizzy', 'Dizzy'], ['Pout', 'Pout']];
let testMotion = 'idle', testExpr = '';
$('motions').innerHTML = MOTIONS.map(([k, l]) => `<button data-m="${k}" class="${k === testMotion ? 'on' : ''}">${l}</button>`).join('');
$('testExpr').innerHTML = TEST_EXPR.map(([k, l]) => `<button data-e="${k}" class="${k === testExpr ? 'on' : ''}">${l}</button>`).join('');
$('motions').onclick = (e) => { const k = e.target.dataset?.m; if (k === undefined) return; testMotion = k; mark($('motions'), 'm', k); viewer.setMotion(k); };
$('testExpr').onclick = (e) => { const k = e.target.dataset?.e; if (k === undefined) return; testExpr = k; mark($('testExpr'), 'e', k); viewer.setExpression(k || null); };
function mark(box, attr, v) { box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === v)); }
function restoreTest() { viewer.setMotion(testMotion); viewer.setExpression(testExpr || null); }

// ------------------------------------------------------------------ control builders
const get = (path) => path.split('.').reduce((o, k) => o?.[k], recipe);
const set = (path, v) => change((r) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), r)[last] = v; });
function chips(path, options, { small = false, filter } = {}) {
  const cur = get(path), opts = filter ? options.filter(filter) : options;
  return `<div class="chips ${small ? 'small' : ''}" data-chips="${path}">${opts.map((o) => `<button data-v="${esc(o.id)}" class="${o.id === cur ? 'on' : ''}">${esc(o.label)}</button>`).join('')}</div>`;
}
function swatches(path, list) {
  const cur = (get(path) || '').toLowerCase();
  return `<div class="sw" data-sw="${path}">${list.map((c) => `<button title="${c}" data-v="${c}" style="background:${c}" class="${c.toLowerCase() === cur ? 'on' : ''}"></button>`).join('')}<input type="color" value="${esc(cur || '#888888')}" title="Any colour"></div>`;
}
function slider(path, label, min = 0, max = 1, step = 0.01, fmt = (v) => `${Math.round(((v - min) / (max - min)) * 100)}`) {
  const v = get(path) ?? (min + max) / 2;
  return `<div class="slider"><span>${label}</span><input type="range" data-slider="${path}" min="${min}" max="${max}" step="${step}" value="${v}"><span data-out="${path}">${fmt(v)}</span></div>`;
}
const animal = () => SPECIES[recipe.species].style === 'animal';

const TABS = [['start', 'Start'], ['body', 'Body'], ['face', 'Face'], ['colors', 'Fur & skin'], ['ears', 'Ears & tail'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['extras', 'Accessories']];
$('tabs').innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('');
$('tabs').onclick = (e) => { const k = e.target.dataset?.tab; if (!k) return; tab = k; renderTab(); };

function renderTab() {
  $('tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const r = recipe;
  let h = '';
  if (tab === 'start') {
    h += `<h3>Start from a character</h3><div class="presets">${PRESETS.map((p, i) => `<button data-preset="${i}"><span class="em">${EMOJI[p.species]}</span><span class="nm">${esc(p.name)}</span></button>`).join('')}</div>`;
    h += `<div class="row" style="margin-top:12px"><button data-random="any">🎲 Randomize everything</button><button data-random="species">🎲 Randomize, keep ${esc(SPECIES[r.species].label.toLowerCase())}</button></div>`;
    h += `<h3>Species</h3><div class="chips" data-species>${Object.entries(SPECIES).map(([k, s]) => `<button data-v="${k}" class="${k === r.species ? 'on' : ''}">${EMOJI[k]} ${s.label}</button>`).join('')}</div>`;
    h += `<p class="muted">Changing species keeps the outfit and hair, and resets fur or skin colours to that species' defaults.</p>`;
  } else if (tab === 'body') {
    h += `<h3>Size</h3>${slider('body.height', 'Height', 0.9, 2.0, 0.01, (v) => `${(+v).toFixed(2)} m`)}${slider('body.head', 'Head size', 0.7, 1.6, 0.01, (v) => `${Math.round(v * 100)}%`)}${slider('body.legLength', 'Leg length')}`;
    h += `<h3>Shape</h3>${slider('body.build', 'Build')}${slider('body.shoulders', 'Shoulders')}${slider('body.chest', 'Chest')}${slider('body.waist', 'Waist')}${slider('body.hips', 'Hips')}${slider('body.arms', 'Arm thickness')}${slider('body.legs', 'Leg thickness')}`;
    h += `<h3>Outline</h3>${slider('outline', 'Toon outline')}`;
  } else if (tab === 'face') {
    h += `<h3>Eyes</h3>${chips('face.eyes', OPTIONS.eyes)}<div class="row">${swatches('face.eyeColor', SWATCHES.eyes)}</div>`;
    h += `${slider('face.eyeSize', 'Eye size')}${slider('face.eyeSpacing', 'Eye spacing')}${slider('face.eyeHeight', 'Eye height')}${slider('face.eyeTilt', 'Eye tilt')}`;
    h += `<div class="row"><label class="muted"><input type="checkbox" data-check="face.lashes" ${r.face.lashes ? 'checked' : ''}> Eyelashes</label></div>`;
    h += `<h3>Eyebrows</h3>${chips('face.brows', OPTIONS.brows)}<div class="row">${swatches('face.browColor', [...SWATCHES.hair.slice(0, 7), r.colors.fur3])}</div>`;
    h += `<h3>Mouth</h3>${chips('face.mouth', OPTIONS.mouth)}`;
    h += `<h3>Nose</h3>${chips('face.nose', OPTIONS.nose)}`;
    if (animal()) h += `${slider('face.muzzle', 'Snout length')}`;
    h += `<h3>Face markings</h3>${chips('face.markings', OPTIONS.markings)}`;
  } else if (tab === 'colors') {
    const main = animal() ? 'Fur' : 'Skin';
    h += `<h3>${main}</h3>${swatches('colors.skin', animal() ? SWATCHES.fur : SWATCHES.skin)}`;
    if (animal()) {
      h += `<h3>Muzzle, cheeks and belly</h3>${swatches('colors.fur2', SWATCHES.fur)}`;
      h += `<h3>Markings and pattern colour</h3>${swatches('colors.fur3', SWATCHES.fur)}`;
      h += `<h3>Pattern</h3>${chips('pattern', OPTIONS.pattern)}`;
      h += `<h3>Inner ears</h3>${swatches('colors.inner', ['#f5a6b8', '#f6b3c2', '#fbe3d0', '#ecebf0', '#e9d6d6', '#24242a', ...SWATCHES.fur.slice(0, 3)])}`;
    }
    h += `<h3>Nose</h3>${swatches('colors.nose', ['#141418', '#2a1d18', '#f08ca0', '#e58a8a', '#c98468', '#d29a80', '#8a5a3c'])}`;
  } else if (tab === 'ears') {
    h += `<h3>Ears</h3>${chips('ears.type', OPTIONS.ears)}${slider('ears.size', 'Ear size')}`;
    h += `<h3>Tail</h3>${chips('tail.type', OPTIONS.tail)}${slider('tail.size', 'Tail size')}`;
    h += `<p class="muted">Bunny ears, long tails and long hair sway with your movement on stream.</p>`;
  } else if (tab === 'hair') {
    h += `<h3>Style</h3>${chips('hair.style', OPTIONS.hair)}`;
    h += `<h3>Colour</h3>${swatches('hair.color', SWATCHES.hair)}<h3>Tips / highlight</h3>${swatches('hair.color2', SWATCHES.hair)}`;
  } else if (tab === 'outfit') {
    h += `<h3>Top</h3>${chips('top.style', OPTIONS.top)}<div class="row"><span class="muted">Main</span>${swatches('top.color', SWATCHES.cloth)}</div><div class="row"><span class="muted">Trim</span>${swatches('top.color2', SWATCHES.cloth)}</div>`;
    h += `<h3>Bottom</h3>${chips('bottom.style', OPTIONS.bottom)}<div class="row">${swatches('bottom.color', SWATCHES.cloth)}</div>`;
    h += `<h3>Shoes</h3>${chips('shoes.style', OPTIONS.shoes)}<div class="row"><span class="muted">Main</span>${swatches('shoes.color', SWATCHES.cloth)}</div><div class="row"><span class="muted">Sole / trim</span>${swatches('shoes.color2', SWATCHES.cloth)}</div>`;
  } else if (tab === 'extras') {
    h += `<h3>Accessories <span class="muted">(up to ${ACCESSORY_LIMIT})</span></h3>`;
    for (const o of OPTIONS.accessories) {
      const idx = r.accessories.findIndex((a) => a.id === o.id), on = idx >= 0;
      h += `<div class="acc"><label><input type="checkbox" data-acc="${o.id}" ${on ? 'checked' : ''} ${!on && r.accessories.length >= ACCESSORY_LIMIT ? 'disabled' : ''}> ${esc(o.label)}</label>${on ? swatches(`accessories.${idx}.color`, [...SWATCHES.cloth.slice(0, 8), '#ffe27a', '#c9a84a']) : ''}</div>`;
    }
  }
  $('tabBody').innerHTML = h;
  bindTab();
}
function bindTab() {
  const body = $('tabBody');
  body.querySelectorAll('[data-chips]').forEach((box) => (box.onclick = (e) => { const v = e.target.dataset?.v; if (v !== undefined) set(box.dataset.chips, v); }));
  body.querySelectorAll('[data-sw]').forEach((box) => {
    box.onclick = (e) => { const v = e.target.dataset?.v; if (v) set(box.dataset.sw, v); };
    const inp = box.querySelector('input[type=color]'); inp.onchange = () => set(box.dataset.sw, inp.value);
  });
  body.querySelectorAll('[data-slider]').forEach((el) => {
    let first = true;
    el.oninput = () => {      // one undo step per drag
      const path = el.dataset.slider, v = Number(el.value);
      if (first) { history.push(clone(recipe)); future = []; first = false; updateUndo(); }
      const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), recipe)[last] = v;
      dirty = true; rebuild();
      const out = body.querySelector(`[data-out="${path}"]`); if (out) out.textContent = path === 'body.height' ? `${v.toFixed(2)} m` : path === 'body.head' ? `${Math.round(v * 100)}%` : `${Math.round(((v - el.min) / (el.max - el.min)) * 100)}`;
    };
    el.onchange = () => { first = true; };
  });
  body.querySelectorAll('[data-check]').forEach((el) => (el.onchange = () => set(el.dataset.check, el.checked)));
  body.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => change((r) => { Object.assign(r, clone(PRESETS[+b.dataset.preset])); }) || ($('name').value = recipe.name)));
  body.querySelectorAll('[data-random]').forEach((b) => (b.onclick = () => { change((r) => Object.assign(r, randomRecipe(Math.random() * 1e9, b.dataset.random === 'species' ? { species: r.species } : {}))); $('name').value = recipe.name; }));
  const sp = body.querySelector('[data-species]');
  if (sp) sp.onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (!v || v === recipe.species) return; change((r) => { withSpecies(r, v, true); r.ears.type = 'auto'; r.tail.type = 'auto'; r.face.nose = 'auto'; if (SPECIES[v].style === 'human' && r.face.markings === 'mask') r.face.markings = 'none'; }); };
  body.querySelectorAll('[data-acc]').forEach((el) => (el.onchange = () => change((r) => {
    const id = el.dataset.acc, i = r.accessories.findIndex((a) => a.id === id);
    if (el.checked && i < 0 && r.accessories.length < ACCESSORY_LIMIT) r.accessories.push({ id, color: id === 'halo' ? '#ffe27a' : id === 'crown' ? '#e8c45a' : '#1f2026' });
    if (!el.checked && i >= 0) r.accessories.splice(i, 1);
  })));
}

// ------------------------------------------------------------------ save
function setStatus(t, kind = '') { $('status').textContent = t; $('status').className = `status ${kind}`; }
$('name').oninput = () => { recipe.name = $('name').value; dirty = true; };
async function save(asCopy = false) {
  const name = $('name').value.trim();
  if (!name) { setStatus('Please give your character a name.', 'error'); $('name').focus(); return; }
  recipe.name = name;
  $('save').disabled = $('saveCopy').disabled = true; setStatus('Saving…');
  try {
    let thumbnail = null; try { const keep = testExpr; viewer.setExpression(null); thumbnail = viewer.thumbnail(); viewer.setExpression(keep || null); } catch {}
    const body = JSON.stringify({ recipe, name, thumbnail, makeActive: $('makeActive').checked });
    const url = editId && !asCopy ? `/api/library/${editId}/recipe` : '/api/library/create';
    const r = await fetch(url, { method: editId && !asCopy ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Save failed.');
    if (editId && !asCopy && $('makeActive').checked) await fetch(`/api/library/${editId}/activate`, { method: 'POST' });
    dirty = false;
    setStatus(editId && !asCopy ? 'Changes saved. If this is your active avatar, OBS has updated.' : 'Saved to your library.', 'ok');
    if (!editId || asCopy) setTimeout(() => { location.href = `/library.html#a=${j.avatar.id}`; }, 700);
  } catch (e) { setStatus(e.message, 'error'); }
  finally { $('save').disabled = $('saveCopy').disabled = false; }
}
$('save').onclick = () => save(false);
$('saveCopy').onclick = () => save(true);

// ------------------------------------------------------------------ start
(async () => {
  if (editId) {
    try {
      const [{ avatar }, rec] = await Promise.all([fetch(`/api/library/${editId}`).then((r) => r.json()), fetch(`/api/library/${editId}/file`).then((r) => r.json())]);
      recipe = { ...defaultRecipe(), ...rec, name: avatar.name };
      $('save').textContent = 'Save changes'; $('saveCopy').classList.remove('hidden');
      document.title = `Editing ${avatar.name} · Kael Studio`;
      const lib = await fetch('/api/library').then((r) => r.json());
      $('makeActive').checked = lib.activeId === editId;
      tab = 'face';
    } catch { setStatus('Could not open that character. Starting a new one instead.', 'error'); }
  }
  $('name').value = recipe.name;
  updateUndo(); renderTab(); rebuild();
})();
window.__creator = { get recipe() { return recipe; }, viewer, set: (p, v) => set(p, v), get building() { return building || !!pending; } };     // for automated tests
