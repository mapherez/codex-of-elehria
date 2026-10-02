import { contrast, composite, mix, readable } from './color';
import { mergeThemeConfigs } from './validation';
import { ThemeValidationError, type CompleteThemeConfig, type HexColor, type ResolvedTheme, type ResolvedSemanticTone,
  type ThemeConfig, type ThemeValidationResult, type WashColors, type StrokeColors } from './types';
const seeds = {success:'#a7d3b5',warning:'#c5a273',danger:'#d06d6d',unchanged:'#dcc15b'} as const;
const washes = (color: HexColor): WashColors => ({
  subtle:{color,alpha:18/255},selected:{color,alpha:22/255},active:{color,alpha:26/255},hover:{color,alpha:38/255}
});
const strokes = (color: HexColor): StrokeColors => ({normal:{color,alpha:56/255},strong:{color,alpha:112/255}});
function calculate(config: CompleteThemeConfig): ResolvedTheme {
  const {background:B,surface:S,text:T,accent:A,link:L} = config.colors;
  const F = mix(B,S,.75); const C = mix(S,T,.05); const H = mix(S,T,.10);
  const neutralWash = {color:T,alpha:3/255}; const neutralWashHover = {color:T,alpha:8/255};
  const accentWash = washes(A);
  const onNeutralHover = [B,S].map(bg => composite(neutralWashHover,bg));
  const onAccent = [B,S].flatMap(bg => Object.values(accentWash).map(wash => composite(wash,bg)));
  // Concrete placements, not a cartesian product of every foreground and surface.
  // Ordinary text: reader, fields, buttons, tables, neutral hover rows.
  const textBackgrounds = [B,S,F,C,H,...onNeutralHover,composite(accentWash.selected,B)];
  if (textBackgrounds.some(bg => contrast(T,bg)<4.5))
    throw new ThemeValidationError([{path:'colors.text',code:'insufficientContrast'}]);
  const guard = (seed:HexColor, backgrounds:readonly HexColor[], minimum:number, path:string):HexColor => {
    const value = readable(seed,backgrounds,minimum);
    if (!value) throw new ThemeValidationError([{path,code:'unresolvableContrast'}]);
    return value;
  };
  // Muted copy: reader/sidebar, fields, controls, search snippets on neutral hover.
  const textMuted = guard(mix(S,T,.70),textBackgrounds,4.5,'textMuted');
  // Control boundaries: inputs/buttons on base/field/control/hover; graph edges on surface.
  const borderControl = guard(mix(S,T,.45),[B,S,F,C,H],3,'borderControl');
  // Brand actions and focus rings: base/control surfaces and accent-tinted action/badge states.
  const accentText = guard(A,[B,S,F,C,H,...onAccent],4.5,'accentText');
  // Links: reader and quotations/code/table surfaces; secondary node/link tone on surface/base.
  const linkText = guard(L,[B,S,F,C],4.5,'linkText');
  const linkMuted = guard(mix(linkText,textMuted,.40),[B,S],4.5,'linkMuted');
  const semantic = Object.fromEntries(Object.entries(seeds).map(([role,base]) => {
    const wash = washes(base);
    // Status labels/notices/conflict rows/diffs are on base/field/control or their own wash.
    const backgrounds = [B,S,F,C,H,...[B,S].flatMap(bg => [wash.subtle,wash.selected].map(w => composite(w,bg)))];
    const tone: ResolvedSemanticTone = {base,wash,stroke:strokes(base),
      text:guard(base,backgrounds,4.5,'semantic.'+role+'.text'),
      indicator:guard(base,[B,S,F],3,'semantic.'+role+'.indicator')};
    return [role,tone];
  })) as unknown as ResolvedTheme['semantic'];
  return {
    colorScheme: contrast('#ffffff',B)>contrast('#000000',B) ? 'dark':'light',
    colors:{background:B,surface:S,text:T,surfaceField:F,surfaceControl:C,surfaceHover:H,textMuted,
      border:mix(S,T,.12),borderControl,accentFill:A,accentText,
      textOnAccent:contrast('#000000',A)>=contrast('#ffffff',A)?'#000000':'#ffffff',
      linkText,linkMuted,scrim:'#000000'},
    neutralWash,neutralWashHover,accentWash,accentStroke:strokes(A),semantic,fonts:{...config.fonts}
  };
}
export function resolveTheme(config?: ThemeConfig): ResolvedTheme { return calculate(mergeThemeConfigs(config)); }
export function resolveThemeLayers(...layers: readonly (ThemeConfig | undefined)[]): {config:CompleteThemeConfig; resolved:ResolvedTheme} {
  const config = mergeThemeConfigs(...layers); return {config,resolved:calculate(config)};
}
export function validateTheme(input: unknown): ThemeValidationResult {
  try { const config = mergeThemeConfigs(input); calculate(config); return {ok:true,config}; }
  catch (error) { if (error instanceof ThemeValidationError) return {ok:false,issues:error.issues}; throw error; }
}
