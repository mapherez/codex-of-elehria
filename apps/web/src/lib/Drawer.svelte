<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Translator } from '../../../../packages/i18n';
  import './drawer.css';

  let { open = $bindable(false), id, title, side = 'right', mobileOnly = false, t, children, onClosed }: {
    open?: boolean; id: string; title: string; side?: 'left' | 'right'; mobileOnly?: boolean;
    t: Translator; children: Snippet; onClosed?: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let scroller: HTMLDivElement;
  let sheet: HTMLDivElement;
  let mounted = $state(false);
  let mobile = $state(false);
  let modal = false;
  let opening = false;
  let closing = false;
  let armed = false;
  let generation = 0;
  let animation: Animation | undefined;
  let previousFocus: HTMLElement | null = null;
  let previousOverflow: string | undefined;
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
      previousFocus?.focus({ preventScroll: true });
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
    const viewport = matchMedia('(max-width: 720px)');
    const resize = () => { mobile = viewport.matches; };
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
      if (!open || (mobileOnly && !mobile)) { finish(); return; }
      finish(false);
    }
    if (mobileOnly && !mobile && open) { open = false; return; }
    if (open) {
      if (!dialog.open) void show();
    } else if (dialog.open) void hide();
  });
</script>

<dialog {id} class="codex side-drawer" class:left={side === 'left'} class:mobile bind:this={dialog}
  aria-labelledby={id + '-title'} oncancel={event => { event.preventDefault(); open = false; }}>
  <div class="drawer-scroller" bind:this={scroller} onscroll={fade} onclick={dismissBackdrop} role="presentation">
    <div class="drawer-sheet" bind:this={sheet}>
      <div class="drawer-heading">
        <h2 id={id + '-title'}>{title}</h2>
        <button type="button" class="drawer-close quiet" onclick={() => open = false} aria-label={t('action.close')}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {@render children()}
    </div>
  </div>
</dialog>
