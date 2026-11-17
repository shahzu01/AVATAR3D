// Picture cards, made on this computer: for every choice that has no picture yet, build that character in a small hidden
// viewer, photograph it and store the picture with the server (/api/thumbs). Runs one at a time in the background,
// so the page stays usable; each picture is only ever made once (until the look of characters changes).
import { AvatarViewer } from '/viewer.js';
import { defaultModular, loadKit, hairChoices, OUTFITS, ACCESSORIES, FACE_SHAPES, EYE_SHAPES } from '/modular.js';
import { EARS, TAILS } from '/animal.js';

export const thumbUrl = (cat, key) => `/api/thumbs/${cat}/${String(key).replace(/[^\w-]+/g, '_')}`;
const W = 240, H = 320;
const HAIR0 = { anime_female: 'Bob', mika_female: 'High ponytail', female: 'Bob', anime_male: 'Side part comb over', male: 'Short crew cut' };

/** Every picture card the Character Maker can show: { cat, key, recipe, view }. */
export async function allJobs(only = null) {
  const kit = await loadKit(), out = [], add = (cat, key, recipe, view) => { if (!only || only.includes(cat)) out.push({ cat, key: String(key).replace(/[^\w-]+/g, '_'), recipe, view }); };
  const male = (b) => kit.bodies[b]?.base === 'male';
  const base = (b, o = {}) => ({ ...defaultModular(b), hair: HAIR0[b] || 'Bob', outfit: male(b) ? 'm_street' : 'a_magical', accessories: [], clothing: '#3a4a7a', accent: '#f2efe9', hairColor: '#4a2f22', eyeColor: '#4f7396', ...o });
  for (const b of Object.keys(kit.bodies)) add('base', b, base(b, { outfit: 'casual', clothing: '#26262e', accent: '#f2efe9' }), 'front-full');
  for (const [g, b] of [['cartoon', 'anime_female'], ['female', 'female'], ['male', 'male']]) for (const [k] of FACE_SHAPES[g]) add('face', k, base(b, { faceShape: k }), 'head');
  for (const [g, b] of [['anime', 'anime_female'], ['animeMale', 'anime_male'], ['female', 'female'], ['male', 'male']]) for (const [k] of EYE_SHAPES[g]) add('eyes', k, base(b, { eyeShape: k }), 'face');
  for (const b of ['anime_female', 'anime_male']) for (const h of hairChoices(kit, b)) add('hair', `${b}__${h.name}`, base(b, { hair: h.name }), 'threequarter');
  for (const [k, o] of Object.entries(OUTFITS)) add('outfit', k, base(['male', 'premiumMale'].includes(o.group) ? 'anime_male' : 'anime_female', { outfit: k, ...(o.colors || {}) }), 'front-full');
  for (const k of Object.keys(ACCESSORIES)) add('acc', k, base('anime_female', { accessories: [k], accent: '#e0566d', hairColor: k === 'tail' || k === 'catEars' ? '#c97b3a' : '#4a2f22' }), ['scarf', 'choker'].includes(k) ? 'front' : k === 'tail' ? 'back' : 'head');
  for (const k of Object.keys(EARS)) if (k !== 'none') add('ears', k, base('anime_female', { ears: k, hairColor: '#c97b3a' }), 'head');
  for (const k of Object.keys(TAILS)) if (k !== 'none') add('tail', k, base('anime_female', { tail: k, hairColor: '#c97b3a' }), 'back');
  return out;
}

let running = null;
/** Make the pictures that are missing. onMade(cat, key, url) is called as each one lands. */
export function makeMissing(jobs, onMade) {
  if (running) return running;
  running = (async () => {
    let have; try { have = new Set((await (await fetch('/api/thumbs')).json()).have); } catch { return; }
    const todo = jobs.filter((j) => !have.has(`${j.cat}/${j.key}`)); if (!todo.length) return;
    const box = document.createElement('div'); box.style.cssText = `position:fixed;left:-${W + 50}px;top:0;width:${W}px;height:${H}px;pointer-events:none`; document.body.append(box);
    const v = new AvatarViewer(box); v.setGrid?.(false); v.setLighting('showcase');
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const j of todo) {
      if (document.hidden) await new Promise((r) => document.addEventListener('visibilitychange', r, { once: true }));      // hidden tabs barely draw
      try {
        await v.loadCreated(JSON.parse(JSON.stringify(j.recipe)), { keepCamera: false });
        for (let i = 0; i < 2; i++) await frame();
        const blob = await v.snapshot(W, H, j.view === 'head' ? 'face' : j.view, j.view === 'head' ? { dolly: 1.75, drop: 0.02 } : {});
        const res = await fetch(thumbUrl(j.cat, j.key), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        if (res.ok) onMade?.(j.cat, j.key, `${thumbUrl(j.cat, j.key)}?t=${Date.now()}`);
      } catch (e) { console.warn('picture card', j.cat, j.key, e); }
      await new Promise((r) => setTimeout(r, 60));
    }
    v.dispose?.(); box.remove();
  })().finally(() => { running = null; });
  return running;
}
