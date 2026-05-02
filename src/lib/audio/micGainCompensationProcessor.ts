import { logger } from '../logger';

const MIC_NOISE_SUPPRESSION_GAIN_DB = 2.5;
const MIC_NOISE_SUPPRESSION_GAIN = 10 ** (MIC_NOISE_SUPPRESSION_GAIN_DB / 20);

/**
 * Small uplink-only gain compensation for browser/native noise suppression.
 * The compressor acts as a soft limiter so the +2.5 dB makeup gain does not
 * turn loud syllables into harsh clipping.
 */
export class MicGainCompensationProcessor {
  readonly name = 'mv-mic-gain-compensation';
  processedTrack?: MediaStreamTrack;

  private ctx: AudioContext | null = null;
  private ownsContext = false;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;
  private originalTrack: MediaStreamTrack | null = null;

  async init(options: { track: MediaStreamTrack; audioContext?: AudioContext }): Promise<void> {
    this.originalTrack = options.track;
    try {
      const ctx = options.audioContext ?? new AudioContext({ sampleRate: 48000 });
      this.ctx = ctx;
      this.ownsContext = !options.audioContext;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
      }

      this.sourceNode = ctx.createMediaStreamSource(new MediaStream([options.track]));
      this.gainNode = ctx.createGain();
      this.limiterNode = ctx.createDynamicsCompressor();
      this.destNode = ctx.createMediaStreamDestination();

      this.gainNode.gain.setValueAtTime(MIC_NOISE_SUPPRESSION_GAIN, ctx.currentTime);
      this.limiterNode.threshold.setValueAtTime(-2, ctx.currentTime);
      this.limiterNode.knee.setValueAtTime(0, ctx.currentTime);
      this.limiterNode.ratio.setValueAtTime(20, ctx.currentTime);
      this.limiterNode.attack.setValueAtTime(0.003, ctx.currentTime);
      this.limiterNode.release.setValueAtTime(0.05, ctx.currentTime);

      this.sourceNode.connect(this.gainNode).connect(this.limiterNode).connect(this.destNode);
      const processed = this.destNode.stream.getAudioTracks()[0];
      if (!processed) throw new Error('mic gain destination track missing');
      this.processedTrack = processed;
      logger.info?.('[mic-gain] noise suppression makeup gain active', {
        gainDb: MIC_NOISE_SUPPRESSION_GAIN_DB,
      });
    } catch (err) {
      logger.warn?.('[mic-gain] fallback — ' + String(err));
      await this.cleanup();
      this.processedTrack = this.originalTrack ?? undefined;
    }
  }

  async restart(options: { track: MediaStreamTrack; audioContext?: AudioContext }): Promise<void> {
    await this.cleanup();
    await this.init(options);
  }

  async destroy(): Promise<void> {
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    try { this.sourceNode?.disconnect(); } catch { /* no-op */ }
    try { this.gainNode?.disconnect(); } catch { /* no-op */ }
    try { this.limiterNode?.disconnect(); } catch { /* no-op */ }
    try { this.destNode?.disconnect(); } catch { /* no-op */ }
    this.sourceNode = null;
    this.gainNode = null;
    this.limiterNode = null;
    this.destNode = null;
    if (this.ownsContext && this.ctx && this.ctx.state !== 'closed') {
      try { await this.ctx.close(); } catch { /* no-op */ }
    }
    this.ctx = null;
    this.ownsContext = false;
  }
}

