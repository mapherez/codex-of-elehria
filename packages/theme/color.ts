import type { AlphaColor, HexColor } from './types';
type Vector = readonly [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const decode = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const encode = (v: number) => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
function rgb(hex: HexColor): Vector { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Vector; }
function hex(rgb: Vector): HexColor { return ('#' + rgb.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')) as HexColor; }
export function luminance(color: HexColor): number {
  const [r, g, b] = rgb(color).map(decode);
  return .2126 * r! + .7152 * g! + .0722 * b!;
}
export function contrast(a: HexColor, b: HexColor): number {
  const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function lab(color: HexColor): Vector {
  const [r, g, b] = rgb(color).map(decode) as [number, number, number];
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [.2104542553*l + .793617785*m - .0040720468*s,
    1.9779984951*l - 2.428592205*m + .4505937099*s,
    .0259040371*l + .7827717662*m - .808675766*s];
}
function linear([L,a,b]: Vector): Vector {
  const l = (L + .3963377774*a + .2158037573*b)**3;
  const m = (L - .1055613458*a - .0638541728*b)**3;
  const s = (L - .0894841775*a - 1.291485548*b)**3;
  return [4.0767416621*l - 3.3077115913*m + .2309699292*s,
    -1.2684380046*l + 2.6097574011*m - .3413193965*s,
    -.0041960863*l - .7034186147*m + 1.707614701*s];
}
function fromLab(value: Vector): HexColor {
  const inGamut = (v: Vector) => v.every(c => c >= -1e-7 && c <= 1 + 1e-7);
  let result = linear(value);
  if (!inGamut(result)) {
    // Reduce chroma at fixed lightness and hue instead of clipping individual channels.
    let low = 0; let high = 1;
    for (let i = 0; i < 24; i++) {
      const t = (low + high) / 2;
      if (inGamut(linear([value[0], value[1]*t, value[2]*t]))) low = t; else high = t;
    }
    result = linear([value[0], value[1]*low, value[2]*low]);
  }
  return hex(result.map(v => encode(clamp(v))) as unknown as Vector);
}
export function mix(a: HexColor, b: HexColor, weight: number): HexColor {
  const x = lab(a); const y = lab(b);
  return fromLab(x.map((v,i) => v + (y[i]! - v) * weight) as unknown as Vector);
}
export function composite(wash: AlphaColor, background: HexColor): HexColor {
  const foreground = rgb(wash.color); const base = rgb(background);
  return hex(base.map((v,i) => v * (1-wash.alpha) + foreground[i]! * wash.alpha) as unknown as Vector);
}
export function readable(seed: HexColor, backgrounds: readonly HexColor[], minimum: number): HexColor | undefined {
  const works = (color: HexColor) => backgrounds.every(bg => contrast(color, bg) >= minimum);
  if (works(seed)) return seed;
  const origin = lab(seed);
  let best: { color: HexColor; distance: number } | undefined;
  for (const target of ['#000000', '#ffffff'] as const) {
    // Scan for a feasible interval: backgrounds may have different luminances.
    let previous = 0;
    for (let step = 1; step <= 256; step++) {
      const current = step / 256;
      if (works(mix(seed,target,current))) {
        let low = previous; let high = current;
        for (let i = 0; i < 24; i++) {
          const mid = (low+high)/2;
          if (works(mix(seed,target,mid))) high = mid; else low = mid;
        }
        const color = mix(seed,target,high); const candidate = lab(color);
        const distance = Math.hypot(...candidate.map((v,i) => v-origin[i]!));
        if (!best || distance < best.distance) best = {color,distance};
        break;
      }
      previous = current;
    }
  }
  return best?.color;
}
