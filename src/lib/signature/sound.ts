/**
 * MAYVOX Signature Sound Engine — UI-level audio identity.
 *
 * Notification v3'ün ayrı bir sound pipeline'ı var (notificationSound.ts);
 * bu modül UI SES'leri için ayrı katmandır (panel açılış, subtle click vb.).
 * Auto-trigger YOK — opt-in `play()` ile kullanılır.
 *
 * Prensip: 150–180ms max, 2 oscillator max, düşük master gain, clipping yok,
 * mute/deafen respect.
 */

export type SignatureSound = 'tap' | 'open' | 'close' | 'dm' | 'invite' | 'system';

const PREF_KEY = 'mv:ui-sound';
let audioCtx: AudioContext | null = null;
let masterGain = 0.18; // global ceiling — duyulur ama baskın değil

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { /* no-op */ });
    return audioCtx;
  } catch {
    return null;
  }
}

export function isSignatureSoundEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== '0'; }
  catch { return true; }
}
export function setSignatureSoundEnabled(on: boolean) {
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* no-op */ }
}
export function setSignatureMasterGain(gain: number) {
  masterGain = Math.max(0, Math.min(0.5, gain)); // hard cap 0.5
}

// Signature tonlarının tanımı — kısa, 2 osc max.
const VOICES: Record<SignatureSound, Array<{ freq: number; delay: number; attack: number; release: number; gain: number; type?: OscillatorType }>> = {
  tap:    [{ freq: 1200, delay: 0,    attack: 2, release: 40,  gain: 0.4 }],
  open:   [{ freq: 660,  delay: 0,    attack: 4, release: 110, gain: 0.6 }, { freq: 990, delay: 0.04, attack: 4, release: 90, gain: 0.35 }],
  close:  [{ freq: 520,  delay: 0,    attack: 4, release: 80,  gain: 0.45 }],
  dm:     [{ freq: 880,  delay: 0,    attack: 4, release: 120, gain: 0.8 }, { freq: 660, delay: 0.03, attack: 6, release: 80, gain: 0.5 }],
  invite: [{ freq: 740,  delay: 0,    attack: 4, release: 140, gain: 0.7 }, { freq: 590, delay: 0.05, attack: 6, release: 120, gain: 0.5 }],
  system: [{ freq: 600,  delay: 0,    attack: 3, release: 90,  gain: 0.5 }],
};

function playPartial(
  c: AudioContext, when: number, freq: number,
  peakGain: number, attackMs: number, releaseMs: number,
  master: GainNode, type: OscillatorType = 'sine',
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
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

/**
 * Signature sound'u oynat.
 *
 * @param kind       Ses kimliği
 * @param options.muted   Kullanıcı muted ise sessiz geç (voice chat ile tutarlı)
 * @param options.gain    Lokal scaling (0..1, master ile çarpılır)
 */
export function playSignature(
  kind: SignatureSound,
  options?: { muted?: boolean; deafened?: boolean; gain?: number },
): void {
  if (!isSignatureSoundEnabled()) return;
  if (options?.muted || options?.deafened) return;
  const c = ensureCtx();
  if (!c) return;
  const parts = VOICES[kind];
  if (!parts || parts.length === 0) return;
  try {
    const master = c.createGain();
    master.gain.value = masterGain * (options?.gain ?? 1);
    master.connect(c.destination);
    const t0 = c.currentTime;
    for (const p of parts) {
      playPartial(c, t0 + p.delay, p.freq, p.gain, p.attack, p.release, master, p.type);
    }
    // ~250ms içinde tüm partial'lar biter
    setTimeout(() => {
      try { master.disconnect(); } catch { /* no-op */ }
    }, 300);
  } catch (err) {
    console.warn('[signature-sound] play error', err);
  }
}

export function disposeSignatureSound() {
  if (audioCtx && audioCtx.state !== 'closed') {
    try { audioCtx.close().catch(() => { /* no-op */ }); } catch { /* no-op */ }
    audioCtx = null;
  }
}
