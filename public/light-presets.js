// Lighting presets for Kael Studio (no dependencies, so any page can read them). Used by public/lighting.js.
// key/fill/rim/kick: [colour, strength, [x, y, z] direction the light comes from (character faces +z, x>0 = its left)]
export const LIGHT_PRESETS = {
  cute: { label: 'Cute anime', key: ['#fff4ea', 1.5, [-0.9, 1.5, 2.4]], fill: ['#ffd6ea', 0.7, [1.8, 0.5, 1.9]], rim: ['#ff9ad5', 1.25, [1.3, 1.5, -2.3]], kick: ['#b9d7ff', 0.55, [-1.6, 1.0, -2.0]],
    sky: '#fff5fa', ground: '#ffd3e6', hemi: 0.95, env: 0.45, ao: 0.55, shadow: 0.26, selfShadow: false, skinGlow: ['#ffb7a8', 0.38] },
  gaming: { label: 'Gaming stream', key: ['#eef3ff', 1.55, [-0.7, 1.4, 2.5]], fill: ['#4b63ff', 0.6, [2.0, 0.3, 1.5]], rim: ['#ff2bd6', 1.9, [1.5, 1.2, -2.2]], kick: ['#21d4fd', 1.5, [-1.7, 1.1, -2.0]],
    sky: '#93a4ff', ground: '#2a1746', hemi: 0.55, env: 0.25, ao: 0.85, shadow: 0.42, selfShadow: false, skinGlow: ['#ff7ad9', 0.30] },
  dramatic: { label: 'Dramatic scene', key: ['#ffe2c2', 2.7, [-2.3, 1.9, 1.2]], fill: ['#5a6c9c', 0.14, [2.0, 0.4, 1.6]], rim: ['#ffb070', 1.6, [1.8, 1.6, -2.0]], kick: null,
    sky: '#8a93b8', ground: '#1b1420', hemi: 0.2, env: 0.12, ao: 1.0, shadow: 0.62, selfShadow: true, skinGlow: ['#ff8a5c', 0.42] },
  showcase: { label: 'Character showcase', key: ['#ffffff', 1.55, [-1.2, 1.9, 2.3]], fill: ['#eaf0ff', 0.45, [2.1, 0.7, 1.7]], rim: ['#ffffff', 1.35, [1.4, 1.8, -2.4]], kick: ['#ffffff', 0.6, [-1.6, 1.2, -2.1]],
    sky: '#ffffff', ground: '#8f8a99', hemi: 0.6, env: 0.5, ao: 0.8, shadow: 0.45, selfShadow: true, skinGlow: ['#ffc2ae', 0.30] },
  classic: { label: 'Classic (flat)', key: ['#ffffff', 1.6, [-1.2, 2.2, 2.5]], fill: ['#bfd4ff', 0.0, [2.2, 0.6, 1.6]], rim: ['#a35cff', 0.72, [1.5, 1.8, -2.5]], kick: null,
    sky: '#ffffff', ground: '#444455', hemi: 0.9, env: 0.0, ao: 0.0, shadow: 0.0, selfShadow: false, skinGlow: null },
};
export const lightDefaults = (name) => { const p = LIGHT_PRESETS[name] || LIGHT_PRESETS.cute; return { lightingPreset: name, lightColor: p.key[0], lightIntensity: 1, rimColor: p.rim[0], rimIntensity: 1 }; };

