// ── Room Mode Config — tek kaynak (single source of truth) ──────────────
// Tüm oda modu davranışları, etiketleri ve kuralları buradan okunur.
// Hardcode edilen davranış kontrolü YASAK — her zaman bu config'e bak.

export type RoomMode = 'social' | 'gaming' | 'broadcast' | 'quiet';

export interface DuckingConfig {
  enabled: boolean;
  /** Ducking miktarı: 0–1. 0.4 → diğerleri %60 ses seviyesinde çalar */
  amount: number;
  /** Ducking başlangıç süresi (ms) */
  attackMs: number;
  /** Ducking bitiş / restore süresi (ms) */
  releaseMs: number;
}

export type VoiceModeType = 'ptt' | 'vad';

export interface VoiceConfig {
  /** Odaya girildiğinde varsayılan ses modu */
  defaultMode: VoiceModeType;
  /** Kullanıcının seçebileceği modlar */
  allowedModes: VoiceModeType[];
}

export interface RoomModeConfig {
  id: RoomMode;
  label: string;
  description: string;
  ruleSummary: string;
  icon: string;
  chatEnabled: boolean;
  chatStyle: 'normal' | 'controlled';
  pttRequired: boolean;
  uiDensity: 'normal' | 'focused' | 'clean';
  ducking: DuckingConfig;
  voice: VoiceConfig;
  futureHostPriority: boolean;
  /** Kısa açıklama — room header'da gösterilir */
  shortHelper: string;
  /** Tam helper text — quiet mode chat disabled alanında */
  helperText?: string;
}

export const ROOM_MODES: Record<RoomMode, RoomModeConfig> = {
  social: {
    id: 'social',
    label: 'Sohbet Lounge',
    description: 'Rahat ve akışkan sesli sohbet.',
    ruleSummary: 'Açık mikrofon \u2022 Mesaj açık',
    icon: 'Coffee',
    chatEnabled: true,
    chatStyle: 'normal',
    pttRequired: false,
    uiDensity: 'normal',
    ducking: { enabled: false, amount: 0, attackMs: 0, releaseMs: 0 },
    voice: { defaultMode: 'ptt', allowedModes: ['ptt', 'vad'] },
    futureHostPriority: false,
    shortHelper: 'Rahat sohbet',
  },
  gaming: {
    id: 'gaming',
    label: 'Oyun Takımı',
    description: 'Hızlı ve odaklı takım iletişimi.',
    ruleSummary: 'Hızlı iletişim \u2022 Mesaj açık',
    icon: 'Gamepad2',
    chatEnabled: true,
    chatStyle: 'normal',
    pttRequired: false,
    uiDensity: 'focused',
    ducking: { enabled: true, amount: 0.35, attackMs: 120, releaseMs: 220 },
    voice: { defaultMode: 'vad', allowedModes: ['vad', 'ptt'] },
    futureHostPriority: false,
    shortHelper: 'Takım iletişimi',
  },
  broadcast: {
    id: 'broadcast',
    label: 'Yayın Sahnesi',
    description: 'Konuşmacı odaklı, düzenli yayın akışı.',
    ruleSummary: 'Düzenli akış \u2022 Mesaj açık',
    icon: 'Radio',
    chatEnabled: true,
    chatStyle: 'normal',
    pttRequired: false,
    uiDensity: 'clean',
    ducking: { enabled: true, amount: 0.65, attackMs: 90, releaseMs: 180 },
    voice: { defaultMode: 'vad', allowedModes: ['vad', 'ptt'] },
    futureHostPriority: true,
    shortHelper: 'Konuşmacı odaklı',
  },
  quiet: {
    id: 'quiet',
    label: 'Sessiz Alan',
    description: 'Bas-konuş odaklı, dikkat dağıtmayan ortam.',
    ruleSummary: 'Bas-konuş zorunlu \u2022 Mesaj kapalı',
    icon: 'VolumeX',
    chatEnabled: false,
    chatStyle: 'normal',
    pttRequired: true,
    uiDensity: 'clean',
    ducking: { enabled: false, amount: 0, attackMs: 0, releaseMs: 0 },
    voice: { defaultMode: 'ptt', allowedModes: ['ptt'] },
    futureHostPriority: false,
    shortHelper: 'Bas-konuş zorunlu',
    helperText: 'Bu odada bas-konuş zorunludur. Mesajlaşma kapalı.',
  },
};

export const ROOM_MODE_LIST: RoomModeConfig[] = [
  ROOM_MODES.social,
  ROOM_MODES.gaming,
  ROOM_MODES.broadcast,
  ROOM_MODES.quiet,
];

export const DEFAULT_ROOM_MODE: RoomMode = 'social';

/** Güvenli fallback — bilinmeyen veya eksik mod için */
export function getRoomModeConfig(mode?: string | null): RoomModeConfig {
  if (mode && mode in ROOM_MODES) return ROOM_MODES[mode as RoomMode];
  return ROOM_MODES[DEFAULT_ROOM_MODE];
}
