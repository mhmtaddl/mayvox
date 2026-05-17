import React from 'react';
import { CalendarDays, Compass, Hash, Search, Sparkles, TrendingUp, UsersRound } from 'lucide-react';

interface MobileDiscoverScreenProps {
  serverName?: string;
  onOpenSection?: (section: 'servers' | 'recommendations' | 'events' | 'trending') => void;
}

const DISCOVER_CARDS = [
  { key: 'servers', title: 'Sunucular', subtitle: 'Topluluklari kesfet', icon: <UsersRound size={16} /> },
  { key: 'recommendations', title: 'Oneriler', subtitle: 'Sana uygun alanlar', icon: <Sparkles size={16} /> },
  { key: 'events', title: 'Etkinlikler', subtitle: 'Yaklasan bulusmalar', icon: <CalendarDays size={16} /> },
  { key: 'trending', title: 'Trendler', subtitle: 'Hareketli basliklar', icon: <TrendingUp size={16} /> },
] as const;

export default function MobileDiscoverScreen({ serverName, onOpenSection }: MobileDiscoverScreenProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar">
      <div className="w-full">
      <section className="mb-2 border-b border-[rgba(var(--glass-tint),0.045)] px-1 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/48">Kesif</p>
        <h2 className="mt-0.5 text-[20px] font-black text-[var(--theme-text)]">Topluluk Kesfet</h2>
        <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-[var(--theme-secondary-text)]/66">
          {serverName ? `${serverName} icin oneriler ve topluluk akisi burada toparlanacak.` : 'Sunucular, etkinlikler ve oneriler icin hafif mobil kesif ekrani.'}
        </p>
      </section>

      <button
        type="button"
        className="mb-1.5 flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left active:scale-[0.995]"
        style={{ background: 'rgba(var(--glass-tint),0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.035)' }}
        aria-label="Kesifte ara"
      >
        <Search size={15} className="shrink-0 text-[var(--theme-secondary-text)]/58" />
        <span className="truncate text-[11.5px] font-semibold text-[var(--theme-secondary-text)]/62">Topluluk, etkinlik veya oda ara</span>
      </button>

      <div className="mb-1.5 flex gap-1 overflow-x-auto custom-scrollbar">
        {['Oyun', 'Ses', 'Yazilim', 'Muzik', 'Yeni'].map(chip => (
          <span
            key={chip}
            className="inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[10.5px] font-bold text-[var(--theme-secondary-text)]/70"
            style={{ background: 'rgba(var(--glass-tint),0.024)' }}
          >
            {chip}
          </span>
        ))}
      </div>

      <section className="mb-2 grid grid-cols-2 gap-1 md:grid-cols-4">
        {DISCOVER_CARDS.map(card => (
          <button
            key={card.key}
            type="button"
            onClick={() => onOpenSection?.(card.key)}
            className="flex min-h-[62px] flex-col justify-between rounded-[12px] px-2.5 py-2 text-left active:scale-[0.995]"
            style={{ background: 'rgba(var(--glass-tint),0.016)', boxShadow: 'inset 0 -1px 0 rgba(var(--glass-tint),0.035)' }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--theme-accent)]"
              style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}
              aria-hidden="true"
            >
              {card.icon}
            </span>
            <span>
              <span className="block truncate text-[12px] font-bold text-[var(--theme-text)]/90">{card.title}</span>
              <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/54">{card.subtitle}</span>
            </span>
          </button>
        ))}
      </section>

      <section className="rounded-[12px] px-3 py-2" style={{ background: 'rgba(var(--glass-tint),0.014)' }}>
        <div className="mb-2 flex items-center gap-1.5">
          <Compass size={14} className="text-[var(--theme-accent)]/78" aria-hidden="true" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">Kesif akisi</h3>
        </div>
        <div className="space-y-1">
          <DiscoverListItem title="Populer topluluklar" subtitle="Aktif sunucu onerileri" />
          <DiscoverListItem title="Yeni etkinlikler" subtitle="Bugun hareketlenen basliklar" />
          <DiscoverListItem title="Sana yakin odalar" subtitle="Sohbet ve ses kanali onerileri" />
        </div>
      </section>
      </div>
    </div>
  );
}

function DiscoverListItem({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      className="flex min-h-11 items-center gap-2.5 rounded-[11px] px-3 py-1.5"
      style={{ background: 'rgba(var(--glass-tint),0.012)' }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[var(--theme-accent)]"
        style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}
        aria-hidden="true"
      >
        <Hash size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-bold text-[var(--theme-text)]/86">{title}</span>
        <span className="block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/52">{subtitle}</span>
      </span>
    </div>
  );
}
