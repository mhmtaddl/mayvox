type ScrollTarget = HTMLElement;

const SELECTOR_SKIP = [
  'textarea',
  'select',
  'input',
  '[data-mv-native-scrollbar="true"]',
].join(',');

function canScrollVertically(element: HTMLElement): boolean {
  if (element.matches(SELECTOR_SKIP)) return false;
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
  return element.scrollHeight - element.clientHeight > 4;
}

function findScrollTarget(start: EventTarget | null): ScrollTarget | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (canScrollVertically(node)) return node;
    node = node.parentElement;
  }
  if (canScrollVertically(document.documentElement)) return document.documentElement;
  if (canScrollVertically(document.body)) return document.body;
  return null;
}

export function installPremiumScrollbars(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (!document.documentElement.classList.contains('mv-electron-window')) return () => {};

  document.documentElement.classList.add('mv-premium-scrollbars');

  const thumb = document.createElement('div');
  thumb.className = 'mv-premium-scrollbar-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  document.body.appendChild(thumb);

  let active: ScrollTarget | null = null;
  let hideTimer: number | null = null;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;

  const hideSoon = () => {
    if (dragging) return;
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      thumb.classList.remove('is-visible');
    }, 700);
  };

  const update = (target: ScrollTarget | null = active) => {
    if (!target || !target.isConnected || !canScrollVertically(target)) {
      thumb.classList.remove('is-visible');
      active = null;
      return;
    }

    active = target;
    const rect = target === document.documentElement || target === document.body
      ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
      : target.getBoundingClientRect();
    const trackInset = 16;
    const trackHeight = Math.max(24, rect.height - trackInset * 2);
    const scrollable = Math.max(1, target.scrollHeight - target.clientHeight);
    const progress = Math.max(0, Math.min(1, target.scrollTop / scrollable));
    const ratio = Math.max(0, Math.min(1, target.clientHeight / target.scrollHeight));
    const thumbHeight = Math.max(36, Math.min(144, trackHeight * ratio * 1.44));
    const top = rect.top + trackInset + (trackHeight - thumbHeight) * progress;
    const right = Math.max(2, window.innerWidth - rect.right + 3);

    thumb.style.setProperty('--mv-premium-scrollbar-top', `${Math.round(top)}px`);
    thumb.style.setProperty('--mv-premium-scrollbar-right', `${Math.round(right)}px`);
    thumb.style.setProperty('--mv-premium-scrollbar-height', `${Math.round(thumbHeight)}px`);
    thumb.classList.add('is-visible');
    hideSoon();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragging && active) {
      const rect = active === document.documentElement || active === document.body
        ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
        : active.getBoundingClientRect();
      const trackInset = 16;
      const trackHeight = Math.max(24, rect.height - trackInset * 2);
      const thumbHeight = parseFloat(thumb.style.getPropertyValue('--mv-premium-scrollbar-height')) || 24;
      const scrollable = Math.max(1, active.scrollHeight - active.clientHeight);
      const delta = event.clientY - dragStartY;
      active.scrollTop = dragStartScrollTop + (delta / Math.max(1, trackHeight - thumbHeight)) * scrollable;
      update(active);
      return;
    }

    const target = findScrollTarget(event.target);
    if (target) update(target);
  };

  const onScroll = (event: Event) => {
    const target = findScrollTarget(event.target);
    if (target) update(target);
  };

  const onResize = () => update();

  const onThumbPointerDown = (event: PointerEvent) => {
    if (!active) return;
    dragging = true;
    dragStartY = event.clientY;
    dragStartScrollTop = active.scrollTop;
    thumb.classList.add('is-dragging');
    thumb.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('is-dragging');
    thumb.releasePointerCapture?.(event.pointerId);
    hideSoon();
  };

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  thumb.addEventListener('pointerdown', onThumbPointerDown);
  document.addEventListener('pointerup', onPointerUp);

  return () => {
    document.documentElement.classList.remove('mv-premium-scrollbars');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    thumb.removeEventListener('pointerdown', onThumbPointerDown);
    document.removeEventListener('pointerup', onPointerUp);
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    thumb.remove();
  };
}
