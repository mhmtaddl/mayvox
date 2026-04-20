/**
 * Mesaj metni içindeki http/https URL'leri tokenize eder.
 *
 * Davranış:
 *  - Yalnızca http:// ve https:// şemaları tanınır (güvenlik).
 *  - Trailing punctuation (`.`, `,`, `;`, `:`, `!`, `?`, `)`, `]`, `}`, `>`) URL'den
 *    ayrılır → bir sonraki text token'ına eklenir. `foo.com/path.` yerine `foo.com/path` yakalanır.
 *  - Metin null-safe; boş string → boş token listesi.
 */

export type Token =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string };

// Açgözlü ama whitespace/quote/brackets'te durur. Trailing punctuation sonradan trim edilir.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>]+$/;

export function tokenize(text: string): Token[] {
  if (!text) return [];
  const tokens: Token[] = [];
  let cursor = 0;
  URL_RE.lastIndex = 0;

  for (let m = URL_RE.exec(text); m !== null; m = URL_RE.exec(text)) {
    const matchStart = m.index;
    const raw = m[0];
    const trailMatch = raw.match(TRAILING_PUNCT_RE);
    const trailLen = trailMatch ? trailMatch[0].length : 0;
    const url = trailLen > 0 ? raw.slice(0, -trailLen) : raw;

    if (matchStart > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, matchStart) });
    }
    tokens.push({ type: 'url', value: url });
    cursor = matchStart + raw.length - trailLen;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }
  return tokens;
}

/**
 * URL'den okunabilir kısa başlık üretir (metadata fetch YOK).
 * Öncelik:
 *   1. Path'in son segment'i → slug clean (tire→boşluk, extension kaldır, title-case)
 *   2. Segment yoksa hostname (www. stripped)
 */
export function prettifyTitle(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments.length > 0 ? segments[segments.length - 1] : '';
    if (!last) return hostnameClean(u);

    let cleaned: string;
    try { cleaned = decodeURIComponent(last); } catch { cleaned = last; }
    cleaned = cleaned
      .replace(/\.(html?|php|aspx?|jsp)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return hostnameClean(u);

    return cleaned
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 80);
  } catch {
    return url;
  }
}

export function getDomain(url: string): string {
  try {
    return hostnameClean(new URL(url));
  } catch {
    return url;
  }
}

function hostnameClean(u: URL): string {
  return u.hostname.replace(/^www\./i, '');
}
