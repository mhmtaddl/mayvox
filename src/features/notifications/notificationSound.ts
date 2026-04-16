/**
 * Premium notification sound — dual-tone ping + soft echo + tiny scheduler.
 *
 * Scheduler:
 *  - `lastPlayEnd` envelope marker tutulur (~400ms envelope)
 *  - Envelope aktifken gelen play() → en fazla BİR pending coalesced play queued;
 *    burst halinde 5 event gelse bile sonuç: 1 immediate + 1 coalesced = 2 ses.
 *  - Çoklu overlap yok, clipping yok, racey re-entry yok.
 */

const SOUND_PREF_KEY = 'notify:sound';
const SOUND_VARIANT_KEY = 'notify:sound-variant';
const SOUND_VOLUME_KEY = 'notify:sound-volume';
const TOAST_PREF_KEY = 'notify:toast';
const GROUP_PREF_KEY = 'notify:group';
const ENVELOPE_MS = 400;

export type SoundVariant = 'ses1' | 'ses2';
export type SoundVolume = 'low' | 'medium' | 'high';

const VOLUME_GAIN: Record<SoundVolume, number> = {
  low: 0.20,
  medium: 0.45,
  high: 0.75,
};

export function getSoundVariant(): SoundVariant {
  try {
    const v = localStorage.getItem(SOUND_VARIANT_KEY);
    return v === 'ses2' ? 'ses2' : 'ses1';
  } catch { return 'ses1'; }
}
export function setSoundVariant(v: SoundVariant) {
  try { localStorage.setItem(SOUND_VARIANT_KEY, v); } catch { /* no-op */ }
}
export function getSoundVolume(): SoundVolume {
  try {
    const v = localStorage.getItem(SOUND_VOLUME_KEY);
    return v === 'low' || v === 'high' ? v : 'medium';
  } catch { return 'medium'; }
}
export function setSoundVolume(v: SoundVolume) {
  try { localStorage.setItem(SOUND_VOLUME_KEY, v); } catch { /* no-op */ }
}
export function isToastEnabled(): boolean {
  try { return localStorage.getItem(TOAST_PREF_KEY) !== '0'; }
  catch { return true; }
}
export function setToastEnabled(on: boolean) {
  try { localStorage.setItem(TOAST_PREF_KEY, on ? '1' : '0'); }
  catch { /* no-op */ }
}
export function isGroupingEnabled(): boolean {
  try { return localStorage.getItem(GROUP_PREF_KEY) !== '0'; }
  catch { return true; }
}
export function setGroupingEnabled(on: boolean) {
  try { localStorage.setItem(GROUP_PREF_KEY, on ? '1' : '0'); }
  catch { /* no-op */ }
}

/**
 * Scheduler strategy — şu an sabit, ileride settings panel'den tune edilebilir.
 * Default: tek coalesced pending (v2.1 davranışını birebir korur).
 */
export const SOUND_STRATEGY: { readonly maxPending: number } = Object.freeze({
  maxPending: 1,
});

let audioCtx: AudioContext | null = null;
let lastPlayEnd = 0;
let queuedTimer: ReturnType<typeof setTimeout> | null = null;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => { /* no-op */ });
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isNotifySoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_PREF_KEY) !== '0'; }
  catch { return true; }
}

export function setNotifySoundEnabled(on: boolean) {
  try { localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0'); }
  catch { /* no-op */ }
}

function playPartial(
  c: AudioContext,
  when: number,
  freq: number,
  peakGain: number,
  attackMs: number,
  releaseMs: number,
  master: GainNode,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);

  const attackT = when + attackMs / 1000;
  const endT = attackT + releaseMs / 1000;

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peakGain, attackT);
  gain.gain.exponentialRampToValueAtTime(0.0001, endT);

  osc.connect(gain);
  gain.connect(master);

  osc.start(when);
  osc.stop(endT + 0.02);

  osc.onended = () => {
    try { gain.disconnect(); } catch { /* no-op */ }
    try { osc.disconnect(); } catch { /* no-op */ }
  };
}

/** Gerçek oynatma — scheduler'dan çağrılır; envelope marker güncellenir. */
function actuallyPlay() {
  const c = ensureCtx();
  if (!c) return;
  try {
    const t0 = c.currentTime;
    const master = c.createGain();
    const peakMaster = VOLUME_GAIN[getSoundVolume()];
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(peakMaster, t0 + 0.05);
    master.connect(c.destination);
    const variant = getSoundVariant();
    if (variant === 'ses2') {
      // Ses 2 — tek tonlu sıcak ping (daha yumuşak, melodik)
      playPartial(c, t0, 740, 1.0, 6, 260, master);
    } else {
      // Ses 1 — dual-tone klasik (mevcut)
      playPartial(c, t0, 880, 0.9, 4, 140, master);
      playPartial(c, t0 + 0.08, 660, 0.55, 8, 220, master);
    }
    setTimeout(() => {
      try { master.disconnect(); } catch { /* no-op */ }
    }, ENVELOPE_MS + 40);
    lastPlayEnd = nowMs() + ENVELOPE_MS;
  } catch (err) {
    console.warn('[notify] sound play error', err);
  }
}

/**
 * Public API — scheduler ile overlap güvenli.
 * - Envelope bittiyse: anında oynat.
 * - Envelope aktif + pending timer yok: envelope sonuna 1 coalesced play queue et.
 * - Envelope aktif + pending var: yoksay (burst coalescence).
 */
export function playNotifyBeep() {
  if (!isNotifySoundEnabled()) return;
  const n = nowMs();
  if (n >= lastPlayEnd) {
    actuallyPlay();
    return;
  }
  // Default maxPending=1 → aynı davranış. Config >1 olursa ileride kuyruk büyüyebilir.
  if (queuedTimer !== null && SOUND_STRATEGY.maxPending <= 1) return;
  if (queuedTimer !== null) return; // tek-slot marker; future: array-based queue
  const delay = Math.max(0, lastPlayEnd - n);
  queuedTimer = setTimeout(() => {
    queuedTimer = null;
    // Hâlâ oynatmak mantıklı mı? (pref değişmiş olabilir)
    if (!isNotifySoundEnabled()) return;
    actuallyPlay();
  }, delay);
}

/**
 * Preview — mevcut ayarlarla (variant + volume) sesi direkt çalar.
 * isNotifySoundEnabled flag'ini BYPASS eder; ayarlar panelinde kullanıcı
 * seçimini duyabilsin diye. Scheduler envelope atlanır, hammer-click kabul.
 */
export function previewNotifySound() {
  const c = ensureCtx();
  if (!c) return;
  try {
    const t0 = c.currentTime;
    const master = c.createGain();
    const peakMaster = VOLUME_GAIN[getSoundVolume()];
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(peakMaster, t0 + 0.05);
    master.connect(c.destination);
    const variant = getSoundVariant();
    if (variant === 'ses2') {
      playPartial(c, t0, 740, 1.0, 6, 260, master);
    } else {
      playPartial(c, t0, 880, 0.9, 4, 140, master);
      playPartial(c, t0 + 0.08, 660, 0.55, 8, 220, master);
    }
    setTimeout(() => {
      try { master.disconnect(); } catch { /* no-op */ }
    }, ENVELOPE_MS + 40);
  } catch { /* no-op */ }
}

export function disposeNotifySound() {
  if (queuedTimer !== null) { try { clearTimeout(queuedTimer); } catch { /* no-op */ } queuedTimer = null; }
  if (audioCtx && audioCtx.state !== 'closed') {
    try { audioCtx.close().catch(() => { /* no-op */ }); } catch { /* no-op */ }
    audioCtx = null;
  }
  lastPlayEnd = 0;
}

// Test helper
export const _testing = {
  hasPending: () => queuedTimer !== null,
  envelopeActive: () => nowMs() < lastPlayEnd,
  reset: () => {
    if (queuedTimer !== null) { try { clearTimeout(queuedTimer); } catch { /* no-op */ } queuedTimer = null; }
    lastPlayEnd = 0;
  },
  /** Saf scheduler mantığını test için expose eder — AudioContext olmadan state simüle. */
  simulatePlay: (t: number, prefOn = true) => {
    if (!prefOn) return { queued: false, played: false };
    if (t >= lastPlayEnd) { lastPlayEnd = t + ENVELOPE_MS; return { queued: false, played: true }; }
    if (queuedTimer !== null) return { queued: false, played: false };
    queuedTimer = 'stub' as unknown as ReturnType<typeof setTimeout>; // marker
    return { queued: true, played: false };
  },
};
