/**
 * Grouping — burst mesajları tek toast'ta topla.
 *
 * Service aktif kuyrukta aynı groupKey'li toast bulduğunda içeriğini
 * günceller (sayaç + son metin) ve TTL'i reset eder.
 *
 * Engine yalnızca groupKey üretir; birleştirme service tarafında.
 */

import type { EventIntent } from './types';

export function groupKeyFor(intent: EventIntent, sourceId?: string, subjectId?: string): string | undefined {
  switch (intent) {
    case 'direct_dm':
      // Aynı senderdan art arda → tek bundle
      return sourceId ? `dm:src:${sourceId}` : undefined;
    case 'invite':
      // 30 sn içinde çoklu davet → tek bundle (senderdan bağımsız)
      return 'invite:batch';
    case 'mention':
      return subjectId ? `mention:${subjectId}` : undefined;
    default:
      return undefined;
  }
}
