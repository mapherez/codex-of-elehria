import { defaultTheme } from './defaults';
import { ThemeValidationError, type CompleteThemeConfig, type ThemeConfig, type ThemeIssue } from './types';
const colorKeys = ['background','surface','text','accent','link'] as const;
const fontKeys = ['body','display','mono'] as const;
const generics = new Set(['serif','sans-serif','monospace','system-ui','ui-serif','ui-sans-serif','ui-monospace','ui-rounded','emoji','math','fangsong']);
const globals = new Set(['inherit','initial','unset','revert','revert-layer','default']);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
function font(value: string, role: typeof fontKeys[number]): string | undefined {
  const text = value.trim();
  if (!text || value.length > 512 || /[;:{}()<>/\\@!\[\]=\p{Cc}]/u.test(value)) return;
  const families: string[] = [];
  let quote = ''; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === ',') { families.push(text.slice(start,i)); start = i+1; }
  }
  if (quote) return;
  families.push(text.slice(start));
  const normalized: string[] = [];
  for (const family of families) {
    const part = family.trim();
    if (!part || (!/^("[^"]+"|'[^']+')$/u.test(part) &&
      (!/^-?[\p{L}_][\p{L}\p{N}\p{M}_-]*(?: +-?[\p{L}_][\p{L}\p{N}\p{M}_-]*)*$/u.test(part) || globals.has(part.toLowerCase())))) return;
    normalized.push(part);
  }
  if (!generics.has(normalized.at(-1)!.toLowerCase())) normalized.push(role === 'body' ? 'sans-serif' : role === 'display' ? 'serif' : 'monospace');
  return normalized.join(', ');
}
function patch(input: unknown): ThemeConfig {
  if (input === undefined) return {};
  const issues: ThemeIssue[] = [];
  if (!object(input)) throw new ThemeValidationError([{path:'theme',code:'invalidType'}]);
  for (const key of Object.keys(input)) if (!['colors','fonts'].includes(key)) issues.push({path:key,code:'unknownKey'});
  const colors: Record<string,string> = {}; const fonts: Record<string,string> = {};
  for (const section of ['colors','fonts'] as const) {
    const values = input[section]; if (values === undefined) continue;
    if (!object(values)) { issues.push({path:section,code:'invalidType'}); continue; }
    const keys: readonly string[] = section === 'colors' ? colorKeys : fontKeys;
    for (const key of Object.keys(values)) {
      const location = section + '.' + key; const value = values[key];
      if (!keys.includes(key)) { issues.push({path:location,code:'unknownKey'}); continue; }
      if (value === undefined) continue;
      if (typeof value !== 'string') { issues.push({path:location,code:'invalidType'}); continue; }
      if (section === 'colors') {
        const trimmed = value.trim().toLowerCase();
        if (!/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/u.test(trimmed)) issues.push({path:location,code:'invalidColor'});
        else colors[key] = trimmed.length === 4 ? '#' + [...trimmed.slice(1)].map(c => c+c).join('') : trimmed;
      } else {
        const normalized = font(value,key as typeof fontKeys[number]);
        if (!normalized) issues.push({path:location,code:'invalidFont'}); else fonts[key] = normalized;
      }
    }
  }
  if (issues.length) throw new ThemeValidationError(issues);
  return {colors,fonts} as ThemeConfig;
}
/** Missing fields inherit; every call replaces the entire instance override. */
export function mergeThemeConfigs(...layers: readonly unknown[]): CompleteThemeConfig {
  const result = {colors:{...defaultTheme.colors},fonts:{...defaultTheme.fonts}};
  for (const layer of layers) {
    const normalized = patch(layer);
    Object.assign(result.colors,normalized.colors); Object.assign(result.fonts,normalized.fonts);
  }
  return result;
}
