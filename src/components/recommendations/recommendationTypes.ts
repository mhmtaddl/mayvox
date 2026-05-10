import type { RecommendationCategory } from '../../lib/serverService';

export type { RecommendationCategory, RecommendationItem, RecommendationPayload, RecommendationLink, RecommendationRating, RecommendationComment } from '../../lib/serverService';

export const RECOMMENDATION_CATEGORIES: Array<{ id: RecommendationCategory; label: string }> = [
  { id: 'film', label: 'Film' },
  { id: 'series', label: 'Dizi' },
  { id: 'game', label: 'Oyun' },
  { id: 'music', label: 'Müzik' },
  { id: 'book', label: 'Kitap' },
  { id: 'hardware', label: 'Donanım' },
];

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = RECOMMENDATION_CATEGORIES.reduce(
  (acc, item) => ({ ...acc, [item.id]: item.label }),
  {} as Record<RecommendationCategory, string>,
);

export function formatRecommendationDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function stringFromMetadata(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (value === null || value === undefined) return '';
  return String(value);
}

export const RECOMMENDATION_METADATA_LABELS: Record<string, string> = {
  year: 'Yıl',
  durationMinutes: 'Süre',
  genres: 'Türler',
  genre: 'Tür',
  platform: 'Platform',
  status: 'Durum',
  externalRating: 'Dış puan',
  watchLink: 'İzleme linki',
  watchLinks: 'İzleme linkleri',
  seasonCount: 'Sezon sayısı',
  episodeCount: 'Toplam bölüm',
  episodeDurationMinutes: 'Bölüm süresi',
  episodesPerSeason: 'Sezon başı bölüm',
  director: 'Yönetmen',
  cast: 'Oyuncular',
  platforms: 'Platformlar',
  playerModes: 'Oyuncu modu',
  idealPartySize: 'İdeal kişi sayısı',
  voiceChatFunScore: 'Sesli sohbet puanı',
  storeLink: 'Mağaza linki',
  storeLinks: 'Mağaza linkleri',
  onlineRequired: 'Online gerekli',
  crossplay: 'Crossplay',
  freeToPlay: 'Ücretsiz',
  artist: 'Sanatçı',
  album: 'Albüm',
  releaseYear: 'Yıl',
  platformLink: 'Platform linki',
  author: 'Yazar',
  pageCount: 'Sayfa sayısı',
  language: 'Dil',
  brand: 'Marka',
  model: 'Model',
  hardwareType: 'Donanım türü',
  priceRange: 'Fiyat aralığı',
  useCase: 'Kullanım amacı',
  pros: 'Artılar',
  cons: 'Eksiler',
  purchaseLink: 'Satın alma linki',
};

export function recommendationMetadataRows(metadata: Record<string, unknown> | null | undefined): Array<{ key: string; label: string; value: string }> {
  return Object.entries(metadata || {})
    .map(([key, value]) => ({ key, label: RECOMMENDATION_METADATA_LABELS[key] || key, value: stringFromMetadata(value) }))
    .filter(row => !!row.value);
}

export function resolveRecommendationCoverUrl(url: string | null | undefined): string {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  const apiBase = String(import.meta.env.VITE_SERVER_API_URL || '').replace(/\/$/, '');
  if (value.startsWith('/')) return apiBase ? `${apiBase}${value}` : value;
  return value;
}
