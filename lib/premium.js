// Premium skins: private, finished avatars kept on this computer only, in <data>/premium/<id>/ (the folder is in
// .gitignore, so it never goes to GitHub). Each skin folder holds:
//   skin.json   { "name": "Nova", "tagline": "Arcade gamer", "accent": "#ff6fd8" }
//   <id>.vrm    the avatar
//   card.png    the picture on the home screen (3:4)
//   hero.png, full.png, face.png   optional renders
// Using a skin links its .vrm into the Library (the file stays in the premium folder).
import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
export const PREMIUM_IMAGES = ['card.png', 'hero.png', 'full.png', 'face.png'];

export class Premium {
  constructor(root) { this.root = root; this.dir = path.join(root, 'premium'); }
  vrmPath(id) { return ID_RE.test(id) ? path.join(this.dir, id, `${id}.vrm`) : null; }
  imagePath(id, name) { return ID_RE.test(id) && PREMIUM_IMAGES.includes(name) ? path.join(this.dir, id, name) : null; }
  read(id) {
    const vrm = this.vrmPath(id); if (!vrm || !fs.existsSync(vrm)) return null;
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(this.dir, id, 'skin.json'), 'utf8')); } catch {}
    const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '');
    return { id, name: str(meta.name, 40) || id, tagline: str(meta.tagline, 80), accent: /^#[0-9a-f]{6}$/i.test(meta.accent) ? meta.accent : '#9b6bff',
      images: PREMIUM_IMAGES.filter((f) => fs.existsSync(path.join(this.dir, id, f))), file: vrm };
  }
  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter((d) => ID_RE.test(d)).sort().map((d) => this.read(d)).filter(Boolean);
  }
}
