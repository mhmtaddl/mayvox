/**
 * SoundManager — uygulama-içi mp3 ses motoru.
 *
 * Mevcut oscillator-bazlı ses sistemi (sounds.ts, notificationSound.ts,
 * signature/sound.ts) AYNEN ÇALIŞIR. Bu modül onları REPLACE etmez,
 * yanlarına fail-safe mp3 katmanı ekler. Asset yüklenemezse caller
 * eski oscillator path'ine fallback eder (safePlay → returns false).
 *
 * Hedef platformlar: Electron + Capacitor Android (HTML5 <Audio>).
 * Asset path: /sounds/* (Vite public/ → bundle root)
 *
 * Audio routing: HTMLAudioElement → MediaElementSource → masterGain
 *   → DynamicsCompressor → destination. Web Audio bus master gain'in
 *   1.0 üzerine çıkmasına izin verir (boost). Compressor harsh clipping
 *   önler. Slider %100 → effective gain MASTER_BOOST (1.5x).
 */

import { createManagedAudioContext } from './audioOutputRegistry';

export type CallVariant = '1' | '2' | '3';
export type MessageVariant = '1' | '2' | '3';
export type NotificationVariant = '1' | '2' | '3';

const LS = {
  callVariant: 'mv:sm:call-variant',
  messageVariant: 'mv:sm:msg-variant',
  notificationVariant: 'mv:sm:notif-variant',
  masterVolume: 'mv:sm:master-volume',
  messageVolume: 'mv:sm:msg-volume',
  muted: 'mv:sm:muted',
  // Per-category enable flags
  // - Message: legacy 'notify:sound' anahtarını yeniden kullan (geriye uyum)
  messageEnabled: 'notify:sound',
  notificationEnabled: 'mv:sm:notif-enabled',
  messageSendEnabled: 'mv:sm:msg-send-enabled',
} as const;

const DEFAULTS = {
  callVariant: '1' as CallVariant,
  messageVariant: '1' as MessageVariant,
  notificationVariant: '1' as NotificationVariant,
  // Slider %100 — Web Audio bus * MASTER_BOOST sayesinde gerçek gain 1.5x
  masterVolume: 1.0,
  messageVolume: 1.0,
  muted: false,
};

// Web Audio master bus boost — slider 1.0 → effective 1.5x output gain.
// DynamicsCompressor downstream harsh clipping'i sınırlar.
const MASTER_BOOST = 1.5;

// Per-call asset volume scale (HTMLAudioElement.volume = 0..1).
// Master gain Web Audio bus'ta uygulanır; bunlar asset arasında relative balance.
const SEND_VOLUME_SCALE = 0.65;       // gönderim — alma sesinden bir miktar düşük
const REJECT_VOLUME_SCALE = 1.0;
const NOTIFICATION_VOLUME_SCALE = 1.0;

// Cooldown — aynı slot'ta hızlı tekrar tetiklemeleri engeller (burst guard)
const COOLDOWN_MS = {
  callRingtone: 500,
  messageReceive: 250,
  messageSend: 200,
  notification: 350,
  reject: 500,
};

// Path relative (leading slash YOK) — Electron production file:// protokolünde
// absolute '/sounds/' filesystem root'a kaçar ve 404 olur. Relative path hem
// dev (Vite serve) hem prod (file://) için çalışır. Vite base: './' ile uyumlu.
const MANIFEST = {
  call: {
    '1': 'sounds/call/1.mp3',
    '2': 'sounds/call/2.mp3',
    '3': 'sounds/call/3.mp3',
    reject: 'sounds/call/reject.mp3',
  },
  message: {
    '1': 'sounds/message/1.mp3',
    '2': 'sounds/message/2.mp3',
    '3': 'sounds/message/3.mp3',
    send: 'sounds/message/send.mp3',
  },
  notification: {
    '1': 'sounds/notification/1.mp3',
    '2': 'sounds/notification/2.mp3',
    '3': 'sounds/notification/3.mp3',
  },
} as const;

// ── Persistence helpers ──────────────────────────────────────────────────
function lsGet(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch { /* no-op */ }
}

function getCallVariant(): CallVariant {
  const v = lsGet(LS.callVariant, DEFAULTS.callVariant);
  return (v === '1' || v === '2' || v === '3') ? v : DEFAULTS.callVariant;
}
function getMessageVariant(): MessageVariant {
  const v = lsGet(LS.messageVariant, DEFAULTS.messageVariant);
  return (v === '1' || v === '2' || v === '3') ? v : DEFAULTS.messageVariant;
}
function getNotificationVariant(): NotificationVariant {
  const v = lsGet(LS.notificationVariant, DEFAULTS.notificationVariant);
  return (v === '1' || v === '2' || v === '3') ? v : DEFAULTS.notificationVariant;
}
function getMasterVolume(): number {
  const v = parseFloat(lsGet(LS.masterVolume, String(DEFAULTS.masterVolume)));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULTS.masterVolume;
}
function getMessageVolume(): number {
  const v = parseFloat(lsGet(LS.messageVolume, String(DEFAULTS.messageVolume)));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULTS.messageVolume;
}
function getMuted(): boolean {
  return lsGet(LS.muted, DEFAULTS.muted ? '1' : '0') === '1';
}
function getMessageEnabled(): boolean {
  return lsGet(LS.messageEnabled, '1') !== '0';
}
function getNotificationEnabled(): boolean {
  return lsGet(LS.notificationEnabled, '1') !== '0';
}
function getMessageSendEnabled(): boolean {
  return lsGet(LS.messageSendEnabled, '1') !== '0';
}

// ── Web Audio bus (master gain + compressor) ─────────────────────────────
let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;
const routedAudios = new WeakSet<HTMLAudioElement>();

function ensureAudioBus(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;
  try {
    // Managed factory — selectedOutput cihazına route edilir. Aksi halde MP3
    // ses efektleri (mesaj/çağrı/bildirim) destination → sistem default'a gidiyordu.
    const ctx = createManagedAudioContext();
    if (!ctx) return null;
    const gain = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-3, ctx.currentTime);
    comp.knee.setValueAtTime(6, ctx.currentTime);
    comp.ratio.setValueAtTime(4, ctx.currentTime);
    comp.attack.setValueAtTime(0.003, ctx.currentTime);
    comp.release.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.setValueAtTime(getMasterVolume() * MASTER_BOOST, ctx.currentTime);
    gain.connect(comp);
    comp.connect(ctx.destination);
    audioContext = ctx;
    masterGainNode = gain;
    compressorNode = comp;
    return ctx;
  } catch {
    audioContext = null;
    masterGainNode = null;
    compressorNode = null;
    return null;
  }
}

function routeAudio(audio: HTMLAudioElement) {
  if (routedAudios.has(audio)) return;
  const ctx = ensureAudioBus();
  if (!ctx || !masterGainNode) return;
  try {
    const src = ctx.createMediaElementSource(audio);
    src.connect(masterGainNode);
    routedAudios.add(audio);
  } catch {
    // createMediaElementSource bir audio için sadece bir kere çağrılabilir;
    // tekrar denenirse InvalidStateError. WeakSet bunu engeller ama yine de catch.
  }
}

// ── Audio cache + pool ───────────────────────────────────────────────────
const POOL_SIZE = 2;

interface PoolEntry {
  audios: HTMLAudioElement[];
  cursor: number;
  loaded: boolean;
  loadFailed: boolean;
}

const pool: Map<string, PoolEntry> = new Map();

function ensurePool(src: string): PoolEntry {
  const existing = pool.get(src);
  if (existing) return existing;
  const entry: PoolEntry = { audios: [], cursor: 0, loaded: false, loadFailed: false };
  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      a.addEventListener('canplaythrough', () => { entry.loaded = true; }, { once: true });
      a.addEventListener('error', () => { entry.loadFailed = true; }, { once: true });
      routeAudio(a);
      entry.audios.push(a);
    } catch {
      entry.loadFailed = true;
    }
  }
  pool.set(src, entry);
  return entry;
}

// ── Cooldown table ───────────────────────────────────────────────────────
const lastFiredAt: Record<string, number> = {};
function cooldownPass(slot: string, ms: number): boolean {
  const now = Date.now();
  const last = lastFiredAt[slot] ?? 0;
  if (now - last < ms) return false;
  lastFiredAt[slot] = now;
  return true;
}

// ── Ringtone state ───────────────────────────────────────────────────────
let activeRingtone: HTMLAudioElement | null = null;
let ringtoneStopTimer: ReturnType<typeof setTimeout> | null = null;

// ── Core play ────────────────────────────────────────────────────────────
function safePlay(src: string, perCallVolume: number, loop = false): HTMLAudioElement | null {
  if (getMuted()) return null;
  const entry = ensurePool(src);
  if (entry.loadFailed) return null;
  const audio = entry.audios[entry.cursor % entry.audios.length];
  entry.cursor++;
  if (!audio) return null;
  // Resume — autoplay policy bazı browser'larda AudioContext'i suspend tutar;
  // ilk user-interaction'da resume gerekir.
  const ctx = ensureAudioBus();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { /* no-op */ });
  try {
    audio.loop = loop;
    audio.volume = Math.max(0, Math.min(1, perCallVolume));
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => { /* autoplay block / source error → sessizce geç */ });
    }
    return audio;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export function playCallRingtone(opts?: { variant?: CallVariant; maxMs?: number }): boolean {
  if (!cooldownPass('callRingtone', COOLDOWN_MS.callRingtone)) return false;
  stopCallRingtone();
  const variant = opts?.variant ?? getCallVariant();
  const src = MANIFEST.call[variant];
  if (!src) return false;
  const a = safePlay(src, 1.0, true);
  if (!a) return false;
  activeRingtone = a;
  const maxMs = opts?.maxMs ?? 60_000;
  ringtoneStopTimer = setTimeout(() => stopCallRingtone(), maxMs);
  return true;
}

export function stopCallRingtone(): void {
  if (ringtoneStopTimer) { clearTimeout(ringtoneStopTimer); ringtoneStopTimer = null; }
  if (activeRingtone) {
    try {
      activeRingtone.pause();
      activeRingtone.currentTime = 0;
      activeRingtone.loop = false;
    } catch { /* no-op */ }
    activeRingtone = null;
  }
}

export function playMessageReceive(opts?: { variant?: MessageVariant; bypassEnabled?: boolean }): boolean {
  if (!opts?.bypassEnabled && !getMessageEnabled()) return false;
  if (!cooldownPass('messageReceive', COOLDOWN_MS.messageReceive)) return false;
  const variant = opts?.variant ?? getMessageVariant();
  const src = MANIFEST.message[variant];
  if (!src) return false;
  return safePlay(src, getMessageVolume()) !== null;
}

export function playMessageSend(opts?: { bypassEnabled?: boolean }): boolean {
  if (!opts?.bypassEnabled && !getMessageSendEnabled()) return false;
  if (!cooldownPass('messageSend', COOLDOWN_MS.messageSend)) return false;
  // Send = receive volume * SEND scale (gönderim alma'dan biraz düşük)
  return safePlay(MANIFEST.message.send, getMessageVolume() * SEND_VOLUME_SCALE) !== null;
}

export function playNotification(opts?: { variant?: NotificationVariant; bypassEnabled?: boolean }): boolean {
  if (!opts?.bypassEnabled && !getNotificationEnabled()) return false;
  if (!cooldownPass('notification', COOLDOWN_MS.notification)) return false;
  const variant = opts?.variant ?? getNotificationVariant();
  const src = MANIFEST.notification[variant];
  if (!src) return false;
  return safePlay(src, NOTIFICATION_VOLUME_SCALE) !== null;
}

export function playReject(): boolean {
  if (!cooldownPass('reject', COOLDOWN_MS.reject)) return false;
  return safePlay(MANIFEST.call.reject, REJECT_VOLUME_SCALE) !== null;
}

/**
 * Çalan tüm preview/sample sesleri durdur.
 * Yeni bir preview tetiklenmeden önce çağrılır → kullanıcı hızlı hızlı
 * butonlara basarsa sesler birbirine karışmasın.
 *
 * Cooldown'ı sıfırlar (preview UX için spam guard'ı bypass).
 */
export function stopAllSamples(): void {
  stopCallRingtone();
  for (const entry of pool.values()) {
    for (const a of entry.audios) {
      try { if (!a.paused) { a.pause(); a.currentTime = 0; } } catch { /* no-op */ }
    }
  }
  // Cooldown reset — kullanıcı önceki preview'dan hemen sonra yeni preview için bekleme yaşamasın
  for (const k of Object.keys(lastFiredAt)) lastFiredAt[k] = 0;
}

export function stopAll(): void {
  stopAllSamples();
}

// ── Settings API ─────────────────────────────────────────────────────────

export const SoundManager = {
  // Variants
  getCallVariant,
  getMessageVariant,
  getNotificationVariant,
  setCallVariant: (v: CallVariant) => lsSet(LS.callVariant, v),
  setMessageVariant: (v: MessageVariant) => lsSet(LS.messageVariant, v),
  setNotificationVariant: (v: NotificationVariant) => lsSet(LS.notificationVariant, v),

  // Master volume (Web Audio bus, slider 0..1 → effective 0..MASTER_BOOST)
  getMasterVolume,
  setMasterVolume: (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    lsSet(LS.masterVolume, String(clamped));
    if (masterGainNode && audioContext) {
      try { masterGainNode.gain.setTargetAtTime(clamped * MASTER_BOOST, audioContext.currentTime, 0.02); }
      catch { masterGainNode.gain.value = clamped * MASTER_BOOST; }
    }
  },

  // Message-specific volume (per-element multiplier on top of master bus)
  getMessageVolume,
  setMessageVolume: (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    lsSet(LS.messageVolume, String(clamped));
    // Persist-only; bir sonraki play'de okunur. Çalmakta olan ses etkilenmez.
  },

  // Mute (global — Web Audio bus gain bağımsız tutulur, safePlay erken çıkar)
  isMuted: getMuted,
  setMuted: (m: boolean) => lsSet(LS.muted, m ? '1' : '0'),

  // Per-category enable
  isMessageEnabled: getMessageEnabled,
  setMessageEnabled: (on: boolean) => lsSet(LS.messageEnabled, on ? '1' : '0'),
  isNotificationEnabled: getNotificationEnabled,
  setNotificationEnabled: (on: boolean) => lsSet(LS.notificationEnabled, on ? '1' : '0'),
  isMessageSendEnabled: getMessageSendEnabled,
  setMessageSendEnabled: (on: boolean) => lsSet(LS.messageSendEnabled, on ? '1' : '0'),

  manifest: MANIFEST,

  preloadAll: () => {
    for (const v of ['1', '2', '3'] as const) {
      ensurePool(MANIFEST.call[v]);
      ensurePool(MANIFEST.message[v]);
      ensurePool(MANIFEST.notification[v]);
    }
    ensurePool(MANIFEST.call.reject);
    ensurePool(MANIFEST.message.send);
  },

  // Önizleme — toggle KAPALIYKEN bile çalar; her çağrı önce çalan sesleri durdurur
  preview: {
    call: (v: CallVariant) => {
      stopAllSamples();
      return playCallRingtone({ variant: v, maxMs: 5000 });
    },
    message: (v: MessageVariant) => {
      stopAllSamples();
      return playMessageReceive({ variant: v, bypassEnabled: true });
    },
    messageSend: () => {
      stopAllSamples();
      return playMessageSend({ bypassEnabled: true });
    },
    notification: (v: NotificationVariant) => {
      stopAllSamples();
      return playNotification({ variant: v, bypassEnabled: true });
    },
    reject: () => {
      stopAllSamples();
      return playReject();
    },
  },
};
