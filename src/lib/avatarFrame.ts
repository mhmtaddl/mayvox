/**
 * Tiered Avatar Frame System
 *
 * Standard (level null/1): temiz ince ring, glow yok, animasyon yok
 * VIP (level 2): premium ring + subtle glow
 * Elite (level 3): zengin glow + shimmer animasyonu
 *
 * `getFrameTier` + `getFrameStyle` → tüm avatar render noktaları bu fonksiyonları
 * kullanarak tutarlı tier-based çerçeve alır.
 */

export type FrameTier = 'standard' | 'vip' | 'elite';

export function getFrameTier(
  userLevel: string | null | undefined,
  opts?: { isPrimaryAdmin?: boolean; isAdmin?: boolean },
): FrameTier {
  // Primary admin tüm yetkilere sahip → her zaman elite
  if (opts?.isPrimaryAdmin) return 'elite';
  // Admin → en az VIP, level daha yüksekse o kazanır
  if (opts?.isAdmin && (!userLevel || userLevel < '2')) return 'vip';
  if (userLevel === '3') return 'elite';
  if (userLevel === '2') return 'vip';
  return 'standard';
}

export function getFrameStyle(color: string, tier: FrameTier): React.CSSProperties {
  if (!color) return {};
  switch (tier) {
    case 'elite':
      return {
        boxShadow: `0 0 0 2.5px ${color}, 0 0 14px ${color}50, 0 0 28px ${color}25`,
      };
    case 'vip':
      return {
        boxShadow: `0 0 0 2.5px ${color}, 0 0 12px ${color}40`,
      };
    case 'standard':
    default:
      return {
        boxShadow: `0 0 0 2px ${color}`,
      };
  }
}

export function getFrameClassName(tier: FrameTier): string {
  if (tier === 'elite') return 'frame-elite';
  if (tier === 'vip') return 'frame-vip';
  return '';
}
