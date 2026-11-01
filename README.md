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

Double-click **Kael Studio** on your Desktop. (Or in Terminal: `cd ~/Downloads/KaelStudio && npm start`.)

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

## Avatar Library

Open **Avatar library** from the Studio's Look panel (or http://localhost:3939/library.html).

- **Import My 3D Avatar:** choose or drag in a `.vrm` (VRM 1.0 or 0.x). Kael Studio checks the file first: type, size, damage, and links to outside files are not allowed. It then shows a 3D preview you can rotate and zoom, with front, ¾, side, back and full-body views, light and background presets, expression buttons and test motions (wave, nod, look around, blink). A report lists what the model supports: humanoid rig, fingers, expressions, Perfect Sync face tracking, blinking, lip sync, eye control, spring bones, textures, size and facing direction. Name it and save it.
- `.glb` models can be stored and previewed, but they have no VRM humanoid rig, so they cannot be driven by tracking.
- **Create a New Avatar** opens the Character Creator (below).
- Each avatar page has **Set as active avatar** (OBS and the Studio switch instantly), **Rename**, **Duplicate settings**, **Download original**, **Replace file…** and **Delete** (with confirmation).
- **Stream presentation** settings are saved per avatar: position, turn and size in the shot, camera framing, background, light preset, blinking on/off, and eye, mouth and expression strength.

## Character Creator

Open it from **Create a New Avatar** in the library (or http://localhost:3939/creator.html).

- **Start:** 12 ready-made characters (Raccoon Gamer, Fox Ranger, Neko Streamer, Panda Chef, Wolf Knight, Bunny Idol, Tiger Athlete, Bear Buddy, Mouse Inventor, Anime Hero, Elf Mage, Idol Star), two randomize buttons, and 11 species: human, elf, cat, fox, wolf, raccoon, bear, panda, bunny, tiger, mouse.
- **Body:** height, head size, leg length, build, shoulders, chest, waist, hips, arm and leg thickness, outline thickness.
- **Face:** 9 eye styles plus eye colour, size, spacing, height and tilt; eyelashes; 7 brow styles; 7 mouths; noses; snout length; markings (bandit mask, panda patches, freckles, cheek marks, whisker dots, star, scar, blush).
- **Fur & skin:** main, muzzle/belly, markings, inner-ear and nose colours; patterns (stripes, spots, socks, tuxedo, dark tips).
- **Ears & tail:** 10 ear types and 8 tails, with sizes. Bunny ears, tails and long hair swing as you move.
- **Hair:** 14 styles with a main colour and a tip colour.
- **Outfit:** 11 tops, 6 bottoms, 5 kinds of shoes, each with colours.
- **Accessories:** up to 6 of 18 (gaming headset, headphones, glasses, sunglasses, cap, beanie, crown, horns, halo, bow, flower, scarf, choker, earrings, backpack, wings, bandana), each with a colour.
- **Test:** idle, wave, nod, look around, blink, talk, and 16 face expressions on the preview.
- **Undo / redo** (⌘Z / ⇧⌘Z). Name it and press **Save to library**. Later, use **Edit in creator** on its library page; OBS updates as soon as you save.

Faces are drawn toon-style and driven by all 52 face-tracking inputs, so blinking, the mouth, brows, gaze and emotions follow your webcam (or iPhone). Extra stream expressions for Stream Deck buttons: `HeartEyes`, `StarEyes`, `Crying`, `Sweat`, `Dizzy`, `Pout`, `Shocked`, `Thinking`, plus the usual `Joy`, `Laughing`, `Angry`, `Sad`, `Surprised`, `Embarrassed`, `Smug`, `Wink_L`. For example: `http://localhost:3939/api/trigger/HeartEyes`.

A created character is saved as a small recipe file (`.kaelchar.json`), so it works only inside Kael Studio. It is not a .vrm for other apps.

Where things are kept (inside the KaelStudio folder):

| Folder | What |
|---|---|
| `library/files/` | Your imported files, stored unchanged |
| `library/library.json` | Names, settings and capability reports |
| `library/trash/` | Deleted or replaced files. Nothing is destroyed; empty it yourself when you are sure |
| `avatars/` | Still works: any `.vrm` dropped here appears in the library automatically and stays where it is |

Limits (changeable in `settings.json` under `importLimits`): 300 MB per file, 4 million triangles, 16384 px textures. Models over 300k triangles get a "may lower the frame rate" warning.

## Troubleshooting

- **Avatar moves the wrong way:** tick **Mirror movement**. If only winks are swapped, tick **Swap face left/right**.
- **Jittery:** raise **Smoothing**. **Laggy:** lower it.
- **Low fps on the M2:** set **Body every** to 3rd frame, or untick Hands when you don't need fingers.
- **OBS shows nothing:** check Kael Studio is running (click the Desktop icon: it offers Open or Quit when running), then right-click the source and choose Refresh.

## How it works

`tracker.html` runs MediaPipe Face, Hand and Pose in Chrome and solves bone rotations and blendshapes (`solver.js`). It streams them over WebSocket to `server.js`, which relays them to every `avatar.html` (OBS, Studio preview). The server also handles VMC/OSC, Twitch chat, Stream Deck HTTP triggers and saves your settings to `settings.json`.
