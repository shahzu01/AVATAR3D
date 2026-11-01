// Kael Studio character creator: everything a character can be made of, plus starter characters.
// A character is saved as a small "recipe" (this file defines the options); build.js turns a recipe into a 3D avatar.

export const SPECIES = {
  human:   { label: 'Human',   style: 'human',  head: [1.0, 1.08, 0.98], ears: 'human',   tail: 'none',   muzzle: 0,    snout: 0,    nose: 'line',   neck: 0, paws: false, colors: { skin: '#f3c9a6', fur2: '#f3c9a6', fur3: '#d9a27e', inner: '#e8a08f', nose: '#c98468' } },
  elf:     { label: 'Elf',     style: 'human',  head: [0.98, 1.1, 0.98], ears: 'elf',     tail: 'none',   muzzle: 0,    snout: 0,    nose: 'line',   neck: 0, paws: false, colors: { skin: '#f6dcc6', fur2: '#f6dcc6', fur3: '#e0b296', inner: '#eaa594', nose: '#d29a80' } },
  cat:     { label: 'Cat',     style: 'animal', head: [1.12, 1.0, 1.0],  ears: 'cat',     tail: 'thin',   muzzle: 0.35, snout: 0.25, nose: 'animal', neck: 0.3, paws: true, colors: { skin: '#f2f0f4', fur2: '#ffffff', fur3: '#9a9aa6', inner: '#f5a6b8', nose: '#f08ca0' } },
  fox:     { label: 'Fox',     style: 'animal', head: [1.12, 0.98, 1.02], ears: 'fox',    tail: 'bushy',  muzzle: 0.55, snout: 0.75, nose: 'animal', neck: 0.4, paws: true, colors: { skin: '#e9792f', fur2: '#fbf4ea', fur3: '#2a2228', inner: '#fbe3d0', nose: '#231d22' } },
  wolf:    { label: 'Wolf',    style: 'animal', head: [1.14, 1.0, 1.04], ears: 'wolf',    tail: 'bushy',  muzzle: 0.6,  snout: 0.7,  nose: 'animal', neck: 0.6, paws: true, colors: { skin: '#8e94a2', fur2: '#e7e9ef', fur3: '#4b4f5a', inner: '#e9d6d6', nose: '#1d1e22' } },
  raccoon: { label: 'Raccoon', style: 'animal', head: [1.15, 1.0, 1.02], ears: 'raccoon', tail: 'ringed', muzzle: 0.5,  snout: 0.5,  nose: 'animal', neck: 0.4, paws: true, colors: { skin: '#9a9ca6', fur2: '#ecebf0', fur3: '#2b2c33', inner: '#4a4b55', nose: '#141418' } },
  bear:    { label: 'Bear',    style: 'animal', head: [1.16, 1.0, 1.02], ears: 'round',   tail: 'stub',   muzzle: 0.55, snout: 0.4,  nose: 'animal', neck: 0.7, paws: true, colors: { skin: '#8a5a3c', fur2: '#d8b48f', fur3: '#5a3a26', inner: '#d8b48f', nose: '#2a1d18' } },
  panda:   { label: 'Panda',   style: 'animal', head: [1.18, 1.0, 1.02], ears: 'round',   tail: 'stub',   muzzle: 0.45, snout: 0.35, nose: 'animal', neck: 0.7, paws: true, colors: { skin: '#f4f4f6', fur2: '#ffffff', fur3: '#24242a', inner: '#24242a', nose: '#1b1b20' } },
  bunny:   { label: 'Bunny',   style: 'animal', head: [1.08, 1.02, 1.0], ears: 'bunny',   tail: 'pom',    muzzle: 0.35, snout: 0.2,  nose: 'animal', neck: 0.3, paws: true, colors: { skin: '#f1e6dd', fur2: '#ffffff', fur3: '#c7b2a3', inner: '#f6b3c2', nose: '#f08ca0' } },
  tiger:   { label: 'Tiger',   style: 'animal', head: [1.16, 1.0, 1.02], ears: 'round',   tail: 'striped', muzzle: 0.5, snout: 0.45, nose: 'animal', neck: 0.6, paws: true, colors: { skin: '#ef8b2c', fur2: '#fbf4ea', fur3: '#26201f', inner: '#fbf4ea', nose: '#e58a8a' } },
  mouse:   { label: 'Mouse',   style: 'animal', head: [1.06, 0.98, 1.02], ears: 'mouse',  tail: 'thin',   muzzle: 0.4,  snout: 0.55, nose: 'animal', neck: 0.2, paws: true, colors: { skin: '#a8a5ae', fur2: '#ece9ef', fur3: '#7d7a84', inner: '#f3b6c4', nose: '#f08ca0' } },
};

const o = (pairs) => pairs.map(([id, label]) => ({ id, label }));
export const OPTIONS = {
  pattern: o([['none', 'Plain'], ['stripes', 'Stripes'], ['spots', 'Spots'], ['socks', 'Socks'], ['tuxedo', 'Tuxedo'], ['points', 'Dark tips']]),
  eyes: o([['round', 'Round'], ['anime', 'Anime'], ['sharp', 'Sharp'], ['sleepy', 'Sleepy'], ['cat', 'Cat slit'], ['sparkle', 'Sparkly'], ['dot', 'Dot'], ['gentle', 'Gentle'], ['fierce', 'Fierce']]),
  brows: o([['none', 'None'], ['soft', 'Soft'], ['thick', 'Thick'], ['angled', 'Angled'], ['thin', 'Thin'], ['bushy', 'Bushy'], ['dots', 'Dots']]),
  mouth: o([['simple', 'Simple'], ['cat', 'Cat :3'], ['fang', 'Fang'], ['grin', 'Grin'], ['small', 'Small'], ['smirk', 'Smirk'], ['teeth', 'Toothy']]),
  nose: o([['auto', 'Species default'], ['none', 'None'], ['dot', 'Dot'], ['line', 'Line'], ['button', 'Button'], ['animal', 'Animal nose']]),
  markings: o([['none', 'None'], ['mask', 'Bandit mask'], ['patches', 'Eye patches'], ['freckles', 'Freckles'], ['cheeks', 'Cheek marks'], ['whiskers', 'Whisker dots'], ['star', 'Star tattoo'], ['scar', 'Scar'], ['blush', 'Always blushing']]),
  ears: o([['auto', 'Species default'], ['human', 'Human'], ['elf', 'Elf'], ['cat', 'Cat'], ['fox', 'Fox'], ['wolf', 'Wolf'], ['raccoon', 'Raccoon'], ['round', 'Round'], ['mouse', 'Mouse'], ['bunny', 'Bunny'], ['none', 'None']]),
  tail: o([['auto', 'Species default'], ['none', 'None'], ['thin', 'Thin'], ['bushy', 'Bushy'], ['ringed', 'Ringed'], ['striped', 'Striped'], ['stub', 'Stub'], ['pom', 'Pom-pom'], ['dragon', 'Dragon']]),
  hair: o([['none', 'None'], ['short', 'Short'], ['spiky', 'Spiky'], ['messy', 'Messy'], ['bob', 'Bob'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['twintails', 'Twin tails'], ['buns', 'Space buns'], ['curly', 'Curly'], ['mohawk', 'Mohawk'], ['sidepart', 'Side part'], ['hime', 'Hime cut'], ['undercut', 'Undercut'], ['tuft', 'Fur tuft']]),
  top: o([['none', 'None'], ['hoodie', 'Hoodie'], ['tshirt', 'T-shirt'], ['tank', 'Tank top'], ['jacket', 'Open jacket'], ['sweater', 'Turtleneck'], ['jersey', 'Gamer jersey'], ['dress', 'Dress'], ['robe', 'Mage robe'], ['tunic', 'Adventurer tunic'], ['blazer', 'Blazer'], ['apron', 'Chef apron']]),
  bottom: o([['none', 'None'], ['pants', 'Pants'], ['joggers', 'Joggers'], ['shorts', 'Shorts'], ['skirt', 'Skirt'], ['longskirt', 'Long skirt'], ['overalls', 'Overalls']]),
  shoes: o([['none', 'Bare / paws'], ['sneakers', 'Sneakers'], ['hightops', 'High-tops'], ['boots', 'Boots'], ['sandals', 'Sandals'], ['slippers', 'Bunny slippers']]),
  accessories: o([['headset', 'Gaming headset'], ['headphones', 'Headphones'], ['glassesRound', 'Round glasses'], ['glassesSquare', 'Square glasses'], ['sunglasses', 'Sunglasses'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['crown', 'Crown'], ['horns', 'Horns'], ['halo', 'Halo'], ['bow', 'Hair bow'], ['flower', 'Flower'], ['scarf', 'Scarf'], ['choker', 'Choker'], ['earrings', 'Earrings'], ['backpack', 'Backpack'], ['wings', 'Little wings'], ['bandana', 'Bandana']]),
};

export const SWATCHES = {
  skin: ['#fde3cf', '#f3c9a6', '#e3a982', '#c98a62', '#a0673f', '#7a4b2c', '#55331f', '#f6dcc6', '#b8d7ff', '#c9f1cf'],
  fur: ['#ffffff', '#f2f0f4', '#ecebf0', '#c7c7cf', '#9a9ca6', '#5d5f69', '#2b2c33', '#e9792f', '#ef8b2c', '#8a5a3c', '#d8b48f', '#f1e6dd', '#ffd1e3', '#b79cff', '#7fd8ff'],
  hair: ['#1c1b22', '#3b2a22', '#6b4226', '#a8692f', '#e3b25b', '#f4e3a6', '#e8e8ee', '#c43a3a', '#ff7fb4', '#8f6bff', '#3f8cff', '#36c9a0', '#ff9a3c'],
  cloth: ['#30508a', '#1f2026', '#f4f4f6', '#c43a3a', '#2f8f5b', '#e8b33c', '#8f6bff', '#ff7fb4', '#3fb6d8', '#8a5a3c', '#4b4f5a', '#f08c3c'],
  eyes: ['#c8211f', '#2f6fd8', '#2fa36b', '#8a5a2c', '#f0b02c', '#8f6bff', '#e64f9b', '#222222', '#56c7e8', '#9aa0aa'],
};

export const ACCESSORY_LIMIT = 6;

export function defaultRecipe() {
  return withSpecies({
    version: 1, name: 'New character', species: 'raccoon',
    body: { height: 1.55, head: 1.15, build: 0.5, shoulders: 0.5, chest: 0.5, waist: 0.5, hips: 0.5, arms: 0.5, legs: 0.5, legLength: 0.5 },
    colors: {}, pattern: 'none',
    face: { eyes: 'round', eyeColor: '#c8211f', eyeSize: 0.5, eyeSpacing: 0.5, eyeHeight: 0.5, eyeTilt: 0.5, lashes: true, brows: 'thick', browColor: '#2b2c33', mouth: 'cat', nose: 'auto', markings: 'mask', muzzle: 0.5 },
    ears: { type: 'auto', size: 0.5 }, tail: { type: 'auto', size: 0.5 },
    hair: { style: 'none', color: '#3b2a22', color2: '#6b4226' },
    top: { style: 'hoodie', color: '#30508a', color2: '#27426f' },
    bottom: { style: 'pants', color: '#1f2026' },
    shoes: { style: 'sneakers', color: '#30323a', color2: '#e6e6ea' },
    accessories: [], outline: 0.5,
  }, 'raccoon', true);
}

/** Apply species defaults for colors (only fills what the recipe does not set, unless force). */
export function withSpecies(r, species, force = false) {
  const sp = SPECIES[species] || SPECIES.human;
  r.species = species;
  r.colors = force ? { ...sp.colors } : { ...sp.colors, ...r.colors };
  return r;
}

const P = (name, species, patch) => {
  const r = withSpecies(defaultRecipe(), species, true);
  r.name = name;
  for (const [k, v] of Object.entries(patch)) r[k] = typeof v === 'object' && !Array.isArray(v) && v !== null ? { ...r[k], ...v } : v;
  return r;
};
export const PRESETS = [
  P('Raccoon Gamer', 'raccoon', { face: { eyes: 'round', mouth: 'cat', markings: 'mask', brows: 'thick', eyeColor: '#c8211f' }, top: { style: 'hoodie', color: '#30508a', color2: '#27426f' }, accessories: [{ id: 'headset', color: '#1f2026' }] }),
  P('Fox Ranger', 'fox', { face: { eyes: 'sharp', mouth: 'fang', markings: 'none', brows: 'angled', browColor: '#2a2228', eyeColor: '#f0b02c' }, top: { style: 'tunic', color: '#2f8f5b', color2: '#8a5a3c' }, bottom: { style: 'pants', color: '#4b3a2c' }, shoes: { style: 'boots', color: '#5a3a26', color2: '#2a1d18' }, accessories: [{ id: 'scarf', color: '#c43a3a' }] }),
  P('Neko Streamer', 'cat', { colors: { skin: '#f2f0f4', fur2: '#ffffff', fur3: '#2b2c33', inner: '#f5a6b8', nose: '#f08ca0' }, pattern: 'points', face: { eyes: 'anime', mouth: 'cat', markings: 'blush', brows: 'soft', eyeColor: '#2f6fd8', browColor: '#5d5f69' }, top: { style: 'hoodie', color: '#ff7fb4', color2: '#e8609a' }, bottom: { style: 'skirt', color: '#2b2c33' }, accessories: [{ id: 'headphones', color: '#f4f4f6' }] }),
  P('Panda Chef', 'panda', { face: { eyes: 'gentle', mouth: 'simple', markings: 'patches', brows: 'none', eyeColor: '#222222' }, top: { style: 'apron', color: '#f4f4f6', color2: '#c43a3a' }, bottom: { style: 'pants', color: '#2b2c33' }, accessories: [{ id: 'beanie', color: '#f4f4f6' }] }),
  P('Wolf Knight', 'wolf', { face: { eyes: 'fierce', mouth: 'teeth', markings: 'scar', brows: 'bushy', browColor: '#2b2c33', eyeColor: '#56c7e8' }, top: { style: 'tunic', color: '#4b4f5a', color2: '#c9a84a' }, bottom: { style: 'pants', color: '#2b2c33' }, shoes: { style: 'boots', color: '#3a3226', color2: '#1d1914' }, accessories: [{ id: 'scarf', color: '#30508a' }] }),
  P('Bunny Idol', 'bunny', { face: { eyes: 'sparkle', mouth: 'small', markings: 'blush', brows: 'thin', eyeColor: '#e64f9b', browColor: '#c7b2a3' }, top: { style: 'dress', color: '#b79cff', color2: '#f4f4f6' }, bottom: { style: 'none' }, shoes: { style: 'slippers', color: '#f4f4f6', color2: '#f6b3c2' }, accessories: [{ id: 'bow', color: '#ff7fb4' }] }),
  P('Tiger Athlete', 'tiger', { pattern: 'stripes', face: { eyes: 'sharp', mouth: 'grin', markings: 'none', brows: 'thick', browColor: '#26201f', eyeColor: '#2fa36b' }, top: { style: 'jersey', color: '#3fb6d8', color2: '#f4f4f6' }, bottom: { style: 'shorts', color: '#1f2026' }, shoes: { style: 'hightops', color: '#f4f4f6', color2: '#c43a3a' }, accessories: [{ id: 'sunglasses', color: '#1f2026' }] }),
  P('Bear Buddy', 'bear', { face: { eyes: 'dot', mouth: 'simple', markings: 'none', brows: 'none', eyeColor: '#222222' }, top: { style: 'sweater', color: '#e8b33c', color2: '#c99724' }, bottom: { style: 'overalls', color: '#3f6fb0' }, shoes: { style: 'none' }, accessories: [{ id: 'cap', color: '#c43a3a' }] }),
  P('Mouse Inventor', 'mouse', { face: { eyes: 'round', mouth: 'teeth', markings: 'whiskers', brows: 'soft', browColor: '#7d7a84', eyeColor: '#8a5a2c' }, top: { style: 'blazer', color: '#4b4f5a', color2: '#f4f4f6' }, bottom: { style: 'pants', color: '#2b2c33' }, shoes: { style: 'boots', color: '#5a3a26', color2: '#2a1d18' }, accessories: [{ id: 'glassesRound', color: '#c9a84a' }] }),
  P('Anime Hero', 'human', { body: { head: 1.2, build: 0.55 }, colors: { skin: '#f3c9a6' }, face: { eyes: 'anime', mouth: 'simple', markings: 'none', brows: 'angled', browColor: '#1c1b22', eyeColor: '#2f6fd8', nose: 'dot' }, hair: { style: 'spiky', color: '#1c1b22', color2: '#3f8cff' }, top: { style: 'jacket', color: '#c43a3a', color2: '#1f2026' }, bottom: { style: 'pants', color: '#1f2026' }, shoes: { style: 'sneakers', color: '#f4f4f6', color2: '#c43a3a' } }),
  P('Elf Mage', 'elf', { body: { head: 1.15, build: 0.35 }, face: { eyes: 'gentle', mouth: 'small', markings: 'none', brows: 'thin', browColor: '#c9b27a', eyeColor: '#2fa36b', nose: 'dot' }, hair: { style: 'long', color: '#f4e3a6', color2: '#e3c56b' }, top: { style: 'robe', color: '#8f6bff', color2: '#e8b33c' }, bottom: { style: 'none' }, shoes: { style: 'boots', color: '#5a3a26', color2: '#2a1d18' }, accessories: [{ id: 'halo', color: '#ffe27a' }] }),
  P('Idol Star', 'human', { body: { head: 1.25, build: 0.35 }, colors: { skin: '#fde3cf' }, face: { eyes: 'sparkle', mouth: 'small', markings: 'blush', brows: 'thin', browColor: '#c43a3a', eyeColor: '#e64f9b', nose: 'none' }, hair: { style: 'twintails', color: '#ff7fb4', color2: '#ffd1e3' }, top: { style: 'dress', color: '#f4f4f6', color2: '#ff7fb4' }, bottom: { style: 'none' }, shoes: { style: 'boots', color: '#f4f4f6', color2: '#ff7fb4' }, accessories: [{ id: 'bow', color: '#ff7fb4' }, { id: 'headset', color: '#f4f4f6' }] }),
];

// ------------------------------------------------------------------ randomize (harmonious colors)
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
function hsl(h, s, l) { const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
export function randomRecipe(seed = Math.random() * 1e9, lock = {}) {
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const species = lock.species || pick(Object.keys(SPECIES), rnd);
  const r = withSpecies(defaultRecipe(), species, true);
  r.name = `${SPECIES[species].label} ${pick(['Star', 'Nova', 'Pixel', 'Echo', 'Blitz', 'Mochi', 'Zephyr', 'Juno', 'Kit', 'Rook'], rnd)}`;
  const h = rnd() * 360, comp = (h + 150 + rnd() * 60) % 360;
  if (SPECIES[species].style === 'human') r.colors.skin = r.colors.fur2 = pick(SWATCHES.skin.slice(0, 8), rnd);
  else if (rnd() < 0.35) { r.colors.skin = pick(SWATCHES.fur, rnd); }
  r.pattern = SPECIES[species].style === 'animal' && rnd() < 0.4 ? pick(['stripes', 'spots', 'socks', 'tuxedo', 'points'], rnd) : 'none';
  r.body = { height: 1.35 + rnd() * 0.4, head: 0.95 + rnd() * 0.4, build: rnd(), shoulders: rnd(), chest: rnd(), waist: rnd(), hips: rnd(), arms: rnd(), legs: rnd(), legLength: rnd() };
  r.face = { ...r.face, eyes: pick(OPTIONS.eyes, rnd).id, eyeColor: pick(SWATCHES.eyes, rnd), eyeSize: 0.3 + rnd() * 0.5, eyeSpacing: 0.3 + rnd() * 0.4, eyeHeight: 0.35 + rnd() * 0.3, eyeTilt: 0.3 + rnd() * 0.4,
    brows: pick(OPTIONS.brows, rnd).id, mouth: pick(OPTIONS.mouth, rnd).id, markings: rnd() < 0.5 ? 'none' : pick(OPTIONS.markings, rnd).id, lashes: rnd() < 0.6 };
  const hairStyles = SPECIES[species].style === 'human' ? OPTIONS.hair.filter((x) => !['none', 'tuft'].includes(x.id)) : OPTIONS.hair.filter((x) => ['none', 'tuft', 'short', 'spiky', 'messy', 'ponytail', 'mohawk'].includes(x.id));
  r.hair = { style: pick(hairStyles, rnd).id, color: pick(SWATCHES.hair, rnd), color2: hsl(h, 0.7, 0.6) };
  r.face.browColor = SPECIES[species].style === 'human' ? r.hair.color : r.colors.fur3;
  r.top = { style: pick(OPTIONS.top.filter((x) => x.id !== 'none'), rnd).id, color: hsl(h, 0.55, 0.45), color2: hsl(comp, 0.5, 0.35) };
  r.bottom = { style: ['dress', 'robe'].includes(r.top.style) ? 'none' : pick(OPTIONS.bottom.filter((x) => x.id !== 'none'), rnd).id, color: hsl(comp, 0.25, 0.2) };
  r.shoes = { style: pick(OPTIONS.shoes, rnd).id, color: hsl(h, 0.3, 0.3), color2: '#f4f4f6' };
  const accs = OPTIONS.accessories.map((a) => a.id).sort(() => rnd() - 0.5).slice(0, Math.floor(rnd() * 3));
  r.accessories = accs.map((id) => ({ id, color: hsl((h + rnd() * 120) % 360, 0.6, 0.5) }));
  return r;
}
