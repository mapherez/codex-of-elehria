import { getContext, hasContext, setContext } from 'svelte';
import { resolveThemeLayers, type CompleteThemeConfig, type ResolvedTheme, type ThemeConfig } from '../../../../../packages/theme';
const key = Symbol('nox-wiki-theme');
export class ThemeState {
  config = $state.raw<CompleteThemeConfig>();
  resolved = $state.raw<ResolvedTheme>();
  constructor(...layers: (ThemeConfig | undefined)[]) { this.update(...layers); }
  update(...layers: (ThemeConfig | undefined)[]) {
    const next = resolveThemeLayers(...layers);
    this.config = next.config; this.resolved = next.resolved;
  }
}
export const parentTheme = () => hasContext(key) ? getContext<ThemeState>(key) : undefined;
export const provideTheme = (state: ThemeState) => setContext(key,state);
export function useTheme(): ThemeState {
  const state = parentTheme();
  if (!state) throw new Error('Nox Wiki theme scope is missing');
  return state;
}
