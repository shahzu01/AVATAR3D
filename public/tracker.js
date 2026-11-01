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
    chip('cVmc', m.status.vmcActive, m.status.vmcActive ? 'iPhone face: on' : 'iPhone (VMC)'); chip('cTwitch', /joined/.test(m.status.twitch), `Twitch: ${m.status.twitch}`);
    if (m.status.phone) updatePhone(m.status.phone);
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
  const ph = s.phone || {};
  set('phoneApp', ph.app || 'vmc'); set('phoneIp', ph.ip || ''); set('phoneMirror', ph.mirror); set('phoneFlipYaw', ph.flipYaw); set('phoneFlipPitch', ph.flipPitch);
  set('phoneWebcamOff', ph.webcamFaceOff !== false); set('phoneSmooth', ph.smoothing ?? 0.25);
  renderPhoneSteps();
  refreshAvatars();
}
async function refreshAvatars() {
  const { avatars, activeId } = await (await fetch('/api/avatars')).json();
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('avatarSel').innerHTML = avatars.map((a) => `<option value="${a.id}" ${a.id === activeId ? 'selected' : ''}>${esc(a.name)}</option>`).join('') || '<option value="">(no avatar yet: open the library)</option>';
}
bind('cam', 'camera', String, 'change'); bind('zoom', 'cameraOffset.zoom', Number); bind('offY', 'cameraOffset.y', Number); bind('offX', 'cameraOffset.x', Number);
bind('bg', 'background', String, 'change'); bind('bgColor', 'backgroundColor'); bind('lightColor', 'lightColor'); bind('lightIntensity', 'lightIntensity', Number);
bind('rimColor', 'rimColor'); bind('rimIntensity', 'rimIntensity', Number); bind('idleMotion', 'idleMotion', Boolean, 'change');
bind('chatCommands', 'chatCommands', Boolean, 'change'); bind('mirror', 'mirror', Boolean, 'change');
$('avatarSel').addEventListener('change', async (e) => {
  if (!e.target.value) return;
  const r = await fetch(`/api/library/${e.target.value}/activate`, { method: 'POST' });
  const j = await r.json(); log(r.ok ? `active avatar: ${j.avatar.name}` : j.error);
});
$('twitchSave').onclick = () => saveSettings({ twitchChannel: $('twitch').value.trim() });
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

// ------------------------------------------------------------------ iPhone face tracking
let phoneState = { active: false, addresses: [] };
const savePhone = (patch) => saveSettings({ phone: { ...(settings.phone || {}), ...patch } });
$('phoneApp').addEventListener('change', (e) => { savePhone({ app: e.target.value }); renderPhoneSteps(); });
$('phoneIp').addEventListener('change', (e) => savePhone({ ip: e.target.value.trim() }));
$('phoneMirror').addEventListener('change', (e) => savePhone({ mirror: e.target.checked }));
$('phoneFlipYaw').addEventListener('change', (e) => savePhone({ flipYaw: e.target.checked }));
$('phoneFlipPitch').addEventListener('change', (e) => savePhone({ flipPitch: e.target.checked }));
$('phoneWebcamOff').addEventListener('change', (e) => savePhone({ webcamFaceOff: e.target.checked }));
$('phoneSmooth').addEventListener('change', (e) => savePhone({ smoothing: Number(e.target.value) }));
$('phoneCalib').onclick = async () => {
  const r = await (await fetch('/api/phone/calibrate', { method: 'POST' })).json();
  log(r.calibrated ? 'iPhone calibrated: your current head position is now "straight"' : 'connect the iPhone first, then calibrate');
};
function macAddresses() { return phoneState.addresses?.length ? phoneState.addresses.map((a) => `<code>${a.address}</code>`).join(' or ') : '<i>(checking…)</i>'; }
function renderPhoneSteps() {
  const app = $('phoneApp').value;
  $('phoneIpWrap').classList.toggle('hidden', app === 'vmc');
  const same = 'Put the iPhone on the <b>same Wi-Fi</b> as this Mac.';
  const fw = 'If macOS asks whether to allow incoming connections for <b>node</b>, click <b>Allow</b>.';
  const steps = {
    vmc: [`Install <b>waidayo</b> (free) from the App Store, or any app that sends the <b>VMC protocol</b>.`, same,
      `In the app's VMC sending settings, enter this Mac's address ${macAddresses()} and port <code>39539</code>, then start sending.`, fw],
    ifacialmocap: ['Install <b>iFacialMocap</b> from the App Store.', same, 'Open it. Its screen shows the iPhone\'s IP address: type that number in the box above.', 'Kael Studio connects to the phone by itself within a few seconds.', fw],
    vtubestudio: ['Install <b>VTube Studio</b> on the iPhone.', same, 'In the iPhone app\'s settings, turn on the option that lets PC apps receive the face tracking, and note the IP address it shows.', 'Type that IP address in the box above. Kael Studio connects by itself.', fw],
  }[app];
  $('phoneSteps').innerHTML = steps.map((t) => `<li>${t}</li>`).join('') + '<li>Look straight ahead and press <b>Calibrate iPhone</b>.</li>';
}
let phoneWasActive = false;
function updatePhone(st) {
  const hadAddr = phoneState.addresses?.length; phoneState = st;
  chip('cPhone', st.active, st.active ? `connected · ${st.source} · ${st.fps} fps` : 'not connected');
  if (!hadAddr && st.addresses?.length) renderPhoneSteps();
  if (st.active !== phoneWasActive) { log(st.active ? `iPhone face tracking connected (${st.source})${$('phoneWebcamOff').checked ? '; webcam now tracks only body and hands' : ''}` : 'iPhone face tracking disconnected; webcam face tracking resumes'); phoneWasActive = st.active; }
}
fetch('/api/phone').then((r) => r.json()).then(updatePhone).catch(() => {});

// ------------------------------------------------------------------ tracking
const face = new FaceSolver(), hands = new HandSolver(), pose = new PoseSolver();
let faceLm, handLm, poseLm, running = false, frameNo = 0, lastRaw = null, lastHands = {}, lastHandsT = 0, lastPose = null, lastPoseLm = null, lastFaceT = 0;
let audioLevel = 0, analyser = null;
$('smooth').addEventListener('input', (e) => face.setSmoothing(Number(e.target.value)));
face.setSmoothing(0.5);

async function loadModels() {
  log('loading MediaPipe models…');
  const vision = await FilesetResolver.forVisionTasks('/vendor/tasks-vision/wasm');
  const delegate = $('delegate').value === 'CPU' ? 'CPU' : 'GPU';
  const base = (file) => ({ modelAssetPath: `/models/${file}`, delegate });
  faceLm = await FaceLandmarker.createFromOptions(vision, { baseOptions: base('face_landmarker.task'), runningMode: 'VIDEO', numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  handLm = await HandLandmarker.createFromOptions(vision, { baseOptions: base('hand_landmarker.task'), runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  poseLm = await PoseLandmarker.createFromOptions(vision, { baseOptions: base('pose_landmarker_lite.task'), runningMode: 'VIDEO', numPoses: 1 });
  log(`models ready (running on ${delegate})`);
}
async function listCameras() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  $('camSel').innerHTML = '<option value="">Default camera</option>' + devs.map((d) => `<option value="${d.deviceId}">${d.label || 'Camera'}</option>`).join('');
}
$('start').onclick = async () => {
  try {
    if (!faceLm) await loadModels();
    const id = $('camSel').value;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    video.srcObject?.getTracks?.().forEach((tr) => tr.stop());
    video.srcObject = stream; await video.play(); await listCameras();
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    $('start').textContent = 'Camera running';
    log(`camera ${video.videoWidth}×${video.videoHeight}`);
    if (!running) { running = true; schedule(); }
  } catch (e) { log(`camera/model error: ${e.message}`); console.error(e); }
};
$('delegate').addEventListener('change', async () => {      // reload the models on the other processor
  if (!faceLm) return;
  const was = running; running = false;
  for (const m of [faceLm, handLm, poseLm]) try { m.close(); } catch {}
  faceLm = handLm = poseLm = null;
  try { await loadModels(); } catch (e) { log(`model error: ${e.message}`); }
  warmFrames = 0; autoLevel = 0;
  if (was) { running = true; schedule(); }
});
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

// Process every new camera frame exactly once (no wasted work when the screen refreshes faster than the camera).
let lastVideoTime = -1;
function schedule() {
  if (!running) return;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) video.requestVideoFrameCallback(() => { safeTick(); schedule(); });
  else requestAnimationFrame(() => { if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; safeTick(); } schedule(); });
}
function safeTick() { try { tick(); } catch (e) { console.error(e); } }

// Auto performance: if a frame takes too long, track hands and body less often (and recover when there is headroom).
const AUTO = [{ hands: 1, pose: 1, label: 'full quality' }, { hands: 2, pose: 2, label: 'hands every 2nd frame' }, { hands: 2, pose: 3, label: 'hands every 2nd, body every 3rd frame' }, { hands: 3, pose: 4, label: 'hands every 3rd, body every 4th frame' }];
let autoLevel = 0, slowSince = 0, fastSince = 0;
const timing = { face: 0, hands: 0, pose: 0, total: 0 };
let warmFrames = 0;     // the first frames include model warm-up; they must not trigger auto performance
const ema = (k, v) => { if (warmFrames < 20) { timing[k] = v; return; } timing[k] = timing[k] ? timing[k] * 0.9 + v * 0.1 : v; };
function autoTune(now) {
  if (!$('autoPerf').checked) { autoLevel = 0; return; }
  if (++warmFrames < 45) { slowSince = 0; return; }
  if (timing.total > 24) { fastSince = 0; slowSince ||= now; if (now - slowSince > 2000 && autoLevel < AUTO.length - 1) { autoLevel++; slowSince = now; log(`auto performance: ${AUTO[autoLevel].label} (frames were taking ${timing.total.toFixed(0)} ms)`); } }
  else if (timing.total < 12) { slowSince = 0; fastSince ||= now; if (now - fastSince > 6000 && autoLevel > 0) { autoLevel--; fastSince = now; log(`auto performance: back to ${AUTO[autoLevel].label}`); } }
  else { slowSince = 0; fastSince = 0; }
}
const wristVisible = (lm) => lm && [15, 16].some((i) => lm[i] && (lm[i].visibility ?? 1) > 0.3 && lm[i].x > -0.05 && lm[i].x < 1.05 && lm[i].y > -0.05 && lm[i].y < 1.1);

let fpsT = performance.now(), fpsN = 0, lastSend = 0, fps = 0;
function tick() {
  if (!running || video.readyState < 2) return;
  const now = performance.now(), t = now / 1000; frameNo++;
  const opts = { mirror: $('mirror').checked, swapLR: $('swapLR').checked, linkEyes: $('linkEyes').checked };
  const msg = { type: 'frame', t: now, conf: {} };
  const phoneFace = phoneState.active && $('phoneWebcamOff').checked;
  let fr = null, hr = null, pr = null, t0;
  // face
  if ($('tFace').checked && !phoneFace) {
    t0 = performance.now(); fr = faceLm.detectForVideo(video, now); ema('face', performance.now() - t0);
    lastRaw = face.raw(fr, opts);
    const f = face.solve(fr, t, opts);
    if (f) { msg.face = f; msg.conf.face = 1; lastFaceT = now; }
  } else timing.face = 0;
  // body (before hands, so hand search can be skipped when the wrists are out of view)
  const poseEvery = Math.max(Number($('poseEvery').value), AUTO[autoLevel].pose);
  if ($('tBody').checked && frameNo % poseEvery === 0) {
    t0 = performance.now(); pr = poseLm.detectForVideo(video, now); ema('pose', performance.now() - t0);
    lastPoseLm = pr?.landmarks?.[0] || null;
    const palms = Object.fromEntries(Object.entries(lastHands).map(([k, v]) => [k, v.palm]));
    lastPose = pose.solve(pr, t, palms, opts);
  }
  if (!$('tBody').checked) { lastPose = null; lastPoseLm = null; timing.pose = 0; }
  if (lastPose) msg.pose = lastPose;
  // hands
  const handsEvery = Math.max(Number($('handsEvery').value), AUTO[autoLevel].hands);
  let wantHands = $('tHands').checked && frameNo % handsEvery === 0;
  if (wantHands && $('smartHands').checked && $('tBody').checked && lastPoseLm && !wristVisible(lastPoseLm)) wantHands = frameNo % 15 === 0;   // occasional check
  if (wantHands) {
    t0 = performance.now(); hr = handLm.detectForVideo(video, now); ema('hands', performance.now() - t0);
    lastHands = hands.solve(hr, t, opts); lastHandsT = now;
  } else if (!$('tHands').checked || now - lastHandsT > 350) { if (!$('tHands').checked) timing.hands = 0; if (now - lastHandsT > 350) lastHands = {}; }
  if (Object.keys(lastHands).length) msg.hands = lastHands;          // reuse the last result on skipped frames
  const v = voiceLevel(); if (v) msg.voice = v;
  if (now - lastSend > 1000 / 45) { send(msg); lastSend = now; }
  timing.total = timing.face + (timing.hands / handsEvery) + (timing.pose / poseEvery);
  autoTune(now);
  if ($('showDots').checked) draw(fr, hr, pr); else if (frameNo % 30 === 1) octx.clearRect(0, 0, overlay.width, overlay.height);
  chip('cFace', !!msg.face || phoneFace, phoneFace ? 'face: iPhone' : 'face');
  chip('cHands', !!msg.hands, `hands ${msg.hands ? Object.keys(msg.hands).join('+') : ''}`.trim());
  chip('cBody', !!(lastPose && Object.keys(lastPose.conf || {}).length));
  fpsN++;
  if (now - fpsT > 1000) {
    fps = fpsN; $('cFps').textContent = `${fpsN} fps`; fpsN = 0; fpsT = now;
    const ms = (x) => `${x.toFixed(0)} ms`;
    $('perf').textContent = `${fps} fps · face ${phoneFace ? 'on iPhone' : $('tFace').checked ? ms(timing.face) : 'off'} · hands ${$('tHands').checked ? ms(timing.hands) : 'off'} · body ${$('tBody').checked ? ms(timing.pose) : 'off'} · ${autoLevel ? `auto: ${AUTO[autoLevel].label}` : 'full quality'}`;
  }
}
let hiddenAt = 0, warnTimer;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (running) hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 1500) {       // tell the user when they come back
    log(`tracking was paused for ${Math.round((Date.now() - hiddenAt) / 1000)} s while this tab was hidden`);
    $('hiddenWarn').classList.remove('hidden'); clearTimeout(warnTimer); warnTimer = setTimeout(() => $('hiddenWarn').classList.add('hidden'), 20000);
  }
  hiddenAt = 0;
});
function draw(fr, hr, pr) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const W = overlay.width, H = overlay.height;
  const dots = (lms, color, r = 1.6) => { octx.fillStyle = color; for (const p of lms) { octx.beginPath(); octx.arc(p.x * W, p.y * H, r, 0, 7); octx.fill(); } };
  fr?.faceLandmarks?.forEach((l) => dots(l.filter((_, i) => i % 3 === 0), 'rgba(163,92,255,.8)', 1.2));
  hr?.landmarks?.forEach((l) => dots(l, 'rgba(60,207,145,.95)', 2.5));
  pr?.landmarks?.forEach((l) => dots(l.slice(11, 17), 'rgba(240,180,76,.95)', 4));
}
listCameras().catch(() => {});
