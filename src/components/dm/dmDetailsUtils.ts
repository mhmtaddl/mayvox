import { tokenize } from '../../lib/linkify';
import type { DmMessage } from '../../lib/dmService';

export interface DmSharedLink {
  url: string;
  domain: string;
  title: string;
  createdAt: number;
  messageId: string;
}

export interface DmSharedMedia extends DmSharedLink {
  kind: 'image' | 'video' | 'media';
}

const MAX_LINKS = 8;
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|m4v)(?:[?#].*)?$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i;

export function extractLinksFromMessages(messages: DmMessage[], maxLinks: number = MAX_LINKS): DmSharedLink[] {
  const seen = new Set<string>();
  const links: DmSharedLink[] = [];

  for (const msg of [...messages].reverse()) {
    for (const token of tokenize(msg.text || '')) {
      if (token.type !== 'url') continue;
      const normalized = normalizeUrl(token.value);
      if (!normalized || seen.has(normalized)) continue;

      seen.add(normalized);
      links.push({
        url: normalized,
        domain: getDomain(normalized),
        title: getLinkTitle(normalized),
        createdAt: msg.createdAt,
        messageId: msg.id,
      });

      if (links.length >= maxLinks) return links;
    }
  }

  return links;
}

export function extractMediaFromMessages(messages: DmMessage[], maxMedia: number = MAX_LINKS): DmSharedMedia[] {
  const seen = new Set<string>();
  const media: DmSharedMedia[] = [];

  for (const msg of [...messages].reverse()) {
    for (const token of tokenize(msg.text || '')) {
      if (token.type !== 'url') continue;
      const normalized = normalizeUrl(token.value);
      if (!normalized || seen.has(normalized) || !isMediaUrl(normalized)) continue;

      seen.add(normalized);
      media.push({
        url: normalized,
        domain: getDomain(normalized),
        title: getLinkTitle(normalized),
        createdAt: msg.createdAt,
        messageId: msg.id,
        kind: getMediaKind(normalized),
      });

      if (media.length >= maxMedia) return media;
    }
  }

  return media;
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

function getLinkTitle(value: string): string {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments.length > 0 ? segments[segments.length - 1] : undefined;
    if (!last) return getDomain(value);

    let decoded = last;
    try {
      decoded = decodeURIComponent(last);
    } catch {
      decoded = last;
    }

    const cleaned = decoded
      .replace(/\.(html?|php|aspx?|jsp)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned ? cleaned.slice(0, 80) : getDomain(value);
  } catch {
    return value;
  }
}

function isMediaUrl(value: string): boolean {
  return MEDIA_EXT_RE.test(new URL(value).pathname);
}

function getMediaKind(value: string): DmSharedMedia['kind'] {
  const path = new URL(value).pathname;
  if (IMAGE_EXT_RE.test(path)) return 'image';
  if (VIDEO_EXT_RE.test(path)) return 'video';
  return 'media';
}
