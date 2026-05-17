import React, { useState } from 'react';
import { Bell, CheckCircle2, Inbox, MessageCircle, Server, ShieldAlert } from 'lucide-react';

type NotificationTab = 'all' | 'dm' | 'server' | 'requests' | 'system';

interface MobileNotificationsScreenProps {
  unreadCount?: number;
  dmCount?: number;
  requestCount?: number;
  serverCount?: number;
  systemCount?: number;
}

const TABS: Array<{ key: NotificationTab; label: string }> = [
  { key: 'all', label: 'Tumu' },
  { key: 'dm', label: 'DM' },
  { key: 'server', label: 'Sunucu' },
  { key: 'requests', label: 'Istekler' },
  { key: 'system', label: 'Sistem' },
];

export default function MobileNotificationsScreen({
  unreadCount = 0,
  dmCount = 0,
  requestCount = 0,
  serverCount = 0,
  systemCount = 0,
}: MobileNotificationsScreenProps) {
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const deltaX = event.changedTouches[0]?.clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 48) return;
    const currentIndex = TABS.findIndex(tab => tab.key === activeTab);
    const nextIndex = deltaX < 0
      ? Math.min(TABS.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    setActiveTab(TABS[nextIndex].key);
  };

  const rows = getRows(activeTab, { dmCount, requestCount, serverCount, systemCount });

  return (
    <div
      className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar"
      onTouchStart={event => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => setTouchStartX(null)}
    >
      <section className="mb-2 flex flex-col gap-2 border-b border-[rgba(var(--glass-tint),0.045)] px-1 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/48">Bildirimler</p>
          <h2 className="mt-0.5 text-[20px] font-black text-[var(--theme-text)]">Gelen bildirimler</h2>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <MetricPill label="Okunmamis" value={unreadCount} />
          <MetricPill label="Istek" value={requestCount} />
          <MetricPill label="DM" value={dmCount} />
        </div>
      </section>

      <div className="mb-2 overflow-x-auto custom-scrollbar">
        <div className="flex min-w-max gap-5 border-b border-[rgba(var(--glass-tint),0.055)] sm:w-full sm:min-w-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative h-10 min-w-11 px-0 text-[12px] font-bold active:scale-[0.98] sm:flex-1 ${
                activeTab === tab.key ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/66'
              }`}
              aria-pressed={activeTab === tab.key}
            >
              {tab.label}
              {activeTab === tab.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--theme-accent)]" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-1.5 md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.75fr)]">
        <div className="space-y-1">
          {rows.length > 0 ? rows.map(row => (
            <NotificationRow key={row.id} {...row} />
          )) : (
            <EmptyState />
          )}
        </div>

        <aside className="space-y-1.5">
          <SummaryCard icon={<CheckCircle2 size={16} />} title="Hizli temizlik" text="Bildirimleri okundu olarak isaretleme sonraki fazda baglanacak." />
          <SummaryCard icon={<ShieldAlert size={16} />} title="Guvenlik" text="Istek ve rapor bildirimleri burada one cikarilacak." />
        </aside>
      </section>
    </div>
  );
}

function getRows(activeTab: NotificationTab, counts: { dmCount: number; requestCount: number; serverCount: number; systemCount: number }) {
  const rows = [
    { id: 'dm', type: 'dm' as NotificationTab, icon: <MessageCircle size={16} />, title: 'Yeni DM bildirimi', text: counts.dmCount > 0 ? `${counts.dmCount} okunmamis mesaj var` : 'Yeni mesajlar burada gorunecek' },
    { id: 'server', type: 'server' as NotificationTab, icon: <Server size={16} />, title: 'Sunucu hareketleri', text: counts.serverCount > 0 ? `${counts.serverCount} sunucu bildirimi` : 'Duyuru, etkinlik ve kanal bildirimleri' },
    { id: 'requests', type: 'requests' as NotificationTab, icon: <Inbox size={16} />, title: 'Istekler', text: counts.requestCount > 0 ? `${counts.requestCount} bekleyen istek` : 'Arkadas ve mesaj istekleri' },
    { id: 'system', type: 'system' as NotificationTab, icon: <Bell size={16} />, title: 'Sistem', text: counts.systemCount > 0 ? `${counts.systemCount} sistem bildirimi` : 'Uygulama ve hesap bildirimleri' },
  ];
  return activeTab === 'all' ? rows : rows.filter(row => row.type === activeTab);
}

function NotificationRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      className="flex min-h-12 w-full items-center gap-2.5 rounded-[13px] px-3 py-1.5 text-left active:scale-[0.995]"
      style={{ background: 'rgba(var(--glass-tint),0.032)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.028)' }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-bold text-[var(--theme-text)]/88">{title}</span>
        <span className="block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/52">{text}</span>
      </span>
    </button>
  );
}

function SummaryCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <section className="rounded-[14px] px-3 py-2.5" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
      <div className="mb-1.5 flex items-center gap-2 text-[var(--theme-accent)]">
        {icon}
        <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/62">{title}</h3>
      </div>
      <p className="text-[11px] leading-5 text-[var(--theme-secondary-text)]/56">{text}</p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-[16px] px-4 py-5 text-center" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}>
        <Bell size={19} />
      </div>
      <h3 className="text-[13px] font-bold text-[var(--theme-text)]/88">Bildirim yok</h3>
      <p className="mx-auto mt-1 max-w-[240px] text-[11px] leading-5 text-[var(--theme-secondary-text)]/56">Bu filtrede gosterilecek bildirim bulunmuyor.</p>
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold text-[var(--theme-secondary-text)]/72" style={{ background: 'rgba(var(--glass-tint),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.035)' }}>
      <span className="text-[var(--theme-text)]/90">{value}</span>
      {label}
    </span>
  );
}
