/**
 * RNNoise AudioWorklet processor — STABLE MODE (v2 hotfix).
 *
 * Worklet global scope: `registerProcessor`, `AudioWorkletProcessor`, `sampleRate` global.
 *
 * Kritik invariant'lar:
 *  1. SIMPLE MODE: dry/wet mix yok; binary active/bypass (amplitude-modulation artifact fix)
 *  2. PRE-FILLED QUEUE: ilk init'te 1 silent frame queue'ya push — 128-chunk vs 480-frame
 *     alignment'tan doğan periyodik zero-fill gap (~0.67ms / 8 chunk) elimine
 *  3. Output frame başına TEK yazım (push = produce, shift = drain; duplicate yok)
 *  4. Frame: 480 sample @ 48 kHz. Worklet 128-sample chunk alır; ring buffer ile 480'e tamamlar
 *
 * Fallback: herhangi bir hatada `bypass=true` → input birebir output'a kopyalanır.
 * Ses akışı ASLA kesilmez.
 */

/// <reference lib="webworker" />

declare const registerProcessor: (name: string, ctor: unknown) => void;
declare const AudioWorkletProcessor: {
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
  prototype: AudioWorkletProcessor;
};

interface AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

const FRAME_SIZE = 480;
/** SIMPLE MODE flag — true ise binary (0/1) davranış; false ise mix destekli (ileri sürüm). */
const RNNOISE_DEBUG_SIMPLE_MODE = true;

class MvRnnoiseProcessor extends AudioWorkletProcessor {
  private wasm: WebAssembly.Instance | null = null;
  private denoiseStatePtr = 0;
  private inputHeapPtr = 0;
  private outputHeapPtr = 0;
  private memoryView: Float32Array | null = null;

  private inBuf = new Float32Array(FRAME_SIZE);
  private inBufPos = 0;
  private outQueue: Float32Array[] = [];

  private initialized = false;
  private bypass = false;
  /** Binary: false = passthrough bypass, true = full denoise. */
  private active = true;

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type: string; wasmBinary?: ArrayBuffer; value?: number; strength?: number };
      if (data?.type === 'init' && data.wasmBinary) {
        if (typeof data.strength === 'number') this.active = data.strength > 0;
        this.tryInit(data.wasmBinary);
      } else if (data?.type === 'strength' && typeof data.value === 'number') {
        this.active = data.value > 0;
      } else if (data?.type === 'bypass') {
        this.bypass = true;
      }
    };
  }

  private tryInit(wasmBinary: ArrayBuffer) {
    try {
      const mod = new WebAssembly.Module(wasmBinary);
      const inst = new WebAssembly.Instance(mod, { env: {} });
      this.wasm = inst;
      const exports = inst.exports as Record<string, unknown>;
      const create = exports._rnnoise_create as () => number;
      const memory = exports.memory as WebAssembly.Memory;
      if (typeof create !== 'function' || !memory) {
        throw new Error('rnnoise exports missing');
      }
      this.denoiseStatePtr = create();
      this.inputHeapPtr = 0;
      this.outputHeapPtr = FRAME_SIZE * 4;
      this.memoryView = new Float32Array(memory.buffer);
      this.initialized = true;

      // PRE-FILL: 1 silent frame queue'ya. 128/480 alignment gap fix.
      // Steady-state'te drain asla kuru kalmaz; ~10ms başlangıç latency.
      this.outQueue.push(new Float32Array(FRAME_SIZE));

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.bypass = true;
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!input) { output.fill(0); return true; }

    if (this.bypass || !this.initialized) {
      output.set(input);
      return true;
    }

    // Binary bypass (SIMPLE MODE) — slider %0
    if (!this.active) {
      output.set(input);
      return true;
    }

    try {
      // Ring buffer ile 480-sample frame topla
      for (let i = 0; i < input.length; i++) {
        this.inBuf[this.inBufPos++] = input[i];
        if (this.inBufPos >= FRAME_SIZE) {
          this.processFrame();
          this.inBufPos = 0;
        }
      }
      this.drainOutput(output);
    } catch (err) {
      // Runtime exception → silent bypass, ses akışı korunur
      this.bypass = true;
      this.port.postMessage({ type: 'error', message: String(err) });
      output.set(input);
    }
    return true;
  }

  private processFrame() {
    if (!this.memoryView || !this.wasm) return;
    const processFrame = (this.wasm.exports as Record<string, unknown>)._rnnoise_process_frame as
      (state: number, out: number, inp: number) => number;
    if (typeof processFrame !== 'function') { this.bypass = true; return; }

    // Scale input: RNNoise int16-range float (~-32768..32767 as float)
    const inStart = this.inputHeapPtr / 4;
    for (let i = 0; i < FRAME_SIZE; i++) {
      this.memoryView[inStart + i] = this.inBuf[i] * 32768;
    }
    processFrame(this.denoiseStatePtr, this.outputHeapPtr, this.inputHeapPtr);
    const outStart = this.outputHeapPtr / 4;
    // SIMPLE MODE: dry/wet mix yok, sadece denoised çıkışı.
    const frame = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      frame[i] = this.memoryView[outStart + i] / 32768;
    }
    this.outQueue.push(frame);
  }

  private drainOutput(out: Float32Array) {
    // Tek yazım garantisi: her chunk için outQueue head'den ardışık tüketim.
    // Pre-fill'den sonra steady state'te queue daima ≥128 sample içerir → gap yok.
    let produced = 0;
    while (produced < out.length && this.outQueue.length > 0) {
      const head = this.outQueue[0];
      const remaining = out.length - produced;
      if (remaining >= head.length) {
        out.set(head, produced);
        produced += head.length;
        this.outQueue.shift();
      } else {
        out.set(head.subarray(0, remaining), produced);
        this.outQueue[0] = head.subarray(remaining);
        produced = out.length;
      }
    }
    // Queue kurusa zero-fill (yalnız init öncesi / çok nadir edge case)
    if (produced < out.length) out.fill(0, produced);
  }
}

// Debug sabiti export edilmiyor (worklet global scope) — sadece dosya kontrolü için.
void RNNOISE_DEBUG_SIMPLE_MODE;

registerProcessor('mv-rnnoise', MvRnnoiseProcessor);
