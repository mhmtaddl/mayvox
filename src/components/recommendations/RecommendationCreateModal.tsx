import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  ChevronDown,
  Clapperboard,
  Gamepad2,
  Gauge,
  ImagePlus,
  Info,
  Link2,
  MoreHorizontal,
  Music2,
  Sparkles,
  Tag,
  Tv,
  UploadCloud,
  X,
} from 'lucide-react';
import type { RecommendationCategory, RecommendationItem, RecommendationLink, RecommendationPayload } from './recommendationTypes';
import type { User } from '../../types';
import { uploadRecommendationCover } from '../../lib/serverService';

const inputCls = 'w-full h-8 rounded-xl px-3 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 focus:outline-none transition-all border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] focus:border-[rgba(var(--theme-accent-rgb),0.34)] focus:shadow-[0_0_0_3px_rgba(var(--theme-accent-rgb),0.07),inset_0_1px_0_rgba(var(--glass-tint),0.045)]';
const numberInputCls = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const labelCls = 'block text-[10px] font-medium text-[var(--theme-secondary-text)]/72 mb-1';
const panelCls = 'rounded-2xl border border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--glass-tint),0.022)]';
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const EMPTY_LINK_URLS = ['', '', '', ''];

interface MetadataField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'boolean';
  placeholder?: string;
}

const METADATA_FIELDS: Record<RecommendationCategory, MetadataField[]> = {
  film: [
    { key: 'year', label: 'Yıl', type: 'number', placeholder: '2024' },
    { key: 'durationMinutes', label: 'Süre/dakika', type: 'number', placeholder: '169' },
    { key: 'genres', label: 'Türler', placeholder: 'Bilim Kurgu, Dram' },
    { key: 'director', label: 'Yönetmen', placeholder: 'Christopher Nolan' },
    { key: 'cast', label: 'Oyuncular', placeholder: 'Ana kadro' },
    { key: 'platform', label: 'Platform', placeholder: 'Netflix, Prime...' },
    { key: 'externalRating', label: 'IMDb puanı', placeholder: '8.7' },
  ],
  series: [
    { key: 'year', label: 'Yıl', type: 'number', placeholder: '2023' },
    { key: 'status', label: 'Durum', placeholder: 'Devam ediyor / Bitti' },
    { key: 'seasonCount', label: 'Sezon sayısı', type: 'number', placeholder: '2' },
    { key: 'episodeCount', label: 'Toplam bölüm', type: 'number', placeholder: '18' },
    { key: 'episodeDurationMinutes', label: 'Bölüm süresi/dakika', type: 'number', placeholder: '45' },
    { key: 'platform', label: 'Platform', placeholder: 'HBO, Netflix...' },
    { key: 'episodesPerSeason', label: 'Sezon başı bölüm', type: 'number', placeholder: '8' },
    { key: 'genres', label: 'Türler', placeholder: 'Dram, Gizem' },
    { key: 'externalRating', label: 'IMDb puanı', placeholder: '8.4' },
  ],
  game: [
    { key: 'platforms', label: 'Platformlar', placeholder: 'PC, PlayStation' },
    { key: 'genres', label: 'Türler', placeholder: 'Shooter, RPG' },
    { key: 'playerModes', label: 'Oyuncu modu', placeholder: 'Co-op, Multiplayer' },
    { key: 'idealPartySize', label: 'İdeal kişi sayısı', type: 'number', placeholder: '4' },
    { key: 'voiceChatFunScore', label: 'Sesli sohbet puanı', type: 'number', placeholder: '1-10' },
    { key: 'storeLink', label: 'Mağaza linki', placeholder: 'https://...' },
    { key: 'onlineRequired', label: 'Online gerekli', type: 'boolean' },
    { key: 'crossplay', label: 'Crossplay', type: 'boolean' },
    { key: 'freeToPlay', label: 'Ücretsiz', type: 'boolean' },
  ],
  music: [
    { key: 'artist', label: 'Sanatçı', placeholder: 'Daft Punk' },
    { key: 'album', label: 'Albüm / single', placeholder: 'Random Access Memories' },
    { key: 'releaseYear', label: 'Yıl', type: 'number', placeholder: '2013' },
    { key: 'genre', label: 'Tür', placeholder: 'Elektronik' },
    { key: 'durationSeconds', label: 'Süre', type: 'number', placeholder: '240' },
    { key: 'moodTags', label: 'Ruh hali', placeholder: 'Chill, odak' },
    { key: 'platformLink', label: 'Platform linki', placeholder: 'https://...' },
  ],
  book: [
    { key: 'author', label: 'Yazar', placeholder: 'Frank Herbert' },
    { key: 'pageCount', label: 'Sayfa sayısı', type: 'number', placeholder: '688' },
    { key: 'genre', label: 'Tür', placeholder: 'Bilim Kurgu' },
    { key: 'language', label: 'Dil', placeholder: 'Türkçe' },
    { key: 'seriesName', label: 'Seri adı', placeholder: 'Dune' },
    { key: 'readingLevel', label: 'Okuma seviyesi', placeholder: 'Orta' },
    { key: 'estimatedReadHours', label: 'Tahmini okuma süresi', type: 'number', placeholder: '14' },
  ],
  hardware: [
    { key: 'brand', label: 'Marka', placeholder: 'Logitech' },
    { key: 'model', label: 'Model', placeholder: 'G Pro X' },
    { key: 'hardwareType', label: 'Donanım türü', placeholder: 'Kulaklık' },
    { key: 'priceRange', label: 'Fiyat aralığı', placeholder: '3000-5000 TL' },
    { key: 'useCase', label: 'Kullanım amacı', placeholder: 'FPS, yayın, ofis' },
    { key: 'pros', label: 'Artılar', placeholder: 'Hafif, rahat' },
    { key: 'cons', label: 'Eksiler', placeholder: 'Kablosu sert' },
    { key: 'purchaseLink', label: 'Satın alma linki', placeholder: 'https://...' },
  ],
};

const CATEGORY_META: Record<RecommendationCategory, { label: string; description: string; icon: React.ElementType }> = {
  film: { label: 'Film', description: 'Yapım', icon: Clapperboard },
  series: { label: 'Dizi', description: 'Sezon', icon: Tv },
  game: { label: 'Oyun', description: 'Parti', icon: Gamepad2 },
  music: { label: 'Müzik', description: 'Yakında', icon: Music2 },
  book: { label: 'Kitap', description: 'Yakında', icon: BookOpen },
  hardware: { label: 'Donanım', description: 'Yakında', icon: MoreHorizontal },
};

const CATEGORY_OPTIONS: Array<{
  id: RecommendationCategory | 'more';
  label: string;
  description: string;
  icon: React.ElementType;
  disabled?: boolean;
  tone: string;
  selectedTone: string;
  iconTone: string;
}> = [
  {
    id: 'film',
    label: 'Film',
    description: 'Yapım',
    icon: Clapperboard,
    tone: 'hover:border-cyan-300/25 hover:bg-cyan-400/[0.045]',
    selectedTone: 'border-cyan-300/45 bg-cyan-400/[0.10] shadow-[0_0_0_1px_rgba(103,232,249,0.10),0_8px_18px_rgba(8,145,178,0.10)]',
    iconTone: 'text-cyan-200 bg-cyan-400/10',
  },
  {
    id: 'series',
    label: 'Dizi',
    description: 'Sezon',
    icon: Tv,
    tone: 'hover:border-violet-300/25 hover:bg-violet-400/[0.045]',
    selectedTone: 'border-violet-300/45 bg-violet-400/[0.10] shadow-[0_0_0_1px_rgba(196,181,253,0.10),0_8px_18px_rgba(124,58,237,0.10)]',
    iconTone: 'text-violet-200 bg-violet-400/10',
  },
  {
    id: 'game',
    label: 'Oyun',
    description: 'Parti',
    icon: Gamepad2,
    tone: 'hover:border-emerald-300/25 hover:bg-emerald-400/[0.045]',
    selectedTone: 'border-emerald-300/45 bg-emerald-400/[0.10] shadow-[0_0_0_1px_rgba(110,231,183,0.10),0_8px_18px_rgba(16,185,129,0.10)]',
    iconTone: 'text-emerald-200 bg-emerald-400/10',
  },
];

const TAG_SUGGESTIONS: Record<RecommendationCategory, string[]> = {
  film: ['Aksiyon', 'Macera', 'Animasyon', 'Komedi', 'Suç', 'Belgesel', 'Dram', 'Aile', 'Fantastik', 'Tarih', 'Korku', 'Gizem', 'Psikolojik', 'Müzik', 'Romantik', 'Bilim Kurgu', 'Gerilim', 'Savaş', 'Western'],
  series: ['Aksiyon & Macera', 'Animasyon', 'Komedi', 'Suç', 'Belgesel', 'Dram', 'Aile', 'Çocuk', 'Korku', 'Gizem', 'Psikolojik', 'Reality', 'Bilim Kurgu & Fantastik', 'Savaş & Politik', 'Western'],
  game: ['Action', 'Adventure', 'RPG', 'Strategy', 'Shooter', 'Puzzle', 'Racing', 'Sports', 'Simulation', 'Indie', 'Casual', 'Arcade', 'Platformer', 'Fighting', 'MMO'],
  music: ['Pop', 'Rock', 'Rap/Hip-Hop', 'Elektronik', 'Metal', 'Jazz', 'Klasik', 'Lo-fi', 'R&B', 'Alternatif', 'Indie', 'Soundtrack', 'Chill', 'Gaz', 'Hüzünlü', 'Odak', 'Gece', 'Spor', 'Yol', 'Oyun'],
  book: ['Roman', 'Bilim Kurgu', 'Fantastik', 'Polisiye', 'Gerilim', 'Tarih', 'Biyografi', 'Kişisel Gelişim', 'Psikoloji', 'Felsefe', 'Bilim', 'Çocuk', 'Genç Yetişkin', 'Çizgi Roman', 'Manga'],
  hardware: ['Kulaklık', 'Mikrofon', 'Klavye', 'Mouse', 'Monitör', 'Ekran kartı', 'İşlemci', 'Anakart', 'RAM', 'SSD', 'Kasa', 'Kamera', 'Oyun kolu'],
};

const DETAIL_FIELD_KEYS: Record<RecommendationCategory, string[]> = {
  film: ['year', 'durationMinutes', 'genres', 'platform', 'externalRating'],
  series: ['year', 'status', 'seasonCount', 'episodeCount', 'episodeDurationMinutes', 'platform', 'externalRating'],
  game: ['platforms', 'genres', 'playerModes', 'idealPartySize', 'voiceChatFunScore', 'storeLink'],
  music: ['artist', 'album', 'releaseYear', 'genre'],
  book: ['author', 'pageCount', 'genre', 'language'],
  hardware: ['brand', 'model', 'hardwareType', 'priceRange'],
};

interface Props {
  open: boolean;
  loading: boolean;
  serverId?: string;
  mode?: 'create' | 'edit';
  initialItem?: RecommendationItem | null;
  currentUser?: User;
  onClose: () => void;
  onSubmit: (payload: RecommendationPayload) => Promise<void>;
}

function parseTags(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function hasMetadataValue(value: string | boolean | undefined): boolean {
  return typeof value === 'boolean' ? value : !!value?.trim();
}

function recommendationErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/endpoint bulunamadı|not found|404/i.test(message)) {
    return 'Keşif altyapısı bu backend sürümünde aktif değil. Backend güncellenince öneri ekleme çalışacak.';
  }
  return message || 'Öneri eklenemedi';
}

function isActiveCategory(value: RecommendationCategory): value is 'film' | 'series' | 'game' {
  return value === 'film' || value === 'series' || value === 'game';
}

function parseDecimalScore(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!/^(10(?:\.0)?|[1-9](?:\.\d)?)$/.test(trimmed)) return null;
  const score = Number(trimmed);
  return Number.isFinite(score) && score >= 1 && score <= 10 ? Math.round(score * 10) / 10 : null;
}

function isScoreDraft(value: string): boolean {
  return value === '' || /^(10(?:\.0?)?|[1-9](?:\.\d?)?)$/.test(value.replace(',', '.'));
}

export default function RecommendationCreateModal({ open, loading, serverId, mode = 'create', initialItem, currentUser, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RecommendationCategory>('film');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkUrls, setLinkUrls] = useState<string[]>(EMPTY_LINK_URLS);
  const [metadata, setMetadata] = useState<Record<string, string | boolean>>({});
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverFileName, setCoverFileName] = useState('');
  const [coverFileNote, setCoverFileNote] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<'uploading' | 'creating' | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const fields = useMemo(() => METADATA_FIELDS[category], [category]);
  const tags = useMemo(() => parseTags(tagsRaw), [tagsRaw]);
  const detailFields = useMemo(() => {
    const keys = new Set(DETAIL_FIELD_KEYS[category]);
    return fields.filter(field => keys.has(field.key));
  }, [category, fields]);
  const categoryMeta = CATEGORY_META[category];
  const CategoryIcon = categoryMeta.icon;
  const activeCover = coverPreviewUrl || coverUrl.trim();
  const isPosterPreview = category === 'film' || category === 'series';
  const authorName = currentUser?.displayName || currentUser?.name || 'Sen';
  const authorAvatar = currentUser?.avatar || '';
  const authorInitial = authorName.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'S';
  const usesMultiLinks = category === 'film' || category === 'series';
  const hasAnyLink = usesMultiLinks ? linkUrls.some(url => url.trim()) : !!linkUrl.trim();
  const isGenreSatisfied = (field: MetadataField) => field.key === 'genres' && (hasMetadataValue(metadata.genres) || tags.length > 0);
  const filledMetadata = detailFields.filter(field => isGenreSatisfied(field) || hasMetadataValue(metadata[field.key])).length;
  const metadataPreview = fields
    .filter(field => hasMetadataValue(metadata[field.key]))
    .slice(0, 2)
    .map(field => ({ label: field.label, value: String(metadata[field.key]) }));
  const busy = loading || submitStage !== null;
  const isEditMode = mode === 'edit' && !!initialItem;

  const qualityScore = useMemo(() => {
    const metadataRatio = detailFields.length ? filledMetadata / detailFields.length : 0;
    const score =
      (title.trim() ? 16 : 0) +
      (description.trim() ? 16 : 0) +
      (activeCover ? 16 : 0) +
      (tags.length > 0 ? 14 : 0) +
      (hasAnyLink ? 10 : 0) +
      Math.round(metadataRatio * 28);
    return Math.min(100, score);
  }, [activeCover, description, detailFields.length, filledMetadata, hasAnyLink, tags.length, title]);

  const clearLocalCover = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setCoverPreviewUrl(null);
    setCoverFile(null);
    setCoverFileName('');
    setCoverFileNote(null);
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setCategory('film');
    setDescription('');
    setCoverUrl('');
    setTagsRaw('');
    setLinkLabel('');
    setLinkUrl('');
    setLinkUrls([...EMPTY_LINK_URLS]);
    setMetadata({});
    setShowTags(false);
    setError(null);
    clearLocalCover();
  }, [clearLocalCover]);

  const handleClose = useCallback(() => {
    if (busy) return;
    resetForm();
    onClose();
  }, [busy, onClose, resetForm]);

  useEffect(() => clearLocalCover, [clearLocalCover]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, open]);

  useEffect(() => {
    if (open && !isActiveCategory(category)) {
      setCategory('film');
      setMetadata({});
    }
  }, [category, open]);

  useEffect(() => {
    if (!open || !initialItem) return;
    setTitle(initialItem.title || '');
    setCategory(initialItem.category);
    setDescription(initialItem.description || '');
    setCoverUrl(initialItem.coverUrl || '');
    setTagsRaw((initialItem.tags || []).join(', '));
    const firstLink = initialItem.links?.[0];
    setLinkLabel(firstLink?.label || '');
    setLinkUrl(firstLink?.url || '');
    setLinkUrls(EMPTY_LINK_URLS.map((_, index) => initialItem.links?.[index]?.url || ''));
    const nextMetadata: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(initialItem.metadata || {})) {
      nextMetadata[key] = typeof value === 'boolean' ? value : String(value ?? '');
    }
    setMetadata(nextMetadata);
    setShowTags(false);
    setError(null);
    clearLocalCover();
  }, [clearLocalCover, initialItem, open]);

  if (!open) return null;

  const setMeta = (key: string, value: string | boolean) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  };

  const handleCoverFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Kapak için sadece görsel dosyası seçebilirsin.');
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError('Kapak görseli 5MB altında olmalı.');
      return;
    }
    clearLocalCover();
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setCoverPreviewUrl(nextUrl);
    setCoverFile(file);
    setCoverFileName(file.name);
    setCoverFileNote(coverUrl.trim() ? 'Dosya seçili; kayıtta URL yerine bu dosya kullanılacak.' : 'Dosya seçili; öneri eklenirken yüklenecek.');
    setError(null);
  };

  const toggleTag = (tag: string) => {
    const current = parseTags(tagsRaw);
    const exists = current.some(t => t.toLocaleLowerCase('tr-TR') === tag.toLocaleLowerCase('tr-TR'));
    const next = exists ? current.filter(t => t.toLocaleLowerCase('tr-TR') !== tag.toLocaleLowerCase('tr-TR')) : [...current, tag];
    setTagsRaw(next.join(', '));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Başlık gerekli');
      return;
    }

    const links: RecommendationLink[] = usesMultiLinks
      ? linkUrls
          .map(url => url.trim())
          .filter(Boolean)
          .slice(0, 4)
          .map((url, index) => ({ label: `Bağlantı ${index + 1}`, url }))
      : linkUrl.trim() ? [{ label: linkLabel.trim() || 'Bağlantı', url: linkUrl.trim() }] : [];
    const cleanMetadata: Record<string, unknown> = {};
    for (const field of fields) {
      const value = metadata[field.key];
      if (typeof value === 'boolean') {
        cleanMetadata[field.key] = value;
      } else if (typeof value === 'string' && value.trim()) {
        if (field.key === 'externalRating' || field.key === 'voiceChatFunScore') {
          const score = parseDecimalScore(value);
          if (score === null) {
            setError(`${field.label} 1.0 ile 10.0 arasında olmalı`);
            return;
          }
          cleanMetadata[field.key] = score;
        } else {
          cleanMetadata[field.key] = field.type === 'number' ? Number(value) || value.trim() : value.trim();
        }
      }
    }

    try {
      setError(null);
      let finalCoverUrl = coverUrl.trim() || undefined;
      if (coverFile) {
        if (!serverId) throw new Error('Sunucu seçili değil');
        setSubmitStage('uploading');
        finalCoverUrl = await uploadRecommendationCover(serverId, coverFile);
      }
      setSubmitStage('creating');
      await onSubmit({
        title: cleanTitle,
        category,
        description: description.trim() || undefined,
        coverUrl: finalCoverUrl,
        tags,
        links,
        metadata: cleanMetadata,
      });
      resetForm();
    } catch (err) {
      setError(recommendationErrorMessage(err));
    } finally {
      setSubmitStage(null);
    }
  };

  const renderField = (field: MetadataField) => (
    field.type === 'boolean' ? (
      <button
        key={field.key}
        type="button"
        onClick={() => setMeta(field.key, metadata[field.key] !== true)}
        className={`flex h-8 items-center justify-between gap-3 rounded-xl border px-3 text-left transition-all ${
          metadata[field.key] === true
            ? 'border-[rgba(var(--theme-accent-rgb),0.32)] bg-[rgba(var(--theme-accent-rgb),0.095)] text-[var(--theme-accent)]'
            : 'border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--shadow-base),0.10)] text-[var(--theme-secondary-text)]/72 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'
        }`}
      >
        <span className="text-[11px] font-medium">{field.label}</span>
        <span className={`h-4 w-8 rounded-full p-0.5 transition-colors ${metadata[field.key] === true ? 'bg-[rgba(var(--theme-accent-rgb),0.32)]' : 'bg-[rgba(var(--glass-tint),0.10)]'}`}>
          <span className={`block h-3 w-3 rounded-full bg-current transition-transform ${metadata[field.key] === true ? 'translate-x-4' : 'translate-x-0'}`} />
        </span>
      </button>
    ) : (
      <label key={field.key}>
        <span className={labelCls}>{field.label}</span>
        <input
          type={field.key === 'externalRating' || field.key === 'voiceChatFunScore' ? 'text' : field.type === 'number' ? 'number' : 'text'}
          inputMode={field.key === 'externalRating' || field.key === 'voiceChatFunScore' ? 'decimal' : undefined}
          min={field.type === 'number' && field.key !== 'externalRating' && field.key !== 'voiceChatFunScore' ? 0 : undefined}
          max={undefined}
          value={typeof metadata[field.key] === 'string' ? metadata[field.key] as string : ''}
          onChange={e => {
            if (field.key === 'externalRating' || field.key === 'voiceChatFunScore') {
              const value = e.target.value.replace(',', '.');
              if (isScoreDraft(value)) setMeta(field.key, value);
              return;
            }
            if (field.type !== 'number') {
              setMeta(field.key, e.target.value);
              return;
            }
            const raw = e.target.value;
            if (!raw || raw.includes('-')) {
              setMeta(field.key, '');
              return;
            }
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) {
              setMeta(field.key, '');
              return;
            }
            const capped = field.key === 'voiceChatFunScore' ? Math.min(10, parsed) : parsed;
            setMeta(field.key, String(Math.max(0, capped)));
          }}
          onBlur={() => {
            if (field.key !== 'externalRating' && field.key !== 'voiceChatFunScore') return;
            const value = typeof metadata[field.key] === 'string' ? metadata[field.key] as string : '';
            if (!value.trim()) return;
            const score = parseDecimalScore(value);
            if (score === null) {
              setError(`${field.label} 1.0 ile 10.0 arasında olmalı`);
              return;
            }
            setError(null);
            setMeta(field.key, score.toFixed(1));
          }}
          className={`${inputCls} ${field.type === 'number' ? numberInputCls : ''}`}
          placeholder={field.placeholder || 'İsteğe bağlı'}
        />
      </label>
    )
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 bg-black/40 backdrop-blur-[1.5px]"
      onMouseDown={event => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={event => event.stopPropagation()}
        className="w-full max-w-[1080px] max-h-[92vh] overflow-y-auto xl:overflow-hidden rounded-[24px] border border-[var(--theme-border)]/18 p-3 shadow-sm shadow-black/10"
        style={{
          background:
            'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.025)), color-mix(in srgb, color-mix(in srgb, rgb(var(--theme-bg-rgb)) 88%, rgb(var(--theme-sidebar-rgb)) 12%) 96%, var(--theme-accent) 4%)',
        }}
      >
        <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(var(--theme-accent-rgb),0.13)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-2.5 py-1 text-[10px] font-semibold text-[var(--theme-accent)]">
              <Sparkles size={12} />
              Keşif
            </div>
            <p className="truncate text-[12px] text-[var(--theme-secondary-text)]/68">Sunucudaki herkesin görebileceği kısa bir öneri paylaş.</p>
          </div>
          <button type="button" onClick={handleClose} disabled={busy} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map(option => {
            const Icon = option.icon;
            const selected = option.id === category;
            const disabled = option.disabled || option.id === 'more';
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled || option.id === 'more') return;
                  setCategory(option.id);
                  setMetadata({});
                }}
                className={`group flex h-10 min-w-[116px] items-center gap-2 rounded-2xl border px-2.5 text-left transition-all ${
                  disabled
                    ? 'cursor-default border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] opacity-55 hover:bg-[rgba(var(--glass-tint),0.024)]'
                    : selected
                      ? option.selectedTone
                      : `border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--glass-tint),0.023)] ${option.tone}`
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${selected || disabled ? option.iconTone : 'bg-[rgba(var(--shadow-base),0.12)] text-[var(--theme-secondary-text)]/64 group-hover:text-[var(--theme-text)]'}`}>
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-[var(--theme-text)]">{option.label}</span>
                  <span className="block truncate text-[9px] text-[var(--theme-secondary-text)]/50">{option.description}</span>
                </span>
                {disabled && <span className="rounded-full bg-[rgba(var(--glass-tint),0.045)] px-1.5 py-0.5 text-[8px] font-semibold text-[var(--theme-secondary-text)]/55">Yakında</span>}
                {isEditMode && selected && <span className="rounded-full bg-[rgba(var(--glass-tint),0.045)] px-1.5 py-0.5 text-[8px] font-semibold text-[var(--theme-secondary-text)]/55">Seçili</span>}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_250px_330px]">
          <section className={`${panelCls} p-2.5 space-y-2.5`}>
            <label>
              <span className={labelCls}>Ne öneriyorsun?</span>
              <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Interstellar, The Last of Us, Valorant, Dune..." maxLength={140} />
            </label>
            <label>
              <span className={labelCls}>Neden öneriyorsun?</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} h-[56px] resize-none overflow-y-auto py-2 leading-5`} placeholder="Kısa bir sebep yaz. Spoiler vermeden :)" maxLength={2000} />
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label>
                <span className={labelCls}>Kapak görseli</span>
                <input
                  value={coverUrl}
                  onChange={e => {
                    setCoverUrl(e.target.value);
                    if (coverFile) setCoverFileNote(e.target.value.trim() ? 'Dosya seçili; kayıtta URL yerine bu dosya kullanılacak.' : 'Dosya seçili; öneri eklenirken yüklenecek.');
                  }}
                  className={inputCls}
                  placeholder="İsteğe bağlı görsel URL"
                />
              </label>
              <label>
                <span className={labelCls}>Etiketler</span>
                <input value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} className={inputCls} placeholder="co-op, bilim kurgu" />
              </label>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setShowTags(prev => !prev)}
                className={`flex h-8 w-full items-center justify-between rounded-xl border px-2.5 text-[11px] transition-colors ${
                  showTags
                    ? 'border-[rgba(var(--theme-accent-rgb),0.16)] bg-[rgba(var(--theme-accent-rgb),0.055)] text-[var(--theme-text)]'
                    : 'border-[rgba(var(--glass-tint),0.075)] bg-[rgba(var(--shadow-base),0.10)] text-[var(--theme-secondary-text)]/76 hover:border-[rgba(var(--glass-tint),0.12)] hover:text-[var(--theme-text)]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Tag size={12} />
                  Hazır etiketler
                  <span className="text-[10px] text-[var(--theme-secondary-text)]/45">{tags.length > 0 ? `${tags.length} seçili` : 'isteğe bağlı'}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--theme-secondary-text)]/62">
                  {showTags ? 'Gizle' : 'Aç'}
                  <ChevronDown size={14} strokeWidth={2.4} className={`transition-transform ${showTags ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {showTags && (
                <div className="mt-2 max-h-[74px] overflow-y-auto rounded-xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--shadow-base),0.08)] p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TAG_SUGGESTIONS[category].map(tag => {
                      const selected = tags.some(t => t.toLocaleLowerCase('tr-TR') === tag.toLocaleLowerCase('tr-TR'));
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`rounded-full border px-2 py-1 text-[10px] transition-all ${
                            selected
                              ? 'border-[rgba(var(--theme-accent-rgb),0.34)] bg-[rgba(var(--theme-accent-rgb),0.11)] text-[var(--theme-accent)]'
                              : 'border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.022)] text-[var(--theme-secondary-text)]/62 hover:text-[var(--theme-text)]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div
              className={`${panelCls} border-dashed p-2.5 text-center`}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                handleCoverFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                  handleCoverFile(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
              <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-2xl bg-[rgba(var(--theme-accent-rgb),0.09)] text-[var(--theme-accent)]">
                <UploadCloud size={17} />
              </div>
              <div className="text-[12px] font-semibold text-[var(--theme-text)]">Kapak dosyası</div>
              <div className="mt-0.5 text-[10px] leading-4 text-[var(--theme-secondary-text)]/55">Sürükle bırak veya 5MB altı görsel seç.</div>
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                    fileInputRef.current.click();
                  }
                }}
                className="mt-2 rounded-xl border border-[rgba(var(--glass-tint),0.08)] bg-[rgba(var(--glass-tint),0.035)] px-3 py-1.5 text-[11px] text-[var(--theme-text)] transition-colors hover:border-[rgba(var(--theme-accent-rgb),0.18)] hover:text-[var(--theme-accent)]"
              >
                Dosya seç
              </button>
              {coverFileName && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-[var(--theme-secondary-text)]/68">
                  <ImagePlus size={11} />
                  <span className="max-w-[135px] truncate">{coverFileName}</span>
                  <button type="button" onClick={clearLocalCover} className="text-[var(--theme-secondary-text)]/45 hover:text-red-300">Kaldır</button>
                </div>
              )}
              {coverFileNote && <p className="mt-2 text-[9px] leading-4 text-amber-200/64">{coverFileNote}</p>}
            </div>

            <div className={`${panelCls} p-2.5`}>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[var(--theme-secondary-text)]/78">
                <Link2 size={12} />
                Bağlantı ekle
              </div>
              <div className="space-y-2">
                {usesMultiLinks ? (
                  linkUrls.map((url, index) => (
                    <input
                      key={index}
                      value={url}
                      onChange={e => setLinkUrls(prev => prev.map((current, currentIndex) => currentIndex === index ? e.target.value : current))}
                      className={inputCls}
                      placeholder="https://..."
                    />
                  ))
                ) : (
                  <>
                    <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} className={inputCls} placeholder="Steam, Netflix, İnceleme..." />
                    <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={inputCls} placeholder="https://..." />
                  </>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-3">
            <div className={`${panelCls} p-2.5`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {authorAvatar ? (
                    <img src={authorAvatar} alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--glass-tint),0.08)] bg-[rgba(var(--glass-tint),0.045)] text-[10px] font-semibold text-[var(--theme-text)]/72">
                      {authorInitial}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-[var(--theme-text)]">{authorName}</span>
                    <span className="block truncate text-[9px] text-[var(--theme-secondary-text)]/52">tarafından paylaşılıyor</span>
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(var(--theme-accent-rgb),0.10)] px-2 py-1 text-[9px] font-semibold text-[var(--theme-accent)]">
                  <CategoryIcon size={10} />
                  {categoryMeta.label}
                </div>
              </div>
              <div className="relative mb-2.5 flex h-28 items-center justify-center overflow-hidden rounded-2xl border border-[var(--theme-border)]/14 bg-[rgba(var(--glass-tint),0.04)]">
                {activeCover ? (
                  isPosterPreview ? (
                    <>
                      <img src={activeCover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-[rgba(var(--shadow-base),0.30)]" />
                      <img src={activeCover} alt="" className="relative z-10 h-full max-w-[62%] object-contain" referrerPolicy="no-referrer" />
                    </>
                  ) : (
                    <img src={activeCover} alt="" className="h-full w-full object-cover object-center" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-[var(--theme-secondary-text)]/45">
                    <CategoryIcon size={28} />
                    <span className="text-[10px]">{categoryMeta.label} kapağı</span>
                  </div>
                )}
              </div>
              <div className="text-[14px] font-semibold text-[var(--theme-text)] line-clamp-2">{title.trim() || 'Öneri başlığı'}</div>
              <p className="mt-1 text-[11px] leading-5 text-[var(--theme-secondary-text)]/64 line-clamp-2">{description.trim() || 'Kısa açıklama burada görünecek.'}</p>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.slice(0, 2).map(tag => (
                    <span key={tag} className="rounded-full bg-[rgba(var(--glass-tint),0.045)] px-2 py-0.5 text-[9px] text-[var(--theme-secondary-text)]/65">#{tag}</span>
                  ))}
                </div>
              )}
              {metadataPreview.length > 0 && (
                <div className="mt-2 grid grid-cols-1 gap-1">
                  {metadataPreview.map(item => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg bg-[rgba(var(--glass-tint),0.032)] px-2 py-1">
                      <span className="text-[9px] text-[var(--theme-secondary-text)]/54">{item.label}</span>
                      <span className="max-w-[170px] truncate text-[9px] font-medium text-[var(--theme-text)]/82">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--theme-text)]">
                    <Gauge size={12} className="text-[var(--theme-accent)]" />
                    Keşif kalitesi
                    <Info size={11} className="text-[var(--theme-secondary-text)]/45" aria-label="İleride Keşif, Puanlama ve Güvenilirlik skorları ile birleşecek." />
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--theme-accent)]">%{qualityScore}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(var(--glass-tint),0.07)]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--theme-accent-rgb),0.48),rgba(var(--theme-accent-rgb),0.86))]" style={{ width: `${qualityScore}%` }} />
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section className={`${panelCls} mt-3 p-2.5`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Info size={12} className="shrink-0 text-[var(--theme-secondary-text)]/48" />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-[var(--theme-text)]">Kategori detayları</div>
                <div className="truncate text-[9px] text-[var(--theme-secondary-text)]/48">En önemli bilgiler yeterli; boş bırakabilirsin.</div>
              </div>
            </div>
            <div className="rounded-full border border-[rgba(var(--theme-accent-rgb),0.13)] bg-[rgba(var(--theme-accent-rgb),0.065)] px-2.5 py-1 text-[10px] font-semibold text-[var(--theme-accent)]">
              {detailFields.filter(field => hasMetadataValue(metadata[field.key])).length}/{detailFields.length}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {detailFields.map(renderField)}
          </div>
        </section>
        {error && (
          <div className="mt-3 rounded-2xl border border-red-400/16 bg-red-500/8 px-3 py-2 text-[11px] text-red-200/86">
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-[rgba(var(--glass-tint),0.05)] pt-3">
          <button type="button" onClick={handleClose} disabled={busy} className="rounded-xl px-4 py-2 text-[12px] text-[var(--theme-secondary-text)] transition-colors hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)] disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={busy || !title.trim()} className="rounded-xl border border-[rgba(var(--theme-accent-rgb),0.24)] bg-[linear-gradient(135deg,rgba(var(--theme-accent-rgb),0.24),rgba(var(--theme-accent-rgb),0.12))] px-4 py-2 text-[12px] font-semibold text-[var(--theme-text)] shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.08),0_10px_24px_rgba(var(--theme-accent-rgb),0.08)] transition-all hover:border-[rgba(var(--theme-accent-rgb),0.34)] hover:bg-[linear-gradient(135deg,rgba(var(--theme-accent-rgb),0.30),rgba(var(--theme-accent-rgb),0.15))] disabled:opacity-45 disabled:hover:border-[rgba(var(--theme-accent-rgb),0.24)]">
            {submitStage === 'uploading' ? 'Kapak yükleniyor...' : submitStage === 'creating' || loading ? (isEditMode ? 'Öneri güncelleniyor...' : 'Öneri ekleniyor...') : (isEditMode ? 'Öneriyi güncelle' : 'Öneriyi ekle')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
