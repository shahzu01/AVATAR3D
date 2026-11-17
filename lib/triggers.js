// Trigger rules: "when this happens on stream, the avatar does that".
// An event (a Twitch redeem, bits, a sub, a follow, a raid, a chat command, or a test from the Studio) is matched
// against the rules; every matching rule that is not cooling down sends its actions to the avatar pages as the same
// messages the Stream Deck and chat buttons already use (throw / trigger / gesture), plus lighting presets.

export const WHEN = {
  redeem: { label: 'Channel-point redeem', match: 'Reward name (blank = any reward)', min: null },
  bits: { label: 'Bits (cheer)', match: null, min: 'At least this many bits' },
  sub: { label: 'New subscriber', match: null, min: null },
  resub: { label: 'Resub', match: null, min: 'At least this many months' },
  gift: { label: 'Gifted subs', match: null, min: 'At least this many gifts' },
  follow: { label: 'New follower', match: null, min: null },
  raid: { label: 'Raid', match: null, min: 'At least this many raiders' },
  command: { label: 'Chat command', match: 'Command without the ! (for example hug)', min: null },
};
export const ITEMS = ['heart', 'star', 'tomato', 'bonk', 'gift', 'pizza'];
export const EXPRESSIONS = ['Joy', 'Laughing', 'Angry', 'Sad', 'Surprised', 'Smug', 'Embarrassed', 'Wink_L', 'Thinking', 'HeartEyes', 'StarEyes', 'Crying', 'Sweat', 'Dizzy', 'Pout', 'Shocked'];
export const GESTURES = ['wave', 'nod', 'dance'];
export const PRESETS = ['cute', 'gaming', 'dramatic', 'showcase', 'cafe', 'daylight', 'moonlight', 'classic'];
export const ACTS = { throw: 'Throw items', expression: 'Expression', gesture: 'Gesture', light: 'Lighting preset', prop: 'Show a prop', pose: 'Strike a pose', camera: 'Camera shot' };
export const FRAMINGS = { head: 'Close-up (head)', bust: 'Bust', half: 'Half body', full: 'Full body' };
export const POSE_NAMES = ['relaxed', 'hips', 'crossed', 'thinking', 'shy', 'lean', 'sit'];

export const DEFAULT_RULES = [
  { id: 'r_follow', on: true, when: 'follow', match: '', min: 0, cooldown: 3, do: [{ act: 'throw', item: 'heart', count: 5 }, { act: 'expression', name: 'Joy', seconds: 2.5 }] },
  { id: 'r_bits', on: true, when: 'bits', match: '', min: 1, cooldown: 0, do: [{ act: 'throw', item: 'star', count: 1, per: 100 }, { act: 'expression', name: 'StarEyes', seconds: 3 }] },
  { id: 'r_sub', on: true, when: 'sub', match: '', min: 0, cooldown: 0, do: [{ act: 'gesture', name: 'dance' }, { act: 'throw', item: 'gift', count: 3 }, { act: 'expression', name: 'HeartEyes', seconds: 3 }] },
  { id: 'r_gift', on: true, when: 'gift', match: '', min: 1, cooldown: 0, do: [{ act: 'throw', item: 'gift', count: 1, per: 1 }, { act: 'expression', name: 'Surprised', seconds: 2.5 }] },
  { id: 'r_raid', on: true, when: 'raid', match: '', min: 1, cooldown: 10, do: [{ act: 'gesture', name: 'wave' }, { act: 'expression', name: 'Shocked', seconds: 2.5 }, { act: 'throw', item: 'star', count: 10 }] },
  { id: 'r_bonk', on: true, when: 'redeem', match: 'Bonk', min: 0, cooldown: 0, do: [{ act: 'throw', item: 'bonk', count: 1 }, { act: 'expression', name: 'Dizzy', seconds: 2.5 }] },
  { id: 'r_hug', on: false, when: 'command', match: 'hug', min: 0, cooldown: 20, do: [{ act: 'expression', name: 'Embarrassed', seconds: 3 }, { act: 'throw', item: 'heart', count: 3 }] },
];

const str = (v, n = 60) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const one = (v, list, d) => (list.includes(v) ? v : d);
function cleanAction(a) {
  if (!a || !ACTS[a.act]) return null;
  if (a.act === 'throw') return { act: 'throw', item: one(a.item, ITEMS, 'heart'), count: Math.round(num(a.count, 1, 30, 1)), ...(a.per ? { per: Math.round(num(a.per, 1, 100000, 100)) } : {}) };
  if (a.act === 'expression') return { act: 'expression', name: one(a.name, EXPRESSIONS, 'Joy'), seconds: num(a.seconds, 0.5, 20, 2.5) };
  if (a.act === 'gesture') return { act: 'gesture', name: one(a.name, GESTURES, 'wave') };
  if (a.act === 'camera') return { act: 'camera', framing: a.framing in FRAMINGS ? a.framing : 'head', seconds: num(a.seconds, 1, 120, 5) };
  if (a.act === 'pose') return { act: 'pose', name: POSE_NAMES.includes(a.name) ? a.name : 'hips', seconds: num(a.seconds, 1, 600, 8) };
  if (a.act === 'prop') return { act: 'prop', id: /^[\w-]{1,24}$/.test(a.id) ? a.id : '', seconds: num(a.seconds, 1, 600, 8) };
  return { act: 'light', preset: one(a.preset, PRESETS, 'cute') };
}
/** Rules as the pages send them -> rules the server will run (anything unknown is dropped or reset). */
export function sanitizeRules(input) {
  if (!Array.isArray(input)) return structuredClone(DEFAULT_RULES);
  const seen = new Set();
  return input.slice(0, 60).map((r, i) => {
    let id = /^[\w-]{1,24}$/.test(r?.id) ? r.id : `r_${Date.now().toString(36)}${i}`; while (seen.has(id)) id += 'x'; seen.add(id);
    return { id, on: r?.on !== false, when: one(r?.when, Object.keys(WHEN), 'redeem'), match: str(r?.match).replace(/^!/, ''), min: Math.round(num(r?.min, 0, 1e6, 0)), cooldown: num(r?.cooldown, 0, 3600, 0),
      do: (Array.isArray(r?.do) ? r.do : []).slice(0, 8).map(cleanAction).filter(Boolean) };
  });
}

/** Runs rules against events. `send(msg)` delivers one avatar message; `setPreset(name)` switches the lighting. */
export class TriggerEngine {
  constructor({ getRules, send, setPreset = () => {}, now = () => Date.now() }) { this.getRules = getRules; this.send = send; this.setPreset = setPreset; this.now = now; this.last = new Map(); }
  /** event: { when, name?, amount?, user?, text? }. Returns the rules that fired (for the activity log and tests). */
  handle(event) {
    const fired = [];
    for (const r of this.getRules() || []) {
      if (!r.on || r.when !== event.when) continue;
      if (WHEN[r.when].match && r.match && r.match.toLowerCase() !== String(event.name || '').toLowerCase()) continue;
      if (WHEN[r.when].min && (event.amount ?? 0) < (r.min || 0)) continue;
      const t = this.now();
      if (r.cooldown && this.last.has(r.id) && t - this.last.get(r.id) < r.cooldown * 1000) continue;
      this.last.set(r.id, t);
      const did = [];
      for (const a of r.do) {
        if (a.act === 'throw') { const n = Math.max(1, Math.min(30, a.per ? Math.floor((event.amount || 0) / a.per) * a.count || a.count : a.count)); this.send({ type: 'throw', item: a.item, count: n, source: 'rule', from: event.user }); did.push(`${a.item} ×${n}`); }
        else if (a.act === 'expression') { this.send({ type: 'trigger', name: a.name, intensity: 1, duration: a.seconds, source: 'rule' }); did.push(a.name); }
        else if (a.act === 'gesture') { this.send({ type: 'gesture', name: a.name, source: 'rule' }); did.push(a.name); }
        else if (a.act === 'light') { this.setPreset(a.preset); did.push(`${a.preset} lighting`); }
        else if (a.act === 'camera') { this.send({ type: 'camera', framing: a.framing, seconds: a.seconds, source: 'rule' }); did.push(`camera ${a.framing}`); }
        else if (a.act === 'pose') { this.send({ type: 'pose', name: a.name, seconds: a.seconds, source: 'rule' }); did.push(`pose ${a.name}`); }
        else if (a.act === 'prop' && a.id) { this.send({ type: 'prop', id: a.id, seconds: a.seconds, source: 'rule' }); did.push(`prop ${a.id}`); }
      }
      fired.push({ id: r.id, did });
    }
    return fired;
  }
}
