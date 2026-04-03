// ── GitHub Releases Policy Provider ─────────────────────────────────────────
import type { UpdatePolicy } from '../types';
import { GITHUB_OWNER, GITHUB_REPO, FETCH_TIMEOUT } from '../constants';

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  body: string | null;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

/**
 * GitHub Releases API'den son release'i çekip UpdatePolicy'ye dönüştürür.
 * minSupportedVersion ve updateLevel release body'den parse edilir (opsiyonel).
 *
 * Release body'de şu formatı arar:
 *   <!-- update-policy: force -->
 *   <!-- min-version: 1.5.0 -->
 */
export async function fetchPolicyFromGitHub(): Promise<UpdatePolicy> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github.v3+json' },
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    }

    const data: GitHubRelease = await res.json();

    // Defensive: gerekli alanlar var mı
    if (!data?.tag_name) {
      throw new Error('Release verisi geçersiz: tag_name eksik');
    }

    return parseRelease(data);
  } catch (e: any) {
    // AbortError'ı kullanıcı dostu mesaja çevir
    if (e?.name === 'AbortError') {
      throw new Error('Bağlantı zaman aşımına uğradı');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRelease(release: GitHubRelease): UpdatePolicy {
  const version = release.tag_name.replace(/^v/, '');
  const body = release.body || '';

  // Parse optional metadata from release body
  const levelMatch = body.match(/<!--\s*update-policy:\s*(optional|recommended|force)\s*-->/i);
  const minMatch = body.match(/<!--\s*min-version:\s*([\d.]+)\s*-->/i);

  // Asset detection — assets null/undefined olabilir
  const assets = release.assets || [];
  const setupExe = assets.find(a => a.name?.endsWith('-setup.exe'));
  const apk = assets.find(a => a.name?.endsWith('.apk'));

  // Clean message: body without HTML comments
  const message = body.replace(/<!--[\s\S]*?-->/g, '').trim() || null;

  return {
    latestVersion: version,
    minSupportedVersion: minMatch?.[1] || '0.0.0',
    updateLevel: (levelMatch?.[1] as UpdatePolicy['updateLevel']) || 'optional',
    message,
    assets: {
      desktop: setupExe
        ? { downloadUrl: setupExe.browser_download_url, size: setupExe.size }
        : undefined,
      android: apk
        ? { apkUrl: apk.browser_download_url, size: apk.size }
        : undefined,
    },
    publishedAt: release.published_at,
  };
}
