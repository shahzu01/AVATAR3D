// Keeps a Part Mixer character's baked VRM up to date: bakes it in this page (public/bake.js) and stores it with the
// character in the library. The stream page then shows the fast baked file instead of building the character live.
const jobs = new Map();

/** Bake library character `id` unless its stored bake is already up to date. Resolves to the library record. */
export function ensureBaked(id, { onStep = () => {}, force = false } = {}) {
  if (jobs.has(id)) return jobs.get(id);
  const job = (async () => {
    const rec = (await (await fetch(`/api/library/${id}`)).json()).avatar;
    if (!rec?.bake || (rec.bake.state === 'fresh' && !force)) return rec;
    const hash = rec.bake.hash, recipe = await (await fetch(rec.fileUrl)).json();
    const { bakeVRM } = await import('/bake.js');
    const res = await bakeVRM(recipe, { name: rec.name, onStep });
    onStep('Saving the optimized file');
    const r = await fetch(`/api/library/${id}/baked?hash=${encodeURIComponent(hash)}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: res.file });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not store the optimized file.');
    return Object.assign(j.avatar, { bakeNotes: res.notes, bakeSize: res.size });
  })().finally(() => jobs.delete(id));
  jobs.set(id, job); return job;
}
export const isBaking = (id) => jobs.has(id);
