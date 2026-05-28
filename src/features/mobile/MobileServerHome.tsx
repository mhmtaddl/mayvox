import React, { useCallback, useMemo, useState } from 'react';
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
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const activePreview = useMemo(() => getActivePreview({
    activeSection,
    featuredAnnouncementTitle,
    upcomingEventTitle,
    discoveryItems,
    activityItems,
  }), [activeSection, activityItems, discoveryItems, featuredAnnouncementTitle, upcomingEventTitle]);
  const previewBlocks = useMemo(() => ([
    {
      title: 'One cikan duyuru',
      emptyText: 'Henuz one cikan duyuru yok',
      items: featuredAnnouncementTitle ? [{ id: 'featured', title: featuredAnnouncementTitle }] : [],
      icon: <Megaphone size={14} />,
    },
    {
      title: 'Yaklasan etkinlik',
      emptyText: 'Planlanmis etkinlik yok',
      items: upcomingEventTitle ? [{ id: 'event', title: upcomingEventTitle }] : [],
      icon: <CalendarDays size={14} />,
    },
    {
      title: 'Kesif ozeti',
      emptyText: 'Henuz kesif onerisi yok',
      items: discoveryItems.slice(0, 2),
      icon: <Compass size={14} />,
    },
    {
      title: 'Son hareketler',
      emptyText: 'Yeni hareket yok',
      items: activityItems.slice(0, 3),
      icon: <ScrollText size={14} />,
    },
  ]), [activityItems, discoveryItems, featuredAnnouncementTitle, upcomingEventTitle]);
  const memberTotal = typeof memberCount === 'number' ? memberCount : 0;
  const onlineTotal = typeof onlineCount === 'number' ? onlineCount : 0;

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    setTouchStart({ x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 });
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    setTouchStart(null);
    if (!touch) return;

    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;

    const currentIndex = SERVER_SECTIONS.findIndex(section => section.key === activeSection);
    if (currentIndex < 0) return;
    const nextIndex = deltaX < 0
      ? Math.min(SERVER_SECTIONS.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    if (nextIndex !== currentIndex) onOpenSection?.(SERVER_SECTIONS[nextIndex].key);
  }, [activeSection, onOpenSection, touchStart]);

  const handleTouchCancel = useCallback(() => setTouchStart(null), []);

  return (
    <div
      className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div className="w-full">
      <section className="mb-2 flex flex-col gap-2 border-b border-[rgba(var(--glass-tint),0.045)] px-1 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="mt-0.5 text-[20px] font-black leading-tight text-[var(--theme-text)]">{name} sunucusuna hoş geldiniz</h2>
          <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-[var(--theme-secondary-text)]/68">{description}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <MemberMetricPill online={onlineTotal} total={memberTotal} />
        </div>
      </section>

      <section className="mb-2">
        <div
          className="grid grid-cols-5 overflow-hidden rounded-[14px]"
          style={SECTION_GRID_STYLE}
          aria-label="Sunucu ana sayfa bölümleri"
        >
          {SERVER_SECTIONS.map(section => {
            const active = activeSection === section.key;
            return (
              <ServerSectionButton
                key={section.key}
                section={section}
                active={active}
                onOpenSection={onOpenSection}
              />
            );
          })}
        </div>
      </section>

      <section className="mb-2 rounded-[12px] px-3 py-2" style={ACTIVE_PREVIEW_STYLE}>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[var(--theme-accent)]/78" aria-hidden="true">{activePreview.icon}</span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">{activePreview.title}</h3>
        </div>
        <div className="space-y-1">
          {activePreview.items.length > 0 ? activePreview.items.map(item => (
            <div key={item.id} className="rounded-[11px] px-3 py-1.5" style={PREVIEW_ITEM_STYLE}>
              <p className="truncate text-[12px] font-semibold text-[var(--theme-text)]/88">{item.title}</p>
              {item.subtitle && <p className="mt-0.5 truncate text-[10.5px] text-[var(--theme-secondary-text)]/56">{item.subtitle}</p>}
            </div>
          )) : (
            <div className="rounded-[11px] px-3 py-1.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/56" style={PREVIEW_EMPTY_STYLE}>
              {activePreview.emptyText}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-x-2 md:grid-cols-2">
        {previewBlocks.map(block => <PreviewBlock key={block.title} {...block} />)}
      </div>
      </div>
    </div>
  );
}

const SERVER_SECTIONS: Array<{ key: MobileServerSection; label: string; icon: React.ReactNode }> = [
  { key: 'announcements', label: 'Duyurular', icon: <Megaphone size={15} /> },
  { key: 'events', label: 'Etkinlikler', icon: <CalendarDays size={15} /> },
  { key: 'discoveries', label: 'Kesif', icon: <Compass size={15} /> },
  { key: 'rules', label: 'Kurallar', icon: <ShieldCheck size={15} /> },
  { key: 'activity', label: 'Hareketler', icon: <ScrollText size={15} /> },
];

const SECTION_GRID_STYLE = {
  background: 'rgba(var(--glass-tint),0.018)',
  boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.04)',
};
const ACTIVE_UNDERLINE_STYLE = { background: 'rgba(var(--theme-accent-rgb),0.78)' };
const ACTIVE_PREVIEW_STYLE = { background: 'rgba(var(--glass-tint),0.014)' };
const PREVIEW_ITEM_STYLE = {
  background: 'rgba(var(--glass-tint),0.012)',
  boxShadow: 'inset 0 -1px 0 rgba(var(--glass-tint),0.028)',
};
const PREVIEW_EMPTY_STYLE = { background: 'rgba(var(--glass-tint),0.012)' };
const MEMBER_PILL_STYLE = { background: 'rgba(var(--glass-tint),0.045)' };

function MemberMetricPill({ online, total }: { online: number; total: number }) {
  return (
    <span
      className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold text-[var(--theme-secondary-text)]/72"
      style={MEMBER_PILL_STYLE}
    >
      <span className="text-[var(--theme-accent)]">{online}</span>
      <span className="text-[var(--theme-secondary-text)]/50">/</span>
      <span className="text-[var(--theme-text)]/88">{total}</span>
      <span>online</span>
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

const ServerSectionButton = React.memo(function ServerSectionButton({
  section,
  active,
  onOpenSection,
}: {
  section: { key: MobileServerSection; label: string; icon: React.ReactNode };
  active: boolean;
  onOpenSection?: (section: MobileServerSection) => void;
}) {
  const handleClick = useCallback(() => onOpenSection?.(section.key), [onOpenSection, section.key]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-center transition-colors active:scale-[0.98] ${
        active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/64 hover:text-[var(--theme-text)]/82'
      }`}
      aria-pressed={active}
    >
      <span className={active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/60'} aria-hidden="true">
        {section.icon}
      </span>
      <span className="max-w-full truncate text-[10.5px] font-black leading-none">{section.label}</span>
      {active && (
        <span
          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
          style={ACTIVE_UNDERLINE_STYLE}
          aria-hidden="true"
        />
      )}
    </button>
  );
});

const PreviewBlock = React.memo(function PreviewBlock({
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
            style={PREVIEW_ITEM_STYLE}
          >
            <p className="truncate text-[12px] font-semibold text-[var(--theme-text)]/88">{item.title}</p>
            {item.subtitle && <p className="mt-0.5 truncate text-[10.5px] text-[var(--theme-secondary-text)]/56">{item.subtitle}</p>}
          </div>
        )) : (
          <div className="rounded-[11px] px-3 py-1.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/56" style={PREVIEW_EMPTY_STYLE}>
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
});
