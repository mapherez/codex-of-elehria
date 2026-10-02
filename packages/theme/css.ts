import type { AlphaColor, ResolvedTheme } from './types';
const kebab = (key: string) => key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
const alpha = (value: AlphaColor) => {
  const n = parseInt(value.color.slice(1),16);
  return `rgb(${n>>16} ${(n>>8)&255} ${n&255} / ${value.alpha})`;
};
/** Values come only from validated input and the resolver; never raw CSS declarations. */
export function themeStyle(theme: ResolvedTheme): string {
  const entries: [string,string][] = Object.entries(theme.colors).map(([key,value])=>['--nox-'+kebab(key),value]);
  for (const [key,value] of Object.entries(theme.fonts)) entries.push(['--nox-font-'+key,value]);
  entries.push(['--nox-neutral-wash',alpha(theme.neutralWash)],['--nox-neutral-wash-hover',alpha(theme.neutralWashHover)]);
  for (const [key,value] of Object.entries(theme.accentWash)) entries.push(['--nox-accent-wash-'+key,alpha(value)]);
  for (const [key,value] of Object.entries(theme.accentStroke)) entries.push(['--nox-accent-stroke-'+key,alpha(value)]);
  for (const [role,tone] of Object.entries(theme.semantic)) {
    entries.push(['--nox-'+role+'-text',tone.text],['--nox-'+role+'-indicator',tone.indicator]);
    for (const [key,value] of Object.entries(tone.wash)) entries.push(['--nox-'+role+'-wash-'+key,alpha(value)]);
    for (const [key,value] of Object.entries(tone.stroke)) entries.push(['--nox-'+role+'-stroke-'+key,alpha(value)]);
  }
  const rgb = (color:string) => {const n=parseInt(color.slice(1),16);return `${n>>16} ${(n>>8)&255} ${n&255}`;};
  entries.push(['--nox-background-rgb',rgb(theme.colors.background)],['--nox-scrim-rgb',rgb(theme.colors.scrim)]);
  return entries.map(([key,value])=>key+':'+value).join(';')+';color-scheme:'+theme.colorScheme;
}

// Native scrollbar gutters and overscroll use the document canvas, outside the root box.
// The selector only matches the standalone adapter; embedded instances never match it.
export function standaloneCanvasStyle(theme: ResolvedTheme): string {
  return 'html:has(> body > #app > [data-nox-standalone]) { background-color:' +
    theme.colors.background + ';color-scheme:' + theme.colorScheme + ';}';
}
