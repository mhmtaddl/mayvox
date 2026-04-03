// ── Policy Evaluation ───────────────────────────────────────────────────────
import type { UpdatePolicy, UpdateUrgency } from './types';
import { isBelowMin, isOutdated } from './compareVersions';

/**
 * Mevcut sürüm + policy → güncelleme aciliyeti.
 * - minSupportedVersion altındaysa → her zaman force
 * - güncel ise → none
 * - aradaysa → policy'deki updateLevel
 */
export function evaluateUrgency(
  currentVersion: string,
  policy: UpdatePolicy,
): UpdateUrgency {
  if (isBelowMin(currentVersion, policy.minSupportedVersion)) {
    return 'force';
  }
  if (!isOutdated(currentVersion, policy.latestVersion)) {
    return 'none';
  }
  return policy.updateLevel;
}
