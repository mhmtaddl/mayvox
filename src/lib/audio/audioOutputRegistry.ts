/**
 * Seçili çıkış cihazını (localStorage selectedOutput) tüm runtime AudioContext
 * instance'larına yayar.
 *
 * NEDEN: `AudioContext.destination` default olarak sistem default output'una gider;
 * `HTMLAudioElement.setSinkId` Web Audio graph'a route edilen element için etkisiz.
 * LiveKit voice ses akışı düz audio element üzerinden gidiyor (setSinkId çalışıyor),
 * ama SoundManager (MP3 pool → createMediaElementSource → destination), sounds.ts
 * (oscillator → destination) ve notificationSound.ts (oscillator → destination)
 * path'leri AudioContext.destination kullanıyor → kullanıcının seçtiği kulaklığa gitmiyor.
 *
 * Çözüm: AudioContext'in kendi setSinkId API'si var (Chromium 110+ / Electron 41+).
 * Oluşturulan her AudioContext bu registry'e register olur; selectedOutput değişince
 * tümüne setSinkId yayınlanır. Yeni oluşan context'ler de constructor'da sinkId
 * option'ı ile başlatılır (lateRegister edilirse son bilinen sink hemen uygulanır).
 */

type AudioContextWithSink = AudioContext & {
  setSinkId?: (id: string) => Promise<void>;
  sinkId?: string;
};

type AudioContextCtor = typeof AudioContext;
type AudioContextOptionsWithSink = AudioContextOptions & { sinkId?: string };

let currentDeviceId: string = '';
const contexts = new Set<AudioContextWithSink>();

/** localStorage'dan initial değeri al; null/'default' ise boş string. */
function readInitial(): string {
  if (typeof window === 'undefined') return '';
  try {
    const v = localStorage.getItem('selectedOutput') ?? '';
    return v === 'default' ? '' : v;
  } catch { return ''; }
}

currentDeviceId = readInitial();

/** Aktif output deviceId — yeni AudioContext oluşturanlar bunu constructor option'ı olarak geçebilir. */
export function getCurrentOutputDeviceId(): string {
  return currentDeviceId;
}

/** Yeni oluşturulmuş AudioContext'i registry'e ekle; son bilinen sinkId'yi uygular. */
export function registerAudioContext(ctx: AudioContext): void {
  const withSink = ctx as AudioContextWithSink;
  contexts.add(withSink);
  if (currentDeviceId && typeof withSink.setSinkId === 'function') {
    withSink.setSinkId(currentDeviceId).catch(err => {
      console.warn('[audio-output] registerAudioContext setSinkId failed:', err);
    });
  }
}

/** Context artık kullanılmıyorsa (ör. close edildi) registry'den çıkar. */
export function unregisterAudioContext(ctx: AudioContext): void {
  contexts.delete(ctx as AudioContextWithSink);
}

/** App.tsx selectedOutput değişince çağrır. Tüm kayıtlı context'lere setSinkId yayınlar. */
export function setAudioOutputDevice(deviceId: string): void {
  const normalized = deviceId === 'default' ? '' : (deviceId || '');
  if (normalized === currentDeviceId) return;
  currentDeviceId = normalized;
  contexts.forEach(ctx => {
    if (typeof ctx.setSinkId === 'function') {
      ctx.setSinkId(normalized).catch(err => {
        console.warn('[audio-output] setSinkId broadcast failed:', err);
      });
    }
  });
}

/**
 * AudioContext factory — constructor'a sinkId option'ı geçirir, kayıt eder.
 * Yoksa fallback olarak plain new AudioContext + post-construction registerAudioContext.
 */
export function createManagedAudioContext(extra?: AudioContextOptions): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  const options: AudioContextOptionsWithSink = { ...(extra ?? {}) };
  if (currentDeviceId) options.sinkId = currentDeviceId;
  let ctx: AudioContext;
  try {
    ctx = new Ctor(options);
  } catch {
    // sinkId desteklemeyen eski Chromium fallback'i — option'sız dene.
    try { ctx = new Ctor(extra ?? {}); } catch { return null; }
  }
  registerAudioContext(ctx);
  return ctx;
}
