export type ThemeColor = `#${string}`;
export interface ThemeColors {
  readonly background: ThemeColor; readonly surface: ThemeColor; readonly text: ThemeColor;
  readonly accent: ThemeColor; readonly link: ThemeColor;
}
export interface ThemeFonts { readonly body: string; readonly display: string; readonly mono: string }
export interface ThemeConfig { readonly colors?: Partial<ThemeColors>; readonly fonts?: Partial<ThemeFonts> }
export interface CompleteThemeConfig { readonly colors: ThemeColors; readonly fonts: ThemeFonts }
export type HexColor = ThemeColor;
export type WashLevel = 'subtle' | 'selected' | 'active' | 'hover';
export type StrokeLevel = 'normal' | 'strong';
export interface AlphaColor { readonly color: HexColor; readonly alpha: number }
export type WashColors = Readonly<Record<WashLevel, AlphaColor>>;
export type StrokeColors = Readonly<Record<StrokeLevel, AlphaColor>>;
export type ResolvedColorRole = 'background' | 'surface' | 'text' | 'surfaceField' | 'surfaceControl' | 'surfaceHover' |
  'textMuted' | 'border' | 'borderControl' | 'accentFill' | 'accentText' | 'textOnAccent' | 'linkText' | 'linkMuted' | 'scrim';
export interface ResolvedSemanticTone {
  readonly base: HexColor; readonly text: HexColor; readonly indicator: HexColor;
  readonly wash: WashColors; readonly stroke: StrokeColors;
}
export interface ResolvedTheme {
  readonly colorScheme: 'light' | 'dark';
  readonly colors: Readonly<Record<ResolvedColorRole, HexColor>>;
  readonly neutralWash: AlphaColor; readonly neutralWashHover: AlphaColor;
  readonly accentWash: WashColors; readonly accentStroke: StrokeColors;
  readonly semantic: Readonly<Record<'success' | 'warning' | 'danger' | 'unchanged', ResolvedSemanticTone>>;
  readonly fonts: ThemeFonts;
}
export interface ThemeIssue {
  readonly path: string;
  readonly code: 'invalidType' | 'unknownKey' | 'invalidColor' | 'invalidFont' | 'insufficientContrast' | 'unresolvableContrast';
}
export type ThemeValidationResult = { readonly ok: true; readonly config: CompleteThemeConfig } |
  { readonly ok: false; readonly issues: readonly ThemeIssue[] };
export class ThemeValidationError extends Error {
  constructor(readonly issues: readonly ThemeIssue[]) { super('Invalid theme configuration'); this.name = 'ThemeValidationError'; }
}
