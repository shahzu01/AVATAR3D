# Kael Studio

A free VTuber app for Mac. Your webcam drives your VRM avatar (face, eyes, mouth, head, arms and fingers), and OBS shows the avatar with a transparent background. Viewers can throw things at the avatar and trigger expressions from Twitch chat. Stream Deck buttons work too.

Everything runs on your Mac. No account is needed and nothing is uploaded.

## First-time setup (once)

1. Install Node.js 20 or newer. You already have Node 24 from the REA install.
2. Open Terminal and run:

```
cd ~/Downloads/KaelStudio
npm install
npm run setup
```

`npm install` fetches three.js, three-vrm, MediaPipe and ws. `npm run setup` downloads Google's three free MediaPipe tracking models into `models/`.

## Every stream

```
cd ~/Downloads/KaelStudio
npm start
```

Then:

1. **Chrome:** open http://localhost:3939/tracker.html and press **Start camera**. Allow camera access. Look straight ahead with a relaxed face and press **Calibrate neutral**.
2. **OBS:** add a **Browser Source** with URL `http://localhost:3939/avatar.html`, width 1920, height 1080. Leave "Shutdown source when not visible" off. Put the source above your Elgato PS5 capture.
3. Change the camera framing, background, lights and avatar in the **Look** panel. Changes appear in OBS instantly.

Keep the Chrome tab open while streaming. Chrome slows down background tabs, so give it its own window rather than hiding it behind another tab.

## Interactions

| What | How |
|---|---|
| Expressions | Studio buttons, keys 1–9, chat `!joy !laugh !angry !sad !wow !smug !blush !wink` |
| Throw items | Keys Q W E R T Y, chat `!heart !star !tomato !bonk !gift !pizza` |
| Gestures | Keys Z X C, chat `!wave !nod !dance` |
| Twitch chat | Enter your channel name in the Studio and tick **Chat commands** (read-only, no login) |

### Stream Deck

Use the **Website** action. Turn on "GET request in background" and set the URL to one of:

- `http://localhost:3939/api/trigger/Joy` (any expression name: Laughing, Angry, Sad, Surprised, Smug, Embarrassed, Wink_L, Thinking…)
- `http://localhost:3939/api/throw/heart?n=5`
- `http://localhost:3939/api/gesture/wave`

## Optional: better face tracking with an iPhone

Any app that sends the **VMC protocol** (for example waidayo, or iFacialMocap through a VMC bridge) can drive the face with Apple's ARKit tracking. Send it to your Mac's IP address on port **39539**. The **iPhone (VMC)** chip turns green when data arrives. Webcam body and hand tracking keep working at the same time.

## Your own avatar

Use **Upload .vrm** in the Look panel, or drop the file into `avatars/`. VRM 0.x and 1.0 both work. Models with ARKit "Perfect Sync" blendshapes, like Kael, get full face tracking. Other models fall back to basic blink, mouth and smile.

## Troubleshooting

- **Avatar moves the wrong way:** tick **Mirror movement**. If only winks are swapped, tick **Swap face left/right**.
- **Jittery:** raise **Smoothing**. **Laggy:** lower it.
- **Low fps on the M2:** set **Body every** to 3rd frame, or untick Hands when you don't need fingers.
- **OBS shows nothing:** check that `npm start` is still running in Terminal, then right-click the source and choose Refresh.

## How it works

`tracker.html` runs MediaPipe Face, Hand and Pose in Chrome and solves bone rotations and blendshapes (`solver.js`). It streams them over WebSocket to `server.js`, which relays them to every `avatar.html` (OBS, Studio preview). The server also handles VMC/OSC, Twitch chat, Stream Deck HTTP triggers and saves your settings to `settings.json`.
