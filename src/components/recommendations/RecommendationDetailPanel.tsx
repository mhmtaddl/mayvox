import React, { useEffect, useState } from 'react';
import { Bookmark, ExternalLink, Star, X } from 'lucide-react';
import type { RecommendationItem } from './recommendationTypes';
import { CATEGORY_LABELS, formatRecommendationDate, resolveRecommendationCoverUrl, stringFromMetadata } from './recommendationTypes';

const METADATA_LABELS: Record<string, string> = {
  year: 'Yıl',
  genre: 'Tür',
  genres: 'Türler',
  platform: 'Platform',
  externalRating: 'Dış puan',
  durationMinutes: 'Süre',
  seasonCount: 'Sezon sayısı',
  episodeCount: 'Toplam bölüm',
  episodeDurationMinutes: 'Bölüm süresi',
  episodesPerSeason: 'Sezon başı bölüm',
  status: 'Durum',
  director: 'Yönetmen',
  cast: 'Oyuncular',
  watchLink: 'İzleme linki',
  watchLinks: 'İzleme linkleri',
  platforms: 'Platformlar',
  playerModes: 'Oyuncu modu',
  onlineRequired: 'Online gerekli',
  crossplay: 'Crossplay',
  freeToPlay: 'Ücretsiz',
  idealPartySize: 'İdeal kişi sayısı',
  voiceChatFunScore: 'Sesli sohbet puanı',
  storeLink: 'Mağaza linki',
  storeLinks: 'Mağaza linkleri',
  artist: 'Sanatçı',
  album: 'Albüm',
  platformLink: 'Platform linki',
  platformLinks: 'Platform linkleri',
  author: 'Yazar',
  pageCount: 'Sayfa sayısı',
  language: 'Dil',
  brand: 'Marka',
  model: 'Model',
  hardwareType: 'Donanım türü',
  priceRange: 'Fiyat aralığı',
  pros: 'Artılar',
  cons: 'Eksiler',
  purchaseLink: 'Satın alma linki',
};

interface Props {
  item: RecommendationItem | null;
  onClose: () => void;
  onHide: () => void;
  onDelete: () => void;
  canHide: boolean;
  canDelete: boolean;
}

export default function RecommendationDetailPanel({ item, onClose, onHide, onDelete, canHide, canDelete }: Props) {
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [item?.id, item?.coverUrl]);
  if (!item) return null;
  const metadata = Object.entries(item.metadata || {}).filter(([, value]) => stringFromMetadata(value));
  const coverSrc = resolveRecommendationCoverUrl(item.coverUrl);
  const showCover = !!coverSrc && !coverFailed;
  const isPoster = item.category === 'film' || item.category === 'series';
  return (
    <div className="rounded-2xl border border-[var(--theme-border)]/25 bg-[var(--theme-panel)]/90 p-4 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-accent)] mb-1">
            {CATEGORY_LABELS[item.category]}
          </div>
          <h2 className="text-base font-semibold text-[var(--theme-text)] break-words">{item.title}</h2>
          <div className="mt-1 text-[10px] text-[var(--theme-secondary-text)]/55">
            {item.createdByName || 'Bir üye'} · {formatRecommendationDate(item.createdAt)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/55 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.055)] transition-colors"
          title="Kapat"
        >
          <X size={15} />
        </button>
      </div>

      <div className={`relative mt-4 flex w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--theme-border)]/20 bg-[rgba(var(--glass-tint),0.04)] ${isPoster ? 'h-60' : 'h-44'}`}>
        {showCover ? (
          isPoster ? (
            <>
              <img
                src={coverSrc}
                alt=""
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-lg"
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
              />
              <div className="absolute inset-0 bg-[rgba(var(--shadow-base),0.35)]" />
              <img
                src={coverSrc}
                alt=""
                className="relative z-10 h-full max-w-[70%] object-contain py-3"
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
              />
            </>
          ) : (
            <img
              src={coverSrc}
              alt=""
              className="h-full w-full object-cover object-center"
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-2 text-[var(--theme-secondary-text)]/42">
            <Bookmark size={28} />
            <span className="text-[10px]">{CATEGORY_LABELS[item.category]} kapağı</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] leading-6 text-[var(--theme-secondary-text)]/75 whitespace-pre-wrap">
        {item.description || 'Açıklama eklenmemiş.'}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[rgba(var(--glass-tint),0.035)] border border-[var(--theme-border)]/15 p-3">
          <div className="text-[9px] text-[var(--theme-secondary-text)]/45">Puan</div>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-[var(--theme-text)]">
            <Star size={13} className="text-amber-300" />
            Puanlama yakında
          </div>
        </div>
        <div className="rounded-xl bg-[rgba(var(--glass-tint),0.035)] border border-[var(--theme-border)]/15 p-3">
          <div className="text-[9px] text-[var(--theme-secondary-text)]/45">Yorum</div>
          <div className="mt-1 text-[12px] text-[var(--theme-text)]">Yorumlar yakında</div>
        </div>
      </div>

      {metadata.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/55">Detaylar</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {metadata.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-[rgba(var(--glass-tint),0.03)] border border-[var(--theme-border)]/10 px-3 py-2">
                <div className="text-[9px] text-[var(--theme-secondary-text)]/45">{METADATA_LABELS[key] || key}</div>
                <div className="mt-0.5 text-[11px] text-[var(--theme-text)]/85 break-words">{stringFromMetadata(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {item.links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.links.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgba(var(--theme-accent-rgb),0.10)] text-[11px] text-[var(--theme-accent)] hover:bg-[rgba(var(--theme-accent-rgb),0.16)] transition-colors"
            >
              {link.label || 'Bağlantı'}
              <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}

      {(canHide || canDelete) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {canHide && (
            <button
              type="button"
              onClick={onHide}
              className="rounded-lg border border-amber-400/15 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-200 hover:bg-amber-500/15 transition-colors"
            >
              Öneriyi gizle
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-400/15 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300 hover:bg-red-500/15 transition-colors"
            >
              Öneriyi sil
            </button>
          )}
        </div>
      )}
    </div>
  );
}
