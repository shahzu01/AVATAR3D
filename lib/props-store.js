// Your own props and scenes: .glb models and pictures (PNG, JPEG, WebP) kept in props/ next to settings.json.
// Every upload is checked first: a real .glb (version 2) that carries everything inside it (no links to outside files,
// which the stream page would otherwise go and fetch), or a real picture; within the size limit.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_PROP_MB = 60;
const BUILTIN_PROPS = ['mic', 'mug', 'lightstick', 'plush', 'sign', 'crown'];
const BUILTIN_SCENES = ['stage', 'room', 'night', 'gaming', 'cafe', 'city', 'park', 'starry'];      // public/props.js + public/scenes.js
const ATTACH = ['rightHand', 'leftHand', 'head', 'chest', 'hips', 'floor'];
export const FILE_RE = /^[a-f0-9]{16}\.(glb|png|jpg|webp)$/;

export class PropStore {
  constructor(dataDir) { this.dir = path.join(dataDir, 'props'); fs.mkdirSync(this.dir, { recursive: true }); this.index = path.join(this.dir, 'props.json'); try { this.list = JSON.parse(fs.readFileSync(this.index, 'utf8')); } catch { this.list = []; } }
  save() { const tmp = this.index + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.list, null, 2)); fs.renameSync(tmp, this.index); }
  filePath(file) { if (!FILE_RE.test(file)) return null; return path.join(this.dir, file); }
  /** buf: the uploaded bytes. Returns the stored entry or throws a message for the person. */
  add(buf, name) {
    if (buf.length > MAX_PROP_MB * 1e6) throw new Error(`That file is too large (the limit is ${MAX_PROP_MB} MB).`);
    let ext = null;
    if (buf.length > 20 && buf.readUInt32LE(0) === 0x46546c67) {
      if (buf.readUInt32LE(4) !== 2) throw new Error('Only glTF 2 (.glb) models can be used.');
      const jl = buf.readUInt32LE(12); if (buf.readUInt32LE(16) !== 0x4e4f534a || 20 + jl > buf.length) throw new Error('This .glb file is damaged.');
      let j; try { j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')); } catch { throw new Error('This .glb file is damaged.'); }
      const outside = [...(j.buffers || []), ...(j.images || [])].some((b) => b.uri && !/^data:/.test(b.uri));
      if (outside) throw new Error('This model points to outside files. Export it as a single .glb (embedded textures) and try again.');
      ext = 'glb';
    } else if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
    else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = 'jpg';
    else if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') ext = 'webp';
    else throw new Error('Use a .glb model or a PNG, JPEG or WebP picture.');
    const id = crypto.randomBytes(8).toString('hex'), file = `${id}.${ext}`;
    fs.writeFileSync(path.join(this.dir, file), buf);
    const entry = { id, file, name: String(name || 'My prop').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'My prop', type: ext === 'glb' ? 'model' : 'image', bytes: buf.length, at: new Date().toISOString() };
    this.list.push(entry); this.save(); return entry;
  }
  remove(id) { const i = this.list.findIndex((e) => e.id === id); if (i < 0) return false; const [e] = this.list.splice(i, 1); fs.rmSync(path.join(this.dir, e.file), { force: true }); this.save(); return e; }
  has(file) { return this.list.some((e) => e.file === file); }
}

const num = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const vec = (v, lim, d = [0, 0, 0]) => (Array.isArray(v) && v.length === 3 ? v.map((x, i) => num(x, -lim, lim, d[i])) : d.slice());
/** Props as the Studio sends them -> props the stream will show (unknown things dropped). */
export function sanitizeProps(list, store) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 24).map((p, i) => {
    const src = typeof p?.src === 'string' && ((p.src.startsWith('builtin:') && BUILTIN_PROPS.includes(p.src.slice(8))) || (p.src.startsWith('file:') && store.has(p.src.slice(5)))) ? p.src : null;
    if (!src) return null;
    return { id: /^[\w-]{1,24}$/.test(p.id) ? p.id : `p_${Date.now().toString(36)}${i}`, name: String(p.name || '').slice(0, 40), src, attach: ATTACH.includes(p.attach) ? p.attach : 'rightHand',
      pos: vec(p.pos, 3), rot: vec(p.rot, 360), scale: num(p.scale, 0.05, 20, 1), on: p.on !== false };
  }).filter(Boolean);
}
export function sanitizeScene(s, store) {
  const kind = ['none', 'builtin', 'model', 'image'].includes(s?.kind) ? s.kind : 'none';
  const out = { kind, scale: num(s?.scale, 0.1, 10, 1), x: num(s?.x, -10, 10, 0), y: num(s?.y, -10, 10, 0), z: num(s?.z, -10, 10, 0), rotY: num(s?.rotY, -180, 180, 0) };
  if (kind === 'builtin') { if (!BUILTIN_SCENES.includes(s.key)) return { ...out, kind: 'none' }; out.key = s.key; }
  if (kind === 'model' || kind === 'image') { if (!store.has(s.file)) return { ...out, kind: 'none' }; out.file = s.file; }
  return out;
}
