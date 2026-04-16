/**
 * Unified notification emitter — Faz 1.
 *
 * Sink-based mimari: UI katmanı mount'ta ilgili sink'leri register eder,
 * emitter priority × type → kanal matrisinden hangi sink'lerin çağrılacağını
 * çözer ve dispatch eder. Böylece call-site'lar çoğalabilen yerlerden koparılır.
 *
 * Faz 1 kullanımı: Mevcut `setToastMsg` / service handler path'leri aynı kalır.
 * Yeni akışlar veya migration adımları emitNotification üzerinden geçebilir.
 * Sink register edilmemişse ilgili kanal sessizce atlanır (safe-by-default).
 */

import {
  AppNotification,
  resolveChannels,
  makeNotificationId,
} from './appNotification';

type ToastSink = (n: AppNotification) => void;
type BellSink = (n: AppNotification) => void;
type BannerSink = (n: AppNotification) => void;
type ModalSink = (n: AppNotification) => void;
type SoundSink = (n: AppNotification) => void;
type FlashSink = (n: AppNotification) => void;

interface Sinks {
  toast?: ToastSink;
  bell?: BellSink;
  banner?: BannerSink;
  modal?: ModalSink;
  sound?: SoundSink;
  flash?: FlashSink;
}

const sinks: Sinks = {};

export function registerToastSink(fn: ToastSink | null): void {
  if (fn) sinks.toast = fn; else delete sinks.toast;
}
export function registerBellSink(fn: BellSink | null): void {
  if (fn) sinks.bell = fn; else delete sinks.bell;
}
export function registerBannerSink(fn: BannerSink | null): void {
  if (fn) sinks.banner = fn; else delete sinks.banner;
}
export function registerModalSink(fn: ModalSink | null): void {
  if (fn) sinks.modal = fn; else delete sinks.modal;
}
export function registerSoundSink(fn: SoundSink | null): void {
  if (fn) sinks.sound = fn; else delete sinks.sound;
}
export function registerFlashSink(fn: FlashSink | null): void {
  if (fn) sinks.flash = fn; else delete sinks.flash;
}

export type EmitInput =
  & Omit<AppNotification, 'id' | 'timestamp' | 'read' | 'channel'>
  & Partial<Pick<AppNotification, 'id' | 'timestamp' | 'read'>>;

/**
 * Merkezi emitter. AppNotification üretir, resolveChannels ile kanalları çözer,
 * register edilmiş sink'lere dispatch eder ve notification nesnesini döner.
 */
export function emitNotification(input: EmitInput): AppNotification {
  const n: AppNotification = {
    id: input.id ?? makeNotificationId(input.type),
    type: input.type,
    priority: input.priority,
    title: input.title,
    message: input.message,
    timestamp: input.timestamp ?? Date.now(),
    read: input.read ?? false,
    silent: input.silent,
    meta: input.meta,
    channel: resolveChannels(input.type, input.priority, input.silent),
  };

  const ch = n.channel!;
  try {
    if (ch.toast && sinks.toast) sinks.toast(n);
    if (ch.bell && sinks.bell) sinks.bell(n);
    if (ch.banner && sinks.banner) sinks.banner(n);
    if (ch.modal && sinks.modal) sinks.modal(n);
    if (ch.sound && sinks.sound) sinks.sound(n);
    if (ch.flash && sinks.flash) sinks.flash(n);
  } catch (err) {
    // Sink hatası diğerlerini durdurmamalı — gözlemlenebilir olsun diye log.
    console.warn('[notify] sink dispatch error', err);
  }

  return n;
}

/** Debug / smoke — register edilmiş sink'lerin anlık görüntüsü. */
export function _getRegisteredChannels(): Array<keyof Sinks> {
  return (Object.keys(sinks) as Array<keyof Sinks>).filter(k => !!sinks[k]);
}
