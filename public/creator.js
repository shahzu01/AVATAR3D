// Character creator page (layout: icon rail · option panel · stage with docks).
import { AvatarViewer } from '/viewer.js';
import { SPECIES, OPTIONS, SWATCHES, PRESETS, ACCESSORY_LIMIT, defaultRecipe, randomRecipe, withSpecies } from '/creator/catalog.js';
import { faceThumb, requestThumb, cachedThumb, clearThumbQueue } from '/creator/thumbs.js';
import { ICON, topbar, wireRanges, paintRange, toast } from '/ui.js';
import { defaultHuman, HUMAN_TYPES, FEMALE_HAIR, MALE_HAIR, SKIN_TONES, HAIR_COLORS, EYE_COLORS, thumbUrl } from '/human.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const hash = (o) => { const s = JSON.stringify(o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const EMOJI = { human: '🧑', elf: '🧝', cat: '🐱', fox: '🦊', wolf: '🐺', raccoon: '🦝', bear: '🐻', panda: '🐼', bunny: '🐰', tiger: '🐯', mouse: '🐭' };
const params = new URLSearchParams(location.search);
const editId = /^[a-f0-9]{16}$/.test(params.get('id') || '') ? params.get('id') : null;
const DEFAULTS = defaultRecipe();

let recipe = clone(PRESETS[0]);
let history = [], future = [], dirty = false, tab = 'start';
const subtab = { start: 'characters', body: 'size', face: 'eyes', colors: 'main', ears: 'ears', hair: 'style', outfit: 'top', extras: 'all' };

topbar('creator', { tools: `<button class="ghost iconbtn" id="undo" title="Undo (⌘Z)">${ICON.undo}</button><button class="ghost iconbtn" id="redo" title="Redo (⇧⌘Z)">${ICON.redo}</button><span style="width:1px;height:22px;background:var(--line);margin:0 4px"></span><button class="ghost iconbtn" id="togglePanel" title="Hide or show the options panel">${ICON.panel}</button><button class="ghost iconbtn" id="toggleEquip" title="Hide or show the equipped list">${ICON.panelR}</button>` });
const viewer = new AvatarViewer($('viewer'));
viewer.setGrid(false);
setBackground('stage');

// ------------------------------------------------------------------ live preview
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
  renderTab(); renderEquipped();
}
function updateUndo() { $('undo').disabled = !history.length; $('redo').disabled = !future.length; }
function step(from, to) { if (!from.length) return; to.push(clone(recipe)); recipe = from.pop(); dirty = true; updateUndo(); rebuild(); renderTab(); renderEquipped(); $('name').value = recipe.name; }
$('undo').onclick = () => step(history, future);
$('redo').onclick = () => step(future, history);
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target.tagName === 'INPUT') return;
  e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click();
});
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
$('togglePanel').onclick = () => { document.body.classList.toggle('panel-closed'); setTimeout(() => viewer.resize(), 280); };
$('toggleEquip').onclick = () => { document.body.classList.toggle('equip-closed'); updateShift(); };
function updateShift() { const eq = $('equipped'); viewer.setShift(eq.offsetParent && !document.body.classList.contains('equip-closed') ? Math.round(eq.offsetWidth / 2) : 0); }
addEventListener('resize', updateShift);

// ------------------------------------------------------------------ stage controls and test dock
const viewBtns = document.querySelectorAll('[data-view]');
viewBtns.forEach((b) => (b.onclick = () => { viewer.frame(b.dataset.view); viewBtns.forEach((x) => x.classList.toggle('on', x === b)); }));
document.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => viewer.zoom(Number(b.dataset.zoom))));
function setBackground(v) { viewer.setBackground(v === 'stage' ? 'transparent' : v); if (v === 'stage') $('viewer').classList.remove('checker'); }
$('bg').onchange = (e) => setBackground(e.target.value);
const MOTIONS = [['idle', 'Idle'], ['wave', 'Wave'], ['nod', 'Nod'], ['look', 'Look around'], ['blink', 'Blink'], ['talk', 'Talk'], ['tpose', 'Rest pose']];
const TEST_EXPR = [['', 'Neutral'], ['happy', 'Happy'], ['Laughing', 'Laugh'], ['angry', 'Angry'], ['sad', 'Sad'], ['surprised', 'Surprised'], ['Embarrassed', 'Blush'], ['Smug', 'Smug'], ['Wink_L', 'Wink'], ['Thinking', 'Thinking'], ['HeartEyes', 'Heart eyes'], ['StarEyes', 'Star eyes'], ['Crying', 'Crying'], ['Sweat', 'Sweat'], ['Dizzy', 'Dizzy'], ['Pout', 'Pout']];
let testMotion = 'idle', testExpr = '';
$('motions').innerHTML = MOTIONS.map(([k, l]) => `<button data-m="${k}" class="${k === testMotion ? 'on' : ''}">${l}</button>`).join('');
$('testExpr').innerHTML = TEST_EXPR.map(([k, l]) => `<button data-e="${k}" class="${k === testExpr ? 'on' : ''}">${l}</button>`).join('');
$('motions').onclick = (e) => { const k = e.target.dataset?.m; if (k === undefined) return; testMotion = k; mark($('motions'), 'm', k); viewer.setMotion(k); };
$('testExpr').onclick = (e) => { const k = e.target.dataset?.e; if (k === undefined) return; testExpr = k; mark($('testExpr'), 'e', k); viewer.setExpression(k || null); };
$('testToggle').onclick = () => { const c = $('testDock').classList.toggle('collapsed'); $('testToggle').textContent = c ? 'Show' : 'Hide'; };
function mark(box, attr, v) { box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === v)); }
function restoreTest() { viewer.setMotion(testMotion); viewer.setExpression(testExpr || null); }

// ------------------------------------------------------------------ categories
const CATS = [
  { id: 'start', label: 'Start', icon: 'start', sub: 'Your character, ready-made characters and species', tabs: [['character', 'Character'], ['characters', 'Ready-made'], ['species', 'Species']] },
  { id: 'body', label: 'Body', icon: 'body', sub: 'Proportions and shape', tabs: [['size', 'Size'], ['shape', 'Shape'], ['style', 'Style']] },
  { id: 'face', label: 'Face', icon: 'face', sub: 'Eyes, brows, mouth and more', tabs: [['eyes', 'Eyes'], ['brows', 'Brows'], ['mouth', 'Mouth'], ['nose', 'Nose'], ['markings', 'Marks']] },
  { id: 'colors', label: 'Fur & skin', icon: 'fur', sub: 'Colours and patterns', tabs: [['main', 'Colours'], ['pattern', 'Pattern']] },
  { id: 'ears', label: 'Ears & tail', icon: 'ears', sub: 'They sway as you move', tabs: [['ears', 'Ears'], ['tail', 'Tail']] },
  { id: 'hair', label: 'Hair', icon: 'hair', sub: 'Style and colour', tabs: [['style', 'Style'], ['color', 'Colour']] },
  { id: 'outfit', label: 'Outfit', icon: 'outfit', sub: 'Tops, bottoms and shoes', tabs: [['top', 'Top'], ['bottom', 'Bottom'], ['shoes', 'Shoes']] },
  { id: 'extras', label: 'Extras', icon: 'extras', sub: `Accessories (up to ${ACCESSORY_LIMIT})`, tabs: [] },
];
const CATS_H = [   // realistic humans (Blender models): fewer, bigger choices
  { id: 'start', label: 'Start', icon: 'start', sub: 'Male or Female, and the body type', tabs: [['character', 'Character']] },
  { id: 'body', label: 'Body', icon: 'body', sub: 'Body type', tabs: [] },
  { id: 'hair', label: 'Hair', icon: 'hair', sub: 'Style and colour', tabs: [['style', 'Style'], ['color', 'Colour']] },
  { id: 'colors', label: 'Skin & eyes', icon: 'fur', sub: 'Skin tone and eye colour', tabs: [] },
  { id: 'outfit', label: 'Outfit', icon: 'outfit', sub: 'Clothing colour', tabs: [] },
];
const isHuman = () => recipe.kind === 'human';
const cats = () => (isHuman() ? CATS_H : CATS);
function renderRail() {
  $('tabs').innerHTML = cats().map((c, i) => `${i === 1 ? '<span class="sep"></span>' : ''}<button data-tab="${c.id}" title="${c.label}">${ICON[c.icon]}<span>${c.label}</span></button>`).join('');
  if (!cats().some((c) => c.id === tab)) tab = 'start';
  const st = cats().find((c) => c.id === tab); if (st.tabs.length && !st.tabs.some(([k]) => k === subtab[tab])) subtab[tab] = st.tabs[0][0];
}
renderRail();
$('tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; if (document.body.classList.contains('panel-closed')) { document.body.classList.remove('panel-closed'); setTimeout(() => viewer.resize(), 280); } renderTab(); };
$('subtabs').onclick = (e) => { const b = e.target.closest('[data-sub]'); if (!b) return; subtab[tab] = b.dataset.sub; renderTab(); };

// ------------------------------------------------------------------ control builders
const get = (path) => path.split('.').reduce((o, k) => o?.[k], recipe);
const getDefault = (path) => path.split('.').reduce((o, k) => o?.[k], DEFAULTS);
const set = (path, v) => change((r) => {
  const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), r)[last] = v;
  if (r.kind === 'human' && path === 'gender') { const d = defaultHuman(v); if (!HUMAN_TYPES[v].includes(r.bodyType)) r.bodyType = 'Balanced'; if (!['None', ...(v === 'male' ? MALE_HAIR : FEMALE_HAIR)].includes(r.hair)) r.hair = d.hair; }
});
const animal = () => SPECIES[recipe.species].style === 'animal';
const section = (t) => `<div class="section-t">${t}<span class="line"></span></div>`;
function swatches(path, list) {
  const cur = (get(path) || '').toLowerCase();
  return `<div class="sw" data-sw="${path}">${list.map((c) => `<button title="${c}" data-v="${c}" style="background:${c}" class="${c.toLowerCase() === cur ? 'on' : ''}"></button>`).join('')}<input type="color" value="${esc(cur || '#888888')}" title="Any colour"></div>`;
}
const SLIDER_FMT = { 'body.height': { min: 0.9, max: 2.0, step: 0.01, show: (v) => (+v).toFixed(2), unit: 'm' }, 'body.head': { min: 0.7, max: 1.6, step: 0.01, show: (v) => Math.round(v * 100), unit: '%', parse: (n) => n / 100 } };
function slider(path, label) {
  const f = SLIDER_FMT[path] || { min: 0, max: 1, step: 0.01, show: (v) => Math.round(v * 100), parse: (n) => n / 100 };
  const v = get(path) ?? (f.min + f.max) / 2;
  return `<div class="srow"><span class="name">${label}${f.unit ? ` <span class="faint">(${f.unit})</span>` : ''}</span>
    <input type="number" data-num="${path}" value="${f.show(v)}" step="${f.unit === 'm' ? 0.01 : 1}">
    <button class="reset" data-reset="${path}" title="Reset">${ICON.reset}</button>
    <input type="range" data-slider="${path}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"></div>`;
}
/** Thumbnail grid for one option list. kind: 'face:<part>' (drawn) or a 3D framing. */
function grid(path, options, kind, { big = false, angle = 0.45, recipeFor } = {}) {
  const cur = get(path) ?? (path === 'proportions' ? 'classic' : undefined);
  return `<div class="thumbs ${big ? 'big' : ''}" data-chips="${path}">${options.map((o) => {
    const variant = recipeFor ? recipeFor(o.id) : withValue(path, o.id);
    let img = '', key = '';
    if (kind.startsWith('face:')) img = `<img src="${faceThumb(variant, kind.slice(5))}" alt="">`;
    else { key = `${path}:${o.id}:${hash(thumbBasis(variant, kind))}`; const hit = cachedThumb(key); img = hit ? `<img src="${hit}" alt="">` : ''; queueThumb(key, variant, kind, angle); }
    return `<button class="thumb ${o.id === cur ? 'on' : ''}" data-v="${esc(o.id)}" title="${esc(o.label)}"><span class="img ${img ? '' : 'loading'}" ${key ? `data-key="${key}"` : ''}>${img}</span><span class="lbl">${esc(o.label)}</span></button>`;
  }).join('')}</div>`;
}
function withValue(path, v) { const r = clone(recipe); const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), r)[last] = v; return r; }
function thumbBasis(r, kind) {   // only what affects a thumbnail goes into its cache key
  return { kind, sp: r.species, c: r.colors, pat: r.pattern, hair: r.hair, top: kind === 'torso' ? r.top : null, bot: kind === 'legs' ? r.bottom : null, shoes: kind === 'feet' ? r.shoes : null,
    acc: r.accessories, ears: r.ears, tail: kind === 'back' ? r.tail : null, head: r.body.head, face: kind === 'bust' ? r.face : null, prop: r.proportions === 'v2' ? 'v2' : undefined,
    pres: r.presentation || undefined, bt: r.bodyType || undefined, bod: kind === 'full' ? r.body : undefined };
}
const thumbJobs = [];
function queueThumb(key, r, framing, angle) { thumbJobs.push([key, r, framing, angle]); }
function flushThumbs() {
  if (!$('flow')?.classList.contains('hidden')) { thumbJobs.length = 0; return; }   // setup screen open: its previews come first
  clearThumbQueue();
  for (const [key, r, framing, angle] of thumbJobs.reverse()) {
    requestThumb(key, r, framing, angle, (url) => {
      document.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach((el) => { el.classList.remove('loading'); el.innerHTML = `<img src="${url}" alt="">`; });
      if (key.startsWith('eq:')) renderEquipped();
    });
  }
  thumbJobs.length = 0;
}
const noAcc = (r) => { r.accessories = []; return r; };

// ------------------------------------------------------------------ panel content
const chips = (path, list, cur, labels) => `<div class="chips" data-chips="${path}">${list.map((v) => `<button class="${v === cur ? 'on' : ''}" data-v="${esc(v)}">${esc(labels?.[v] ?? v)}</button>`).join('')}</div>`;
const tiles = (path, list, cur, kind) => `<div class="thumbs big" data-chips="${path}">${list.map((v) => `<button class="thumb ${v === cur ? 'on' : ''}" data-v="${esc(v)}" title="${esc(v)}"><span class="img"><img src="${thumbUrl(kind, recipe.gender, v)}" alt="" onerror="this.remove()"></span><span class="lbl">${esc(v)}</span></button>`).join('')}</div>`;
const swatchList = (path, map, cur) => `<div class="chips" data-chips="${path}">${Object.entries(map).map(([k, c]) => `<button class="${k === cur ? 'on' : ''}" data-v="${esc(k)}"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${Array.isArray(c) ? c[0] : c};margin-right:6px;vertical-align:-1px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)"></span>${esc(k)}</button>`).join('')}</div>`;
function humanTab(r, st) {
  let h = '';
  if (tab === 'start') {
    h += section('Starting anatomy') + chips('gender', ['female', 'male'], r.gender, { female: 'Female', male: 'Male' })
      + `<p class="hint">Realistic human made in Blender. Switching Male / Female keeps your colours.</p>`;
    h += section('Body type') + tiles('bodyType', HUMAN_TYPES[r.gender], r.bodyType, 'body');
    h += `<div class="rnd"><button data-cartoon>Switch to a cartoon character</button><button data-flow>${ICON.start || ''} Run the setup again</button></div>`;
  } else if (tab === 'body') h += section('Body type') + tiles('bodyType', HUMAN_TYPES[r.gender], r.bodyType, 'body');
  else if (tab === 'hair') {
    const list = ['None', ...(r.gender === 'male' ? MALE_HAIR : FEMALE_HAIR)];
    if (st === 'style') h += section('Hairstyle') + tiles('hair', list, r.hair, 'hair') + `<p class="hint">Long hair, ponytails and braids swing as you move.</p>`;
    else h += section('Hair and brow colour') + swatchList('hairColor', HAIR_COLORS, r.hairColor);
  } else if (tab === 'colors') h += section('Skin tone') + swatchList('skin', SKIN_TONES, r.skin) + section('Eye colour') + swatchList('eyeColor', { brown: '#6b3a1e', hazel: '#8a6a2a', green: '#4f7a3a', blue: '#3f6fb0', grey: '#8a96a3' }, r.eyeColor);
  else if (tab === 'outfit') h += section('Clothing colour') + swatches('clothing', ['#2b2b31', '#e8e9f2', '#5b6bd6', '#c43a3a', '#2f8f5b', '#e0a43a', '#d97aa8', '#7a4fc2', '#1f3a5a', '#8a5a3c']);
  return h;
}
function renderTab() {
  renderRail();
  const cat = cats().find((c) => c.id === tab), st = subtab[tab];
  $('tabs').querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('catTitle').textContent = cat.label; $('catSub').textContent = cat.sub;
  $('subtabsWrap').classList.toggle('hidden', !cat.tabs.length);
  $('subtabs').innerHTML = cat.tabs.map(([k, l]) => `<button data-sub="${k}" class="${k === st ? 'on' : ''}">${l}</button>`).join('');
  const r = recipe;
  let h = '';
  if (isHuman()) h = humanTab(r, st);
  else if (tab === 'start') {
    if (st === 'character') {
      h += section('Starting anatomy') + grid('presentation', PRESENTATIONS, 'full', { big: true, angle: 0.5, recipeFor: (v) => noAcc(withValue('presentation', v)) })
        + `<p class="hint">Male and Female set the starting body for every species. Every slider stays free afterwards.</p>`;
      h += section('Body type') + grid('bodyType', BODY_TYPES, 'full', { angle: 0.5, recipeFor: (v) => noAcc(withValue('bodyType', v)) });
      h += `<div class="rnd"><button data-flow>${ICON.start || ''} Run the setup again</button></div>`;
    } else if (st === 'characters') {
      h += section('Ready-made characters');
      h += `<div class="presets">${PRESETS.map((p, i) => {
        const key = `preset:${i}:${hash(p)}`, hit = cachedThumb(key); queueThumb(key, p, 'bust', 0.35);
        return `<button class="thumb" data-preset="${i}" title="${esc(p.name)}"><span class="img ${hit ? '' : 'loading'}" data-key="${key}">${hit ? `<img src="${hit}" alt="">` : `<span class="em">${EMOJI[p.species]}</span>`}</span><span class="lbl">${esc(p.name)}</span></button>`;
      }).join('')}</div>`;
      h += `<div class="rnd"><button data-random="any">${ICON.dice} Surprise me</button><button data-random="species">${ICON.dice} New ${esc(SPECIES[r.species].label.toLowerCase())}</button></div>`;
    } else {
      h += section('Species');
      h += `<div class="thumbs big" data-species>${Object.entries(SPECIES).map(([k, s]) => {
        const v = speciesVariant(k), key = `sp:${k}:${hash(thumbBasis(v, 'bust'))}`, hit = cachedThumb(key); queueThumb(key, v, 'bust', 0.35);
        return `<button class="thumb ${k === r.species ? 'on' : ''}" data-v="${k}" title="${s.label}"><span class="img ${hit ? '' : 'loading'}" data-key="${key}">${hit ? `<img src="${hit}" alt="">` : `<span class="em">${EMOJI[k]}</span>`}</span><span class="lbl">${EMOJI[k]} ${s.label}</span></button>`;
      }).join('')}</div><p class="hint">Changing species keeps your outfit and hair and resets fur or skin colours to that species' defaults.</p>`;
    }
  } else if (tab === 'body') {
    if (st === 'size') h += section('Size') + slider('body.height', 'Height') + slider('body.head', 'Head size') + slider('body.legLength', 'Leg length')
      + section('Body style') + grid('proportions', [{ id: 'classic', label: 'Classic' }, { id: 'v2', label: 'Compact (preview)' }], 'full', { angle: 0.5 });
    if (st === 'shape') h += section('Shape') + slider('body.build', 'Build') + slider('body.shoulders', 'Shoulders') + slider('body.chest', 'Chest') + slider('body.waist', 'Waist') + slider('body.hips', 'Hips') + slider('body.arms', 'Arm thickness') + slider('body.legs', 'Leg thickness');
    if (st === 'style') h += section('Look') + slider('outline', 'Toon outline') + `<p class="hint">A thicker outline gives a bolder cartoon look on stream.</p>`;
  } else if (tab === 'face') {
    if (st === 'eyes') {
      h += section('Eye style') + grid('face.eyes', OPTIONS.eyes, 'face:eyes');
      h += section('Eye colour') + swatches('face.eyeColor', SWATCHES.eyes);
      h += section('Adjust') + slider('face.eyeSize', 'Eye size') + slider('face.eyeSpacing', 'Eye spacing') + slider('face.eyeHeight', 'Eye height') + slider('face.eyeTilt', 'Eye tilt');
      h += `<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" data-check="face.lashes" ${r.face.lashes ? 'checked' : ''}> Eyelashes</label>`;
    }
    if (st === 'brows') h += section('Eyebrows') + grid('face.brows', OPTIONS.brows, 'face:brows') + section('Colour') + swatches('face.browColor', [...SWATCHES.hair.slice(0, 7), r.colors.fur3]);
    if (st === 'mouth') h += section('Mouth') + grid('face.mouth', OPTIONS.mouth, 'face:mouth');
    if (st === 'nose') { h += section('Nose') + grid('face.nose', OPTIONS.nose, 'face:nose'); if (animal()) h += section('Snout') + slider('face.muzzle', 'Snout length'); }
    if (st === 'markings') h += section('Face markings') + grid('face.markings', OPTIONS.markings, 'face:markings');
  } else if (tab === 'colors') {
    if (st === 'main') {
      h += section(animal() ? 'Fur' : 'Skin') + swatches('colors.skin', animal() ? SWATCHES.fur : SWATCHES.skin);
      if (animal()) {
        h += section('Muzzle, cheeks and belly') + swatches('colors.fur2', SWATCHES.fur);
        h += section('Markings and pattern') + swatches('colors.fur3', SWATCHES.fur);
        h += section('Inner ears') + swatches('colors.inner', ['#f5a6b8', '#f6b3c2', '#fbe3d0', '#ecebf0', '#e9d6d6', '#4a4b55', '#24242a', ...SWATCHES.fur.slice(0, 3)]);
      }
      h += section('Nose') + swatches('colors.nose', ['#141418', '#2a1d18', '#f08ca0', '#e58a8a', '#c98468', '#d29a80', '#8a5a3c']);
    } else {
      if (animal()) h += section('Fur pattern') + grid('pattern', OPTIONS.pattern, 'full', { big: true, angle: 0.5, recipeFor: (id) => noAcc(Object.assign(withValue('pattern', id), { top: { ...recipe.top, style: 'none' }, bottom: { ...recipe.bottom, style: 'none' } })) });
      else h += `<p class="hint">Patterns are for animal species. Pick an animal on the Start page to use them.</p>`;
    }
  } else if (tab === 'ears') {
    if (st === 'ears') h += section('Ears') + grid('ears.type', OPTIONS.ears, 'head', { angle: 0.6, recipeFor: (id) => noAcc(withValue('ears.type', id)) }) + section('Adjust') + slider('ears.size', 'Ear size');
    if (st === 'tail') h += section('Tail') + grid('tail.type', OPTIONS.tail, 'back', { angle: 2.5 }) + section('Adjust') + slider('tail.size', 'Tail size');
    h += `<p class="hint">Bunny ears, long tails and long hair swing with your movement on stream.</p>`;
  } else if (tab === 'hair') {
    if (st === 'style') h += section('Hairstyle') + grid('hair.style', OPTIONS.hair, 'head', { angle: 0.5, recipeFor: (id) => noAcc(withValue('hair.style', id)) });
    if (st === 'color') h += section('Main colour') + swatches('hair.color', SWATCHES.hair) + section('Tips and highlights') + swatches('hair.color2', SWATCHES.hair);
  } else if (tab === 'outfit') {
    if (st === 'top') h += section('Top') + grid('top.style', OPTIONS.top, 'torso', { angle: 0.4, recipeFor: (id) => noAcc(withValue('top.style', id)) }) + section('Main colour') + swatches('top.color', SWATCHES.cloth) + section('Trim colour') + swatches('top.color2', SWATCHES.cloth);
    if (st === 'bottom') h += section('Bottom') + grid('bottom.style', OPTIONS.bottom, 'legs', { angle: 0.4 }) + section('Colour') + swatches('bottom.color', SWATCHES.cloth);
    if (st === 'shoes') h += section('Shoes') + grid('shoes.style', OPTIONS.shoes, 'feet', { angle: 0.7 }) + section('Main colour') + swatches('shoes.color', SWATCHES.cloth) + section('Sole and trim') + swatches('shoes.color2', SWATCHES.cloth);
  } else if (tab === 'extras') {
    h += section(`Accessories · ${r.accessories.length} of ${ACCESSORY_LIMIT}`);
    h += `<div class="thumbs">${OPTIONS.accessories.map((o) => {
      const on = r.accessories.some((a) => a.id === o.id), dis = !on && r.accessories.length >= ACCESSORY_LIMIT;
      const variant = clone(recipe); variant.accessories = [{ id: o.id, color: r.accessories.find((a) => a.id === o.id)?.color || defaultAccColor(o.id) }];
      const framing = ['backpack', 'wings'].includes(o.id) ? 'back' : ['scarf', 'choker'].includes(o.id) ? 'torso' : 'head';
      const key = `acc:${o.id}:${hash(thumbBasis(variant, framing))}`, hit = cachedThumb(key); queueThumb(key, variant, framing, framing === 'back' ? 2.6 : 0.5);
      return `<label class="thumb acc-tile ${on ? 'on' : ''}" title="${esc(o.label)}"><input type="checkbox" data-acc="${o.id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><span class="img ${hit ? '' : 'loading'}" data-key="${key}">${hit ? `<img src="${hit}" alt="">` : ''}</span><span class="lbl">${esc(o.label)}</span></label>`;
    }).join('')}</div>`;
    if (r.accessories.length) h += section('Colours') + `<div class="acc-colors">${r.accessories.map((a, i) => `<div class="ac"><span>${esc(OPTIONS.accessories.find((o) => o.id === a.id)?.label || a.id)}</span>${swatches(`accessories.${i}.color`, [...SWATCHES.cloth.slice(0, 8), '#ffe27a', '#c9a84a'])}</div>`).join('')}</div>`;
  }
  $('tabBody').innerHTML = h;
  bindTab();
  wireRanges($('tabBody'));
  flushThumbs();
}
function speciesVariant(k) { const v = withSpecies(clone(recipe), k, true); v.ears.type = 'auto'; v.tail.type = 'auto'; v.face.nose = 'auto'; if (SPECIES[k].style === 'human' && v.face.markings === 'mask') v.face.markings = 'none'; return noAcc(v); }
const defaultAccColor = (id) => (id === 'halo' ? '#ffe27a' : id === 'crown' ? '#e8c45a' : '#1f2026');

function bindTab() {
  const body = $('tabBody');
  body.querySelectorAll('[data-chips]').forEach((box) => (box.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) set(box.dataset.chips, b.dataset.v); }));
  body.querySelectorAll('[data-sw]').forEach((box) => {
    box.onclick = (e) => { const v = e.target.dataset?.v; if (v) set(box.dataset.sw, v); };
    const inp = box.querySelector('input[type=color]'); inp.onchange = () => set(box.dataset.sw, inp.value);
  });
  body.querySelectorAll('[data-slider]').forEach((el) => {
    let first = true;
    const path = el.dataset.slider, f = SLIDER_FMT[path] || { show: (v) => Math.round(v * 100) };
    el.oninput = () => {      // one undo step per drag
      const v = Number(el.value);
      if (first) { history.push(clone(recipe)); future = []; first = false; updateUndo(); }
      const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), recipe)[last] = v;
      dirty = true; rebuild(); paintRange(el);
      const num = body.querySelector(`[data-num="${path}"]`); if (num && document.activeElement !== num) num.value = f.show(v);
    };
    el.onchange = () => { first = true; renderEquipped(); };
  });
  body.querySelectorAll('[data-num]').forEach((el) => (el.onchange = () => {
    const path = el.dataset.num, f = SLIDER_FMT[path] || { min: 0, max: 1, parse: (n) => n / 100 };
    const rng = body.querySelector(`[data-slider="${path}"]`), min = +rng.min, max = +rng.max;
    const raw = Number(el.value); if (!Number.isFinite(raw)) return;
    const v = Math.min(max, Math.max(min, f.parse ? f.parse(raw) : raw));
    set(path, Math.round(v * 1000) / 1000);
  }));
  body.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = () => set(b.dataset.reset, getDefault(b.dataset.reset) ?? 0.5)));
  body.querySelectorAll('[data-check]').forEach((el) => (el.onchange = () => set(el.dataset.check, el.checked)));
  body.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { change((r) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, clone(PRESETS[+b.dataset.preset])); }); $('name').value = recipe.name; toast(`Loaded ${recipe.name}`); }));   // a ready-made character comes exactly as it is
  body.querySelectorAll('[data-random]').forEach((b) => (b.onclick = () => { change((r) => Object.assign(r, randomRecipe(Math.random() * 1e9, b.dataset.random === 'species' ? { species: r.species } : {}))); $('name').value = recipe.name; }));
  body.querySelector('[data-flow]')?.addEventListener('click', () => openFlow());
  body.querySelector('[data-cartoon]')?.addEventListener('click', () => { const g = recipe.gender; change((r) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, recipeFromFlow({ presentation: g, species: 'human', bodyType: 'balanced' })); }); $('name').value = recipe.name; });
  const sp = body.querySelector('[data-species]');
  if (sp) sp.onclick = (e) => { const v = e.target.closest('[data-v]')?.dataset.v; if (!v || v === recipe.species) return; change((r) => { withSpecies(r, v, true); r.ears.type = 'auto'; r.tail.type = 'auto'; r.face.nose = 'auto'; if (SPECIES[v].style === 'human' && r.face.markings === 'mask') r.face.markings = 'none'; }); };
  body.querySelectorAll('[data-acc]').forEach((el) => (el.onchange = () => change((r) => {
    const id = el.dataset.acc, i = r.accessories.findIndex((a) => a.id === id);
    if (el.checked && i < 0 && r.accessories.length < ACCESSORY_LIMIT) r.accessories.push({ id, color: defaultAccColor(id) });
    if (!el.checked && i >= 0) r.accessories.splice(i, 1);
  })));
}

// ------------------------------------------------------------------ equipped list (click to jump)
const label = (k, id) => OPTIONS[k]?.find((o) => o.id === id)?.label || id;
function renderEquipped() {
  if (isHuman()) {
    const r = recipe, rows = [['start', 'character', 'Character', `${r.gender === 'male' ? 'Male' : 'Female'} · realistic`], ['body', '', 'Body type', r.bodyType], ['hair', 'style', 'Hair', r.hair], ['hair', 'color', 'Hair colour', r.hairColor], ['colors', '', 'Skin', r.skin], ['colors', '', 'Eyes', r.eyeColor]];
    $('equipped').innerHTML = `<h3>Equipped <button class="ghost" id="eqClose" title="Hide">×</button></h3>` + rows.map(([t, s2, k, v]) => `<button class="it" data-jt="${t}" data-js="${s2}"><span class="ic">${EMOJI.human}</span><span><small>${k}</small>${esc(v)}</span></button>`).join('');
    $('eqClose').onclick = () => { document.body.classList.add('equip-closed'); updateShift(); };
    $('equipped').querySelectorAll('[data-jt]').forEach((b) => (b.onclick = () => { tab = b.dataset.jt; if (b.dataset.js) subtab[tab] = b.dataset.js; document.body.classList.remove('panel-closed'); renderTab(); }));
    return;
  }
  const r = recipe, sp = SPECIES[r.species];
  const rows = [
    ['start', 'species', 'Species', `${EMOJI[r.species]} ${sp.label}`, null],
    ['face', 'eyes', 'Eyes', label('eyes', r.face.eyes), faceThumb(r, 'eyes', 60)],
    ['face', 'mouth', 'Mouth', label('mouth', r.face.mouth), faceThumb(r, 'mouth', 60)],
    ['hair', 'style', 'Hair', label('hair', r.hair.style), null, r.hair.color],
    ['outfit', 'top', 'Top', label('top', r.top.style), null, r.top.color],
    ['outfit', 'bottom', 'Bottom', label('bottom', r.bottom.style), null, r.bottom.color],
    ['outfit', 'shoes', 'Shoes', label('shoes', r.shoes.style), null, r.shoes.color],
    ['ears', 'ears', 'Ears', r.ears.type === 'auto' ? `${label('ears', sp.ears)} (default)` : label('ears', r.ears.type), null],
    ['ears', 'tail', 'Tail', r.tail.type === 'auto' ? `${label('tail', sp.tail)} (default)` : label('tail', r.tail.type), null],
    ...r.accessories.map((a) => ['extras', 'all', 'Accessory', label('accessories', a.id), null, a.color]),
  ];
  $('equipped').innerHTML = `<h3>Equipped <button class="ghost" id="eqClose" title="Hide">×</button></h3>` + rows.map(([t, s, k, v, img, color]) =>
    `<button class="it" data-jt="${t}" data-js="${s}"><span class="ic">${img ? `<img src="${img}" alt="">` : color ? `<span style="width:18px;height:18px;border-radius:50%;background:${color};box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)"></span>` : EMOJI[r.species]}</span><span><small>${k}</small>${esc(v)}</span></button>`).join('');
  $('eqClose').onclick = () => { document.body.classList.add('equip-closed'); updateShift(); };
  $('equipped').querySelectorAll('[data-jt]').forEach((b) => (b.onclick = () => { tab = b.dataset.jt; subtab[tab] = b.dataset.js; document.body.classList.remove('panel-closed'); renderTab(); }));
}

// ------------------------------------------------------------------ saved characters strip
async function renderSaved() {
  try {
    const lib = await fetch('/api/library').then((r) => r.json());
    const mine = lib.avatars.filter((a) => a.sourceType === 'created').slice(0, 8);
    $('savedStrip').innerHTML = (mine.length ? `<span class="lbl">Mine</span>` : '') + mine.map((a) => `<a href="/creator.html?id=${a.id}" class="${a.id === editId ? 'cur' : ''}" title="Edit ${esc(a.name)}">${a.thumbUrl ? `<img src="${a.thumbUrl}" alt="">` : EMOJI.human}</a>`).join('') +
      `<a href="/creator.html" title="Start a new character" style="color:var(--muted)">${ICON.plus}</a>`;
    $('savedStrip').querySelector('a:last-child svg').style.width = '20px';
  } catch {}
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
    renderSaved();
    if (!editId || asCopy) setTimeout(() => { location.href = `/library.html#a=${j.avatar.id}`; }, 700);
  } catch (e) { setStatus(e.message, 'error'); }
  finally { $('save').disabled = $('saveCopy').disabled = false; }
}
$('save').onclick = () => save(false);
$('saveCopy').onclick = () => save(true);

// ------------------------------------------------------------------ new-character start flow: Male/Female -> Species -> Body type
const PRESENTATIONS = [{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }];
const BODY_TYPES = [{ id: 'compact', label: 'Compact' }, { id: 'balanced', label: 'Balanced' }, { id: 'athletic', label: 'Athletic' }, { id: 'broad', label: 'Broad' }, { id: 'custom', label: 'Custom' }];
const BODY_TYPE_HINT = { compact: 'Shorter and rounder', balanced: 'The standard shape', athletic: 'Broad shoulders, slim waist', broad: 'Wide and sturdy throughout', custom: 'Neutral; shape it with sliders' };
/** A clean starting character for the chosen sex, species and body type (built on that species' ready-made look). */
function recipeFromFlow({ presentation, species, bodyType }) {
  const base = PRESETS.find((p) => p.species === species);
  const r = base ? clone(base) : withSpecies(defaultRecipe(), species, true);
  r.name = 'New character'; r.accessories = []; r.proportions = 'v2';
  r.presentation = presentation || null; r.bodyType = bodyType || 'balanced';
  r.face = { ...r.face, lashes: presentation === 'female' };
  if (SPECIES[species]?.style === 'human') r.hair = presentation === 'female' ? { style: 'long', color: '#4a2f22', color2: '#6b4226' } : { style: 'short', color: '#2b2220', color2: '#3b2a22' };
  return r;
}
// simple fitted clothes for the Male / Female previews, so the body shape is easy to see
const anatomyPreview = (r) => { r.top = { style: 'tank', color: '#5b6bd6', color2: '#e8e9f2' }; r.bottom = { style: 'shorts', color: '#2b2c36' }; r.shoes = { style: 'sneakers', color: '#e8e9f2', color2: '#5b6bd6' }; return r; };
const flow = { step: 0, presentation: null, species: 'fox', bodyType: 'balanced' };
const FLOW_STEPS = [
  { title: 'Who are you creating?', sub: 'Choose the starting anatomy. You can change it, and every slider, at any time.', key: 'presentation',
    items: () => PRESENTATIONS.map((o) => ({ ...o, recipe: anatomyPreview(recipeFromFlow({ ...flow, presentation: o.id, species: 'human' })) })) },
  { title: 'Pick a species', sub: 'Each species has its own head, ears, tail and paws.', key: 'species',
    items: () => [{ id: 'realhuman', label: '🧑 Realistic human (new)', img: thumbUrl('body', flow.presentation === 'male' ? 'male' : 'female', 'Balanced') },
      ...Object.entries(SPECIES).map(([k, sp]) => ({ id: k, label: `${EMOJI[k]} ${sp.label}`, recipe: recipeFromFlow({ ...flow, species: k }) }))] },
  { title: 'Choose a body type', sub: 'A starting shape, not a limit: fine-tune everything in the Creator.', key: 'bodyType',
    items: () => (flow.species === 'realhuman'
      ? HUMAN_TYPES[flow.presentation === 'male' ? 'male' : 'female'].map((n) => ({ id: n, label: n, img: thumbUrl('body', flow.presentation === 'male' ? 'male' : 'female', n) }))
      : BODY_TYPES.map((o) => ({ ...o, hint: BODY_TYPE_HINT[o.id], recipe: recipeFromFlow({ ...flow, bodyType: o.id }) }))) },
];
function openFlow() { clearThumbQueue(); flow.step = 0; flow.presentation = recipe.presentation || recipe.gender || null; flow.species = isHuman() ? 'realhuman' : recipe.species; flow.bodyType = recipe.bodyType || 'balanced'; $('flow').classList.remove('hidden'); renderFlow(); }
function closeFlow() { $('flow').classList.add('hidden'); clearThumbQueue(); renderTab(); }   // panel thumbnails resume
function renderFlow() {
  const st = FLOW_STEPS[flow.step], items = st.items();
  $('flowSteps').innerHTML = FLOW_STEPS.map((x, i) => `<span class="${i === flow.step ? 'on' : i < flow.step ? 'done' : ''}">${i + 1} · ${['Male / Female', 'Species', 'Body type'][i]}</span>`).join('');
  $('flowTitle').textContent = st.title; $('flowSub').textContent = st.sub;
  $('flowGrid').className = `flowgrid n${items.length > 6 ? 'many' : items.length}`;
  $('flowGrid').innerHTML = items.map((it) => {
    if (it.img) return `<button class="fcard ${flow[st.key] === it.id ? 'on' : ''}" data-fv="${esc(it.id)}"><span class="img"><img src="${it.img}" alt="" onerror="this.remove()"></span><span class="lbl">${esc(it.label)}</span></button>`;
    const key = `flow:${st.key}:${it.id}:${hash(thumbBasis(it.recipe, 'full'))}`, hit = cachedThumb(key);
    requestThumb(key, it.recipe, 'full', 0.5, (url) => { document.querySelectorAll(`[data-fkey="${CSS.escape(key)}"]`).forEach((el) => { el.classList.remove('loading'); el.innerHTML = `<img src="${url}" alt="">`; }); });
    return `<button class="fcard ${flow[st.key] === it.id ? 'on' : ''}" data-fv="${esc(it.id)}"><span class="img ${hit ? '' : 'loading'}" data-fkey="${key}">${hit ? `<img src="${hit}" alt="">` : ''}</span><span class="lbl">${esc(it.label)}</span>${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}</button>`;
  }).join('');
  $('flowBack').classList.toggle('invisible', flow.step === 0);
  $('flowNext').textContent = flow.step === FLOW_STEPS.length - 1 ? 'Start customizing' : 'Next';
  $('flowNext').disabled = !flow[st.key];
}
function finishFlow() {
  if (flow.species === 'realhuman') {
    const g = flow.presentation === 'male' ? 'male' : 'female', fresh = { ...defaultHuman(g), bodyType: HUMAN_TYPES[g].includes(flow.bodyType) ? flow.bodyType : 'Balanced', name: 'New character' };
    change((r) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, fresh); });
    $('name').value = recipe.name; tab = 'hair'; subtab.hair = 'style'; renderTab(); renderEquipped(); closeFlow();
    toast(`Realistic ${g} ready to customize`); return;
  }
  const fresh = recipeFromFlow(flow);
  change((r) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, fresh); });
  $('name').value = recipe.name; tab = 'body'; subtab.body = 'size'; renderTab(); renderEquipped(); closeFlow();
  toast(`${flow.presentation === 'female' ? 'Female' : 'Male'} ${SPECIES[flow.species].label.toLowerCase()} ready to customize`);
}
$('flowGrid').onclick = (e) => {
  const b = e.target.closest('[data-fv]'); if (!b) return;
  const st = FLOW_STEPS[flow.step]; flow[st.key] = b.dataset.fv;
  if (st.key === 'species') flow.bodyType = b.dataset.fv === 'realhuman' ? 'Balanced' : (BODY_TYPES.some((o) => o.id === flow.bodyType) ? flow.bodyType : 'balanced');
  if (flow.step < FLOW_STEPS.length - 1) { flow.step++; renderFlow(); } else renderFlow();
};
$('flowBack').onclick = () => { if (flow.step > 0) { flow.step--; renderFlow(); } };
$('flowNext').onclick = () => { if (flow.step < FLOW_STEPS.length - 1) { flow.step++; renderFlow(); } else finishFlow(); };
$('flowSkip').onclick = () => closeFlow();

// ------------------------------------------------------------------ start
(async () => {
  if (editId) {
    try {
      const [{ avatar }, rec] = await Promise.all([fetch(`/api/library/${editId}`).then((r) => r.json()), fetch(`/api/library/${editId}/file`).then((r) => r.json())]);
      recipe = rec.kind === 'human' ? { ...defaultHuman(rec.gender), ...rec, name: avatar.name } : { ...defaultRecipe(), ...rec, name: avatar.name };
      $('save').textContent = 'Save changes'; $('saveCopy').classList.remove('hidden');
      document.title = `Editing ${avatar.name} · Kael Studio`;
      const lib = await fetch('/api/library').then((r) => r.json());
      $('makeActive').checked = lib.activeId === editId;
      tab = rec.kind === 'human' ? 'hair' : 'face';
    } catch { setStatus('Could not open that character. Starting a new one instead.', 'error'); }
  }
  $('name').value = recipe.name;
  updateUndo(); renderTab(); renderEquipped(); renderSaved(); rebuild(); updateShift();
  if (!editId && params.get('setup') !== '0') openFlow();     // new characters start with Male/Female -> Species -> Body type
})();
window.__creator = { get recipe() { return recipe; }, viewer, set: (p, v) => set(p, v), get building() { return building || !!pending; }, flow, openFlow, recipeFromFlow };     // for automated tests
