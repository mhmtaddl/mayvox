import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, BookmarkPlus, CheckCircle2, ChevronDown, Edit3, ExternalLink, Eye, EyeOff, MessageCircle, Star, Trash2 } from 'lucide-react';
import {
  deleteRecommendationComment,
  deleteRecommendationRating,
  getRecommendationComments,
  getRecommendationRatings,
  setRecommendationUserState,
  setRecommendationRating,
  upsertRecommendationComment,
} from '../../lib/serverService';
import { openExternalUrl } from '../../lib/openExternalUrl';
import type { User } from '../../types';
import type { RecommendationComment, RecommendationItem, RecommendationRating } from './recommendationTypes';
import {
  CATEGORY_LABELS,
  formatRecommendationDate,
  RECOMMENDATION_METADATA_LABELS,
  resolveRecommendationCoverUrl,
  stringFromMetadata,
} from './recommendationTypes';

interface Props {
  serverId: string;
  item: RecommendationItem;
  currentUser: User;
  canDelete: boolean;
  canHide: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onItemChange: (item: RecommendationItem) => void;
  onHide: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onOpenCreatorProfile: (userId: string, position: { x: number; y: number }) => void;
}

function numericMetadata(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function externalRatingClass(score: number): string {
  if (score < 5) return 'border-red-400/18 bg-red-500/8 text-red-200';
  if (score < 7) return 'border-amber-400/20 bg-amber-500/10 text-amber-200';
  if (score < 8.5) return 'border-cyan-300/18 bg-cyan-400/9 text-cyan-100';
  return 'border-emerald-300/22 bg-emerald-400/10 text-emerald-100';
}

function communityRatingClass(score: number | null): string {
  if (score === null) return 'border-[var(--theme-border)]/14 bg-[rgba(var(--glass-tint),0.028)] text-[var(--theme-secondary-text)]/68';
  return externalRatingClass(score);
}

function avatarInitial(name: string | null | undefined): string {
  return (name || 'U').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'U';
}

function formatScore(score: number | null): string {
  if (score === null) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function parseRatingInput(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!/^(10(?:\.0)?|[1-9](?:\.\d)?)$/.test(normalized)) return null;
  const score = Number(normalized);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;
  return Math.round(score * 10) / 10;
}

export default function RecommendationCard({ serverId, item, currentUser, canDelete, canHide, canEdit, onEdit, onItemChange, onHide, onRestore, onDelete, onOpenCreatorProfile }: Props) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [ratings, setRatings] = useState<RecommendationRating[]>([]);
  const [comments, setComments] = useState<RecommendationComment[]>([]);
  const [ratingsLoaded, setRatingsLoaded] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingInput, setRatingInput] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentSpoiler, setCommentSpoiler] = useState(false);
  const [shownSpoilers, setShownSpoilers] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const previousCommentCountRef = useRef(item.commentCount);
  const ratingSaveTimerRef = useRef<number | null>(null);

  const coverSrc = resolveRecommendationCoverUrl(item.coverUrl);
  const showCover = !!coverSrc && !coverFailed;
  const isPoster = item.category === 'film' || item.category === 'series';
  const description = item.description?.trim() || 'Açıklama eklenmemiş.';
  const myRating = ratings.find(r => r.userId === currentUser.id);
  const ownRatingScore = myRating?.score ?? item.myRatingScore ?? null;
  const myComment = comments.find(c => c.createdBy === currentUser.id);
  const averageScore = item.ratingCount > 0 ? item.averageRating : null;

  const summaryRows = useMemo(() => {
    const keysByCategory: Record<string, string[]> = {
      film: ['year', 'durationMinutes', 'genres', 'platform', 'externalRating'],
      series: ['year', 'status', 'seasonCount', 'episodeCount', 'episodeDurationMinutes', 'platform', 'externalRating'],
      game: ['platforms', 'genres', 'playerModes', 'idealPartySize', 'voiceChatFunScore'],
      music: ['artist', 'album', 'releaseYear', 'genre'],
      book: ['author', 'pageCount', 'genre', 'language'],
      hardware: ['brand', 'model', 'hardwareType', 'priceRange'],
    };
    return (keysByCategory[item.category] || [])
      .map(key => {
        const value = stringFromMetadata(item.metadata?.[key]);
        const externalScore = key === 'externalRating' ? numericMetadata(item.metadata?.[key]) : null;
        const labelOverrides: Record<string, string> = {
          seasonCount: 'Sezon',
          episodeCount: 'Bölüm',
          episodeDurationMinutes: 'Bölüm süresi',
          externalRating: item.category === 'film' || item.category === 'series' ? 'IMDb' : 'Dış puan',
        };
        return {
          key,
          label: labelOverrides[key] || RECOMMENDATION_METADATA_LABELS[key] || key,
          value,
          tone: externalScore !== null ? externalRatingClass(externalScore) : '',
        };
      })
      .filter(row => !!row.value)
      .slice(0, 7);
  }, [item.category, item.metadata]);

  const loadRatings = useCallback(async () => {
    if (ratingsLoaded) return;
    const next = await getRecommendationRatings(serverId, item.id);
    setRatings(next);
    setRatingsLoaded(true);
  }, [item.id, ratingsLoaded, serverId]);

  const loadComments = useCallback(async () => {
    if (commentsLoaded) return;
    const next = await getRecommendationComments(serverId, item.id);
    setComments(next);
    const own = next.find(c => c.createdBy === currentUser.id);
    if (own) {
      setCommentBody(own.body);
      setCommentSpoiler(own.isSpoiler);
    }
    setCommentsLoaded(true);
  }, [commentsLoaded, currentUser.id, item.id, serverId]);

  useEffect(() => {
    if (item.ratingCount <= 0 || ratingsLoaded) return;
    void loadRatings().catch(() => {});
  }, [item.ratingCount, loadRatings, ratingsLoaded]);

  useEffect(() => {
    setRatingInput(ownRatingScore !== null ? ownRatingScore.toFixed(1) : '');
  }, [ownRatingScore]);

  useEffect(() => () => {
    if (ratingSaveTimerRef.current !== null) window.clearTimeout(ratingSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (ratingSaveTimerRef.current !== null) {
      window.clearTimeout(ratingSaveTimerRef.current);
      ratingSaveTimerRef.current = null;
    }
    const score = parseRatingInput(ratingInput);
    if (score === null || score === ownRatingScore || ratingBusy) return;
    ratingSaveTimerRef.current = window.setTimeout(() => {
      void submitRating(score);
    }, 650);
  }, [ownRatingScore, ratingBusy, ratingInput]);

  useEffect(() => {
    if (!commentsOpen || !commentsLoaded || previousCommentCountRef.current === item.commentCount) return;
    previousCommentCountRef.current = item.commentCount;
    void getRecommendationComments(serverId, item.id)
      .then(next => {
        setComments(next);
        const own = next.find(c => c.createdBy === currentUser.id);
        if (own) {
          setCommentBody(own.body);
          setCommentSpoiler(own.isSpoiler);
        }
      })
      .catch(() => {});
  }, [currentUser.id, commentsLoaded, commentsOpen, item.commentCount, item.id, serverId]);

  const toggleRatings = async () => {
    const nextOpen = !ratingsOpen;
    setRatingsOpen(nextOpen);
    if (nextOpen) {
      try { await loadRatings(); } catch (err) { setError(err instanceof Error ? err.message : 'Puanlar alınamadı'); }
    }
  };

  const toggleComments = async () => {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (!nextOpen) setShownSpoilers(new Set());
    if (nextOpen) {
      try { await loadComments(); } catch (err) { setError(err instanceof Error ? err.message : 'Yorumlar alınamadı'); }
    }
  };

  const submitRating = async (score: number) => {
    setRatingBusy(true);
    setError(null);
    try {
      const result = await setRecommendationRating(serverId, item.id, score);
      onItemChange(result.item);
      setRatingsLoaded(false);
      const next = await getRecommendationRatings(serverId, item.id);
      setRatings(next);
      setRatingsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Puan kaydedilemedi');
    } finally {
      setRatingBusy(false);
    }
  };

  const submitRatingInput = async () => {
    const score = parseRatingInput(ratingInput);
    if (score === null) {
      setError('Puan 1.0 ile 10.0 arasında olmalı');
      return;
    }
    await submitRating(Math.round(score * 10) / 10);
  };

  const clearRating = async () => {
    setRatingBusy(true);
    setError(null);
    try {
      const result = await deleteRecommendationRating(serverId, item.id);
      onItemChange(result.item);
      setRatings(prev => prev.filter(r => r.userId !== currentUser.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Puan kaldırılamadı');
    } finally {
      setRatingBusy(false);
    }
  };

  const toggleWatched = async () => {
    setStateBusy(true);
    setError(null);
    try {
      const result = await setRecommendationUserState(serverId, item.id, { isWatched: !item.myWatched });
      onItemChange(result.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İzledim durumu kaydedilemedi');
    } finally {
      setStateBusy(false);
    }
  };

  const toggleWatchlist = async () => {
    setStateBusy(true);
    setError(null);
    try {
      const result = await setRecommendationUserState(serverId, item.id, { isWatchlisted: !item.myWatchlisted });
      onItemChange(result.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İzleme listesi güncellenemedi');
    } finally {
      setStateBusy(false);
    }
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body) {
      setError('Yorum boş olamaz');
      return;
    }
    setCommentBusy(true);
    setError(null);
    try {
      const result = await upsertRecommendationComment(serverId, item.id, { body, isSpoiler: commentSpoiler });
      onItemChange(result.item);
      setComments(prev => [result.comment, ...prev.filter(c => c.id !== result.comment.id)]);
      setCommentsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yorum kaydedilemedi');
    } finally {
      setCommentBusy(false);
    }
  };

  const removeComment = async (comment: RecommendationComment) => {
    setCommentBusy(true);
    setError(null);
    try {
      const result = await deleteRecommendationComment(serverId, item.id, comment.id);
      onItemChange(result.item);
      setComments(prev => prev.filter(c => c.id !== comment.id));
      if (comment.createdBy === currentUser.id) {
        setCommentBody('');
        setCommentSpoiler(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yorum silinemedi');
    } finally {
      setCommentBusy(false);
    }
  };

  return (
    <article
      className="w-full rounded-2xl border border-[var(--theme-border)]/22 bg-[var(--theme-surface)]/50 p-3.5 text-left transition-all hover:border-[rgba(var(--theme-accent-rgb),0.18)] hover:bg-[var(--theme-surface)]/72"
      style={{ boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.055), 0 14px 34px rgba(0,0,0,0.08)' }}
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <div className={`${isPoster ? 'w-[86px]' : 'w-[126px]'} shrink-0`}>
          <div className={`${isPoster ? 'h-[118px] w-[86px]' : 'h-[98px] w-[126px]'} overflow-hidden rounded-xl border border-[var(--theme-border)]/20 bg-[rgba(var(--glass-tint),0.045)] flex items-center justify-center`}>
            {showCover ? (
              <img src={coverSrc} alt="" className="h-full w-full object-cover object-center" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-[var(--theme-secondary-text)]/42">
                <Bookmark size={20} />
                <span className="text-[9px] font-medium">{CATEGORY_LABELS[item.category]}</span>
              </div>
            )}
          </div>
          {(canEdit || canHide || canDelete) && (
            <div className="mt-1.5 flex items-center justify-center gap-1">
              {canEdit && (
                <button type="button" title="Düzenle" onClick={onEdit} className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/48 transition-colors hover:text-[var(--theme-accent)]">
                  <Edit3 size={11} />
                </button>
              )}
              {canHide && (
                <button
                  type="button"
                  title={item.status === 'hidden' ? 'Gizliliği kaldır' : 'Gizle'}
                  onClick={item.status === 'hidden' ? onRestore : onHide}
                  className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                    item.status === 'hidden'
                      ? 'text-amber-300/85 hover:text-emerald-300'
                      : 'text-[var(--theme-secondary-text)]/48 hover:text-amber-300'
                  }`}
                >
                  {item.status === 'hidden' ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
              )}
              {canDelete && (
                <button type="button" title="Sil" onClick={onDelete} className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/48 transition-colors hover:text-red-300">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[rgba(var(--theme-accent-rgb),0.11)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                  {CATEGORY_LABELS[item.category]}
                </span>
                <button type="button" onClick={event => onOpenCreatorProfile(item.createdBy, { x: event.clientX, y: event.clientY })} className="group inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 text-[10px] text-[var(--theme-secondary-text)]/58 transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.06)] hover:text-[var(--theme-accent)]">
                  {item.createdByAvatar ? (
                    <img src={item.createdByAvatar} alt="" className="h-4 w-4 shrink-0 rounded-[5px] object-cover ring-1 ring-[rgba(var(--theme-accent-rgb),0.16)]" />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-[rgba(var(--glass-tint),0.06)] text-[8px] font-semibold ring-1 ring-[rgba(var(--theme-accent-rgb),0.12)]">{avatarInitial(item.createdByName)}</span>
                  )}
                  <span className="max-w-[120px] truncate font-medium underline-offset-2 group-hover:underline">{item.createdByName || 'Bir üye'}</span>
                  <span className="shrink-0 text-[var(--theme-secondary-text)]/38">{formatRecommendationDate(item.createdAt)}</span>
                </button>
                {item.status !== 'active' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                    <EyeOff size={9} />
                    Gizli
                  </span>
                )}
              </div>
              <h3 className="text-[15px] font-semibold leading-5 text-[var(--theme-text)] line-clamp-2">{item.title}</h3>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void toggleWatchlist()}
                disabled={stateBusy}
                title={item.myWatchlisted ? 'İzleme listemden çıkar' : 'İzleme listeme ekle'}
                aria-label={item.myWatchlisted ? 'İzleme listemden çıkar' : 'İzleme listeme ekle'}
                className={`inline-flex h-8 w-7 items-center justify-center transition-colors disabled:opacity-35 ${item.myWatchlisted ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/58 hover:text-[var(--theme-accent)]'}`}
              >
                <BookmarkPlus size={14} />
              </button>
              <button
                type="button"
                onClick={() => void toggleWatched()}
                disabled={stateBusy}
                title={item.myWatched ? 'İzledim işaretini kaldır' : 'Bu diziyi/filmi izledim'}
                aria-label={item.myWatched ? 'İzledim işaretini kaldır' : 'Bu diziyi/filmi izledim'}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-[10px] font-semibold transition-colors disabled:opacity-40 ${item.myWatched ? 'text-emerald-200' : 'text-[var(--theme-secondary-text)]/58 hover:text-emerald-200'}`}
              >
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{item.watchedCount}</span>
              </button>
              <div className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold ${communityRatingClass(averageScore)}`}>
                <Star size={12} className="shrink-0" />
                <span>{formatScore(averageScore)}</span>
                <span className="text-[9px] font-medium opacity-65">{item.ratingCount} oy</span>
              </div>
            </div>
          </div>

          <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-[var(--theme-secondary-text)]/72">{description}</p>
          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.slice(0, 4).map(tag => <span key={tag} className="rounded-md bg-[rgba(var(--glass-tint),0.045)] px-1.5 py-0.5 text-[9px] text-[var(--theme-secondary-text)]/62">#{tag}</span>)}
            </div>
          )}
          {(summaryRows.length > 0 || item.links.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {summaryRows.map(row => (
                <span key={row.key} className={`inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--theme-border)]/12 bg-[rgba(var(--glass-tint),0.032)] px-2 py-1 text-[11px] leading-4 text-[var(--theme-secondary-text)]/76 ${row.tone || ''}`}>
                  <span className="font-medium text-[var(--theme-secondary-text)]/50">{row.label}</span>
                  <span className="truncate font-semibold text-[var(--theme-text)]/88">{row.value}</span>
                </span>
              ))}
              {item.links.map((link, index) => (
                <button
                  type="button"
                  key={`${link.url}-${index}`}
                  onClick={() => openExternalUrl(link.url)}
                  title={link.label || 'Bağlantıyı aç'}
                  aria-label={link.label || 'Bağlantıyı aç'}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--theme-secondary-text)]/58 transition-colors hover:text-[var(--theme-accent)]"
                >
                  <ExternalLink size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[rgba(var(--glass-tint),0.055)] pt-2.5">
        <button type="button" onClick={toggleComments} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-1 text-[10px] font-medium text-[var(--theme-secondary-text)]/66 transition-colors hover:text-[var(--theme-text)]">
          <MessageCircle size={12} className="shrink-0" />
          <span>{item.commentCount} yorum</span>
          <ChevronDown size={12} className={`shrink-0 transition-transform ${commentsOpen ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={toggleRatings} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[10px] text-[var(--theme-secondary-text)]/66 hover:text-[var(--theme-text)]">
          Puanlar <ChevronDown size={12} className={`transition-transform ${ratingsOpen ? 'rotate-180' : ''}`} />
        </button>
        <span className="relative inline-flex h-6 w-[62px] items-center">
          <input
            type="text"
            inputMode="decimal"
            disabled={ratingBusy}
            value={ratingInput}
            onChange={event => {
              const value = event.target.value.replace(',', '.');
              if (value === '' || /^(10(?:\.0?)?|[1-9](?:\.\d?)?)$/.test(value)) setRatingInput(value);
            }}
            onBlur={() => {
              const score = parseRatingInput(ratingInput);
              if (score !== null) {
                setRatingInput(score.toFixed(1));
                if (score !== ownRatingScore) void submitRating(score);
              }
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitRatingInput();
              }
            }}
            placeholder="1.0"
            className="h-6 w-full rounded-md border border-[var(--theme-border)]/12 bg-transparent py-0 pl-1.5 pr-5 text-[10px] text-[var(--theme-text)] outline-none [appearance:textfield] placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.30)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {ownRatingScore !== null && (
            <button type="button" title="Puanı kaldır" aria-label="Puanı kaldır" onClick={() => void clearRating()} disabled={ratingBusy} className="absolute right-1 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-white/72 transition-colors hover:text-red-300 disabled:opacity-35">
              <Trash2 size={10} />
            </button>
          )}
        </span>
      </div>

      {ratingsOpen && (
        <div className="mt-2 grid max-h-32 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl bg-[rgba(var(--glass-tint),0.025)] p-2 sm:grid-cols-2 lg:grid-cols-3">
          {ratings.length === 0 ? <div className="col-span-full text-[11px] text-[var(--theme-secondary-text)]/50">Henüz puan yok.</div> : ratings.map(r => (
            <div key={r.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--theme-border)]/10 bg-[rgba(var(--shadow-base),0.07)] px-2 py-1.5 text-[11px]">
              {r.userAvatar ? <img src={r.userAvatar} alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--glass-tint),0.06)] text-[10px] font-semibold text-[var(--theme-text)]/76">{avatarInitial(r.userName)}</span>}
              <span className="min-w-0 flex-1 truncate text-[var(--theme-secondary-text)]/76">{r.userName || 'Bir üye'}</span>
              <span className="shrink-0 font-semibold text-[var(--theme-text)]">{r.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      {commentsOpen && (
        <div className="mt-3 rounded-xl border border-[var(--theme-border)]/14 bg-[rgba(var(--glass-tint),0.025)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-[var(--theme-text)]">Yorumlar <span className="text-[var(--theme-secondary-text)]/45">{item.commentCount}</span></div>
            <button type="button" onClick={() => void loadComments()} className="text-[10px] text-[var(--theme-secondary-text)]/56 hover:text-[var(--theme-text)]">Yenile</button>
          </div>
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {comments.length === 0 ? <div className="text-[11px] text-[var(--theme-secondary-text)]/50">Henüz yorum yok.</div> : comments.map(comment => {
              const spoilerVisible = shownSpoilers.has(comment.id);
              const canRemove = comment.createdBy === currentUser.id || canHide;
              return (
                <div key={comment.id} className="rounded-lg bg-[rgba(var(--shadow-base),0.08)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {comment.createdByAvatar ? <img src={comment.createdByAvatar} alt="" className="h-6 w-6 rounded-lg object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(var(--glass-tint),0.06)] text-[10px] font-semibold">{avatarInitial(comment.createdByName)}</span>}
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-medium text-[var(--theme-text)]">{comment.createdByName || 'Bir üye'}</span>
                        <span className="block text-[9px] text-[var(--theme-secondary-text)]/45">{formatRecommendationDate(comment.createdAt)}</span>
                      </span>
                    </div>
                    {canRemove && <button type="button" onClick={() => void removeComment(comment)} className="rounded-md p-1 text-[var(--theme-secondary-text)]/42 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={12} /></button>}
                  </div>
                  {comment.isSpoiler && !spoilerVisible ? (
                    <button type="button" onClick={() => setShownSpoilers(prev => new Set(prev).add(comment.id))} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                      <Eye size={11} /> Bu yorum spoiler içeriyor - göster
                    </button>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[var(--theme-secondary-text)]/78">{comment.body}</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 space-y-2 border-t border-[rgba(var(--glass-tint),0.05)] pt-3">
            <textarea value={commentBody} onChange={e => setCommentBody(e.target.value)} maxLength={2000} className="h-20 w-full resize-none rounded-xl border border-[var(--theme-border)]/16 bg-[rgba(var(--shadow-base),0.10)] px-3 py-2 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 focus:outline-none focus:border-[rgba(var(--theme-accent-rgb),0.32)]" placeholder={myComment ? 'Yorumunu düzenle' : 'Yorum yaz'} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setCommentSpoiler(prev => !prev)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] transition-colors ${commentSpoiler ? 'border-amber-400/22 bg-amber-500/10 text-amber-200' : 'border-[var(--theme-border)]/14 text-[var(--theme-secondary-text)]/62 hover:text-[var(--theme-text)]'}`}>
                Spoiler içeriyor
              </button>
              <button type="button" onClick={() => void submitComment()} disabled={commentBusy || !commentBody.trim()} className="rounded-xl border border-[rgba(var(--theme-accent-rgb),0.20)] bg-[rgba(var(--theme-accent-rgb),0.10)] px-3 py-1.5 text-[11px] font-semibold text-[var(--theme-accent)] disabled:opacity-45">
                {myComment ? 'Güncelle' : 'Yorumla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mt-3 rounded-xl border border-red-400/14 bg-red-500/8 px-3 py-2 text-[11px] text-red-200">{error}</div>}
    </article>
  );
}
