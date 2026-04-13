/**
 * RNNoise LiveKit TrackProcessor wrapper — POC.
 *
 * LiveKit `TrackProcessor<T>` interface implementasyonu. Lifecycle:
 *   1. processTrack(options) → AudioContext + worklet graph kur → processedTrack döndür
 *   2. restart(options)     → mevcut graph'i söküp yeniden kur
 *   3. destroy()            → tüm kaynakları serbest bırak
 *
 * Fallback stratejisi — her hata noktasında `active=false`, `processedTrack`
 * orijinal track olarak kalır. LiveKit track'i bu durumda düz yayına devam eder.
 */

import { logger } from '../logger';

// LiveKit TrackProcessor generic type'ını inline tanımlıyoruz — doğrudan
// import eden versiyon package API'sine göre değişebilir; POC için loose.
export interface RNNoiseProcessorOptions {
  track: MediaStreamTrack;
  audioContext?: AudioContext;
  /** 0..1 — dry/wet mix. 0 bypass, 1 full denoise. Runtime güncellenebilir. */
  strength?: number;
}

// @shiguredo/rnnoise-wasm veya benzeri paketten gelen ArrayBuffer.
// NPM install sonrası:
//   import wasmUrl from '@shiguredo/rnnoise-wasm/dist/rnnoise.wasm?url';
//   fetch(wasmUrl).then(r => r.arrayBuffer()) → processor'a verir.
// Şu an dynamic import ile loose; paket yoksa init fail → fallback.

async function loadWasmBinary(): Promise<ArrayBuffer | null> {
  try {
    // Paket yokluğunda build-error olmasın diye dynamic + optional.
    // Path string literal değil — vite static analysis atlar.
    const pkgName = '@shiguredo' + '/rnnoise-wasm';
    const mod: unknown = await import(/* @vite-ignore */ pkgName).catch(() => null);
    if (!mod) return null;
    // Common patterns — denenir:
    //  A) mod.wasmBinary
    //  B) mod.default (url) → fetch
    //  C) mod.getWasmBinary()
    const m = mod as Record<string, unknown>;
    if (m.wasmBinary instanceof ArrayBuffer) return m.wasmBinary;
    if (typeof m.getWasmBinary === 'function') {
      const v = await (m.getWasmBinary as () => Promise<ArrayBuffer>)();
      if (v instanceof ArrayBuffer) return v;
    }
    if (typeof m.default === 'string') {
      const res = await fetch(m.default as string);
      return await res.arrayBuffer();
    }
  } catch (err) {
    logger.warn?.('[rnnoise] wasm load error: ' + String(err));
  }
  return null;
}

async function loadWorkletUrl(): Promise<string | null> {
  try {
    // Vite `?worker&url` veya `?url` pattern — build sonrası gerçek URL.
    // Build pipeline henüz worklet url import'u configure etmediyse null döner.
    const mod: unknown = await import(
      /* @vite-ignore */ './rnnoise.worklet.ts?url'
    ).catch(() => null);
    if (!mod) return null;
    const m = mod as { default?: string };
    return typeof m.default === 'string' ? m.default : null;
  } catch {
    return null;
  }
}

/**
 * LiveKit TrackProcessor implementasyonu — duck-typed.
 * LiveKit runtime `processTrack`, `restart`, `destroy`, `processedTrack`, `name`
 * alanlarını bekler.
 */
export class RNNoiseTrackProcessor {
  readonly name = 'mv-rnnoise';
  processedTrack?: MediaStreamTrack;

  private ctx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;
  private originalTrack: MediaStreamTrack | null = null;
  private ready = false;
  private destroyed = false;
  private strength = 1.0;

  // LiveKit TrackProcessor interface: `init(options)` — eski `processTrack` değil.
  async init(options: RNNoiseProcessorOptions): Promise<void> {
    this.originalTrack = options.track;
    if (typeof options.strength === 'number') this.strength = Math.max(0, Math.min(1, options.strength));
    try {
      const ctx = options.audioContext ?? new AudioContext({ sampleRate: 48000 });
      this.ctx = ctx;

      const workletUrl = await loadWorkletUrl();
      if (!workletUrl) throw new Error('worklet url unavailable');
      await ctx.audioWorklet.addModule(workletUrl);

      const wasmBinary = await loadWasmBinary();
      if (!wasmBinary) throw new Error('wasm binary unavailable');

      const inputStream = new MediaStream([options.track]);
      this.sourceNode = ctx.createMediaStreamSource(inputStream);
      this.workletNode = new AudioWorkletNode(ctx, 'mv-rnnoise', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });

      // Worklet init — WASM binary + initial strength
      this.workletNode.port.postMessage({ type: 'init', wasmBinary, strength: this.strength }, [wasmBinary]);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('worklet init timeout')), 3000);
        const handler = (ev: MessageEvent) => {
          const data = ev.data as { type: string; message?: string };
          if (data.type === 'ready') {
            clearTimeout(timeout);
            this.workletNode?.port.removeEventListener('message', handler);
            resolve();
          } else if (data.type === 'error') {
            clearTimeout(timeout);
            this.workletNode?.port.removeEventListener('message', handler);
            reject(new Error(data.message ?? 'worklet init error'));
          }
        };
        this.workletNode!.port.addEventListener('message', handler);
        this.workletNode!.port.start();
      });

      this.destNode = ctx.createMediaStreamDestination();
      this.sourceNode.connect(this.workletNode).connect(this.destNode);

      const processed = this.destNode.stream.getAudioTracks()[0];
      if (!processed) throw new Error('destination track missing');
      this.processedTrack = processed;
      this.ready = true;
      logger.info?.('[rnnoise] processor ready');
    } catch (err) {
      console.warn('[rnnoise] fallback triggered:', err);
      logger.warn?.('[rnnoise] fallback — ' + String(err));
      await this.cleanup();
      // Fallback: processedTrack = orijinal track. LiveKit track'i bu şekilde
      // düz yayına devam eder, hiçbir kesinti olmaz.
      this.processedTrack = this.originalTrack ?? undefined;
    }
  }

  async restart(options: RNNoiseProcessorOptions): Promise<void> {
    logger.info?.('[rnnoise] restart');
    await this.cleanup();
    await this.init(options);
  }

  /** Strength'i runtime güncelle (slider değişimi). 0..1 normalize edilir. */
  setStrength(strength: number) {
    const clamped = Math.max(0, Math.min(1, strength));
    this.strength = clamped;
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'strength', value: clamped }); }
      catch { /* no-op */ }
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    logger.info?.('[rnnoise] destroy');
    await this.cleanup();
  }

  private async cleanup() {
    this.ready = false;
    try { this.sourceNode?.disconnect(); } catch { /* no-op */ }
    try { this.workletNode?.disconnect(); } catch { /* no-op */ }
    try { this.destNode?.disconnect(); } catch { /* no-op */ }
    this.sourceNode = null;
    this.workletNode = null;
    this.destNode = null;
    if (this.ctx && this.ctx.state !== 'closed') {
      try { await this.ctx.close(); } catch { /* no-op */ }
    }
    this.ctx = null;
  }
}
