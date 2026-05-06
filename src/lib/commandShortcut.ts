export type CommandShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
};
export type OptionalCommandShortcut = CommandShortcut | null;

export const COMMAND_SHORTCUT_STORAGE_KEY = 'mayvox.commandPaletteShortcut.v1';
export const APP_SHORTCUTS_STORAGE_KEY = 'mayvox.appShortcuts.v1';

export type ShortcutActionId =
  | 'command-palette'
  | 'toggle-mute'
  | 'toggle-deafen'
  | 'user-search'
  | 'open-settings'
  | 'open-shortcuts'
  | 'open-server-settings'
  | 'toggle-room'
  | 'toggle-room-chat-muted'
  | 'toggle-room-members'
  | 'open-discover'
  | 'open-server-home'
  | 'open-admin'
  | 'previous-server'
  | 'next-server'
  | 'previous-room'
  | 'next-room'
  | 'open-unread-dm'
  | 'close-dm';

export type AppShortcuts = Record<ShortcutActionId, OptionalCommandShortcut>;

export function isMacPlatform() {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

export function getDefaultCommandShortcut(): CommandShortcut {
  return isMacPlatform()
    ? { ctrl: false, alt: false, shift: false, meta: true, key: 'f' }
    : { ctrl: true, alt: false, shift: false, meta: false, key: 'f' };
}

export function getDefaultAppShortcuts(): AppShortcuts {
  return {
    'command-palette': getDefaultCommandShortcut(),
    'toggle-mute': { ctrl: true, alt: false, shift: true, meta: false, key: 'm' },
    'toggle-deafen': { ctrl: true, alt: false, shift: true, meta: false, key: 'k' },
    'user-search': { ctrl: true, alt: false, shift: false, meta: false, key: 'a' },
    'open-settings': { ctrl: true, alt: false, shift: false, meta: false, key: 's' },
    'open-shortcuts': { ctrl: true, alt: false, shift: false, meta: false, key: 'k' },
    'open-server-settings': { ctrl: true, alt: false, shift: true, meta: false, key: 's' },
    'toggle-room': null,
    'toggle-room-chat-muted': null,
    'toggle-room-members': null,
    'open-discover': null,
    'open-server-home': null,
    'open-admin': { ctrl: true, alt: false, shift: false, meta: false, key: 'y' },
    'previous-server': null,
    'next-server': null,
    'previous-room': null,
    'next-room': null,
    'open-unread-dm': null,
    'close-dm': null,
  };
}

function isCommandShortcut(value: unknown): value is CommandShortcut {
  if (!value || typeof value !== 'object') return false;
  const shortcut = value as Partial<CommandShortcut>;
  return typeof shortcut.ctrl === 'boolean'
    && typeof shortcut.alt === 'boolean'
    && typeof shortcut.shift === 'boolean'
    && typeof shortcut.meta === 'boolean'
    && typeof shortcut.key === 'string'
    && shortcut.key.length > 0;
}

export function readCommandShortcut(): CommandShortcut {
  return readAppShortcut('command-palette') ?? getDefaultCommandShortcut();
}

export function readAppShortcuts(): AppShortcuts {
  const defaults = getDefaultAppShortcuts();
  try {
    const raw = localStorage.getItem(APP_SHORTCUTS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    return (Object.keys(defaults) as ShortcutActionId[]).reduce<AppShortcuts>((acc, actionId) => {
      const value = (parsed as Partial<Record<ShortcutActionId, unknown>>)[actionId];
      acc[actionId] = value === null ? null : isCommandShortcut(value) ? value : defaults[actionId];
      return acc;
    }, { ...defaults });
  } catch {
    return defaults;
  }
}

export function readAppShortcut(actionId: ShortcutActionId): OptionalCommandShortcut {
  return readAppShortcuts()[actionId];
}

function emitShortcutChanged(actionId: ShortcutActionId, shortcut: OptionalCommandShortcut) {
  window.dispatchEvent(new CustomEvent('mayvox:app-shortcuts-changed', { detail: { actionId, shortcut, shortcuts: readAppShortcuts() } }));
  if (actionId === 'command-palette') {
    window.dispatchEvent(new CustomEvent('mayvox:command-shortcut-changed', { detail: { shortcut } }));
  }
}

export function saveAppShortcut(actionId: ShortcutActionId, shortcut: OptionalCommandShortcut) {
  const shortcuts = readAppShortcuts();
  const next = { ...shortcuts, [actionId]: shortcut };
  localStorage.setItem(APP_SHORTCUTS_STORAGE_KEY, JSON.stringify(next));
  if (actionId === 'command-palette') {
    localStorage.setItem(COMMAND_SHORTCUT_STORAGE_KEY, JSON.stringify(shortcut));
  }
  emitShortcutChanged(actionId, shortcut);
}

export function resetAppShortcut(actionId: ShortcutActionId) {
  const defaults = getDefaultAppShortcuts();
  const shortcuts = readAppShortcuts();
  const shortcut = defaults[actionId];
  const next = { ...shortcuts, [actionId]: shortcut };
  localStorage.setItem(APP_SHORTCUTS_STORAGE_KEY, JSON.stringify(next));
  if (actionId === 'command-palette') {
    localStorage.removeItem(COMMAND_SHORTCUT_STORAGE_KEY);
  }
  emitShortcutChanged(actionId, shortcut);
  return shortcut;
}

export function saveCommandShortcut(shortcut: CommandShortcut) {
  saveAppShortcut('command-palette', shortcut);
}

export function resetCommandShortcut() {
  return resetAppShortcut('command-palette') ?? getDefaultCommandShortcut();
}

export function shortcutFromEvent(event: KeyboardEvent): CommandShortcut | null {
  const key = event.key;
  if (!key || ['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) return null;
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: key.length === 1 ? key.toLocaleLowerCase('tr') : key,
  };
}

export function isReservedShortcut(shortcut: CommandShortcut) {
  const key = shortcut.key.toLocaleLowerCase('tr');
  const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
  if (!ctrlOrMeta) return false;
  return ['r', 'w', 'q', 'f4'].includes(key);
}

export function shortcutMatchesEvent(shortcut: OptionalCommandShortcut, event: KeyboardEvent) {
  if (!shortcut) return false;
  const eventKey = event.key.length === 1 ? event.key.toLocaleLowerCase('tr') : event.key;
  return shortcut.ctrl === event.ctrlKey
    && shortcut.alt === event.altKey
    && shortcut.shift === event.shiftKey
    && shortcut.meta === event.metaKey
    && shortcut.key.toLocaleLowerCase('tr') === eventKey.toLocaleLowerCase('tr');
}

export function formatCommandShortcut(shortcut: OptionalCommandShortcut) {
  if (!shortcut) return 'Atanmadı';
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.meta) parts.push(isMacPlatform() ? 'Cmd' : 'Win');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  const key = shortcut.key === ' ' ? 'Space' : shortcut.key.length === 1 ? shortcut.key.toLocaleUpperCase('tr') : shortcut.key;
  parts.push(key);
  return parts.join(' + ');
}
