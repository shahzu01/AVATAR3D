// Character Maker, laid out like VRoid Studio: tabs across the top (Face, Hair, Body, Outfit, Accessories, Animal, Look),
// sections down the left, a grid of picture cards for the choices, the character in the middle, colours on the right.
// Start points (Create New, sample models) are on the Characters home page (/characters.html).
import { AvatarViewer } from '/viewer.js';
import { topbar, toast } from '/ui.js';
import { loadKit, defaultModular, PART_ROWS, OUTFITS, SLOTS, outfitSlice, customFrom, BODY_SLIDERS, defaultOutfit, hairChoices, hairSource, outfitGroup, ACCESSORIES, accessoriesOf, FACE_SHAPES, faceShapeGroup, faceShapeOf, EYE_SHAPES, eyeShapeGroup, eyeShapeOf } from '/modular.js';
import { ensureBaked } from '/autobake.js';
import { EARS, TAILS, furTipFor } from '/animal.js';
import { READY } from '/readymade.js';
import { allJobs, makeMissing, thumbUrl } from '/thumbmaker.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const q = new URLSearchParams(location.search); const editId = q.get('id');
let savedId = editId, dirty = false;      // the library character this page is editing, and whether it has unsaved changes
topbar('mixer');
const viewer = new AvatarViewer($('viewer')); viewer.setGrid(false); window.viewer = viewer;
const kit = await loadKit();
const HEADS = Object.entries(kit.heads || {});
const DEFAULT_HAIR = { anime_female: 'Bob', mika_female: 'High ponytail', female: 'Bob', anime_male: 'Side part comb over', male: 'Short crew cut' };
/** A fresh character on one body, in the plain starting clothes (like VRoid's T-shirt and shorts). */
function fromBase(b) {
  const head = HEADS.find(([k]) => k === b || (b === 'nekomika' && /neko/i.test(k)));
  if (head) { const body = kit.bodies.mika_female ? 'mika_female' : 'anime_female'; return { ...defaultModular(body), name: '', headModel: head[0], skin: head[1].skin || '#ecc4ad', outfit: 'casual', clothing: '#26262e', accent: '#f2efe9' }; }
  if (!kit.bodies[b]) b = 'anime_female';
  return { ...defaultModular(b), hair: DEFAULT_HAIR[b] || 'Bob', outfit: 'casual', clothing: '#26262e', accent: '#f2efe9' };
}
let recipe = fromBase('anime_female');
let view = 'front-full', seq = 0, first = true, tab = 'face', section = null;
const made = new Map();       // pictures made during this visit (fresh URLs)
const thumb = (cat, key) => { const k = `${cat}/${String(key).replace(/[^\w-]+/g, '_')}`; return { k, url: made.get(k) || thumbUrl(cat, key) }; };
const card = (pick, label, img, on, cls = '') => `<button class="opt ${on ? 'on' : ''} ${cls}" data-pick="${esc(pick)}" title="${esc(label)}"><span class="im" ${img ? `data-thumb="${img.k}" style="background-image:url('${img.url}')"` : ''}>${img ? '' : '∅'}</span><span class="lb">${esc(label)}</span></button>`;

// ------------------------------------------------------------------ what each tab offers
const hairKey = () => { const src = hairSource(kit, recipe.parts.Head).body; return src === 'mika_female' ? 'anime_female' : src; };
const worn = () => accessoriesOf(kit, recipe);
const HAIR_EXTRA = ['bow', 'kanzashi', 'headdress', 'tiara'], ACC_MAIN = ['headset', 'glasses', 'choker', 'scarf'];
const TABS = {
  face: { label: 'Face', sections: [['shape', 'Face shape', '◯'], ['eyes', 'Eyes', '◉']] },
  hair: { label: 'Hairstyle', sections: [['style', 'Hairstyle', '♒'], ['extra', 'Extra', '✿']] },
  body: { label: 'Body', sections: [['base', 'Base body', '⚲'], ['shape', 'Proportions', '⇕'], ['mix', 'Mix parts', '⧉']] },
  outfit: { label: 'Outfit', sections: [['sets', 'Whole sets', '👗'], ['top', 'Tops', '👕'], ['bottom', 'Bottoms', '👖'], ['legs', 'Legwear', '🧦'], ['shoes', 'Shoes', '👟']] },
  acc: { label: 'Accessories', sections: [['acc', 'Accessories', '🎧']] },
  animal: { label: 'Animal', sections: [['ears', 'Ears', '▲'], ['tail', 'Tail', '∿']] },
  look: { label: 'Look', sections: [['look', 'Look', '✦']] },
};
const panels = {
  shape() {
    if (recipe.headModel) return '<h3>Face shape</h3><p class="hint">This head keeps its own face. Pick another base on the Body tab to choose a face shape.</p>';
    const g = faceShapeGroup(kit, recipe.parts.Head), cur = faceShapeOf(kit, recipe)[0];
    return `<h3>Face shape</h3><div class="cards">${FACE_SHAPES[g].map(([k, n]) => card(`faceShape:${k}`, n, thumb('face', k), k === cur)).join('')}</div>`;
  },
  eyes() {
    const g = recipe.headModel ? null : eyeShapeGroup(kit, recipe.parts.Head);
    if (!g) return '<h3>Eyes</h3><p class="hint">This head keeps its own eyes. You can still change the eye colour on the right.</p>';
    const cur = eyeShapeOf(kit, recipe)?.[0];
    return `<h3>Eyes</h3><div class="cards">${EYE_SHAPES[g].map(([k, n]) => card(`eyeShape:${k}`, n, thumb('eyes', k), k === cur)).join('')}</div>`;
  },
  style() {
    if (recipe.headModel) return '<h3>Hairstyle</h3><p class="hint">This head comes with its own hair.</p>';
    const list = hairChoices(kit, recipe.parts.Head), hk = hairKey();
    return `<h3>Hairstyle</h3><div class="cards">${card('hair:None', 'None', null, recipe.hair === 'None', 'none')}${list.map((h) => card(`hair:${h.name}`, h.name, thumb('hair', `${hk}__${h.name}`), h.name === recipe.hair)).join('')}</div>`;
  },
  extra() { const w = worn(); return `<h3>Extra</h3><p class="hint">Bows, pins and headpieces that sit in the hair. Tap to add or remove.</p><div class="cards">${HAIR_EXTRA.map((k) => card(`acc:${k}`, ACCESSORIES[k], thumb('acc', k), w.includes(k))).join('')}</div>`; },
  base() {
    const bodies = Object.entries(kit.bodies).map(([k, b]) => [k, b.label]), cur = recipe.headModel ? `head:${recipe.headModel}` : (PART_ROWS.every(([, ps]) => ps.every((p) => recipe.parts[p] === recipe.parts.Torso)) ? recipe.parts.Torso : null);
    return `<h3>Base body</h3><p class="hint">Changes the whole body. Your hair, outfit and colours stay where they can.</p><div class="cards">${bodies.map(([k, n]) => card(`base:${k}`, n, thumb('base', k), cur === k)).join('')}${HEADS.map(([k, h]) => card(`base:${k}`, `${h.label} head`, thumb('base', k), cur === `head:${k}`)).join('')}</div>`;
  },
  shape() {
    const bd = { height: 1, legs: 1, shoulders: 0, waist: 0, hips: 0, ...(recipe.body || {}) }, fitN = (p, d = 1) => (typeof recipe.fit[p] === 'number' ? recipe.fit[p] : d);
    const sl = (key, label, min, max, val, step = 0.01) => `<div class="line col"><span>${label} <b class="muted" data-out="${key}">${val.toFixed(2)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-body="${key}"></div>`;
    return `<h3>Proportions</h3><p class="hint">Drag a slider; the character updates when you let go. Clothes, hair and the face follow.</p>` +
      BODY_SLIDERS.map(([k, n, a, b]) => sl(k, n, a, b, bd[k])).join('') +
      sl('fit:Head', 'Head size', 0.8, 1.25, fitN('Head')) + sl('fit:Arm', 'Arm thickness', 0.8, 1.3, fitN('Arm_L')) + sl('fit:Leg', 'Leg thickness', 0.8, 1.3, fitN('Leg_L')) +
      '<button data-reset-body style="margin-top:8px">Reset proportions</button>';
  },
  top() { return slotPanel('top'); }, bottom() { return slotPanel('bottom'); }, legs() { return slotPanel('legs'); }, shoes() { return slotPanel('shoes'); },
  mix() {
    const bodies = Object.entries(kit.bodies), FITS = [['own', 'Own size'], ['match', 'Match']];
    return `<h3>Mix parts</h3><p class="hint">Take each part from a different body. <b>Match</b> scales a part to what it attaches to.</p>` + PART_ROWS.map(([label, ps]) => {
      const isHead = label === 'Head', cur = isHead && recipe.headModel ? `model:${recipe.headModel}` : recipe.parts[ps[0]], fit = recipe.fit[ps[0]] ?? 'own';
      const extra = isHead ? HEADS.map(([k, h]) => `<option value="model:${k}" ${cur === `model:${k}` ? 'selected' : ''}>${esc(h.label)} (complete head)</option>`).join('') : '';
      return `<div class="prow"><span class="k">${label}</span><select data-part="${label}">${bodies.map(([k, b]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}${extra}</select>
        ${ps[0] === 'Torso' ? '<span></span>' : `<select data-fit="${label}">${FITS.map(([v, n]) => `<option value="${v}" ${v === fit ? 'selected' : ''}>${n}</option>`).join('')}</select>`}</div>`;
    }).join('') + '<div id="notes"></div>';
  },
  sets() {
    const cur = recipe.outfit || defaultOutfit(kit, recipe.parts.Torso), grp = outfitGroup(kit, recipe.parts.Torso);
    const GN = { anime: 'Anime', female: 'Everyday (women)', male: 'Everyday (men)', premium: 'Premium', premiumMale: 'Premium (men)', any: 'Basics' };
    const order = grp === 'male' ? ['premiumMale', 'male', 'any', 'premium', 'anime', 'female'] : ['premium', grp, 'any', ...['anime', 'female'].filter((g) => g !== grp), 'premiumMale', 'male'];
    return '<h3>Whole sets</h3><p class="hint">Change the colours on the right.</p>' + order.map((g) => { const list = Object.entries(OUTFITS).filter(([, o]) => o.group === g); if (!list.length) return '';
      return `<h4>${GN[g]}</h4><div class="cards">${list.map(([k, o]) => card(`outfit:${k}`, o.label.split(':')[0], thumb('outfit', k), k === cur)).join('')}</div>`; }).join('') + `<h4>Nothing</h4><div class="cards">${card('outfit:none', 'No outfit', null, cur === 'none', 'none')}</div>`;
  },
  acc() { const w = worn(), list = [...ACC_MAIN, ...['catEars', 'tail'].filter((k) => w.includes(k))]; return `<h3>Accessories</h3><p class="hint">Tap to add or remove. Each outfit starts with its own; hair pieces are under Hairstyle › Extra.</p><div class="cards">${list.map((k) => card(`acc:${k}`, ACCESSORIES[k], thumb('acc', k), w.includes(k))).join('')}</div>`; },
  ears() { if (recipe.headModel) return '<h3>Ears</h3><p class="hint">This head has its own ears.</p>'; return `<h3>Ears</h3><div class="cards">${Object.entries(EARS).map(([k, n]) => card(`ears:${k}`, n, k === 'none' ? null : thumb('ears', k), (recipe.ears || 'none') === k, k === 'none' ? 'none' : '')).join('')}</div>`; },
  tail() { return `<h3>Tail</h3><p class="hint">Tails swing as you move: press <b>Sway</b> above the character.</p><div class="cards">${Object.entries(TAILS).map(([k, n]) => card(`tail:${k}`, n, k === 'none' ? null : thumb('tail', k), (recipe.tail || 'none') === k, k === 'none' ? 'none' : '')).join('')}</div>`; },
  look() { return `<h3>Look</h3><p class="hint">How the whole character is drawn.</p>
    <div class="line"><span>Ink outline (anime edge lines)</span><input type="checkbox" data-flag="outline" ${recipe.outline !== false ? 'checked' : ''}></div>
    <div class="line"><span>Painted hair, shading and clothes</span><input type="checkbox" data-flag="paint" ${recipe.paint !== false ? 'checked' : ''}></div>
    <h4>Preview light</h4><div class="cards three">${['showcase', 'studio', 'soft', 'warm', 'cool', 'neon'].map((l) => `<button class="opt" data-light="${l}"><span class="lb">${l[0].toUpperCase() + l.slice(1)}</span></button>`).join('')}</div>`; },
};
const SLOT_NAME = Object.fromEntries(SLOTS);
/** One card per different piece the outfits have for a slot (identical pieces, such as plain shoes, appear once). */
function slotChoices(slot) { const seen = new Map(); for (const k of Object.keys(OUTFITS)) { const d = outfitSlice(k, slot); if (!d) continue; const sig = JSON.stringify(d.layers) + JSON.stringify(d.extras) + JSON.stringify(d.skirt || d.skirts || ''); if (!seen.has(sig)) seen.set(sig, k); } return [...seen.values()]; }
const slotFrom = (slot) => (recipe.outfit === 'custom' ? recipe.custom?.[slot]?.from : outfitSlice(recipe.outfit || defaultOutfit(kit, recipe.parts.Torso), slot) ? (recipe.outfit || defaultOutfit(kit, recipe.parts.Torso)) : 'none') || 'none';
function slotPanel(slot) {
  const cur = slotFrom(slot);
  return `<h3>${SLOT_NAME[slot]}</h3><p class="hint">Mix pieces from different outfits. Each piece keeps its own colours (right).</p><div class="cards">${card(`piece:${slot}:none`, 'None', null, cur === 'none', 'none')}${slotChoices(slot).map((k) => card(`piece:${slot}:${k}`, OUTFITS[k].label.split(':')[0], thumb('piece', `${slot}_${k}`), cur === k || (cur !== 'none' && JSON.stringify(outfitSlice(cur, slot)) === JSON.stringify(outfitSlice(k, slot))))).join('')}</div>`;
}
const colour = (id, label) => `<div class="line"><span>${label}</span><input type="color" data-col="${id}" value="${id === 'eyeColor' ? (recipe.eyeColor || (kit.bodies[recipe.parts.Head]?.base === 'male' ? '#2f8f8a' : '#4f7396')) : (recipe[id] || (id === 'accent' ? '#f2efe9' : '#888888'))}"></div>`;
const PROPS = {
  face: () => colour('skin', 'Skin') + colour('eyeColor', 'Eyes'),
  hair: () => (recipe.headModel ? '<p class="muted">This head keeps its own hair colour.</p>' : colour('hairColor', 'Hair')),
  body: () => colour('skin', 'Skin') + `<div id="height" class="muted"></div>`,
  outfit: () => { const slot = SLOT_NAME[section] ? section : null;
    if (slot && recipe.outfit === 'custom') { const c = recipe.custom[slot] || {}; return `<p class="muted">${SLOT_NAME[slot]}</p><div class="line"><span>Main colour</span><input type="color" data-ccol="${slot}:main" value="${c.main || recipe.clothing}"></div><div class="line"><span>Accent colour</span><input type="color" data-ccol="${slot}:accent" value="${c.accent || recipe.accent || '#f2efe9'}"></div>`; }
    return colour('clothing', 'Main colour') + colour('accent', 'Accent colour') + (recipe.outfit === 'custom' ? '<p class="muted">Applies to pieces without colours of their own. Pick a section on the left to colour one piece.</p>' : ''); },
  acc: () => colour('accent', 'Accent colour'),
  animal: () => `<div class="line"><span>Same colour as the hair</span><input type="checkbox" data-flag="furMatch" ${recipe.furColor ? '' : 'checked'}></div>` + (recipe.furColor ? colour('furColor', 'Fur') : '') + `<div class="line"><span>Tip (fox, wolf, bunny puff)</span><input type="color" data-col="furTip" value="${recipe.furTip || furTipFor(recipe.tail !== 'none' ? recipe.tail : recipe.ears, recipe.furColor || recipe.hairColor)}"></div>`,
  look: () => '',
};

function render() {
  $('tabs').innerHTML = Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t.label}</button>`).join('');
  const secs = TABS[tab].sections; if (!secs.some(([k]) => k === section)) section = secs[0][0];
  $('rail').innerHTML = secs.map(([k, n, g]) => `<button data-sec="${k}" class="${k === section ? 'on' : ''}" title="${n}"><span class="g">${g}</span>${n}</button>`).join('');
  $('panel').innerHTML = panels[section]();
  $('props').innerHTML = `<h4>${TABS[tab].label} colours</h4>` + PROPS[tab]() + (tab !== 'body' ? '<div id="notes"></div>' : '');
  $('name').value = recipe.name || '';
  showNotes();
}
function showNotes() {
  const n = viewer.vrm?.userData?.modularNotes || [], h = viewer.vrm?.userData?.modularHeight;
  for (const el of document.querySelectorAll('#notes')) el.innerHTML = `<b>Height ${h ? h.toFixed(2) : '?'} m.</b> ` + n.map((x) => x.replace(/^(\w+):/, '<b>$1</b>:')).join('<br>');
  if ($('height')) $('height').textContent = h ? `Height ${h.toFixed(2)} m` : '';
}
function setStatus(t, kind = '') { $('status').textContent = t; $('status').className = `status ${kind}`; }

// ------------------------------------------------------------------ undo / redo: every change is a snapshot of the recipe
const hist = []; let hpos = -1, fromHistory = false;
const histButtons = () => { $('undo').disabled = hpos <= 0; $('redo').disabled = hpos >= hist.length - 1; };
function remember() { const s = JSON.stringify(recipe); if (hist[hpos] === s) return; hist.splice(hpos + 1); hist.push(s); if (hist.length > 80) hist.shift(); hpos = hist.length - 1; histButtons(); }
function travel(d) { const p = hpos + d; if (p < 0 || p >= hist.length) return; hpos = p; const keep = recipe.name; recipe = JSON.parse(hist[p]); recipe.name = keep; fromHistory = true; render(); refresh(); histButtons(); }

// ------------------------------------------------------------------ a random character
const PALETTE = ['#24315e', '#7a1c26', '#2b3f73', '#ff5fa2', '#1c1a22', '#2d6a4f', '#f2efe9', '#ffd166', '#5b6bd6', '#8e2a2a', '#3a3a46', '#e0566d', '#2f8f8a', '#c97b3a'];
const HAIR = ['#2b2220', '#4a2f22', '#6b4226', '#a0522d', '#d9b26a', '#1c1c24', '#b03a48', '#5c7cfa', '#e8e2d6', '#f2a7c3'];
const EYES = ['#4f7396', '#2f8f8a', '#6b4226', '#5a8a3c', '#8a4fb8', '#c0392b', '#3c6e9e', '#d4a017'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function surprise() {
  const keep = recipe.name; recipe = fromBase(pick(['anime_female', 'anime_female', 'anime_male', ...(kit.bodies.mika_female ? ['mika_female'] : []), 'female', 'male'])); recipe.name = keep;
  const hl = hairChoices(kit, recipe.parts.Head); if (hl.length) recipe.hair = pick(hl).name;
  recipe.faceShape = pick(FACE_SHAPES[faceShapeGroup(kit, recipe.parts.Head)])[0];
  const eg = eyeShapeGroup(kit, recipe.parts.Head); if (eg) recipe.eyeShape = pick(EYE_SHAPES[eg])[0];
  const grp = outfitGroup(kit, recipe.parts.Torso), ok = Object.entries(OUTFITS).filter(([, o]) => o.group === grp || o.group === (grp === 'male' ? 'premiumMale' : 'premium'));
  const [k, o] = pick(ok); recipe.outfit = k; recipe.accessories = null;
  if (o.colors && Math.random() < 0.5) Object.assign(recipe, o.colors); else { recipe.clothing = pick(PALETTE); recipe.accent = pick(PALETTE.filter((c) => c !== recipe.clothing)); }
  recipe.hairColor = pick(HAIR); recipe.eyeColor = pick(EYES);
  recipe.ears = recipe.tail = 'none'; recipe.furColor = recipe.furTip = null;          // about half get animal ears, most of those a tail too
  if (Math.random() < 0.5) { const a = pick(['cat', 'cat', 'fox', 'wolf', 'bunny', 'bear', 'elf']); recipe.ears = a; if (a !== 'elf' && Math.random() < 0.8) recipe.tail = a; }
  render(); refresh();
}

// ------------------------------------------------------------------ build the character
let refreshes = 0;
async function refresh() {
  if (refreshes++) dirty = true;
  if (!fromHistory) remember(); fromHistory = false;
  const my = ++seq; $('busy').classList.add('on');
  try {
    await viewer.loadCreated(JSON.parse(JSON.stringify(recipe)), { keepCamera: !first });
    if (my !== seq) return;
    if (first) { viewer.frame(view); first = false; }
    showNotes();
    document.title = 'READY Character Maker · Kael Studio';
  } catch (e) { console.error(e); setStatus(e.message, 'err'); document.title = 'ERROR ' + e.message; }
  finally { if (my === seq) $('busy').classList.remove('on'); }
}
function setBase(b) {
  const keep = { hair: recipe.hair, hairColor: recipe.hairColor, eyeColor: recipe.eyeColor, outfit: recipe.outfit, clothing: recipe.clothing, accent: recipe.accent, accessories: recipe.accessories, ears: recipe.ears, tail: recipe.tail, furColor: recipe.furColor, furTip: recipe.furTip, outline: recipe.outline, paint: recipe.paint, name: recipe.name };
  const head = HEADS.find(([k]) => k === b);
  if (head) { recipe = { ...fromBase(b), ...keep, headModel: b, skin: head[1].skin || recipe.skin }; return; }
  recipe = { ...fromBase(b), ...keep, skin: recipe.skin, headModel: null };
  const list = hairChoices(kit, recipe.parts.Head); if (recipe.hair !== 'None' && !list.some((h) => h.name === recipe.hair)) recipe.hair = list[0]?.name || 'None';      // a head never goes bald just because it was swapped
}
function choose(pickStr) {
  const i = pickStr.indexOf(':'), k = pickStr.slice(0, i), v = pickStr.slice(i + 1);
  if (k === 'faceShape' || k === 'eyeShape' || k === 'hair') recipe[k] = v;
  else if (k === 'piece') { const [slot, from] = v.split(':');
    if (recipe.outfit !== 'custom' || !recipe.custom) { const cur = recipe.outfit && recipe.outfit !== 'none' ? recipe.outfit : defaultOutfit(kit, recipe.parts.Torso); recipe.accessories = worn(); recipe.custom = recipe.outfit === 'none' ? customFrom('basic', recipe.clothing, recipe.accent) : customFrom(cur, recipe.clothing, recipe.accent); if (recipe.outfit === 'none') for (const [s] of SLOTS) recipe.custom[s].from = 'none'; recipe.outfit = 'custom'; }
    const sig = OUTFITS[from]?.colors; recipe.custom[slot] = { from, main: sig ? sig.clothing : recipe.custom[slot]?.main || recipe.clothing, accent: sig ? sig.accent : recipe.custom[slot]?.accent || recipe.accent }; }
  else if (k === 'outfit') { recipe.outfit = v; recipe.custom = null; recipe.accessories = null; const c = OUTFITS[v]?.colors; if (c) Object.assign(recipe, c); }      // premium outfits start in their signature colours; a new outfit brings its own accessories
  else if (k === 'acc') { const w = new Set(worn()); w.has(v) ? w.delete(v) : w.add(v); recipe.accessories = [...w]; }
  else if (k === 'ears' || k === 'tail') { recipe[k] = v; if (v !== 'none' && Array.isArray(recipe.accessories)) recipe.accessories = recipe.accessories.filter((a) => a !== (k === 'ears' ? 'catEars' : 'tail')); }
  else if (k === 'base') setBase(v);
  else return;
  render(); refresh();
}

// ------------------------------------------------------------------ input
document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a'); if (!b) { if (!e.target.closest('.hmenu')) document.querySelector('.hmenu')?.remove(); return; }
  if (b.dataset.tab) { tab = b.dataset.tab; section = null; render(); return; }
  if (b.dataset.sec) { section = b.dataset.sec; render(); return; }
  if (b.dataset.pick) return choose(b.dataset.pick);
  if (b.dataset.light) { viewer.setLighting(b.dataset.light); return; }
  if ('resetBody' in b.dataset) { recipe.body = null; for (const p of Object.keys(recipe.fit)) if (typeof recipe.fit[p] === 'number') recipe.fit[p] = 'own'; render(); refresh(); return; }
  if (b.id === 'undo') return travel(-1);
  if (b.id === 'redo') return travel(1);
  if (b.id === 'surprise') return surprise();
  if (b.id === 'menuBtn') { const open = document.querySelector('.hmenu'); if (open) return open.remove();
    const m = document.createElement('div'); m.className = 'hmenu';
    m.innerHTML = `<a href="/characters.html">← My Characters</a><a href="/characters.html#new">Create New…</a>${READY.map((r) => `<a href="/mixer.html?ready=${r.key}">Sample: ${esc(r.label)}</a>`).join('')}`;
    document.body.append(m); return; }
  if (b.dataset.motion) { const on = !b.classList.contains('on'); b.classList.toggle('on', on); viewer.setMotion(on ? b.dataset.motion : 'idle'); return; }
  if (b.dataset.view) { view = b.dataset.view; document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); viewer.frame(view); }
});
document.addEventListener('input', (e) => { const t = e.target; if (t.dataset.body) { const o = document.querySelector(`[data-out="${t.dataset.body}"]`); if (o) o.textContent = (+t.value).toFixed(2); } });
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.part === 'Head' && t.value.startsWith('model:')) {      // a complete head: sits where the anime head would, brings its own skin tone
    recipe.headModel = t.value.slice(6); if (kit.bodies[recipe.parts.Head]?.style !== 'anime') recipe.parts.Head = 'anime_female';
    const h = kit.heads[recipe.headModel]; if (h?.skin) recipe.skin = h.skin;
  }
  else if (t.dataset.part) { for (const p of PART_ROWS.find((r) => r[0] === t.dataset.part)[1]) recipe.parts[p] = t.value; if (t.dataset.part === 'Head') { recipe.headModel = null; const list = hairChoices(kit, recipe.parts.Head); if (recipe.hair !== 'None' && !list.some((h) => h.name === recipe.hair)) recipe.hair = list[0]?.name || 'None'; } }
  else if (t.dataset.fit) { for (const p of PART_ROWS.find((r) => r[0] === t.dataset.fit)[1]) recipe.fit[p] = t.value; }
  else if (t.dataset.col) recipe[t.dataset.col] = t.value;
  else if (t.dataset.ccol) { const [slot, w] = t.dataset.ccol.split(':'); recipe.custom[slot][w] = t.value; }
  else if (t.dataset.body) { const k = t.dataset.body, val = +t.value;
    if (k.startsWith('fit:')) { const p = k.slice(4); for (const q of p === 'Head' ? ['Head'] : [`${p}_L`, `${p}_R`].filter((x) => x in recipe.fit)) recipe.fit[q] = Math.abs(val - 1) < 0.005 ? 'own' : val; }
    else recipe.body = { height: 1, legs: 1, shoulders: 0, waist: 0, hips: 0, ...(recipe.body || {}), [k]: val }; }
  else if (t.dataset.flag === 'furMatch') { recipe.furColor = t.checked ? null : recipe.hairColor; render(); }
  else if (t.dataset.flag) recipe[t.dataset.flag] = t.checked;
  else if (t.id === 'name') { recipe.name = t.value; return; }
  else return;
  if (t.dataset.part || t.dataset.fit) render();
  refresh();
});

// ------------------------------------------------------------------ save and export
$('save').addEventListener('click', async () => {
  recipe.name = $('name').value.trim() || recipe.name || 'My character'; setStatus('Saving…');
  try {
    let thumbnail = null; try { thumbnail = viewer.thumbnail(); } catch { /* preview only */ }
    const url = savedId ? `/api/library/${savedId}/recipe` : '/api/library/create';
    const r = await fetch(url, { method: savedId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipe, name: recipe.name, thumbnail }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not save');
    if (!savedId) { savedId = j.avatar.id; const u = new URL(location.href); for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k); u.searchParams.set('id', savedId); history.replaceState(null, '', u); }      // later saves update this character instead of adding copies
    dirty = false;
    if ($('bakeLive').checked) await fetch(`/api/library/${savedId}/activate`, { method: 'POST' });
    toast?.('Saved to My Characters');
    setStatus('Saved. Optimizing it for the stream…', 'ok');          // the stream builds it live until this finishes
    const id = savedId, rec = await ensureBaked(id, { onStep: (s) => { if (savedId === id && !dirty) setStatus(`Saved. Optimizing for the stream: ${s}…`, 'ok'); } });
    if (savedId === id && !dirty) setStatus(`Saved and optimized for the stream${rec.bakeNotes ? `: ${rec.bakeNotes.slice(0, 2).join(' · ')}` : ''}.${$('bakeLive').checked ? ' It is on stream now.' : ''}`, 'ok');
  } catch (err) { setStatus(err.message, 'err'); }
});
$('bake').addEventListener('click', async () => {        // a .vrm to keep or use in other VTuber apps
  const name = $('name').value.trim() || recipe.name || 'My character', btn = $('bake'); btn.disabled = true; $('bakeDl').classList.add('hidden');
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

// ------------------------------------------------------------------ start
if (editId) { try { const rec = await fetch(`/api/library/${editId}/file`).then((r) => r.json()); if (rec.kind === 'modular') recipe = { ...defaultModular(), ...rec }; } catch { /* start fresh */ } }
if (q.get('base')) recipe = fromBase(q.get('base'));
if (q.get('ready')) { const r = READY.find((x) => x.key === q.get('ready')); if (r) recipe = r.make(); }
if (q.get('outfit')) { recipe.outfit = q.get('outfit'); if (OUTFITS[recipe.outfit]?.colors) Object.assign(recipe, OUTFITS[recipe.outfit].colors); }
if (q.get('outline')) recipe.outline = q.get('outline') !== '0';
if (q.get('acc') !== null) recipe.accessories = q.get('acc').split(',').filter(Boolean);
for (const k of ['clothing', 'accent', 'hairColor', 'hair', 'eyeColor', 'face', 'faceShape', 'eyeShape', 'ears', 'tail', 'furColor', 'furTip']) if (q.get(k)) recipe[k] = q.get(k);
if (q.get('body')) recipe.body = Object.fromEntries(q.get('body').split(',').map((kv) => kv.split(':')).map(([k, v]) => [k, +v]));      // e.g. body=legs:1.1,hips:0.5
if (q.get('light')) viewer.setLighting(q.get('light'));
if (q.get('view')) view = q.get('view');
if (q.get('tab') && TABS[q.get('tab')]) tab = q.get('tab');
document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === view));
render(); refresh();
// picture cards that do not exist yet are made in the background, the open tab's first
const TAB_CATS = { face: ['face', 'eyes'], hair: ['hair', 'acc'], body: ['base'], outfit: ['outfit', 'piece'], acc: ['acc'], animal: ['ears', 'tail'], look: [] };
if (!q.get('nothumbs')) allJobs().then((jobs) => { const first = TAB_CATS[tab]; jobs.sort((a, b) => (first.includes(b.cat) ? 1 : 0) - (first.includes(a.cat) ? 1 : 0));
  return makeMissing(jobs, (cat, key, url) => { made.set(`${cat}/${key}`, url); for (const el of document.querySelectorAll(`[data-thumb="${cat}/${key}"]`)) el.style.backgroundImage = `url('${url}')`; }); }).catch((e) => console.warn('picture cards', e));

document.addEventListener('keydown', (e) => {      // ⌘Z / ⇧⌘Z (Ctrl on other keyboards), not while typing a name
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || document.activeElement?.type === 'text') return;
  e.preventDefault(); travel(e.shiftKey ? 1 : -1);
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
