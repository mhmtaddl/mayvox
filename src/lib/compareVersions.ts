/**
 * Semver-lite version comparator.
 * Handles: "2.0.7", "v2.0.7", "2.0.7-beta", "2.0.7-beta.1"
 *
 * Returns: -1 if a<b, 0 if equal, 1 if a>b.
 * Prerelease (-beta, -rc, -alpha...) is treated as LESS THAN the base version.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (s: string): number[] => {
    const head = s.trim().replace(/^v/i, '').split('-')[0] ?? '';
    return head.split('.').map((x) => {
      const n = parseInt(x, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const A = parse(a);
  const B = parse(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const ai = A[i] ?? 0;
    const bi = B[i] ?? 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  // Same numeric tuple — prerelease lower than stable.
  const aPre = a.includes('-');
  const bPre = b.includes('-');
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  return 0;
}

/**
 * Display-friendly version string: strip leading "v".
 * "v2.0.7" → "2.0.7", "2.0.7" → "2.0.7", null → ''
 */
export function displayVersion(v: string | null | undefined): string {
  if (!v) return '';
  return v.trim().replace(/^v/i, '');
}

/**
 * Is userVersion older than currentVersion? Safe with missing/malformed inputs.
 */
export function isOutdatedVersion(
  userVersion: string | null | undefined,
  currentVersion: string | null | undefined,
): boolean {
  if (!userVersion || !currentVersion) return false;
  try {
    return compareVersions(userVersion, currentVersion) < 0;
  } catch {
    return false;
  }
}
