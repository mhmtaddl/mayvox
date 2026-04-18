export type SoundCategory = 'JoinLeave' | 'MuteDeafen' | 'Ptt';
export type SoundVariant = 1 | 2 | 3;
type SoundType = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'ptt-on' | 'ptt-off';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  return audioCtx;
}

function tone(
  ctx: AudioContext, freq: number, start: number, dur: number,
  vol = 0.25, type: OscillatorType = 'sine', freqEnd?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd !== undefined) osc.frequency.linearRampToValueAtTime(freqEnd, start + dur);
  const att = Math.min(0.01, dur * 0.1);
  const rel = Math.min(0.02, dur * 0.2);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + att);
  gain.gain.setValueAtTime(vol, start + dur - rel);
  gain.gain.linearRampToValueAtTime(0, start + dur);
  osc.start(start); osc.stop(start + dur);
}

// ── Join / Leave ─────────────────────────────────────────────────────────────
function playJoinLeave(ctx: AudioContext, isJoin: boolean, variant: SoundVariant) {
  const t = ctx.currentTime;
  if (variant === 1) {
    // İki nota: join yükselir, leave alçalır
    const [a, b] = isJoin ? [880, 1108] : [1108, 740];
    tone(ctx, a, t, 0.08, 0.25); tone(ctx, b, t + 0.1, 0.08, 0.20);
  } else if (variant === 2) {
    // Yumuşak glide
    const [a, b] = isJoin ? [440, 660] : [660, 440];
    tone(ctx, a, t, 0.18, 0.22, 'sine', b);
  } else {
    // Üç hızlı nota (C-E-G / G-E-C)
    const notes = isJoin ? [523, 659, 784] : [784, 659, 523];
    notes.forEach((f, i) => tone(ctx, f, t + i * 0.07, 0.06, 0.20));
  }
}

// ── Mute / Deafen ─────────────────────────────────────────────────────────────
function playMuteDeafen(ctx: AudioContext, isOn: boolean, variant: SoundVariant) {
  const t = ctx.currentTime;
  if (variant === 1) {
    // Üç nota: açılınca yükselir, kapanınca alçalır
    const notes = isOn ? [880, 660, 440] : [440, 660, 880];
    notes.forEach((f, i) => tone(ctx, f, t + i * 0.07, 0.06, isOn ? 0.20 - i * 0.02 : 0.14 + i * 0.03));
  } else if (variant === 2) {
    // Tek ton glide
    const [a, b] = isOn ? [660, 330] : [330, 660];
    tone(ctx, a, t, 0.12, 0.22, 'triangle', b);
  } else {
    // İki nota
    const [a, b] = isOn ? [800, 560] : [560, 800];
    tone(ctx, a, t, 0.07, 0.20); tone(ctx, b, t + 0.08, 0.07, 0.20);
  }
}

// ── PTT ──────────────────────────────────────────────────────────────────────
function playPtt(ctx: AudioContext, isOn: boolean, variant: SoundVariant) {
  const t = ctx.currentTime;
  if (variant === 1) {
    // Radyo pip
    tone(ctx, isOn ? 1320 : 1100, t, 0.03, 0.14, 'sine');
  } else if (variant === 2) {
    // Derin tık
    tone(ctx, isOn ? 660 : 550, t, 0.025, 0.12, 'triangle');
  } else {
    // Çift pip
    const f = isOn ? 1320 : 1100;
    tone(ctx, f, t, 0.02, 0.12); tone(ctx, f, t + 0.04, 0.02, 0.10);
  }
}

// ── Invite Ringtone ───────────────────────────────────────────────────────────
export type InviteRingtoneVariant = 1 | 2;

// Davet çalma süresi — caller/callee aynı timeout'u kullanır, UI modal'ı buna eşlenir.
// Değiştirmeden önce: InvitationModal callee timeout + handleInviteUser caller timeout
// da aynı değeri kullanır; tek kaynak burada.
export const INVITE_RING_DURATION_MS = 35_000;

let ringtoneGain: GainNode | null = null;
let ringtoneAutoStop: ReturnType<typeof setTimeout> | null = null;

function toneToNode(
  ctx: AudioContext, dest: AudioNode, freq: number, start: number, dur: number,
  vol = 0.28, type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(dest);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  const att = Math.min(0.01, dur * 0.1);
  const rel = Math.min(0.03, dur * 0.15);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + att);
  g.gain.setValueAtTime(vol, start + dur - rel);
  g.gain.linearRampToValueAtTime(0, start + dur);
  osc.start(start); osc.stop(start + dur);
}

// Klasik: iki çift akort — 480+620 Hz, 2 saniyelik çevrim
function ringCycleClassic(ctx: AudioContext, dest: AudioNode, t: number) {
  toneToNode(ctx, dest, 480, t, 0.38);
  toneToNode(ctx, dest, 620, t, 0.38);
  toneToNode(ctx, dest, 480, t + 0.55, 0.38);
  toneToNode(ctx, dest, 620, t + 0.55, 0.38);
}

// Yumuşak: üç çan notası (A4-C#5-E5) — triangle osilatör, 2 saniyelik çevrim
function ringCycleSoft(ctx: AudioContext, dest: AudioNode, t: number) {
  toneToNode(ctx, dest, 440, t,        0.28, 0.22, 'triangle');
  toneToNode(ctx, dest, 554, t + 0.36, 0.28, 0.22, 'triangle');
  toneToNode(ctx, dest, 659, t + 0.72, 0.28, 0.22, 'triangle');
}

function buildRingtone(ctx: AudioContext, variant: InviteRingtoneVariant, cycles: number): GainNode {
  const master = ctx.createGain();
  master.gain.setValueAtTime(1, ctx.currentTime);
  master.connect(ctx.destination);
  for (let i = 0; i < cycles; i++) {
    const t = ctx.currentTime + i * 2;
    if (variant === 1) ringCycleClassic(ctx, master, t);
    else ringCycleSoft(ctx, master, t);
  }
  return master;
}

export function startInviteRingtone(variant: InviteRingtoneVariant = 1): void {
  stopInviteRingtone();
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    // 18 × 2s = 36s — 35s timeout'a yetecek şekilde cycles ayarlandı.
    ringtoneGain = buildRingtone(ctx, variant, 18);
    ringtoneAutoStop = setTimeout(stopInviteRingtone, INVITE_RING_DURATION_MS);
  } catch { /* sessizce geç */ }
}

export function stopInviteRingtone(): void {
  if (ringtoneAutoStop) { clearTimeout(ringtoneAutoStop); ringtoneAutoStop = null; }
  if (ringtoneGain) {
    try {
      const ctx = getCtx();
      const g = ringtoneGain;
      ringtoneGain = null;
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);
      setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, 150);
    } catch { ringtoneGain = null; }
  }
}

// Önizleme: tek çevrim çal (2s), ardından otomatik durdur
export function previewInviteRingtone(variant: InviteRingtoneVariant): void {
  stopInviteRingtone();
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    ringtoneGain = buildRingtone(ctx, variant, 1); // sadece 1 çevrim
    ringtoneAutoStop = setTimeout(stopInviteRingtone, 2200);
  } catch { /* sessizce geç */ }
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────
function getCategory(type: SoundType): SoundCategory {
  if (type === 'join' || type === 'leave') return 'JoinLeave';
  if (type === 'ptt-on' || type === 'ptt-off') return 'Ptt';
  return 'MuteDeafen';
}

function getVariant(cat: SoundCategory): SoundVariant {
  return (parseInt(localStorage.getItem(`sound${cat}Variant`) || '1') || 1) as SoundVariant;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function playSound(type: SoundType): void {
  try {
    const cat = getCategory(type);
    if (localStorage.getItem(`sound${cat}`) === 'false') return;
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const v = getVariant(cat);
    if (cat === 'JoinLeave') playJoinLeave(ctx, type === 'join', v);
    else if (cat === 'MuteDeafen') playMuteDeafen(ctx, type === 'mute' || type === 'deafen', v);
    else playPtt(ctx, type === 'ptt-on', v);
  } catch { /* sessizce geç */ }
}

export function previewSound(category: SoundCategory, variant: SoundVariant): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (category === 'JoinLeave') playJoinLeave(ctx, true, variant);
    else if (category === 'MuteDeafen') playMuteDeafen(ctx, false, variant);
    else playPtt(ctx, true, variant);
  } catch { /* sessizce geç */ }
}
