import { Keyboard } from '@capacitor/keyboard';
import { isCapacitor } from './platform';

const FOCUSABLE_SELECTOR = 'input, textarea, [contenteditable="true"]';

function setKeyboardHeight(height: number) {
  const next = Math.max(0, Math.round(height));
  document.documentElement.style.setProperty('--mv-keyboard-height', `${next}px`);
  document.documentElement.classList.toggle('mv-keyboard-open', next > 24);
}

function estimateKeyboardHeight(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
}

function getFocusedEditable(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return active.matches(FOCUSABLE_SELECTOR) ? active : null;
}

function keepFocusedInputVisible() {
  const target = getFocusedEditable();
  if (!target) return;

  window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  });
}

export function installMobileKeyboardGuard() {
  if (!isCapacitor()) return;

  document.documentElement.classList.add('mv-capacitor');

  const refreshViewport = () => {
    setKeyboardHeight(estimateKeyboardHeight());
    keepFocusedInputVisible();
  };

  const delayedRefresh = () => {
    refreshViewport();
    window.setTimeout(refreshViewport, 80);
    window.setTimeout(refreshViewport, 220);
  };

  Keyboard.addListener('keyboardWillShow', info => {
    setKeyboardHeight(info.keyboardHeight || estimateKeyboardHeight());
    delayedRefresh();
  }).catch(() => {});

  Keyboard.addListener('keyboardDidShow', info => {
    setKeyboardHeight(info.keyboardHeight || estimateKeyboardHeight());
    delayedRefresh();
  }).catch(() => {});

  Keyboard.addListener('keyboardWillHide', () => {
    setKeyboardHeight(0);
  }).catch(() => {});

  Keyboard.addListener('keyboardDidHide', () => {
    setKeyboardHeight(0);
  }).catch(() => {});

  window.visualViewport?.addEventListener('resize', delayedRefresh);
  window.visualViewport?.addEventListener('scroll', delayedRefresh);
  window.addEventListener('focusin', delayedRefresh);
}
