const APP_HELP_ENABLED_KEY = 'mayvox.appHelp.enabled';

export function isAppHelpEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(APP_HELP_ENABLED_KEY) !== 'false';
}

export function setAppHelpEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APP_HELP_ENABLED_KEY, String(enabled));
  if (enabled) {
    Object.keys(sessionStorage)
      .filter(key => key.startsWith('mayvox.appHelp.session.'))
      .forEach(key => sessionStorage.removeItem(key));
  }
  window.dispatchEvent(new CustomEvent('mayvox:app-help-changed', { detail: { enabled } }));
}

export function shouldShowAppHelp(id: string): boolean {
  if (typeof window === 'undefined' || !isAppHelpEnabled()) return false;
  const key = `mayvox.appHelp.session.${id}`;
  if (sessionStorage.getItem(key) === 'true') return false;
  sessionStorage.setItem(key, 'true');
  return true;
}
