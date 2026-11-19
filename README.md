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

## Updating

Your KaelStudio folder is linked to the GitHub project, so getting the latest version is one step. Quit Kael Studio, then in Terminal:

```
cd ~/Downloads/KaelStudio
npm run update
```

It downloads the new version (your library, settings and avatars are not touched) and installs anything new. If it says your local changes would be overwritten, nothing has changed yet: tell Claude, or set those files aside first. Start Kael Studio again afterwards.

## Every stream

Double-click **Kael Studio** on your Desktop. (Or in Terminal: `cd ~/Downloads/KaelStudio && npm start`.)

Then:

1. **Chrome:** open http://localhost:3939/tracker.html and press **Start camera**. Allow camera access. Look straight ahead with a relaxed face and press **Calibrate neutral**.
2. **OBS:** add a **Browser Source** with URL `http://localhost:3939/avatar.html`, width 1920, height 1080. Leave "Shutdown source when not visible" off. Put the source above your Elgato PS5 capture.
3. Change the camera framing, background, lighting preset (Cute anime, Gaming stream, Dramatic scene, Character showcase, Warm café, Sunny day, Moonlit night, Classic) and avatar in the **Look** panel. Changes appear in OBS instantly. **Idle breathing** also adds a slow hip-to-hip weight shift, which keeps skirts, capes and hair gently moving while you sit still.

Keep the Chrome tab open while streaming. Chrome slows down background tabs, so give it its own window rather than hiding it behind another tab.

## Interactions

| What | How |
|---|---|
| Expressions | Studio buttons, keys 1–9, chat `!joy !laugh !angry !sad !wow !smug !blush !wink` |
| Throw items | Keys Q W E R T Y, chat `!heart !star !tomato !bonk !gift !pizza` |
| Gestures | Keys Z X C, chat `!wave !nod !dance` |
| Twitch chat | Enter your channel name in the Studio and tick **Chat commands** (read-only, no login) |

### Twitch events and rules

In the Studio's **Interact** panel, **Twitch events** connects your channel's channel-point redeems, bits, subs, gifted subs, resubs, follows and raids. It is a one-time setup:

1. Open the [Twitch developer console](https://dev.twitch.tv/console/apps/create) and register an application: any name, OAuth Redirect URL `http://localhost`, category *Broadcaster Suite*, client type **Public**.
2. Paste its **Client ID** into the panel and press **Connect**, then enter the code it shows at twitch.tv/activate.

No password or secret is ever typed into Kael Studio. The sign-in is kept in `twitch-auth.json` in the KaelStudio folder (never on GitHub) and renews itself; **Sign out** removes it. Bits and subs only work for Affiliate and Partner channels: the panel shows which events Twitch allowed.

**Rules** say what happens: *when* a redeem (by name), bits (at least N), a sub, resub, gifted subs, a follow, a raid or a chat command happens, *do* any mix of thrown items (optionally one per N bits, gifts or raiders), an expression, a gesture, a lighting preset, a prop shown for a few seconds, a pose (for example sit down for 10 seconds) or a camera shot (a close-up that glides in and back out), with an optional wait before the rule can fire again. Starter rules are included (follow, bits, sub, gift subs, raid, a "Bonk" redeem). **▶ Test** on any rule pretends it just happened, so you can try it without going live; the Activity log shows every event and what it did. Chat commands you add as rules work with the read-only chat connection too.

### Stream Deck

Use the **Website** action. Turn on "GET request in background" and set the URL to one of:

- `http://localhost:3939/api/trigger/Joy` (any expression name: Laughing, Angry, Sad, Surprised, Smug, Embarrassed, Wink_L, Thinking…)
- `http://localhost:3939/api/throw/heart?n=5`
- `http://localhost:3939/api/gesture/wave`

## iPhone face tracking (recommended)

An iPhone with Face ID tracks your face much better than a webcam. Use the **iPhone face tracking** panel in the Studio. The webcam keeps tracking body and hands.

| Phone app | Setup |
|---|---|
| **waidayo** (free) or any VMC app | In the app's VMC settings, send to this Mac's address (shown in the panel) on port **39539**. |
| **iFacialMocap** | Type the IP address the app shows into the panel. Kael Studio connects to the phone by itself. |
| **VTube Studio** (iPhone app) | Turn on the setting that lets PC apps receive tracking, then type the phone's IP address into the panel. |

Phone and Mac must be on the same Wi-Fi. If macOS asks about incoming connections for **node**, click **Allow**. Look straight ahead and press **Calibrate iPhone**. If turning or nodding goes the wrong way, use **Mirror**, **Flip left/right** or **Flip up/down**. While the iPhone is connected, the webcam skips the face to save power (you can turn that off).

## Look: scene, props, pose and camera

The Studio's **Look** panel dresses the stream:

- **Scene behind you:** one of eight built-in sets (concert stage, cosy room, night city window, gaming room, cosy café, neon street at night, cherry blossom park, starry stage), or your own `.glb` room or a picture, instead of a flat colour. Sliders move, scale and turn it. Picking a built-in set also switches to the lighting that suits it (you can change it again under Lighting). Some sets move a little: the gaming room's RGB strips, falling petals in the park, the starry stage's bulbs, spotlights and sparkles.
- **Props:** a microphone, mug, lightstick, plushie, "Thank you!" sign or crown, or your own `.glb` models and pictures. Each one attaches to the right or left hand, the head, chest, hips or the floor, and follows it; sliders fine-tune where it sits. Rules can show a prop for a few seconds (for example a sign on a follow). Uploads are checked: only single-file `.glb` models (textures inside the file) and PNG, JPEG or WebP pictures, up to 60 MB, and they stay in the `props` folder on your Mac.
- **Pose:** Relaxed, Hands on hips, Arms crossed, Thinking, Shy, Leaning, or Sitting (a stool appears under the character). When the camera sees your arms, they follow you as usual; tick **Keep the pose** to hold it anyway.
- **Camera:** framing changes glide instead of cutting. **Camera motion** adds a gentle drift or a slow sway around the character to keep the shot alive.

**Voice lip sync** (Track panel) moves the mouth from your microphone whenever your face is not visible, including with the camera switched off. It shapes the mouth for "a", "i", "o" and similar sounds, and ignores steady background noise like a fan.

## Tracking tips and options

- Press **Calibrate neutral** each session (head straight, relaxed face).
- **Smoothing:** move right if the avatar jitters, left if it lags.
- **Blink both eyes together:** stops one-eye flicker from webcams; real winks still work.
- **Smart hand search:** looks for hands only while your wrists are in view.
- **Auto performance:** if your Mac struggles, hands and body are tracked less often automatically; the timing line under the camera shows what each part costs.
- **Run on GPU / CPU:** GPU is fastest on Apple Silicon. Try CPU only if tracking misbehaves.
- Keep the Studio in its own visible window; Chrome pauses hidden tabs (the Studio warns you if that happened).
- Light in front of you, camera at eye level, charger plugged in, Low Power Mode off.

## Characters

**Characters** in the top bar (http://localhost:3939/characters.html) is the home for every character, laid out like VRoid Studio:

- **My Characters:** what you made and what you imported, newest first. Click one to edit it (or, for an imported model, to see its details). The **⋯** menu has Put on stream, Details, Rename, Duplicate and Delete. The card marked **On stream** is what OBS shows.
- **Create New** asks for a base: **Feminine** or **Masculine** (or Mika, a human body or NekoMika's head under *More bases*), then opens the editor.
- **Open a .vrm** imports a model you already have, for example one made in VRoid Studio.
- **Ready to Stream** and **Animal & Fantasy:** the ready-made anime characters. Open one to use it or change it.

### Premium skins (this computer only)

Finished avatars you keep private go in a `premium/` folder inside Kael Studio. The folder is in `.gitignore`, so it is never uploaded. Each skin has its own folder, `premium/<id>/`, holding `<id>.vrm`, a `card.png` picture (3:4), optional renders (`hero.png`, `full.png`, `face.png`) and `skin.json`:

```json
{ "name": "Nova", "tagline": "Arcade gamer", "accent": "#ff6fd8" }
```

When the folder has skins, Characters shows a **Premium** row. Clicking a skin adds it to your Library (the file stays in `premium/`) and puts it on stream. Deleting it from the Library leaves the file in `premium/`.

### Avatar library (details and import)

The library page (http://localhost:3939/library.html, or *Details* in a card's menu) still handles importing, checking and the per-avatar settings below.

- **Import My 3D Avatar:** choose or drag in a `.vrm` (VRM 1.0 or 0.x). Kael Studio checks the file first: type, size, damage, and links to outside files are not allowed. It then shows a 3D preview you can rotate and zoom, with front, ¾, side, back and full-body views, light and background presets, expression buttons and test motions (wave, nod, look around, blink). A report lists what the model supports: humanoid rig, fingers, expressions, Perfect Sync face tracking, blinking, lip sync, eye control, spring bones, textures, size and facing direction. Name it and save it.
- `.glb` models can be stored and previewed, but they have no VRM humanoid rig, so they cannot be driven by tracking.
- **Create a New Avatar** opens the Character Creator (below).
- Each avatar page has **Set as active avatar** (OBS and the Studio switch instantly), **Rename**, **Duplicate settings**, **Download original**, **Replace file…** and **Delete** (with confirmation).
- **Stream presentation** settings are saved per avatar: position, turn and size in the shot, camera framing, background, light preset, blinking on/off, and eye, mouth and expression strength.

## Characters made in the old Animal Maker

The Animal Maker has been retired: animal ears and tails are now part of the Character Maker (below). Animals you made before still load, stream and can be edited: **Edit** on their library page opens them where they were made.

Where things are kept (inside the KaelStudio folder):

| Folder | What |
|---|---|
| `library/files/` | Your imported files, stored unchanged |
| `library/library.json` | Names, settings and capability reports |
| `library/trash/` | Deleted or replaced files. Nothing is destroyed; empty it yourself when you are sure |
| `avatars/` | Still works: any `.vrm` dropped here appears in the library automatically and stays where it is |

Limits (changeable in `settings.json` under `importLimits`): 300 MB per file, 4 million triangles, 16384 px textures. Models over 300k triangles get a "may lower the frame rate" warning.

## Character Maker

The editor works like VRoid Studio: tabs across the top (**Face, Hairstyle, Body, Outfit, Accessories, Animal, Look**), sections down the left, picture cards for every choice, the character in the middle and colours on the right. Save, Go live and Export .vrm are at the top right; ☰ goes back to My Characters or opens a sample. The picture cards are drawn on your Mac the first time you open the editor (a second or two each, in the background) and kept in the `thumbs` folder, so later visits show them at once.

**Undo / Redo** (⌘Z / ⇧⌘Z) and **Surprise me** (a random character, sometimes with animal ears and a tail) are at the top. It builds a character from parts that fit together: five bodies (female, male, anime female, anime male, and Mika), swappable heads (including complete heads such as NekoMika), hair, outfits and accessories.

- **Ready-made:** fifteen complete anime characters to start from. Ready to Stream: School Day, Sky Stage Idol, Cyber Runner, Cozy Streamer, Star Knight, Street Gamer, Idol Prince (classic face, built hair). Animal & Fantasy: Neko Streamer, Fox Shrine Maiden, Bunny Idol, Elf Mage, Wolf Knight, Cat Butler, Bear Buddy, Anime Idol. Everything about them can be changed.
- **Animal:** cat, fox, wolf, bunny, bear or pointed elf ears, and cat, fox or wolf tails or a bunny or bear puff, in the hair colour or a fur colour of your own, with a tip colour for fox and wolf tails. Ears are fitted to the head and hairstyle; tails swing with spring physics and come along in a baked or exported .vrm.
- **Face:** 15 face shapes (5 female, 5 male, 5 cartoon) and 20 eye shapes (5 each for human women, human men, anime girls and anime boys), plus eye colour. Human heads get drawn brows, a lash line and lip colour (and blush on women). Anime heads get painted eyes, lash lines and blush.
- **Face tracking:** every Part Mixer face has 43 of the iPhone's 52 face shapes (Perfect Sync) plus the usual blink, mouth and mood shapes, so winks, one-sided smiles, brows, cheek puffs and the jaw all follow you. Eye direction moves the eyes themselves.
- **Built hair** (Hairstyle tab): pick a starting style under *Hairstyle sets* (bob with bangs, long straight, twin tails, high ponytail, twin buns, very long curtain, braid, short boy cut), then change each part on its own: **Front** (straight, side-swept, centre part, wispy, long curtain), **Back** (short, bob, shoulder length, long, very long), **Side** locks, **Extensions** (high or low ponytail, twin tails, twin buns, top bun, side ponytail, braid) and **Extra** (ahoge, antenna pair). Every lock is drawn to fit the chosen head and body and painted with strands and a shine ring, like VRoid's hair. The original sculpted hairstyles are still there under *Sculpted*; bows, pins and headpieces are under *Hair pieces*.
- **Separate pieces:** besides whole sets, the Outfit tab has **Tops, Bottoms, Legwear and Shoes**. Each piece comes from one of the outfits and keeps its own two colours, so a Gothic Lolita top can go with a sailor skirt and stage-idol boots.
- **Proportions** (Body tab): height, leg length, shoulders, waist, hips, head size, and arm and leg thickness. Clothes, hair and the face follow the new shape, on stream too.
- **Outfits:** everyday sets for male, female and anime bodies, **Premium (female & anime)**: Gothic Lolita, Magical Knight, Modern Kimono, Stage Idol, Victorian Maid, and **Premium (male)**: Royal Knight, Butler, Samurai, Stage Idol. Premium outfits start in their own colours; change them with **Clothing** and **Accent**.
- **Cloth physics:** skirts, capes and hakama swing and settle, and bounce off the legs, hands and body. Hair sways too. Press **Sway** in the view bar to try it.
- **Save to library** saves the character and optimizes it for the stream (see below). Tick **Go live** to put it on stream when it is saved.
- **Export .vrm file** gives you a standard VRM 1.0 file of the character for other apps (VSeeFace, Warudo, VRChat and others), with its expressions, Perfect Sync shapes, hair and cloth physics and toon materials.

### Optimized for the stream

A Part Mixer character is made of many pieces. Kael Studio bakes it into one optimized VRM (about 8 times less work per frame for a premium outfit) and keeps it next to the character in the library. This happens by itself after **Save to library**, after **Put on stream** in the library, and in the Studio while the camera is off. The library shows **Stream file: Optimized** when it is ready. Until then, and right after you edit a character, OBS builds it live (it looks the same, it just costs more), so the stream never shows an out-of-date version.

## Troubleshooting

- **Avatar moves the wrong way:** tick **Mirror movement**. If only winks are swapped, tick **Swap face left/right**.
- **Jittery:** raise **Smoothing**. **Laggy:** lower it.
- **Low fps on the M2:** set **Body every** to 3rd frame, or untick Hands when you don't need fingers.
- **OBS shows nothing:** check Kael Studio is running (click the Desktop icon: it offers Open or Quit when running), then right-click the source and choose Refresh.

## Privacy and safety

Kael Studio only answers this Mac. Other computers and phones on your Wi-Fi cannot open its pages or change anything, and other websites open in Chrome cannot send it commands (no deleting avatars, changing settings or spamming throws). Stream Deck buttons and the iPhone tracking apps keep working.

If you really need another computer to reach it (for example OBS on a second PC), start it with `KAEL_HOST=0.0.0.0 npm start`, or set `"listenHost": "0.0.0.0"` in `settings.json`. Anyone on that network can then use it, so only do this on a network you trust.

## How it works

`tracker.html` runs MediaPipe Face, Hand and Pose in Chrome and solves bone rotations and blendshapes (`solver.js`). It streams them over WebSocket to `server.js`, which relays them to every `avatar.html` (OBS, Studio preview). The server also handles VMC/OSC, Twitch chat, Stream Deck HTTP triggers and saves your settings to `settings.json`.

Part Mixer characters are assembled in the browser (`modular.js`, with `outfits.js`, `garments.js`, `cloth.js`, `face.js` and `accessories.js`) from the kit in `public/modular/`, which the Blender scripts in `blender/modular/` build. `bake.js` turns one into a single optimized VRM; `autobake.js` keeps the stored copy up to date.

## Checking that everything works

```
npm test
```

runs a quick check (under a minute) on a spare port with a scratch data folder, so your library and settings are never touched: every script parses, every page loads, the safety lock holds, every outfit, accessory, face shape and eye shape survives saving, the face kit is complete, and the optimized-file checks refuse stale or broken files.
