// Ready-made anime characters for the Character Maker: complete recipes to start from, each fully editable.
// The pictures in /readymade/ are renders of these exact recipes.
import { defaultModular, OUTFITS } from '/modular.js';

const make = (body, o) => ({ ...defaultModular(body), ...(OUTFITS[o.outfit]?.colors || {}), ...o });      // premium outfits keep their signature colours unless the character sets its own
export const READY = [
  { key: 'neko', label: 'Neko Streamer', make: () => make('anime_female', { name: 'Neko Streamer', hair: 'Bob', hairColor: '#f2a7c3', eyeColor: '#8a4fb8', ears: 'cat', tail: 'cat', outfit: 'a_cyber', clothing: '#2b2c36', accent: '#ff5fa2', accessories: ['choker'] }) },
  { key: 'fox', label: 'Fox Shrine Maiden', make: () => make('anime_female', { name: 'Fox Shrine Maiden', hair: 'High ponytail', hairColor: '#e07a2e', eyeColor: '#d4a017', ears: 'fox', tail: 'fox', outfit: 'p_kimono', clothing: '#f2efe9', accent: '#c0392b', accessories: ['kanzashi'] }) },
  { key: 'bunny', label: 'Bunny Idol', make: () => make('anime_female', { name: 'Bunny Idol', hair: 'Pixie cut', hairColor: '#f9dbe8', eyeColor: '#c0392b', ears: 'bunny', tail: 'bunny', outfit: 'p_idol', clothing: '#ff8fbf', accent: '#ffffff', accessories: ['choker'] }) },
  { key: 'elf', label: 'Elf Mage', make: () => make('anime_female', { name: 'Elf Mage', hair: 'Braided ponytail', hairColor: '#e8d9a0', eyeColor: '#5a8a3c', ears: 'elf', outfit: 'a_magical', clothing: '#5b6bd6', accent: '#ffd166', accessories: ['tiara'] }) },
  { key: 'wolf', label: 'Wolf Knight', make: () => make('anime_male', { name: 'Wolf Knight', hair: 'Short crew cut', hairColor: '#6a6a78', eyeColor: '#3c6e9e', ears: 'wolf', tail: 'wolf', outfit: 'pm_knight', accessories: [] }) },
  { key: 'catboy', label: 'Cat Butler', make: () => make('anime_male', { name: 'Cat Butler', hair: 'Side part comb over', hairColor: '#1c1c24', eyeColor: '#d4a017', ears: 'cat', tail: 'cat', outfit: 'pm_butler', accessories: [] }) },
  { key: 'bear', label: 'Bear Buddy', make: () => make('anime_male', { name: 'Bear Buddy', hair: 'Short crew cut', hairColor: '#6b4226', eyeColor: '#6b4226', ears: 'bear', tail: 'bear', outfit: 'm_street', clothing: '#c97b3a', accent: '#2d6a4f', accessories: ['scarf'] }) },
  { key: 'idol', label: 'Anime Idol', make: () => make('anime_female', { name: 'Anime Idol', hair: 'Double buns', hairColor: '#5c7cfa', eyeColor: '#3c6e9e', outfit: 'p_idol', accessories: ['bow'] }) },
];
