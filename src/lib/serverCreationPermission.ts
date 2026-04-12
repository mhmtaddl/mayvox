/**
 * Sunucu oluşturma yetkisi — PLAN BAZLI.
 *
 * Kural:
 *   - user.serverCreationPlan tek belirleyici (rol artık sunucu açmaya karışmaz).
 *   - 'none' → oluşturamaz
 *   - 'free' → yalnızca free plan
 *   - 'pro'  → free + pro
 *   - 'ultra'→ tüm planlar
 *
 * Backend `createServer` aynı kuralı enforce eder — bu helper UI görünürlüğü içindir.
 * Eski 1-sunucu-owner limiti ve admin/mod gating tamamen kaldırıldı.
 */

import type { User, ServerCreationPlan } from '../types';
import type { PlanKey } from './planConfig';
import type { Server } from './serverService';

const PLAN_RANK: Record<ServerCreationPlan, number> = {
  none: 0,
  free: 1,
  pro: 2,
  ultra: 3,
};

const SERVER_PLAN_RANK: Record<PlanKey, number> = {
  free: 1,
  pro: 2,
  ultra: 3,
};

/** User'ın efektif plan tier'ı ('none' fallback). */
export function getUserCreationTier(user: { serverCreationPlan?: ServerCreationPlan } | null | undefined): ServerCreationPlan {
  return user?.serverCreationPlan ?? 'none';
}

/** Kullanıcının owner olduğu sunucu sayısı. */
export function ownedServerCount(serverList: Server[] | null | undefined): number {
  if (!serverList) return 0;
  return serverList.filter(s => s.role === 'owner').length;
}

/**
 * Sunucu oluşturma butonu/menüleri görünmeli mi?
 *   - Plan 'none' değilse
 *   - AND kullanıcının aktif sahibi olduğu sunucu yoksa (tek-sunucu-owner kuralı)
 * Backend aynı iki kuralı enforce eder — UI sadece görünürlüktür.
 */
export function canCreateServer(user: User | null | undefined, serverList: Server[] | null | undefined): boolean {
  if (getUserCreationTier(user) === 'none') return false;
  return ownedServerCount(serverList) === 0;
}

/** Belirli bir plan (free/pro/ultra) seçimi bu kullanıcıya açık mı? */
export function canUserCreateWithPlan(user: User | null | undefined, planKey: PlanKey): boolean {
  const tier = getUserCreationTier(user);
  if (tier === 'none') return false;
  return SERVER_PLAN_RANK[planKey] <= PLAN_RANK[tier];
}

/** Kullanıcının seçebileceği plan listesi — Create modal dropdown için. */
export function allowedCreatePlans(user: User | null | undefined): PlanKey[] {
  const tier = getUserCreationTier(user);
  if (tier === 'none') return [];
  const max = PLAN_RANK[tier];
  return (['free', 'pro', 'ultra'] as const).filter(p => SERVER_PLAN_RANK[p] <= max);
}
