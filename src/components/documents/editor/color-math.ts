// Studio de documents — conversions HSV/hex pures pour la roue chromatique
// (étape 21). Séparées du composant UI pour rester testables sans
// navigateur. h: 0-360°, s/v: 0-100 (pourcentages, convention UI usuelle).

export type Hsv = { h: number; s: number; v: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function componentToHex(value: number): string {
  const hex = Math.round(clamp(value, 0, 255)).toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;

  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return `#${componentToHex((r + m) * 255)}${componentToHex((g + m) * 255)}${componentToHex((b + m) * 255)}`;
}

export function hexToHsv(hex: string): Hsv {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h, s, v };
}
