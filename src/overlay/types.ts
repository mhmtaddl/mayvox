export type OverlayPosition =
  // üst kenar — 4 nokta (soldan sağa)
  | 'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right'
  // sağ kenar — 4 (yukarıdan aşağıya); top-right ve bottom-right köşeler yukarı/aşağı listelerde
  | 'right-top-mid' | 'right-bot-mid'
  // alt kenar — 4 (sağdan sola)
  | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left'
  // sol kenar — 4 (aşağıdan yukarıya); bottom-left ve top-left köşeler
  | 'left-bot-mid' | 'left-top-mid';

export type OverlaySize = 'small' | 'medium' | 'large';

/** Overlay görünüm stili — 3 tasarım + "Yok" (kart/waveform yok, sade avatar+isim). */
export type OverlayVariant = 'capsule' | 'card' | 'badge' | 'none';

export interface OverlaySettings {
  enabled: boolean;
  position: OverlayPosition;
  size: OverlaySize;
  showOnlySpeaking: boolean;
  showSelf: boolean;
  clickThrough: boolean;
  /** Kart şeffaflığı 0-100 (idle görünürlük). Konuşan satırda otomatik 100'e çıkar. */
  cardOpacity: number;
  /** Görünüm stili — capsule (pill), card (info-dense kare), badge (ultra minimal). */
  variant: OverlayVariant;
}

export interface OverlayParticipant {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** Mayvox status text (presence'tan) — overlay renderer AvatarContent fallback'i için kullanır. */
  statusText: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSelf: boolean;
}

export interface OverlaySnapshot {
  roomId: string | null;
  roomName: string | null;
  participants: OverlayParticipant[];
  size: OverlaySize;
  /** Kart şeffaflığı — 0-100 (idle görünürlük). Konuşan satırda otomatik 100'e çıkar. */
  cardOpacity: number;
  /** Render stili — overlay renderer buna göre component dispatch eder. */
  variant: OverlayVariant;
}

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  enabled: false,
  position: 'top-right',
  size: 'medium',
  showOnlySpeaking: false,
  showSelf: true,
  clickThrough: true,
  cardOpacity: 50,
  variant: 'capsule',
};

/** Tüm anchor'lar + preview picker konumları (0..1 fraction, sol-üst kökenli). */
export const ANCHOR_PREVIEW_COORDS: Record<OverlayPosition, { x: number; y: number }> = {
  'top-left':         { x: 0,    y: 0 },
  'top-mid-left':     { x: 0.33, y: 0 },
  'top-mid-right':    { x: 0.67, y: 0 },
  'top-right':        { x: 1,    y: 0 },
  'right-top-mid':    { x: 1,    y: 0.33 },
  'right-bot-mid':    { x: 1,    y: 0.67 },
  'bottom-right':     { x: 1,    y: 1 },
  'bottom-mid-right': { x: 0.67, y: 1 },
  'bottom-mid-left':  { x: 0.33, y: 1 },
  'bottom-left':      { x: 0,    y: 1 },
  'left-bot-mid':     { x: 0,    y: 0.67 },
  'left-top-mid':     { x: 0,    y: 0.33 },
};
