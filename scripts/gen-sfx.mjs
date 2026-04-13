// UI Sound Pack Generator — prosedürel, bağımlılık yok.
// Çalıştır:  node scripts/gen-sfx.mjs
// Çıktı:     public/sfx/*.wav

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'sfx');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SR = 48000;

// ── WAV writer (PCM16 mono) ─────────────────────────────
function writeWav(filename, samples) {
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const norm = 0.5 / peak; // peak -6 dBFS
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * norm));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);       // PCM
  header.writeUInt16LE(1, 22);       // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(OUT_DIR, filename), Buffer.concat([header, pcm]));
  console.log('→', filename, `(${(samples.length / SR * 1000).toFixed(0)}ms)`);
}

// ── Helpers ─────────────────────────────────────────────
const buf = (ms) => new Float32Array(Math.round(ms / 1000 * SR));

/** AR (attack-release) envelope, exponential release. */
function envAR(len, attackMs, releaseMs) {
  const env = new Float32Array(len);
  const aN = Math.min(len, Math.round(attackMs / 1000 * SR));
  const rN = Math.min(len, Math.round(releaseMs / 1000 * SR));
  const hold = len - aN - rN;
  for (let i = 0; i < aN; i++) env[i] = i / Math.max(1, aN);
  for (let i = 0; i < Math.max(0, hold); i++) env[aN + i] = 1;
  for (let i = 0; i < rN; i++) {
    const t = i / rN;
    env[aN + Math.max(0, hold) + i] = Math.exp(-4 * t); // exp decay
  }
  return env;
}

/** Sine with optional linear frequency sweep. */
function sineSweep(len, fStart, fEnd = fStart) {
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const f = fStart + (fEnd - fStart) * t;
    phase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(phase);
  }
  return out;
}

/** Mix b into a with gain. */
function mix(a, b, gain = 1) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) a[i] += b[i] * gain;
  return a;
}

/** Simple one-pole lowpass (cutoff Hz). */
function lowpass(x, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  const y = new Float32Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) { prev = prev + a * (x[i] - prev); y[i] = prev; }
  return y;
}

/** Feedback-delay mini reverb (cheap plate feel). */
function reverb(x, delayMs = 35, feedback = 0.35, wet = 0.25, tailMs = 250) {
  const tailN = Math.round(tailMs / 1000 * SR);
  const out = new Float32Array(x.length + tailN);
  for (let i = 0; i < x.length; i++) out[i] = x[i];
  const d = Math.round(delayMs / 1000 * SR);
  for (let i = d; i < out.length; i++) {
    out[i] += out[i - d] * feedback;
  }
  // mix dry+wet (out already contains dry + tail)
  const dry = new Float32Array(out.length);
  for (let i = 0; i < x.length; i++) dry[i] = x[i];
  for (let i = 0; i < out.length; i++) out[i] = dry[i] * (1 - wet) + out[i] * wet;
  return out;
}

/** Short filtered-noise click (percussive). */
function noiseClick(ms, cutoff = 3000) {
  const n = Math.round(ms / 1000 * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
  const y = lowpass(x, cutoff);
  const env = envAR(n, 1, ms - 1);
  for (let i = 0; i < n; i++) y[i] *= env[i];
  return y;
}

/** Render a tone: sine(sweep) * AR env. */
function tone(ms, fStart, fEnd, aMs, rMs) {
  const n = Math.round(ms / 1000 * SR);
  const s = sineSweep(n, fStart, fEnd);
  const e = envAR(n, aMs, rMs);
  for (let i = 0; i < n; i++) s[i] *= e[i];
  return s;
}

// ── 1. Join: 440→660 sweep, 180ms ───────────────────────
writeWav('join.wav', tone(180, 440, 660, 6, 150));

// ── 2. Leave: 660→400 sweep, 160ms ──────────────────────
writeWav('leave.wav', tone(160, 660, 400, 6, 140));

// ── 3. Mic ON: 520Hz + click overlay ────────────────────
{
  const body = tone(150, 520, 520, 4, 140);
  const click = noiseClick(18, 4000);
  const out = new Float32Array(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body[i];
  for (let i = 0; i < click.length; i++) out[i] += click[i] * 0.6;
  writeWav('mic_on.wav', out);
}

// ── 4. Mic OFF: 320Hz ───────────────────────────────────
writeWav('mic_off.wav', tone(170, 320, 320, 4, 160));

// ── 5. PTT press: short click ~700Hz ────────────────────
{
  const body = tone(55, 700, 680, 2, 50);
  const click = noiseClick(10, 2500);
  const out = new Float32Array(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body[i] * 0.8;
  for (let i = 0; i < click.length; i++) out[i] += click[i] * 0.7;
  writeWav('ptt_press.wav', out);
}

// ── 5b. PTT press ALT: square 700Hz, exp decay 40ms (WebAudio parity) ──
{
  const ms = 40;
  const n = Math.round(ms / 1000 * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * 700) / SR;
    const sq = Math.sin(phase) >= 0 ? 1 : -1;
    // exponentialRamp: 0.6 → 0.001 over n samples
    const t = i / n;
    const gain = 0.6 * Math.pow(0.001 / 0.6, t);
    out[i] = sq * gain;
  }
  writeWav('ptt_press_alt.wav', out);
}

// ── 6. PTT release: 500Hz fade ──────────────────────────
writeWav('ptt_release.wav', tone(90, 500, 470, 3, 85));

// ── 7. Notification: C5 → E5 → G5 with slight reverb ───
{
  const notes = [
    { f: 523.25, ms: 110 }, // C5
    { f: 659.25, ms: 110 }, // E5
    { f: 783.99, ms: 180 }, // G5
  ];
  let total = 0;
  for (const n of notes) total += n.ms;
  const full = new Float32Array(Math.round(total / 1000 * SR));
  let off = 0;
  for (const n of notes) {
    const seg = tone(n.ms, n.f, n.f, 4, n.ms - 4);
    for (let i = 0; i < seg.length && off + i < full.length; i++) full[off + i] += seg[i];
    off += seg.length;
  }
  const wet = reverb(full, 40, 0.30, 0.22, 220);
  writeWav('notify.wav', wet);
}

// ── 8. UI click: 600Hz soft ─────────────────────────────
{
  const body = tone(45, 600, 600, 2, 42);
  const click = noiseClick(6, 5000);
  const out = new Float32Array(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body[i] * 0.7;
  for (let i = 0; i < click.length; i++) out[i] += click[i] * 0.35;
  writeWav('click.wav', out);
}

console.log(`\nWrote ${fs.readdirSync(OUT_DIR).length} files to ${OUT_DIR}`);
