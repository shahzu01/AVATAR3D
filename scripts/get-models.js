// Downloads Google's free MediaPipe models (Apache 2.0) into ./models
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models');
fs.mkdirSync(DIR, { recursive: true });
const BASE = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = {
  'face_landmarker.task': `${BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  'hand_landmarker.task': `${BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  'pose_landmarker_lite.task': `${BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
};
for (const [name, url] of Object.entries(MODELS)) {
  const out = path.join(DIR, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 100000) { console.log(`ok   ${name} (already downloaded)`); continue; }
  process.stdout.write(`get  ${name} ... `);
  const r = await fetch(url);
  if (!r.ok) { console.log(`failed (HTTP ${r.status})`); process.exitCode = 1; continue; }
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log(`${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}
// copy a bundled avatar if present
const avatars = path.join(DIR, '..', 'avatars');
fs.mkdirSync(avatars, { recursive: true });
console.log('\nModels ready. Put your .vrm files in the avatars folder (Kael.vrm is the default), then run: npm start');
