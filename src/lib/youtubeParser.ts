/**
 * YouTube URL → videoId parser.
 *
 * Desteklenen şekiller:
 *  - https://www.youtube.com/watch?v=VIDEO_ID
 *  - https://youtu.be/VIDEO_ID
 *  - https://www.youtube.com/shorts/VIDEO_ID
 *  - https://www.youtube.com/embed/VIDEO_ID
 *  - m./music. subdomain varyantları
 *  - youtube-nocookie.com
 *
 * videoId formatı: 11 karakter [A-Za-z0-9_-]. Bu format guard'ı,
 * path'e gömülü ID dışı segmentlerin (ör. /shorts/xxxx?feature=share)
 * yanlış eşleşmesini engeller.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isValidId(id: string | null | undefined): id is string {
  return !!id && ID_RE.test(id);
}

export function parseYouTubeUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }

  const host = u.hostname.replace(/^(?:www|m|music)\./i, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return isValidId(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      return isValidId(id) ? id : null;
    }
    const PREFIXES = ['/shorts/', '/embed/', '/v/'];
    for (const p of PREFIXES) {
      if (u.pathname.startsWith(p)) {
        const id = u.pathname.slice(p.length).split('/')[0];
        return isValidId(id) ? id : null;
      }
    }
  }

  return null;
}

export function youtubeThumbnailUrl(videoId: string): string {
  // hqdefault her video için garanti (480x360). maxresdefault bazı eski/az izlenen
  // videolarda 404 → ilk yüklemede flicker'a yol açar. hq güvenli default.
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
