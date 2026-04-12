/**
 * Adaptive memory — bounded, explainable, human-readable.
 *
 * Intent başına son N olayın sonucu (clicked / ignored) takip edilir.
 * Rolling oran yüksek ignore → intent softened.
 *
 * ML YOK. Sadece son-N window frequency.
 */

import type { EventIntent } from './types';

const WINDOW_SIZE = 30; // son 30 olay / intent

type Outcome = 'clicked' | 'ignored';

const byIntent: Partial<Record<EventIntent, Outcome[]>> = {};

function arr(intent: EventIntent): Outcome[] {
  let a = byIntent[intent];
  if (!a) { a = []; byIntent[intent] = a; }
  return a;
}

export function recordOutcome(intent: EventIntent, outcome: Outcome) {
  const a = arr(intent);
  a.push(outcome);
  if (a.length > WINDOW_SIZE) a.shift();
}

function rate(intent: EventIntent, outcome: Outcome): number {
  const a = byIntent[intent];
  if (!a || a.length === 0) return 0;
  let count = 0;
  for (const o of a) if (o === outcome) count++;
  return count / a.length;
}

export function ignoredRate(intent: EventIntent): number {
  return rate(intent, 'ignored');
}
export function clickedRate(intent: EventIntent): number {
  return rate(intent, 'clicked');
}

export function snapshotRates(): {
  ignored: Partial<Record<EventIntent, number>>;
  clicked: Partial<Record<EventIntent, number>>;
} {
  const ignored: Partial<Record<EventIntent, number>> = {};
  const clicked: Partial<Record<EventIntent, number>> = {};
  for (const key of Object.keys(byIntent) as EventIntent[]) {
    ignored[key] = ignoredRate(key);
    clicked[key] = clickedRate(key);
  }
  return { ignored, clicked };
}

/**
 * İntent için "soften" eşiğini aşıyor mu?
 * - Minimum sample boyutu (N >= 8) gerek — erken yanlış karar almayalım.
 * - İgnore oranı ≥ 0.8 → softening.
 */
export function shouldSoften(intent: EventIntent): boolean {
  const a = byIntent[intent];
  if (!a || a.length < 8) return false;
  return ignoredRate(intent) >= 0.8;
}

export const _testing = {
  reset: () => {
    for (const k of Object.keys(byIntent)) delete byIntent[k as EventIntent];
  },
  getBuffer: (intent: EventIntent) => [...(byIntent[intent] ?? [])],
};
