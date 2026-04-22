import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Zap, MessageSquareWarning, ListFilter, Save, RotateCcw, Filter, BookLock, Search, X } from 'lucide-react';
import {
  type ModerationConfigResponse, type FloodConfig,
  getModerationConfig, updateModerationConfig,
} from '../../../lib/serverService';
import { Loader } from './shared';
// Sistem kara listesi — tek gerçek kaynak (chat-server ile aynı dosya).
// Vite JSON import native; build-time inline olur, runtime fetch yok.
import SYSTEM_BLACKLIST from '../../../../system-profanity.json';

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
    profanityText    !== initialWordsStr
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateModerationConfig(serverId, {
        flood,
        profanity: { enabled: profanityEnabled, words: currentWords },
      });
      setInitial(prev => prev ? { ...prev, flood, profanity: { enabled: profanityEnabled, words: currentWords } } : prev);
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
  };

  // Kara liste modal
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [blacklistQuery, setBlacklistQuery] = useState('');
  const filteredBlacklist = useMemo(() => {
    const q = blacklistQuery.trim().toLowerCase();
    if (!q) return SYSTEM_BLACKLIST as string[];
    return (SYSTEM_BLACKLIST as string[]).filter(w => w.toLowerCase().includes(q));
  }, [blacklistQuery]);

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
            <BookLock size={11} /> Kara listeyi gör ({(SYSTEM_BLACKLIST as string[]).length})
          </button>
        </div>

        {/* Sistem kara listesi bilgi notu */}
        <div className="mt-3 px-3 py-2 rounded-lg text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-relaxed flex items-start gap-2"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.04)', border: '1px solid rgba(var(--theme-accent-rgb),0.10)' }}>
          <BookLock size={12} className="mt-0.5 shrink-0 text-[var(--theme-accent)]/80" />
          <span>
            <strong className="text-[var(--theme-text)]">Sistem kara listesi</strong> ({(SYSTEM_BLACKLIST as string[]).length} kelime) küfür filtresi
            aktifken her zaman çalışır — kaldırılamaz. Kendi kelimelerini yukarıdaki kutudan ekleyebilirsin.
          </span>
        </div>
      </section>

      {/* ── Kara liste modal ── */}
      {showBlacklist && (
        <BlacklistModal
          words={filteredBlacklist}
          total={(SYSTEM_BLACKLIST as string[]).length}
          query={blacklistQuery}
          onQueryChange={setBlacklistQuery}
          onClose={() => { setShowBlacklist(false); setBlacklistQuery(''); }}
        />
      )}

      {/* ── Spam koruması — placeholder (Faz 3) ── */}
      <section
        className="rounded-2xl p-5 opacity-55 pointer-events-none"
        style={{
          background: 'rgba(var(--glass-tint), 0.03)',
          border: '1px dashed rgba(var(--glass-tint), 0.12)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareWarning size={14} className="text-[var(--theme-secondary-text)]/60" />
            <h4 className="text-[13px] font-bold text-[var(--theme-text)]">Spam koruması</h4>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-accent)]/80 px-2 py-0.5 rounded-full border border-[var(--theme-accent)]/30 bg-[var(--theme-accent)]/10">
            Yakında
          </span>
        </div>
        <p className="text-[11px] text-[var(--theme-secondary-text)]/60 mt-2 leading-relaxed">
          Aynı mesajın tekrarı, tamamı büyük harf, zincir emoji gibi şablonları otomatik tespit eder.
        </p>
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

// ── Sistem kara listesi modal (read-only + search) ──
function BlacklistModal({
  words, total, query, onQueryChange, onClose,
}: {
  words: string[];
  total: number;
  query: string;
  onQueryChange: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[min(80vh,640px)] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(var(--glass-tint), 0.08)',
          border: '1px solid rgba(var(--glass-tint), 0.15)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[rgba(var(--glass-tint),0.08)] flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/12 border border-[var(--theme-accent)]/25 flex items-center justify-center shrink-0">
            <BookLock size={14} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-bold text-[var(--theme-text)] leading-none">Sistem kara listesi</h4>
            <p className="text-[10.5px] text-[var(--theme-secondary-text)]/65 mt-1">
              {query ? `${words.length} eşleşti / ${total} toplam` : `${total} kelime — her zaman aktif, kaldırılamaz`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--theme-secondary-text)]/55 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.08)] transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-[rgba(var(--glass-tint),0.05)] shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/45" />
            <input
              type="text"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              autoFocus
              placeholder="Kelime ara..."
              className="w-full pl-7 pr-3 py-2 rounded-lg text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 outline-none focus:border-[var(--theme-accent)]/30 transition-colors"
              style={{
                background: 'rgba(var(--glass-tint), 0.06)',
                border: '1px solid rgba(var(--glass-tint), 0.10)',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
          {words.length === 0 ? (
            <div className="text-center py-8 text-[11px] text-[var(--theme-secondary-text)]/50">
              Bu arama için eşleşme yok
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {words.map((w, i) => (
                <span
                  key={`${i}-${w}`}
                  className="px-2 py-1 rounded text-[11px] text-[var(--theme-text)]/85 font-mono truncate"
                  style={{
                    background: 'rgba(var(--glass-tint), 0.05)',
                    border: '1px solid rgba(var(--glass-tint), 0.06)',
                  }}
                  title={w}
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
