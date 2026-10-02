<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { createTranslator, type Translator } from '../../../../../packages/i18n';
  import { themeStyle, ThemeValidationError, type ThemeConfig, type ThemeIssue } from '../../../../../packages/theme';
  import { standaloneCanvasStyle } from '../../../../../packages/theme/css';
  import { parentTheme, provideTheme, ThemeState } from './theme-context.svelte';
  import './theme.css';
  let { theme, siteTheme, standalone = false, t = createTranslator(), onThemeError, children }: {
    theme?: ThemeConfig; siteTheme?: ThemeConfig; standalone?: boolean; t?: Translator;
    onThemeError?: (issues: readonly ThemeIssue[]) => void; children: Snippet;
  } = $props();
  const parent = parentTheme();
  const scope = untrack(() => new ThemeState(parent?.config,siteTheme,theme));
  provideTheme(scope);
  const uid = $props.id();
  let invalid = $state(false);
  $effect(() => {
    try { scope.update(parent?.config,siteTheme,theme); invalid = false; }
    catch (error) {
      if (!(error instanceof ThemeValidationError)) throw error;
      invalid = true; onThemeError?.(error.issues);
    }
  });
</script>

<svelte:head>
  {#if standalone}<svelte:element this={'style'}>{standaloneCanvasStyle(scope.resolved!)}</svelte:element>{/if}
</svelte:head>

<section data-nox-wiki data-nox-instance={uid} data-nox-standalone={standalone || undefined}
  style={themeStyle(scope.resolved!)}>
  {#if invalid}<p class="theme-error" role="alert">{t('theme.invalid')}</p>{/if}
  {@render children()}
</section>
