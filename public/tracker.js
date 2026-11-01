// Kael Studio tracker + control panel
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '/vendor/tasks-vision/vision_bundle.mjs';
import { FaceSolver, HandSolver, PoseSolver } from '/solver.js';

const $ = (id) => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), octx = overlay.getContext('2d');
const log = (t) => { const d = new Date().toLocaleTimeString(); $('log').innerHTML = `${d}  ${t}<br>` + $('log').innerHTML.slice(0, 6000); };
const chip = (id, on, text) => { const c = $(id); c.classList.toggle('on', !!on); if (text) c.textContent = text; };

// ------------------------------------------------------------------ connection
let ws, settings = {};
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?role=tracker`);
  ws.onopen = () => log('connected to Kael Studio server');
  ws.onclose = () => setTimeout(connect, 1500);
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'settings') loadSettings(m.settings); };
}
connect();
const ctl = new WebSocket(`ws://${location.host}/ws?role=control`);
ctl.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'status') {
    chip('cObs', m.status.avatars > 1, `OBS avatars: ${Math.max(0, m.status.avatars - 1)}`);      // minus this page's preview
    chip('cVmc', m.status.vmcActive); chip('cTwitch', /joined/.test(m.status.twitch), `Twitch: ${m.status.twitch}`);
  } else if (m.source === 'chat') log(`chat: ${m.from} → ${m.item || m.name}`);
};
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));
async function saveSettings(patch) {
  const r = await fetch('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
  settings = await r.json();
}

// ------------------------------------------------------------------ settings UI
const bind = (id, key, conv = (v) => v, evt = 'input') => $(id).addEventListener(evt, (e) => {
  const el = e.target; const v = el.type === 'checkbox' ? el.checked : conv(el.value);
  if (key.includes('.')) { const [a, b] = key.split('.'); saveSettings({ [a]: { ...settings[a], [b]: v } }); } else saveSettings({ [key]: v });
});
function loadSettings(s) {
  settings = s;
  const set = (id, v) => { const el = $(id); if (!el || document.activeElement === el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
  set('cam', s.camera); set('zoom', s.cameraOffset?.zoom ?? 1); set('offY', s.cameraOffset?.y ?? 0); set('offX', s.cameraOffset?.x ?? 0);
  set('bg', s.background); set('bgColor', s.backgroundColor); set('lightColor', s.lightColor); set('lightIntensity', s.lightIntensity);
  set('rimColor', s.rimColor); set('rimIntensity', s.rimIntensity); set('idleMotion', s.idleMotion); set('twitch', s.twitchChannel);
  set('chatCommands', s.chatCommands); set('mirror', s.mirror);
  refreshAvatars();
}
async function refreshAvatars() {
  const { avatars } = await (await fetch('/api/avatars')).json();
  $('avatarSel').innerHTML = avatars.map((a) => `<option ${a === settings.avatar ? 'selected' : ''}>${a}</option>`).join('') || '<option>(drop a .vrm in the avatars folder)</option>';
}
bind('cam', 'camera', String, 'change'); bind('zoom', 'cameraOffset.zoom', Number); bind('offY', 'cameraOffset.y', Number); bind('offX', 'cameraOffset.x', Number);
bind('bg', 'background', String, 'change'); bind('bgColor', 'backgroundColor'); bind('lightColor', 'lightColor'); bind('lightIntensity', 'lightIntensity', Number);
bind('rimColor', 'rimColor'); bind('rimIntensity', 'rimIntensity', Number); bind('idleMotion', 'idleMotion', Boolean, 'change');
bind('chatCommands', 'chatCommands', Boolean, 'change'); bind('mirror', 'mirror', Boolean, 'change');
$('avatarSel').addEventListener('change', (e) => saveSettings({ avatar: e.target.value }));
$('twitchSave').onclick = () => saveSettings({ twitchChannel: $('twitch').value.trim() });
$('upload').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  log(`uploading ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`);
  const r = await fetch(`/api/avatar?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
  log(r.ok ? `${f.name} uploaded and selected` : `upload failed: ${await r.text()}`); refreshAvatars();
});
const obs = `${location.origin}/avatar.html`; $('obsUrl').textContent = obs; $('apiEx').textContent = `${location.origin}/api/trigger/joy`;
$('copyUrl').onclick = () => navigator.clipboard.writeText(obs);

// ------------------------------------------------------------------ interaction buttons + hotkeys
const EXPR = ['Joy', 'Laughing', 'Smug', 'Angry', 'Sad', 'Surprised', 'Embarrassed', 'Wink_L', 'Thinking'];
const THROWS = ['heart', 'star', 'tomato', 'bonk', 'gift', 'pizza'];
const GESTURES = ['wave', 'nod', 'dance'];
const mk = (box, items, fn, keys) => items.forEach((n, i) => { const b = document.createElement('button'); b.textContent = `${keys ? keys[i] + ' · ' : ''}${n}`; b.onclick = () => fn(n); $(box).appendChild(b); });
const fire = { expr: (n) => send({ type: 'trigger', name: n, intensity: 1, duration: 2.5 }), throw: (n) => send({ type: 'throw', item: n, count: 1 }), gesture: (n) => send({ type: 'gesture', name: n }) };
mk('exprBtns', EXPR, fire.expr, '123456789'.split(''));
mk('throwBtns', THROWS, fire.throw, 'QWERTY'.split(''));
mk('gestureBtns', GESTURES, fire.gesture, 'ZXC'.split(''));
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
  const k = e.key.toUpperCase();
  const i1 = '123456789'.indexOf(k), i2 = 'QWERTY'.indexOf(k), i3 = 'ZXC'.indexOf(k);
  if (i1 >= 0) fire.expr(EXPR[i1]); else if (i2 >= 0) fire.throw(THROWS[i2]); else if (i3 >= 0) fire.gesture(GESTURES[i3]);
});

// ------------------------------------------------------------------ tracking
const face = new FaceSolver(), hands = new HandSolver(), pose = new PoseSolver();
let faceLm, handLm, poseLm, running = false, frameNo = 0, lastRaw = null, lastHands = {}, lastPose = null;
let audioLevel = 0, analyser = null;
$('smooth').addEventListener('input', (e) => face.setSmoothing(Number(e.target.value)));
face.setSmoothing(0.5);

async function loadModels() {
  log('loading MediaPipe models…');
  const vision = await FilesetResolver.forVisionTasks('/vendor/tasks-vision/wasm');
  const base = (file) => ({ modelAssetPath: `/models/${file}`, delegate: 'GPU' });
  faceLm = await FaceLandmarker.createFromOptions(vision, { baseOptions: base('face_landmarker.task'), runningMode: 'VIDEO', numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true });
  handLm = await HandLandmarker.createFromOptions(vision, { baseOptions: base('hand_landmarker.task'), runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  poseLm = await PoseLandmarker.createFromOptions(vision, { baseOptions: base('pose_landmarker_lite.task'), runningMode: 'VIDEO', numPoses: 1 });
  log('models ready');
}
async function listCameras() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  $('camSel').innerHTML = '<option value="">Default camera</option>' + devs.map((d) => `<option value="${d.deviceId}">${d.label || 'Camera'}</option>`).join('');
}
$('start').onclick = async () => {
  try {
    if (!faceLm) await loadModels();
    const id = $('camSel').value;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: 640, height: 360, frameRate: 30 }, audio: false });
    video.srcObject = stream; await video.play(); await listCameras();
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    $('start').textContent = 'Camera running'; running = true; log(`camera ${video.videoWidth}×${video.videoHeight}`);
    requestAnimationFrame(tick);
  } catch (e) { log(`camera/model error: ${e.message}`); console.error(e); }
};
$('calib').onclick = () => { if (lastRaw) { face.calibrate(lastRaw); log('neutral pose calibrated'); } else log('start the camera and look at it first'); };
$('tVoice').addEventListener('change', async (e) => {
  if (!e.target.checked) { analyser = null; chip('cVoice', false); return; }
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ac = new AudioContext(); const src = ac.createMediaStreamSource(s); analyser = ac.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser);
  chip('cVoice', true); log('voice lip sync on (used when your face is not visible)');
});
function voiceLevel() {
  if (!analyser) return 0;
  const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a);
  let s = 0; for (const v of a) s += v * v;
  const rms = Math.sqrt(s / a.length), lvl = Math.max(0, Math.min(1, (rms - 0.01) * 12));
  audioLevel += (lvl - audioLevel) * 0.5; return Math.round(audioLevel * 100) / 100;
}

let fpsT = performance.now(), fpsN = 0, lastSend = 0;
function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  if (video.readyState < 2) return;
  const now = performance.now(), t = now / 1000; frameNo++;
  const opts = { mirror: $('mirror').checked, swapLR: $('swapLR').checked };
  const msg = { type: 'frame', t: now, conf: {} };
  let fr = null, hr = null, pr = null;
  if ($('tFace').checked) {
    fr = faceLm.detectForVideo(video, now);
    lastRaw = face.raw(fr, opts);
    const f = face.solve(fr, t, opts);
    if (f) { msg.face = f; msg.conf.face = 1; }
  }
  if ($('tHands').checked) { hr = handLm.detectForVideo(video, now); lastHands = hands.solve(hr, t, opts); if (Object.keys(lastHands).length) msg.hands = lastHands; }
  if ($('tBody').checked && frameNo % Number($('poseEvery').value) === 0) {
    pr = poseLm.detectForVideo(video, now);
    const palms = Object.fromEntries(Object.entries(lastHands).map(([k, v]) => [k, v.palm]));
    lastPose = pose.solve(pr, t, palms, opts);
  }
  if ($('tBody').checked && lastPose) msg.pose = lastPose;
  const v = voiceLevel(); if (v) msg.voice = v;
  if (now - lastSend > 1000 / 45) { send(msg); lastSend = now; }
  draw(fr, hr, pr);
  chip('cFace', !!msg.face); chip('cHands', !!msg.hands, `hands ${msg.hands ? Object.keys(msg.hands).join('+') : ''}`.trim()); chip('cBody', !!(lastPose && Object.keys(lastPose.conf || {}).length));
  fpsN++; if (now - fpsT > 1000) { $('cFps').textContent = `${fpsN} fps`; fpsN = 0; fpsT = now; }
}
function draw(fr, hr, pr) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const W = overlay.width, H = overlay.height;
  const dots = (lms, color, r = 1.6) => { octx.fillStyle = color; for (const p of lms) { octx.beginPath(); octx.arc(p.x * W, p.y * H, r, 0, 7); octx.fill(); } };
  fr?.faceLandmarks?.forEach((l) => dots(l.filter((_, i) => i % 3 === 0), 'rgba(163,92,255,.8)', 1.2));
  hr?.landmarks?.forEach((l) => dots(l, 'rgba(60,207,145,.95)', 2.5));
  pr?.landmarks?.forEach((l) => dots(l.slice(11, 17), 'rgba(240,180,76,.95)', 4));
}
listCameras().catch(() => {});
