import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Zap, MessageSquareWarning, ListFilter, Save, RotateCcw, Filter, BookLock, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type ModerationConfigResponse, type FloodConfig,
  getModerationConfig, updateModerationConfig,
} from '../../../lib/serverService';
import { Loader } from './shared';
// Sistem kara listesi — tek gerçek kaynak (chat-server ile aynı dosya).
// Vite JSON import native; build-time inline olur, runtime fetch yok.
// Shape: { [langCode]: string[] }  (multi-language object)
import SYSTEM_BLACKLIST_RAW from '../../../../system-profanity.json';
const SYSTEM_BLACKLIST_BY_LANG = SYSTEM_BLACKLIST_RAW as Record<string, string[]>;
const SYSTEM_BLACKLIST_TOTAL = Object.values(SYSTEM_BLACKLIST_BY_LANG).reduce((a, arr) => a + arr.length, 0);

// Dil kodu → (ad, bayrak emoji). Liste user'ın verdiği kod tablosu ile senkron.
const LANG_META: Record<string, { name: string; flag: string }> = {
  tr:                 { name: 'Türkçe',               flag: '🇹🇷' },
  en:                 { name: 'English',              flag: '🇬🇧' },
  ar:                 { name: 'العربية',              flag: '🇸🇦' },
  cs:                 { name: 'Čeština',              flag: '🇨🇿' },
  da:                 { name: 'Dansk',                flag: '🇩🇰' },
  de:                 { name: 'Deutsch',              flag: '🇩🇪' },
  eo:                 { name: 'Esperanto',            flag: '🌐' },
  es:                 { name: 'Español',              flag: '🇪🇸' },
  fa:                 { name: 'فارسی',                flag: '🇮🇷' },
  fi:                 { name: 'Suomi',                flag: '🇫🇮' },
  fil:                { name: 'Filipino',             flag: '🇵🇭' },
  fr:                 { name: 'Français',             flag: '🇫🇷' },
  'fr-CA-u-sd-caqc':  { name: 'Français (Québec)',    flag: '🇨🇦' },
  hi:                 { name: 'हिन्दी',                flag: '🇮🇳' },
  hu:                 { name: 'Magyar',               flag: '🇭🇺' },
  it:                 { name: 'Italiano',             flag: '🇮🇹' },
  ja:                 { name: '日本語',               flag: '🇯🇵' },
  kab:                { name: 'Taqbaylit',            flag: '🏳️' },
  ko:                 { name: '한국어',               flag: '🇰🇷' },
  nl:                 { name: 'Nederlands',           flag: '🇳🇱' },
  no:                 { name: 'Norsk',                flag: '🇳🇴' },
  pl:                 { name: 'Polski',               flag: '🇵🇱' },
  pt:                 { name: 'Português',            flag: '🇵🇹' },
  ru:                 { name: 'Русский',              flag: '🇷🇺' },
  sv:                 { name: 'Svenska',              flag: '🇸🇪' },
  th:                 { name: 'ไทย',                  flag: '🇹🇭' },
  tlh:                { name: 'Klingon',              flag: '🖖' },
  zh:                 { name: '中文',                 flag: '🇨🇳' },
};

const WORDS_PER_PAGE = 60;

interface Props {
  serverId: string;
  showToast: (m: string) => void;
}

const FLOOD_DEFAULT: FloodConfig = { cooldownMs: 3000, limit: 5, windowMs: 5000 };

// UI'de gösterilecek limit/aralık sınırları — backend validation ile aynı.
const BOUNDS = {
  cooldownMs: { min: 1000, max: 60_000, step: 500 },
  limit:      { min: 1,    max: 50,     step: 1 },
  // windowMs min 6s — çok dar pencere normal konuşmayı yanlış pozitif flood sayar.
  windowMs:   { min: 6000, max: 60_000, step: 500 },
};


export default function AutoModerationTab({ serverId, showToast }: Props) {
  const [initial, setInitial] = useState<ModerationConfigResponse | null>(null);
  const [flood, setFlood] = useState<FloodConfig>(FLOOD_DEFAULT);
  const [profanityEnabled, setProfanityEnabled] = useState(false);
  // Textarea'da her satır bir kelime — state string olarak tutulur, save'de split edilir.
  const [profanityText, setProfanityText] = useState('');
  const [spamEnabled, setSpamEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const cfg = await getModerationConfig(serverId);
      setInitial(cfg);
      setFlood(cfg.flood);
      setProfanityEnabled(cfg.profanity.enabled);
      setProfanityText((cfg.profanity.words || []).join('\n'));
      setSpamEnabled(cfg.spam.enabled);
    } catch (err: any) {
      showToast(err?.message || 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [serverId, showToast]);

  useEffect(() => { load(); }, [load]);

  // Textarea → temiz kelime listesi (boş satır at, trim, dedup).
  const parseProfanityWords = useCallback(() => {
    const set = new Set<string>();
    const out: string[] = [];
    for (const raw of profanityText.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (set.has(key)) continue;
      set.add(key);
      out.push(t);
    }
    return out;
  }, [profanityText]);

  const currentWords = parseProfanityWords();
  const initialWordsStr = initial ? (initial.profanity.words || []).join('\n') : '';

  const dirty = initial != null && (
    flood.cooldownMs !== initial.flood.cooldownMs ||
    flood.limit      !== initial.flood.limit ||
    flood.windowMs   !== initial.flood.windowMs ||
    profanityEnabled !== initial.profanity.enabled ||
    profanityText    !== initialWordsStr ||
    spamEnabled      !== initial.spam.enabled
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateModerationConfig(serverId, {
        flood,
        profanity: { enabled: profanityEnabled, words: currentWords },
        spam: { enabled: spamEnabled },
      });
      setInitial(prev => prev ? {
        ...prev,
        flood,
        profanity: { enabled: profanityEnabled, words: currentWords },
        spam: { enabled: spamEnabled },
      } : prev);
      // UI'yi normalize sonuç ile hizala (dedup/trim eksik satır varsa).
      setProfanityText(currentWords.join('\n'));
      showToast('Oto-Mod ayarları kaydedildi');
    } catch (err: any) {
      showToast(err?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!initial) return;
    setFlood(initial.flood);
    setProfanityEnabled(initial.profanity.enabled);
    setProfanityText((initial.profanity.words || []).join('\n'));
    setSpamEnabled(initial.spam.enabled);
  };

  // Kara liste modal (dil-tab + sayfalama)
  const [showBlacklist, setShowBlacklist] = useState(false);

  if (loading) return <Loader />;

  return (
    <div className="max-w-[760px] mx-auto space-y-4 pb-8">
      {/* Başlık */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/12 border border-[var(--theme-accent)]/25 flex items-center justify-center">
          <ShieldCheck size={18} className="text-[var(--theme-accent)]" strokeWidth={1.8} />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[var(--theme-text)] leading-tight">Otomatik Moderasyon</h3>
          <p className="text-[11px] text-[var(--theme-secondary-text)]/70 mt-0.5">
            Sunucu içi spam ve taşkın mesaj akışını otomatik sınırla.
          </p>
        </div>
      </div>

      {/* ── Flood Control ── */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: 'rgba(var(--glass-tint), 0.04)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Zap size={14} className="text-amber-400" />
          <h4 className="text-[13px] font-bold text-[var(--theme-text)]">Flood Control</h4>
        </div>
        <p className="text-[11px] text-[var(--theme-secondary-text)]/65 mb-5 leading-relaxed">
          Kısa sürede çok sayıda mesaj gönderenleri sessizce engeller. Limit aşılırsa mesaj kaydedilmez
          ve gönderene "biraz bekle" uyarısı gider.
        </p>

        <div className="space-y-5">
          <SliderRow
            icon={<MessageSquareWarning size={12} />}
            label="Mesaj limiti"
            hint="Pencere içinde izin verilen maksimum mesaj"
            unit={`${flood.limit} mesaj`}
            value={flood.limit}
            min={BOUNDS.limit.min}
            max={BOUNDS.limit.max}
            step={BOUNDS.limit.step}
            onChange={v => setFlood(prev => ({ ...prev, limit: v }))}
          />

          <SliderRow
            icon={<ListFilter size={12} />}
            label="Zaman penceresi"
            hint="Limit bu süre içinde geçerli"
            unit={`${(flood.windowMs / 1000).toFixed(1)} sn`}
            value={flood.windowMs}
            min={BOUNDS.windowMs.min}
            max={BOUNDS.windowMs.max}
            step={BOUNDS.windowMs.step}
            onChange={v => setFlood(prev => ({ ...prev, windowMs: v }))}
          />

          <SliderRow
            icon={<Zap size={12} />}
            label="Cooldown (bekleme)"
            hint="Limit aşıldığında kullanıcının beklemesi gereken süre"
            unit={`${(flood.cooldownMs / 1000).toFixed(1)} sn`}
            value={flood.cooldownMs}
            min={BOUNDS.cooldownMs.min}
            max={BOUNDS.cooldownMs.max}
            step={BOUNDS.cooldownMs.step}
            onChange={v => setFlood(prev => ({ ...prev, cooldownMs: v }))}
          />
        </div>

        {/* Live preview */}
        <div
          className="mt-5 px-3 py-2.5 rounded-lg text-[11px] text-[var(--theme-secondary-text)]/75 leading-relaxed"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.06)', border: '1px solid rgba(var(--theme-accent-rgb),0.12)' }}
        >
          <span className="font-semibold text-[var(--theme-text)]">Önizleme:</span>{' '}
          {(flood.windowMs / 1000).toFixed(1)} saniyede <strong>{flood.limit}</strong> mesaj limiti.
          Aşan kullanıcıya <strong>{(flood.cooldownMs / 1000).toFixed(1)} sn</strong> bekleme uygulanır.
        </div>
      </section>

      {/* ── Küfür filtresi ── */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: 'rgba(var(--glass-tint), 0.04)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-rose-400" />
            <h4 className="text-[13px] font-bold text-[var(--theme-text)]">Küfür filtresi</h4>
          </div>
          <button
            type="button"
            onClick={() => setProfanityEnabled(v => !v)}
            role="switch"
            aria-checked={profanityEnabled}
            className={`relative w-9 h-5 rounded-full transition-colors ${profanityEnabled ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: profanityEnabled ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </button>
        </div>
        <p className="text-[11px] text-[var(--theme-secondary-text)]/65 mb-3 leading-relaxed">
          Listedeki kelimeler mesajlarda tespit edilirse mesaj gönderilmez. Türkçe eklerle (salak
          → salakça, salakların) otomatik uyumludur.
        </p>

        <label className="block text-[11px] font-semibold text-[var(--theme-text)] mb-1.5">
          Kelime listesi
          <span className="ml-2 text-[10px] font-normal text-[var(--theme-secondary-text)]/55 tabular-nums">
            ({currentWords.length} kelime)
          </span>
        </label>
        <textarea
          value={profanityText}
          onChange={e => setProfanityText(e.target.value)}
          disabled={!profanityEnabled}
          rows={6}
          placeholder={'Her satıra bir kelime yaz…\naptal\nsalak'}
          className="w-full rounded-lg px-3 py-2 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 outline-none focus:border-[var(--theme-accent)]/30 transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed font-mono"
          style={{
            background: 'rgba(var(--glass-tint), 0.05)',
            border: '1px solid rgba(var(--glass-tint), 0.10)',
          }}
        />
        <div className="flex items-center justify-between mt-1.5 gap-3">
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/55 leading-snug">
            Büyük/küçük harf farkı yok; Türkçe ve Latin aksanları otomatik normalize edilir.
          </p>
          <button
            type="button"
            onClick={() => setShowBlacklist(true)}
            title="Küfür filtresi aktifken her sunucuda çalışan sistem listesi"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-semibold shrink-0 transition-colors"
            style={{
              background: 'rgba(var(--glass-tint),0.06)',
              border: '1px solid rgba(var(--glass-tint),0.15)',
              color: 'var(--theme-text)',
            }}
          >
            <BookLock size={11} /> Kara listeyi gör ({SYSTEM_BLACKLIST_TOTAL})
          </button>
        </div>

        {/* Sistem kara listesi bilgi notu */}
        <div className="mt-3 px-3 py-2 rounded-lg text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-relaxed flex items-start gap-2"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.04)', border: '1px solid rgba(var(--theme-accent-rgb),0.10)' }}>
          <BookLock size={12} className="mt-0.5 shrink-0 text-[var(--theme-accent)]/80" />
          <span>
            <strong className="text-[var(--theme-text)]">Sistem kara listesi</strong> ({SYSTEM_BLACKLIST_TOTAL} kelime · {Object.keys(SYSTEM_BLACKLIST_BY_LANG).length} dil) küfür filtresi
            aktifken her zaman çalışır — kaldırılamaz. Kendi kelimelerini yukarıdaki kutudan ekleyebilirsin.
          </span>
        </div>
      </section>

      {/* ── Kara liste modal ── */}
      {showBlacklist && (
        <BlacklistModal onClose={() => setShowBlacklist(false)} />
      )}

      {/* ── Spam koruması ── */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: 'rgba(var(--glass-tint), 0.04)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <MessageSquareWarning size={14} className="text-sky-400" />
            <h4 className="text-[13px] font-bold text-[var(--theme-text)]">Spam koruması</h4>
          </div>
          <button
            type="button"
            onClick={() => setSpamEnabled(v => !v)}
            role="switch"
            aria-checked={spamEnabled}
            className={`relative w-9 h-5 rounded-full transition-colors ${spamEnabled ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: spamEnabled ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </button>
        </div>
        <p className="text-[11px] text-[var(--theme-secondary-text)]/65 mb-3 leading-relaxed">
          Şu şablonlar tespit edilirse mesaj gönderilmez:
        </p>
        <ul className="space-y-1.5 text-[11px] text-[var(--theme-secondary-text)]/75">
          <li className="flex items-start gap-2">
            <span className="text-[var(--theme-accent)]/70 shrink-0">•</span>
            <span><strong className="text-[var(--theme-text)]">Tekrar eden mesaj</strong> — 60 saniye içinde aynı mesaj 3+ kez</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--theme-accent)]/70 shrink-0">•</span>
            <span><strong className="text-[var(--theme-text)]">ALL CAPS</strong> — 10+ harf ve %80+'ı büyük harf</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--theme-accent)]/70 shrink-0">•</span>
            <span><strong className="text-[var(--theme-text)]">Zincir emoji</strong> — sadece emoji içeren 10+ emojilik mesaj</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--theme-accent)]/70 shrink-0">•</span>
            <span><strong className="text-[var(--theme-text)]">Link spam</strong> — tek mesajda 3+ URL</span>
          </li>
        </ul>
      </section>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={handleReset}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <RotateCcw size={12} /> Sıfırla
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold transition-all disabled:opacity-40 disabled:pointer-events-none"
          style={{
            background: 'var(--theme-accent)',
            color: 'var(--theme-text-on-accent, #000)',
            boxShadow: '0 2px 12px rgba(var(--theme-accent-rgb),0.25)',
          }}
        >
          <Save size={12} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

// ── Slider row ──
function SliderRow({
  icon, label, hint, unit, value, min, max, step, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--theme-text)]">
          <span className="text-[var(--theme-accent)]/75">{icon}</span>
          {label}
        </label>
        <span className="text-[11px] font-bold tabular-nums text-[var(--theme-accent)] px-2 py-0.5 rounded-md bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20">
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer automod-slider"
        style={{
          background: `linear-gradient(to right, var(--theme-accent) 0%, var(--theme-accent) ${((value - min) / (max - min)) * 100}%, rgba(var(--glass-tint),0.15) ${((value - min) / (max - min)) * 100}%, rgba(var(--glass-tint),0.15) 100%)`,
        }}
      />
      <p className="text-[10.5px] text-[var(--theme-secondary-text)]/55 mt-1">{hint}</p>
    </div>
  );
}

// ── Sistem kara listesi modal (dil tab + sayfalama + search) ──
// Stil: ChannelAccessModal ile paritet (tema-aware, solid bg, blur yok).
function BlacklistModal({ onClose }: { onClose: () => void }) {
  const langs = useMemo(() => Object.keys(SYSTEM_BLACKLIST_BY_LANG), []);
  const [activeLang, setActiveLang] = useState<string>(langs[0] || 'tr');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Dil değişince sayfa 1'e dön, search temizle
  useEffect(() => { setPage(1); setQuery(''); }, [activeLang]);
  // Search değişince sayfa 1'e dön
  useEffect(() => { setPage(1); }, [query]);

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const langWords = SYSTEM_BLACKLIST_BY_LANG[activeLang] || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return langWords;
    return langWords.filter(w => w.toLowerCase().includes(q));
  }, [langWords, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / WORDS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageWords = filtered.slice((currentPage - 1) * WORDS_PER_PAGE, currentPage * WORDS_PER_PAGE);

  const activeMeta = LANG_META[activeLang] || { name: activeLang, flag: '🏳️' };

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.72)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[680px] max-w-[94vw] rounded-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: 'min(85vh, 720px)',
          background: 'var(--theme-surface-card, rgba(var(--theme-bg-rgb, 6,10,20), 0.97))',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center gap-4 shrink-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.18), rgba(var(--theme-accent-rgb), 0.08))',
            }}
          >
            <BookLock size={18} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-[var(--theme-text)] truncate">Sistem Kara Listesi</h3>
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-55 mt-0.5 truncate">
              {SYSTEM_BLACKLIST_TOTAL} kelime · {langs.length} dil — her zaman aktif, kaldırılamaz
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.05)] transition-colors shrink-0"
            title="Kapat"
          >
            <X size={15} />
          </button>
        </div>

        {/* Dil tab bar — horizontal scroll */}
        <div
          className="px-4 pb-3 overflow-x-auto custom-scrollbar shrink-0"
          style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.06)' }}
        >
          <div className="flex gap-1.5 min-w-max">
            {langs.map(code => {
              const meta = LANG_META[code] || { name: code, flag: '🏳️' };
              const count = SYSTEM_BLACKLIST_BY_LANG[code]?.length ?? 0;
              const active = code === activeLang;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveLang(code)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-semibold shrink-0 transition-colors"
                  style={active ? {
                    background: 'rgba(var(--theme-accent-rgb),0.14)',
                    border: '1px solid rgba(var(--theme-accent-rgb),0.30)',
                    color: 'var(--theme-accent)',
                  } : {
                    background: 'transparent',
                    border: '1px solid rgba(var(--glass-tint),0.08)',
                    color: 'var(--theme-secondary-text)',
                  }}
                >
                  <span className="text-[12px]">{meta.flag}</span>
                  <span>{meta.name}</span>
                  <span className="tabular-nums opacity-65">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'rgba(var(--glass-tint), 0.04)',
              border: '1px solid rgba(var(--glass-tint), 0.08)',
            }}
          >
            <Search size={12} className="text-[var(--theme-secondary-text)]/40 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              placeholder={`${activeMeta.name} içinde ara...`}
              className="flex-1 bg-transparent text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none min-w-0"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] transition-colors shrink-0"
                title="Temizle"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-1.5">
            {query
              ? `${filtered.length} eşleşti / ${langWords.length} kelime`
              : `${langWords.length} kelime`}
            {totalPages > 1 && ` · Sayfa ${currentPage}/${totalPages}`}
          </p>
        </div>

        {/* Kelime grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar">
          {pageWords.length === 0 ? (
            <div className="text-center py-10 text-[11px] text-[var(--theme-secondary-text)]/40">
              {query ? 'Bu arama için eşleşme yok' : 'Bu dilde kelime yok'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {pageWords.map((w, i) => (
                <span
                  key={`${activeLang}-${(currentPage - 1) * WORDS_PER_PAGE + i}`}
                  className="px-2.5 py-1.5 rounded-md text-[11.5px] text-[var(--theme-text)]/90 font-mono truncate"
                  style={{
                    background: 'rgba(var(--theme-accent-rgb), 0.06)',
                    border: '1px solid rgba(var(--theme-accent-rgb), 0.12)',
                  }}
                  title={w}
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div
            className="px-6 py-3 flex items-center justify-between gap-2 shrink-0"
            style={{ borderTop: '1px solid rgba(var(--glass-tint),0.06)' }}
          >
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(var(--glass-tint),0.06)',
                border: '1px solid rgba(var(--glass-tint),0.10)',
                color: 'var(--theme-text)',
              }}
            >
              <ChevronLeft size={12} /> Önceki
            </button>

            <div className="flex items-center gap-1">
              {buildPageNumbers(currentPage, totalPages).map((n, i) =>
                n === '…' ? (
                  <span key={`dots-${i}`} className="px-1 text-[11px] text-[var(--theme-secondary-text)]/40">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n as number)}
                    className="w-7 h-7 rounded-md text-[11px] font-bold tabular-nums transition-colors"
                    style={n === currentPage ? {
                      background: 'var(--theme-accent)',
                      color: 'var(--theme-text-on-accent, #000)',
                    } : {
                      background: 'rgba(var(--glass-tint),0.04)',
                      color: 'var(--theme-secondary-text)',
                    }}
                  >
                    {n}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(var(--glass-tint),0.06)',
                border: '1px solid rgba(var(--glass-tint),0.10)',
                color: 'var(--theme-text)',
              }}
            >
              Sonraki <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Sayfa numaraları — kompakt pattern: 1 … (n-1) n (n+1) … last
function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}
