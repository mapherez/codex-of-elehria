import type { CompleteThemeConfig } from './types';
export const defaultTheme: CompleteThemeConfig = {
  colors: { background: '#101214', surface: '#15181c', text: '#e7e6e2', accent: '#cfb991', link: '#a9c7ec' },
  fonts: {
    body: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Consolas, monospace'
  }
};
