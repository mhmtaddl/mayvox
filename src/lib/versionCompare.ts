/**
 * Semver karşılaştırma yardımcıları.
 * Sadece major.minor.patch destekler (pre-release tag'leri yok sayılır).
 */

function parse(v: string | null | undefined): [number, number, number] {
  if (!v || typeof v !== 'string') return [0, 0, 0];
  const cleaned = v.replace(/^v/, '').trim();
  if (!cleaned) return [0, 0, 0];
  const parts = cleaned.split('.').map(s => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** a < b → -1, a === b → 0, a > b → 1 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** current, latest'ten düşük mü? */
export function isOutdated(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  return compareSemver(current, latest) < 0;
}
