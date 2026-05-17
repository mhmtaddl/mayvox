import React from 'react';
import { CalendarDays, Compass, Megaphone, ScrollText, ShieldCheck } from 'lucide-react';

type MobileServerSection = 'announcements' | 'events' | 'discoveries' | 'rules' | 'activity';

interface PreviewItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface MobileServerHomeProps {
  serverName?: string;
  serverDescription?: string;
  memberCount?: number;
  onlineCount?: number;
  roomCount?: number;
  announcementCount?: number;
  eventCount?: number;
  discoveryCount?: number;
  activityCount?: number;
  featuredAnnouncementTitle?: string;
  upcomingEventTitle?: string;
  discoveryItems?: PreviewItem[];
  activityItems?: PreviewItem[];
  activeSection?: MobileServerSection;
  onOpenSection?: (section: MobileServerSection) => void;
}

export default function MobileServerHome({
  serverName,
  serverDescription,
  memberCount,
  onlineCount,
  roomCount,
  announcementCount,
  eventCount,
  discoveryCount,
  activityCount,
  featuredAnnouncementTitle,
  upcomingEventTitle,
  discoveryItems = [],
  activityItems = [],
  activeSection = 'announcements',
  onOpenSection,
}: MobileServerHomeProps) {
  const name = serverName || 'MAYVox';
  const description = serverDescription || 'Sunucu ozeti ve topluluk hareketleri';
  const activePreview = getActivePreview({
    activeSection,
    featuredAnnouncementTitle,
    upcomingEventTitle,
    discoveryItems,
    activityItems,
  });

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar">
      <div className="w-full">
      <section className="mb-2 flex flex-col gap-2 border-b border-[rgba(var(--glass-tint),0.045)] px-1 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/48">Sunucu</p>
          <h2 className="mt-0.5 truncate text-[20px] font-black text-[var(--theme-text)]">{name}</h2>
          <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-[var(--theme-secondary-text)]/68">{description}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <MetricPill label="Online" value={onlineCount} />
          <MetricPill label="Uye" value={memberCount} />
          <MetricPill label="Oda" value={roomCount} />
        </div>
      </section>

      <section className="mb-2 rounded-[12px] px-3 py-2" style={{ background: 'rgba(var(--glass-tint),0.014)' }}>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[var(--theme-accent)]/78" aria-hidden="true">{activePreview.icon}</span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">{activePreview.title}</h3>
        </div>
        <div className="space-y-1">
          {activePreview.items.length > 0 ? activePreview.items.map(item => (
            <div key={item.id} className="rounded-[11px] px-3 py-1.5" style={{ background: 'rgba(var(--glass-tint),0.012)', boxShadow: 'inset 0 -1px 0 rgba(var(--glass-tint),0.028)' }}>
              <p className="truncate text-[12px] font-semibold text-[var(--theme-text)]/88">{item.title}</p>
              {item.subtitle && <p className="mt-0.5 truncate text-[10.5px] text-[var(--theme-secondary-text)]/56">{item.subtitle}</p>}
            </div>
          )) : (
            <div className="rounded-[11px] px-3 py-1.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/56" style={{ background: 'rgba(var(--glass-tint),0.012)' }}>
              {activePreview.emptyText}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-x-2 md:grid-cols-2">
        <PreviewBlock
          title="One cikan duyuru"
          emptyText="Henuz one cikan duyuru yok"
          items={featuredAnnouncementTitle ? [{ id: 'featured', title: featuredAnnouncementTitle }] : []}
          icon={<Megaphone size={14} />}
        />

        <PreviewBlock
          title="Yaklasan etkinlik"
          emptyText="Planlanmis etkinlik yok"
          items={upcomingEventTitle ? [{ id: 'event', title: upcomingEventTitle }] : []}
          icon={<CalendarDays size={14} />}
        />

        <PreviewBlock
          title="Kesif ozeti"
          emptyText="Henuz kesif onerisi yok"
          items={discoveryItems.slice(0, 2)}
          icon={<Compass size={14} />}
        />

        <PreviewBlock
          title="Son hareketler"
          emptyText="Yeni hareket yok"
          items={activityItems.slice(0, 3)}
          icon={<ScrollText size={14} />}
        />
      </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value?: number }) {
  return (
    <span
      className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold text-[var(--theme-secondary-text)]/72"
      style={{ background: 'rgba(var(--glass-tint),0.045)' }}
    >
      <span className="text-[var(--theme-text)]/90">{typeof value === 'number' ? value : '-'}</span>
      {label}
    </span>
  );
}

function getActivePreview({
  activeSection,
  featuredAnnouncementTitle,
  upcomingEventTitle,
  discoveryItems,
  activityItems,
}: {
  activeSection: MobileServerSection;
  featuredAnnouncementTitle?: string;
  upcomingEventTitle?: string;
  discoveryItems: PreviewItem[];
  activityItems: PreviewItem[];
}) {
  if (activeSection === 'events') {
    return {
      title: 'Etkinlikler',
      emptyText: 'Planlanmis etkinlik yok',
      items: upcomingEventTitle ? [{ id: 'event', title: upcomingEventTitle }] : [],
      icon: <CalendarDays size={14} />,
    };
  }
  if (activeSection === 'discoveries') {
    return {
      title: 'Kesif',
      emptyText: 'Henuz kesif onerisi yok',
      items: discoveryItems.slice(0, 3),
      icon: <Compass size={14} />,
    };
  }
  if (activeSection === 'rules') {
    return {
      title: 'Kurallar',
      emptyText: 'Sunucu kurallari sonraki fazda burada gorunecek',
      items: [],
      icon: <ShieldCheck size={14} />,
    };
  }
  if (activeSection === 'activity') {
    return {
      title: 'Hareketler',
      emptyText: 'Yeni hareket yok',
      items: activityItems.slice(0, 3),
      icon: <ScrollText size={14} />,
    };
  }
  return {
    title: 'Duyurular',
    emptyText: 'Henuz one cikan duyuru yok',
    items: featuredAnnouncementTitle ? [{ id: 'featured', title: featuredAnnouncementTitle }] : [],
    icon: <Megaphone size={14} />,
  };
}

function PreviewBlock({
  title,
  emptyText,
  items,
  icon,
}: {
  title: string;
  emptyText: string;
  items: PreviewItem[];
  icon: React.ReactNode;
}) {
  return (
    <section className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <span className="text-[var(--theme-accent)]/78" aria-hidden="true">{icon}</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">{title}</h3>
      </div>
      <div className="space-y-1">
        {items.length > 0 ? items.map(item => (
          <div
            key={item.id}
            className="rounded-[11px] px-3 py-1.5"
            style={{
              background: 'rgba(var(--glass-tint),0.014)',
              boxShadow: 'inset 0 -1px 0 rgba(var(--glass-tint),0.028)',
            }}
          >
            <p className="truncate text-[12px] font-semibold text-[var(--theme-text)]/88">{item.title}</p>
            {item.subtitle && <p className="mt-0.5 truncate text-[10.5px] text-[var(--theme-secondary-text)]/56">{item.subtitle}</p>}
          </div>
        )) : (
          <div className="rounded-[11px] px-3 py-1.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/56" style={{ background: 'rgba(var(--glass-tint),0.012)' }}>
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}
