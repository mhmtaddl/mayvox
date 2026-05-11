import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

type TooltipState = {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
  visible: boolean;
};

const TOOLTIP_SELECTOR = '[data-tooltip], [title], button[aria-label], [role="button"][aria-label], [aria-label][tabindex]';
const SHOW_DELAY_MS = 260;
const EDGE_PADDING = 12;
const OFFSET = 12;

function getTooltipText(el: HTMLElement): string {
  const explicit = el.getAttribute('data-tooltip');
  if (explicit?.trim()) return explicit.trim();
  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim();
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();
  return '';
}

function findTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(TOOLTIP_SELECTOR);
  if (!(el instanceof HTMLElement)) return null;
  const text = getTooltipText(el);
  if (!text || el.dataset.tooltipDisabled === 'true') return null;
  return el;
}

export default function GlobalTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const activeElRef = useRef<HTMLElement | null>(null);
  const originalTitleRef = useRef<string | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const restoreTitle = () => {
      const active = activeElRef.current;
      if (active && originalTitleRef.current !== null) {
        active.setAttribute('title', originalTitleRef.current);
      }
      activeElRef.current = null;
      originalTitleRef.current = null;
    };

    const positionFor = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const showBelow = rect.top < 58;
      return {
        x: Math.min(Math.max(centerX, EDGE_PADDING), window.innerWidth - EDGE_PADDING),
        y: showBelow ? rect.bottom + OFFSET : rect.top - OFFSET,
        placement: showBelow ? 'bottom' as const : 'top' as const,
      };
    };

    const showFor = (el: HTMLElement, immediate = false) => {
      const text = getTooltipText(el);
      if (!text) return;
      clearTimer();
      restoreTitle();
      activeElRef.current = el;
      originalTitleRef.current = el.hasAttribute('title') ? el.getAttribute('title') ?? '' : null;
      if (originalTitleRef.current !== null) el.removeAttribute('title');
      const run = () => {
        if (activeElRef.current !== el) return;
        const pos = positionFor(el);
        setTooltip({ text, ...pos, visible: true });
      };
      if (immediate) run();
      else showTimerRef.current = setTimeout(run, SHOW_DELAY_MS);
    };

    const hide = () => {
      clearTimer();
      setTooltip(prev => prev ? { ...prev, visible: false } : null);
      window.setTimeout(() => {
        setTooltip(prev => (prev?.visible ? prev : null));
      }, 140);
      restoreTitle();
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const el = findTooltipTarget(event.target);
      if (!el || el === activeElRef.current) return;
      showFor(el);
    };

    const onPointerOut = (event: PointerEvent) => {
      const active = activeElRef.current;
      if (!active) return;
      const next = event.relatedTarget;
      if (next instanceof Node && active.contains(next)) return;
      hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      const el = findTooltipTarget(event.target);
      if (el) showFor(el, true);
    };

    const onFocusOut = () => hide();
    const onDismiss = () => hide();

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);

    return () => {
      clearTimer();
      restoreTitle();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
    };
  }, []);

  if (!tooltip) return null;

  return createPortal(
    <div
      className={`mv-global-tooltip ${tooltip.visible ? 'is-visible' : ''} ${tooltip.placement === 'bottom' ? 'is-bottom' : 'is-top'}`}
      role="tooltip"
      style={{
        left: tooltip.x,
        top: tooltip.y,
      }}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
