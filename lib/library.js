// Avatar library: one place for every avatar, whether imported (VRM / GLB) or created in a future Kael Studio creator.
// Layout (all inside the app folder):
//   library/library.json         records (metadata, capabilities, per-avatar presentation settings)
//   library/files/<fileId>/      original upload, kept byte-for-byte (original.vrm / original.glb)
//   library/thumbs/<id>.png      preview image
//   library/tmp/                 imports waiting for the user to confirm (cleaned up automatically)
//   library/trash/<stamp>-<id>/  deleted avatars (moved, not destroyed, so a mistake can be undone by hand)
// Avatars dropped into the old avatars/ folder are registered automatically and left where they are ("linked").
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectAvatar, DEFAULT_LIMITS } from './inspect.js';
import { sanitizeRecipe, creationReport, RecipeError } from './recipe.js';

export const OWNER = 'local';     // single-user desktop app: everything belongs to the person at this Mac
const ID_RE = /^[a-f0-9]{16}$/;
const TMP_RE = /^[a-f0-9]{24}$/;
const newId = (n = 8) => crypto.randomBytes(n).toString('hex');
const now = () => new Date().toISOString();

export const DEFAULT_PRESENTATION = {
  transform: { x: 0, y: 0, rotY: 0, scale: 1 },
  tracking: { blink: true, gaze: 1, mouth: 1, expressions: 1 },
  look: null,      // camera/background/light snapshot, filled the first time this avatar is active
};
export const LOOK_KEYS = ['camera', 'cameraOffset', 'background', 'backgroundColor', 'lightColor', 'lightIntensity', 'rimColor', 'rimIntensity', 'idleMotion'];
export const LIMITS = { x: [-1, 1], y: [-1, 1], rotY: [-180, 180], scale: [0.25, 3], gaze: [0, 2], mouth: [0, 3], expressions: [0, 2] };
const clamp = (v, [a, b], d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);

export class Library {
  constructor(root, { legacyDir, limits } = {}) {
    this.root = root;
    this.dir = path.join(root, 'library');
    this.legacyDir = legacyDir;
    this.limits = { ...DEFAULT_LIMITS, ...(limits || {}) };
    for (const d of ['files', 'thumbs', 'tmp', 'trash']) fs.mkdirSync(path.join(this.dir, d), { recursive: true });
    this.dbFile = path.join(this.dir, 'library.json');
    this.records = [];
    try { this.records = JSON.parse(fs.readFileSync(this.dbFile, 'utf8')).avatars || []; } catch {}
    this.cleanupTmp(0);
    this.scanLegacy();
  }

  save() {
    const tmp = this.dbFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, avatars: this.records }, null, 2));
    fs.renameSync(tmp, this.dbFile);            // atomic replace: a crash never leaves a half-written library
  }

  list() { return this.records.filter((r) => r.ownerId === OWNER); }
  get(id) {
    if (!ID_RE.test(String(id))) return null;
    return this.records.find((r) => r.id === id && r.ownerId === OWNER) || null;
  }
  filePath(rec) {
    const p = path.normalize(path.join(this.root, rec.storage));
    if (!p.startsWith(path.normalize(this.root + path.sep))) throw new Error('bad storage path');
    return p;
  }
  thumbPath(rec) { return rec.thumbnail ? path.join(this.dir, 'thumbs', `${rec.id}.png`) : null; }

  // ---------------------------------------------------------------- import (two steps: upload+inspect, then confirm)
  tmpPath(tmpId) { if (!TMP_RE.test(String(tmpId))) return null; return path.join(this.dir, 'tmp', tmpId); }
  /** Stream an upload to a temporary file, enforcing the size limit. Resolves { tmpId, report }. */
  receiveUpload(req, filename) {
    return new Promise((resolve) => {
      const tmpId = newId(12), base = this.tmpPath(tmpId);
      const safeName = sanitizeName(filename);
      const out = fs.createWriteStream(base + '.upload');
      let size = 0, aborted = false;
      const max = this.limits.maxFileMB * 1e6;
      const fail = (msg) => { aborted = true; out.destroy(); fs.rm(base + '.upload', { force: true }, () => {}); resolve({ error: msg }); };
      req.on('data', (d) => { size += d.length; if (size > max && !aborted) { fail(`File is too large. The limit is ${this.limits.maxFileMB} MB.`); req.resume(); } });
      req.on('error', () => !aborted && fail('Upload interrupted.'));
      out.on('error', () => !aborted && fail('Could not store the upload.'));
      req.pipe(out);
      out.on('finish', () => {
        if (aborted) return;
        const buf = fs.readFileSync(base + '.upload');
        const report = inspectAvatar(buf, { filename: safeName, limits: this.limits });
        if (!report.ok) { fs.rmSync(base + '.upload', { force: true }); resolve({ report }); return; }
        fs.writeFileSync(base + '.json', JSON.stringify({ filename: safeName, report, created: Date.now() }));
        resolve({ tmpId, report });
      });
    });
  }
  pending(tmpId) {
    const base = this.tmpPath(tmpId);
    if (!base || !fs.existsSync(base + '.json')) return null;
    return { ...JSON.parse(fs.readFileSync(base + '.json', 'utf8')), file: base + '.upload' };
  }
  cancel(tmpId) {
    const base = this.tmpPath(tmpId); if (!base) return false;
    fs.rmSync(base + '.upload', { force: true }); fs.rmSync(base + '.json', { force: true });
    return true;
  }
  /** Confirm a pending import: moves the original into the library and creates a record. */
  confirm(tmpId, { name, thumbnail } = {}) {
    const p = this.pending(tmpId);
    if (!p) throw new UserError('This import has expired or was cancelled. Please choose the file again.');
    const fileId = newId(8), ext = p.report.format.extension;
    const rel = path.join('library', 'files', fileId, `original.${ext}`);
    fs.mkdirSync(path.join(this.dir, 'files', fileId), { recursive: true });
    fs.renameSync(p.file, path.join(this.root, rel));
    fs.rmSync(this.tmpPath(tmpId) + '.json', { force: true });
    const rec = this.makeRecord({ name: name || p.report.meta?.name || stripExt(p.filename), filename: p.filename, report: p.report, storage: rel, fileId, linked: false });
    this.records.push(rec);
    if (thumbnail) this.setThumbnail(rec, thumbnail);
    this.save();
    return rec;
  }
  makeRecord({ name, filename, report, storage, fileId, linked }) {
    const c = report.capabilities;
    return {
      id: newId(8), ownerId: OWNER, name: cleanTitle(name), sourceType: report.format.type === 'Kael Studio character' ? 'created' : report.format.type === 'VRM' ? 'imported-vrm' : 'imported-gltf',
      originalFilename: filename, format: { container: report.format.container, type: report.format.type, vrmVersion: report.format.vrmVersion, specVersion: report.format.specVersion, extension: report.format.extension },
      fileId, storage, linked: !!linked, fileSize: report.bytes, importedAt: now(), updatedAt: now(), thumbnail: false,
      meta: report.meta, stats: report.stats,
      capabilities: { humanoid: c.humanoid, expressions: { ...c.expressions, names: c.expressions.names.slice(0, 300) }, lookAt: c.lookAt, springBones: c.springBones, materials: c.materials, animations: c.animations },
      suitability: report.suitability,
      validation: { status: report.warnings.length ? 'valid-with-warnings' : 'valid', warnings: report.warnings, checkedAt: now() },
      presentation: structuredClone(DEFAULT_PRESENTATION),
    };
  }

  // ---------------------------------------------------------------- characters made in the creator
  createFromRecipe(input, { name, thumbnail } = {}) {
    const recipe = this.cleanRecipe(input, name);
    const fileId = newId(8), rel = path.join('library', 'files', fileId, 'recipe.json');
    fs.mkdirSync(path.join(this.dir, 'files', fileId), { recursive: true });
    const data = JSON.stringify(recipe, null, 2);
    fs.writeFileSync(path.join(this.root, rel), data);
    const rec = this.makeRecord({ name: recipe.name, filename: `${safeFile(recipe.name)}.kaelchar.json`, report: creationReport(recipe, data.length), storage: rel, fileId, linked: false });
    this.records.push(rec);
    if (thumbnail) this.setThumbnail(rec, thumbnail);
    this.save();
    return rec;
  }
  /** Save edits to a created character. Writes a new file version so the previous one is kept in the trash. */
  updateRecipe(id, input, { thumbnail } = {}) {
    const r = this.req(id);
    if (r.sourceType !== 'created') throw new UserError('Only characters made in the creator can be edited here.');
    const recipe = this.cleanRecipe(input, r.name);
    const shared = this.records.some((o) => o !== r && o.storage === r.storage);
    if (!shared && fs.existsSync(this.filePath(r))) {
      const dest = path.join(this.dir, 'trash', `${Date.now()}-${r.id}-previous`); fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(this.filePath(r), path.join(dest, 'recipe.json'));
    }
    const fileId = shared ? newId(8) : r.fileId, rel = path.join('library', 'files', fileId, 'recipe.json');
    fs.mkdirSync(path.join(this.dir, 'files', fileId), { recursive: true });
    const data = JSON.stringify(recipe, null, 2);
    fs.writeFileSync(path.join(this.root, rel), data);
    const rep = creationReport(recipe, data.length);
    Object.assign(r, { fileId, storage: rel, name: cleanTitle(recipe.name), originalFilename: `${safeFile(recipe.name)}.kaelchar.json`, fileSize: data.length, capabilities: rep.capabilities, meta: rep.meta, updatedAt: now() });
    if (thumbnail) this.setThumbnail(r, thumbnail);
    this.save();
    return r;
  }
  readRecipe(id) { const r = this.req(id); if (r.sourceType !== 'created') throw new UserError('Not a created character.'); return JSON.parse(fs.readFileSync(this.filePath(r), 'utf8')); }
  cleanRecipe(input, name) {
    try { const rc = sanitizeRecipe(input); if (name) rc.name = cleanTitle(name); return rc; }
    catch (e) { if (e instanceof RecipeError) throw new UserError(e.message); throw e; }
  }

  // ---------------------------------------------------------------- record actions
  rename(id, name) { const r = this.req(id); r.name = cleanTitle(name); r.updatedAt = now(); this.save(); return r; }
  setPresentation(id, patch = {}) {
    const r = this.req(id), p = r.presentation || structuredClone(DEFAULT_PRESENTATION);
    if (patch.transform) for (const k of ['x', 'y', 'rotY', 'scale']) if (k in patch.transform) p.transform[k] = clamp(patch.transform[k], LIMITS[k], DEFAULT_PRESENTATION.transform[k]);
    if (patch.tracking) {
      if ('blink' in patch.tracking) p.tracking.blink = !!patch.tracking.blink;
      for (const k of ['gaze', 'mouth', 'expressions']) if (k in patch.tracking) p.tracking[k] = clamp(patch.tracking[k], LIMITS[k], 1);
    }
    if (patch.look) p.look = pickLook(patch.look);
    r.presentation = p; r.updatedAt = now(); this.save(); return r;
  }
  duplicate(id) {
    const src = this.req(id);
    const copy = { ...structuredClone(src), id: newId(8), name: cleanTitle(`${src.name} copy`), importedAt: now(), updatedAt: now() };
    if (src.thumbnail) fs.copyFileSync(this.thumbPath(src), path.join(this.dir, 'thumbs', `${copy.id}.png`));
    this.records.push(copy); this.save();
    return copy;      // shares the same stored original; the file is only removed when no record uses it
  }
  remove(id) {
    const r = this.req(id);
    const dest = path.join(this.dir, 'trash', `${Date.now()}-${r.id}`);
    fs.mkdirSync(dest, { recursive: true });
    const shared = this.records.some((o) => o !== r && o.storage === r.storage);
    if (!shared && fs.existsSync(this.filePath(r))) moveFile(this.filePath(r), path.join(dest, sanitizeName(r.originalFilename)));
    if (!shared && !r.linked) fs.rmSync(path.dirname(this.filePath(r)), { recursive: true, force: true });
    if (r.thumbnail && fs.existsSync(this.thumbPath(r))) moveFile(this.thumbPath(r), path.join(dest, 'thumbnail.png'));
    fs.writeFileSync(path.join(dest, 'record.json'), JSON.stringify(r, null, 2));
    this.records = this.records.filter((o) => o !== r); this.save();
    return { removed: r.id, keptFile: shared };
  }
  /** Replace the stored file of a record with a new confirmed import. The previous file goes to the trash. */
  replace(id, tmpId) {
    const r = this.req(id), p = this.pending(tmpId);
    if (!p) throw new UserError('This import has expired. Please choose the file again.');
    const dest = path.join(this.dir, 'trash', `${Date.now()}-${r.id}-replaced`);
    fs.mkdirSync(dest, { recursive: true });
    const shared = this.records.some((o) => o !== r && o.storage === r.storage);
    if (!shared && fs.existsSync(this.filePath(r))) moveFile(this.filePath(r), path.join(dest, sanitizeName(r.originalFilename)));
    const fileId = newId(8), ext = p.report.format.extension;
    const rel = path.join('library', 'files', fileId, `original.${ext}`);
    fs.mkdirSync(path.join(this.dir, 'files', fileId), { recursive: true });
    fs.renameSync(p.file, path.join(this.root, rel));
    fs.rmSync(this.tmpPath(tmpId) + '.json', { force: true });
    const fresh = this.makeRecord({ name: r.name, filename: p.filename, report: p.report, storage: rel, fileId, linked: false });
    Object.assign(r, { ...fresh, id: r.id, name: r.name, importedAt: r.importedAt, presentation: r.presentation, thumbnail: false, replacedAt: now() });
    this.save();
    return r;
  }
  setThumbnail(rec, dataUrl) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return false;
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > 2e6 || buf.readUInt32BE(0) !== 0x89504e47) return false;
    fs.writeFileSync(path.join(this.dir, 'thumbs', `${rec.id}.png`), buf);
    rec.thumbnail = true; rec.updatedAt = now(); this.save();
    return true;
  }
  req(id) { const r = this.get(id); if (!r) throw new UserError('Avatar not found.', 404); return r; }

  // ---------------------------------------------------------------- housekeeping
  cleanupTmp(maxAgeMs = 3600e3) {
    const d = path.join(this.dir, 'tmp');
    for (const f of fs.readdirSync(d)) {
      try { if (Date.now() - fs.statSync(path.join(d, f)).mtimeMs >= maxAgeMs) fs.rmSync(path.join(d, f), { force: true }); } catch {}
    }
  }
  /** Register .vrm files dropped into the legacy avatars/ folder (left in place). */
  scanLegacy() {
    if (!this.legacyDir || !fs.existsSync(this.legacyDir)) return [];
    const added = [];
    for (const f of fs.readdirSync(this.legacyDir)) {
      if (!/\.(vrm|glb)$/i.test(f)) continue;
      const rel = path.relative(this.root, path.join(this.legacyDir, f));
      if (this.records.some((r) => r.storage === rel)) continue;
      const buf = fs.readFileSync(path.join(this.legacyDir, f));
      const report = inspectAvatar(buf, { filename: f, limits: this.limits });
      if (!report.ok) { console.log(`Skipping ${f}: ${report.errors[0]}`); continue; }
      const rec = this.makeRecord({ name: report.meta?.name || stripExt(f), filename: f, report, storage: rel, fileId: null, linked: true });
      this.records.push(rec); added.push(rec);
    }
    if (added.length) this.save();
    return added;
  }
  publicRecord(r) {
    const { storage, ...rest } = r;     // never expose disk paths to the page
    return { ...rest, fileUrl: `/api/library/${r.id}/file?v=${encodeURIComponent(r.updatedAt)}`, thumbUrl: r.thumbnail ? `/api/library/${r.id}/thumb?v=${encodeURIComponent(r.updatedAt)}` : null,
      location: r.linked ? 'avatars folder' : 'library' };
  }
}

export class UserError extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }
export function pickLook(s = {}) { const o = {}; for (const k of LOOK_KEYS) if (k in s) o[k] = s[k]; return o; }
function sanitizeName(n) { return (path.basename(String(n || 'avatar.vrm')).replace(/[^\w.\- ()]/g, '_').slice(-120)) || 'avatar.vrm'; }
function safeFile(n) { return String(n || 'character').replace(/[^\w\- ]/g, '_').trim().slice(0, 60) || 'character'; }
function stripExt(n) { return String(n).replace(/\.[^.]+$/, ''); }
function cleanTitle(n) { const t = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60); return t || 'Untitled avatar'; }
function moveFile(a, b) { try { fs.renameSync(a, b); } catch { fs.copyFileSync(a, b); fs.rmSync(a, { force: true }); } }
