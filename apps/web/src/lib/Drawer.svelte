<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Translator } from '../../../../packages/i18n';
  import './drawer.css';
  import Icon from './Icon.svelte';

  let { open = $bindable(false), id, title, side = 'right', alwaysModal = false, t, children, onClosed, onBack, wide = false }: {
    open?: boolean; id: string; title: string; side?: 'left' | 'right'; alwaysModal?: boolean;
    t: Translator; children: Snippet; onClosed?: () => void; onBack?: () => void; wide?: boolean;
  } = $props();
  let dialog: HTMLDialogElement;
  let scroller: HTMLDivElement;
  let sheet: HTMLDivElement;
  let mounted = $state(false);
  let compact = $state(false);
  const mobile = $derived(compact || alwaysModal);
  let modal = false;
  let opening = false;
  let closing = false;
  let armed = false;
  let generation = 0;
  let animation: Animation | undefined;
  let previousFocus: HTMLElement | null = null;
  let previousOverflow: string | undefined;
  let lastTitle = '';
  const scrollPositions = new Map<string, number>();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const closedPosition = () => side === 'left' ? sheet.offsetWidth : 0;
  const openPosition = () => side === 'left' ? 0 : sheet.offsetWidth;

  function unlock() {
    if (previousOverflow !== undefined) {
      document.documentElement.style.overflow = previousOverflow;
      previousOverflow = undefined;
    }
  }
  function finish(notify = true) {
    generation++; animation?.cancel();
    dialog.close(); unlock();
    opening = false; closing = false; armed = false;
    if (notify) {
      open = false;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.brand')?.focus({ preventScroll: true });
      onClosed?.();
    }
  }
  async function show() {
    const request = ++generation;
    modal = mobile; opening = true; closing = false; armed = false;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modal) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      dialog.style.setProperty('--drawer-fade', '0');
      dialog.showModal();
      scroller.scrollTo({ left: closedPosition(), behavior: 'instant' });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (request !== generation) return;
      opening = false;
      scroller.scrollTo({ left: openPosition(), behavior: reducedMotion() ? 'instant' : 'smooth' });
    } else {
      dialog.show();
      opening = false;
      if (!reducedMotion()) animation = sheet.animate([
        { transform: `translateX(${side === 'left' ? '-100%' : '100%'})` }, { transform: 'translateX(0)' }
      ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  async function hide() {
    if (closing) return;
    generation++; opening = false; closing = true;
    if (modal) {
      scroller.scrollTo({ left: closedPosition(), behavior: reducedMotion() ? 'instant' : 'smooth' });
      if (Math.abs(scroller.scrollLeft - closedPosition()) < 1) finish();
    } else {
      animation?.cancel();
      if (!reducedMotion()) {
        animation = sheet.animate([{ transform: 'translateX(0)' }, {
          transform: `translateX(${side === 'left' ? '-100%' : '100%'})`
        }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
        try { await animation.finished; } catch { return; }
      }
      finish();
    }
  }
  function fade() {
    if (!modal) return;
    const width = sheet.offsetWidth || 1;
    const ratio = side === 'left' ? 1 - scroller.scrollLeft / width : scroller.scrollLeft / width;
    dialog.style.setProperty('--drawer-fade', String(Math.max(0, Math.min(1, ratio))));
  }
  function dismissBackdrop(event: MouseEvent) {
    if (modal && !sheet.contains(event.target as Node)) open = false;
  }
  onMount(() => {
    const viewport = matchMedia('(max-width: 1024px)');
    const resize = () => { compact = viewport.matches; };
    resize(); viewport.addEventListener('change', resize);
    const observer = new IntersectionObserver(entries => {
      if (!modal || !dialog.open || opening) return;
      const visible = entries.at(-1)!.intersectionRatio;
      if (visible >= .99) armed = true;
      // A positive threshold catches the sheet reaching the root edge as well as leaving it.
      if (visible < .001 && (armed || closing)) finish();
    }, { root: scroller, threshold: [.001, .99] });
    observer.observe(sheet);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dialog.open) return;
      const activeModal = document.querySelector('dialog:modal');
      if (activeModal && activeModal !== dialog) return;
      event.preventDefault(); open = false;
    };
    window.addEventListener('keydown', escape);
    mounted = true;
    return () => {
      generation++; animation?.cancel(); observer.disconnect();
      viewport.removeEventListener('change', resize); window.removeEventListener('keydown', escape);
      dialog.close(); unlock();
    };
  });
  $effect(() => {
    if (!mounted) return;
    if (dialog.open && modal !== mobile) {
      if (!open) { finish(); return; }
      finish(false);
    }
    if (open) {
      if (!dialog.open) void show();
    } else if (dialog.open) void hide();
  });
  $effect(() => {
    if (!mounted || title === lastTitle) return;
    if (lastTitle) scrollPositions.set(lastTitle, sheet.scrollTop);
    lastTitle = title;
    sheet.scrollTop = scrollPositions.get(title) || 0;
    if (dialog.open) dialog.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  });
</script>

<dialog {id} class="codex side-drawer" class:left={side === 'left'} class:mobile bind:this={dialog}
  class:wide
  aria-labelledby={id + '-title'} onclick={dismissBackdrop} oncancel={event => { event.preventDefault(); open = false; }}>
  <div class="drawer-scroller" bind:this={scroller} onscroll={fade} role="presentation">
    <div class="drawer-sheet" bind:this={sheet}>
      <div class="drawer-heading">
        {#if onBack}<button type="button" class="drawer-back quiet" onclick={onBack} aria-label={t('action.back')}><Icon name="back" /></button>{/if}
        <h2 id={id + '-title'} tabindex="-1">{title}</h2>
        <button type="button" class="drawer-close quiet" onclick={() => open = false} aria-label={t('action.close')}>
          <Icon name="cancel" />
        </button>
      </div>
      {@render children()}
    </div>
  </div>
</dialog>
