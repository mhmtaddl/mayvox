import React, { useMemo, useState } from 'react';
import { Ban, Bell, Check, Flag, Info, Inbox, Layers, MessageCircle, Plus, Search, Send, ShieldOff, SlidersHorizontal, UserPlus, UsersRound, Volume2, X } from 'lucide-react';
import MobileUserListItem, { type MobileUserStatus } from './MobileUserListItem';

type MobileSocialTab = 'dm' | 'friends' | 'serverMembers' | 'requests' | 'online' | 'blocked' | 'messageSettings';
type MobileSocialMode = 'full' | 'friends';

interface MobileDmItem {
  id: string;
  name: string;
  avatarUrl?: string;
  subtitle?: string;
  unreadCount?: number;
  online?: boolean;
}

interface MobileFriendItem {
  id: string;
  name: string;
  avatarUrl?: string;
  status?: MobileUserStatus;
  subtitle?: string;
  statusText?: string;
  serverName?: string | null;
  gameActivity?: string;
  lastSeenText?: string;
  platform?: 'mobile' | 'desktop';
}

interface MobileRequestItem {
  id: string;
  name: string;
  avatarUrl?: string;
  subtitle?: string;
}

interface MobileSocialScreenProps {
  mode?: MobileSocialMode;
  dmCount?: number;
  friendCount?: number;
  onlineCount?: number;
  requestCount?: number;
  serverName?: string;
  serverMemberCount?: number;
  activeTab?: MobileSocialTab;
  dmItems?: MobileDmItem[];
  friendItems?: MobileFriendItem[];
  serverMemberItems?: MobileFriendItem[];
  requestItems?: MobileRequestItem[];
  onOpenDm?: (id: string) => void;
  onOpenProfile?: (id: string, x: number, y: number) => void;
  onOpenRequests?: () => void;
  onAcceptRequest?: (id: string) => void;
  onDeclineRequest?: (id: string) => void;
}

const PREVIEW_DMS: MobileDmItem[] = [
  { id: 'preview-dm-1', name: 'MAYVox Bot', subtitle: 'Mobil DM akisi burada gorunecek', unreadCount: 2, online: true },
  { id: 'preview-dm-2', name: 'Echo', subtitle: 'Son mesaj ve saat bilgisi preview', online: true },
  { id: 'preview-dm-3', name: 'Nova', subtitle: 'Gercek DMPanel bu patchte baglanmadi' },
];

const PREVIEW_FRIENDS: MobileFriendItem[] = [
  { id: 'preview-friend-1', name: 'Atlas', status: 'online', subtitle: 'Ses odasinda' },
  { id: 'preview-friend-2', name: 'Luna', status: 'idle', subtitle: 'Oyunda' },
  { id: 'preview-friend-3', name: 'Mira', status: 'offline', subtitle: 'Cevrimdisi' },
];

const PREVIEW_REQUESTS: MobileRequestItem[] = [
  { id: 'preview-request-1', name: 'Kaan', subtitle: 'Arkadaslik istegi preview' },
];

export default function MobileSocialScreen({
  mode = 'full',
  dmCount,
  friendCount,
  onlineCount,
  requestCount,
  serverName,
  serverMemberCount,
  activeTab,
  dmItems = [],
  friendItems = [],
  serverMemberItems = [],
  requestItems = [],
  onOpenProfile,
  onOpenRequests,
  onAcceptRequest,
  onDeclineRequest,
}: MobileSocialScreenProps) {
  const [localTab, setLocalTab] = useState<MobileSocialTab>(activeTab ?? (mode === 'friends' ? 'friends' : 'dm'));
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<MobileDmItem | null>(null);
  const selectedTab = activeTab ?? localTab;
  const compactFriendsMode = mode === 'friends';
  const hasRealDm = dmItems.length > 0;
  const hasRealFriends = friendItems.length > 0;
  const hasRealServerMembers = serverMemberItems.length > 0;
  const hasRealRequests = requestItems.length > 0;
  const visibleDmItems = hasRealDm ? dmItems : PREVIEW_DMS;
  const visibleFriendItems = hasRealFriends ? friendItems : PREVIEW_FRIENDS;
  const visibleServerMemberItems = hasRealServerMembers ? serverMemberItems : [];
  const visibleRequestItems = hasRealRequests ? requestItems : PREVIEW_REQUESTS;
  const onlineItems = useMemo(() => visibleFriendItems.filter(item => item.status === 'online'), [visibleFriendItems]);
  const friendOnlineCount = onlineCount ?? visibleFriendItems.filter(isVisibleOnline).length;
  const friendTotalCount = friendCount ?? friendItems.length;
  const serverOnlineCount = visibleServerMemberItems.filter(isVisibleOnline).length;
  const serverTotalCount = serverMemberCount ?? serverMemberItems.length;
  const selectedItemsTitle =
    selectedTab === 'dm' ? 'Gelen mesajlar' :
    selectedTab === 'friends' ? 'Arkadaslar' :
    selectedTab === 'serverMembers' ? (serverName || 'Sunucu') :
    selectedTab === 'requests' ? (compactFriendsMode ? 'Istekler' : 'Mesaj istekleri') :
    selectedTab === 'blocked' ? 'Engellenenler' :
    selectedTab === 'messageSettings' ? 'Mesaj ayarlari' :
    'Online';
  const listSectionClassName = compactFriendsMode
    ? 'min-w-0 px-0 py-0'
    : 'min-w-0 rounded-[14px] px-1 py-1';

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (activeConversation || touchStartX === null) return;
    const deltaX = event.changedTouches[0]?.clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 48) return;
    const tabOrder: MobileSocialTab[] = compactFriendsMode
      ? ['friends', 'serverMembers']
      : ['dm', 'requests', 'blocked', 'messageSettings'];
    const currentIndex = tabOrder.indexOf(selectedTab);
    if (currentIndex < 0) return;
    const nextIndex = deltaX < 0
      ? Math.min(tabOrder.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    setLocalTab(tabOrder[nextIndex]);
  };

  const handleTabChange = (tab: MobileSocialTab) => {
    setActiveConversation(null);
    setLocalTab(tab);
  };

  if (!compactFriendsMode && activeConversation) {
    return (
      <MobileConversationPreview
        item={activeConversation}
        isFriend={visibleFriendItems.some(friend => friend.id === activeConversation.id)}
        onBack={() => setActiveConversation(null)}
      />
    );
  }

  return (
    <>
      {compactFriendsMode && (
        <style>{`
          .mobile-social-panel-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(var(--theme-accent-rgb), 0.42) transparent;
            scrollbar-gutter: stable;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar-track,
          .mobile-social-panel-scrollbar::-webkit-scrollbar-track-piece {
            background: transparent;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar-thumb {
            min-height: 18px;
            border-radius: 999px;
            border: 28px solid transparent;
            border-left-width: 1.5px;
            border-right-width: 1.5px;
            background:
              linear-gradient(
                180deg,
                transparent 0%,
                rgba(var(--theme-accent-rgb), 0.2) 14%,
                rgba(var(--theme-accent-rgb), 0.62) 50%,
                rgba(var(--theme-accent-rgb), 0.2) 86%,
                transparent 100%
              );
            background-clip: padding-box;
            box-shadow: none;
          }
          .mobile-social-panel-scrollbar:hover::-webkit-scrollbar-thumb {
            background:
              linear-gradient(
                180deg,
                transparent 0%,
                rgba(var(--theme-accent-rgb), 0.28) 14%,
                rgba(var(--theme-accent-rgb), 0.74) 50%,
                rgba(var(--theme-accent-rgb), 0.28) 86%,
                transparent 100%
              );
            background-clip: padding-box;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar-corner {
            background: transparent;
          }
        `}</style>
        )}
      <div
        className={`h-full min-h-0 pb-3 pt-0.5 ${compactFriendsMode ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}
        onTouchStart={event => setTouchStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => setTouchStartX(null)}
      >
      <div className={`${compactFriendsMode ? 'flex h-full min-h-0 flex-col' : ''} w-full`}>
        {!compactFriendsMode && <section className="mb-2 flex flex-col gap-2 border-b border-[rgba(var(--glass-tint),0.045)] px-1 pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/48">{compactFriendsMode ? 'Sosyal panel' : 'Mesajlar'}</p>
            <h2 className="mt-0.5 text-[20px] font-black text-[var(--theme-text)]">{compactFriendsMode ? 'Arkadaslar' : 'Gelen mesajlar'}</h2>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {compactFriendsMode ? (
              <>
                <MetricPill label="Arkadas" value={friendCount ?? friendItems.length} />
                <MetricPill label="Istek" value={requestCount ?? requestItems.length} />
              </>
            ) : (
              <>
                <MetricPill label="DM" value={dmCount ?? dmItems.length} />
                <MetricPill label="Istek" value={requestCount ?? requestItems.length} />
              </>
            )}
          </div>
        </section>}

        {!compactFriendsMode && <div className="mb-1.5 flex min-h-10 items-center gap-2 rounded-[12px] px-3" style={{ background: 'rgba(var(--glass-tint),0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.035)' }}>
          <Search size={16} className="shrink-0 text-[var(--theme-secondary-text)]/52" />
          <span className="truncate text-[11.5px] font-medium text-[var(--theme-secondary-text)]/55">Mesajlarda ara</span>
        </div>}

        {!compactFriendsMode && <div className="mb-1.5 overflow-x-auto custom-scrollbar">
          <div className="flex min-w-max gap-3 border-b border-[rgba(var(--glass-tint),0.055)] sm:w-full sm:min-w-0">
            <TabButton active={selectedTab === 'dm'} label="Gelen" count={dmCount ?? dmItems.length} onClick={() => handleTabChange('dm')} />
            <TabButton active={selectedTab === 'requests'} label="Istekler" count={requestCount ?? requestItems.length} onClick={() => { handleTabChange('requests'); onOpenRequests?.(); }} />
            <TabButton active={selectedTab === 'blocked'} label="Engellenenler" onClick={() => handleTabChange('blocked')} />
            <TabButton active={selectedTab === 'messageSettings'} label="Ayarlar" onClick={() => handleTabChange('messageSettings')} />
          </div>
        </div>}

        {compactFriendsMode && (
          <div className="mb-1.5 flex gap-3 border-b border-[rgba(var(--glass-tint),0.055)]">
            <TabButton active={selectedTab === 'friends'} label="Arkadaslar" countNode={<OnlineFraction online={friendOnlineCount} total={friendTotalCount} />} onClick={() => handleTabChange('friends')} />
            <TabButton active={selectedTab === 'serverMembers'} label={serverName || 'Sunucu'} countNode={<OnlineFraction online={serverOnlineCount} total={serverTotalCount} />} onClick={() => handleTabChange('serverMembers')} />
          </div>
        )}

        <div className={compactFriendsMode ? 'min-h-0 flex-1 overflow-y-auto pr-0.5 mobile-social-panel-scrollbar' : 'grid gap-1.5 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]'}>
          <section className={listSectionClassName} style={{ background: 'transparent', boxShadow: 'none' }}>
            {!compactFriendsMode && <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[12.5px] font-black text-[var(--theme-text)]/90">{selectedItemsTitle}</h3>
                <p className="truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/52">
                  {hasRealDm || hasRealFriends || hasRealRequests ? 'Mevcut veriden preview' : 'Skeleton preview verisi'}
                </p>
              </div>
              <MetricPill label={compactFriendsMode ? 'Aktif' : 'Mesaj'} value={getActiveCount(selectedTab, visibleDmItems, visibleFriendItems, visibleRequestItems, onlineItems)} />
            </div>}
            {renderActiveList({
              selectedTab,
              dmItems: visibleDmItems,
              friendItems: visibleFriendItems,
              serverMemberItems: visibleServerMemberItems,
              requestItems: visibleRequestItems,
              onlineItems,
              onOpenDm: item => setActiveConversation(item),
              onOpenProfile: hasRealFriends || hasRealRequests ? onOpenProfile : undefined,
              onAcceptRequest: hasRealRequests ? onAcceptRequest : undefined,
              onDeclineRequest: hasRealRequests ? onDeclineRequest : undefined,
            })}
          </section>

          {!compactFriendsMode && <aside className="space-y-1.5">
            <SidePanel
              title="Son mesajlar"
              emptyText="Gelen mesaj yok"
              items={[]}
              onOpenProfile={undefined}
            />

            <section className="rounded-[12px] px-3 py-2" style={{ background: 'rgba(var(--glass-tint),0.012)' }}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">Hizli aksiyonlar</h3>
                <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/45">Preview</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <QuickAction icon={<MessageCircle size={15} />} title="Yeni mesaj" />
                <QuickAction icon={<ShieldOff size={15} />} title="Engellenenler" />
              </div>
            </section>

            <section className="rounded-[12px] px-3 py-2" style={{ background: 'rgba(var(--glass-tint),0.012)' }}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">Mesaj istegi ozeti</h3>
                <MetricPill label="Istek" value={requestCount ?? requestItems.length} />
              </div>
              <div className="space-y-1">
                {visibleRequestItems.slice(0, 2).map(item => (
                  <CompactRequestRow
                    key={item.id}
                    item={item}
                    onAcceptRequest={hasRealRequests ? onAcceptRequest : undefined}
                    onDeclineRequest={hasRealRequests ? onDeclineRequest : undefined}
                  />
                ))}
              </div>
            </section>
          </aside>}
        </div>
      </div>
      </div>
    </>
  );
}

function renderActiveList({
  selectedTab,
  dmItems,
  friendItems,
  serverMemberItems,
  requestItems,
  onlineItems,
  onOpenDm,
  onOpenProfile,
  onAcceptRequest,
  onDeclineRequest,
}: {
  selectedTab: MobileSocialTab;
  dmItems: MobileDmItem[];
  friendItems: MobileFriendItem[];
  serverMemberItems: MobileFriendItem[];
  requestItems: MobileRequestItem[];
  onlineItems: MobileFriendItem[];
  onOpenDm?: (item: MobileDmItem) => void;
  onOpenProfile?: (id: string, x: number, y: number) => void;
  onAcceptRequest?: (id: string) => void;
  onDeclineRequest?: (id: string) => void;
}) {
  if (selectedTab === 'dm') {
    return (
      <ListSection emptyIcon={<Inbox size={20} />} emptyTitle="DM listesi bos" emptyText="Mobil DM listesi sonraki fazda baglanacak.">
        {dmItems.map(item => (
          <MobileUserListItem
            key={item.id}
            id={item.id}
            name={item.name}
            avatarUrl={item.avatarUrl}
            subtitle={item.subtitle || 'Son mesaj burada gorunecek'}
            status={item.online ? 'online' : 'offline'}
            unreadCount={item.unreadCount}
            onClick={() => onOpenDm?.(item)}
          />
        ))}
      </ListSection>
    );
  }

  if (selectedTab === 'friends') {
    return (
      <ListSection emptyIcon={<UsersRound size={20} />} emptyTitle="Arkadas listesi bos" emptyText="Arkadaslar sonraki fazda bu listeye baglanacak.">
        {friendItems.map(item => (
          <MobileUserListItem
            key={item.id}
            id={item.id}
            name={item.name}
            avatarUrl={item.avatarUrl}
            subtitle={item.subtitle || statusLabel(item.status)}
            statusText={item.statusText}
            serverName={item.serverName}
            gameActivity={item.gameActivity}
            lastSeenText={item.lastSeenText}
            platform={item.platform}
            status={item.status ?? 'offline'}
            onClick={onOpenProfile}
          />
        ))}
      </ListSection>
    );
  }

  if (selectedTab === 'serverMembers') {
    return (
      <ListSection emptyIcon={<UsersRound size={20} />} emptyTitle="Sunucu uyesi bulunamadi" emptyText="Bu sunucudaki uyeler burada gorunecek.">
        {serverMemberItems.map(item => (
          <MobileUserListItem
            key={item.id}
            id={item.id}
            name={item.name}
            avatarUrl={item.avatarUrl}
            subtitle={item.subtitle || statusLabel(item.status)}
            statusText={item.statusText}
            serverName={item.serverName}
            gameActivity={item.gameActivity}
            lastSeenText={item.lastSeenText}
            platform={item.platform}
            status={item.status ?? 'offline'}
            onClick={onOpenProfile}
          />
        ))}
      </ListSection>
    );
  }

  if (selectedTab === 'requests') {
    return (
      <ListSection emptyIcon={<UserPlus size={20} />} emptyTitle="Mesaj istegi yok" emptyText="Bilinmeyen kisilerden gelen mesaj istekleri burada listelenecek.">
        {requestItems.map(item => (
          <MobileUserListItem
            key={item.id}
            id={item.id}
            name={item.name}
            avatarUrl={item.avatarUrl}
            subtitle={item.subtitle || 'Arkadaslik istegi'}
            rightSlot={<RequestActions id={item.id} onAcceptRequest={onAcceptRequest} onDeclineRequest={onDeclineRequest} />}
            onClick={onOpenProfile}
          />
        ))}
      </ListSection>
    );
  }

  if (selectedTab === 'blocked') {
    return (
      <ListSection emptyIcon={<Ban size={20} />} emptyTitle="Engellenen kisi yok" emptyText="Engelledigin kisiler ve mesaj kisitlamalari burada gorunecek.">
        {null}
      </ListSection>
    );
  }

  if (selectedTab === 'messageSettings') {
    return <MessageSettingsList />;
  }

  return (
    <ListSection emptyIcon={<UsersRound size={20} />} emptyTitle="Cevrimici arkadas yok" emptyText="Online kisiler burada gorunecek.">
      {onlineItems.map(item => (
        <MobileUserListItem
          key={item.id}
          id={item.id}
          name={item.name}
          avatarUrl={item.avatarUrl}
          subtitle={item.subtitle || 'Cevrimici'}
          statusText={item.statusText}
          serverName={item.serverName}
          gameActivity={item.gameActivity}
          lastSeenText={item.lastSeenText}
          platform={item.platform}
          status="online"
          onClick={onOpenProfile}
        />
      ))}
    </ListSection>
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

function isVisibleOnline(item: MobileFriendItem) {
  return item.status === 'online' || item.status === 'idle' || item.status === 'dnd';
}

function OnlineFraction({ online, total }: { online: number; total: number }) {
  const onlineClassName = online > 0 ? 'text-emerald-400' : 'text-[var(--theme-secondary-text)]/58';
  return (
    <span className="ml-1 inline-flex items-baseline gap-0.5 text-[10px] font-black tabular-nums">
      <span className={onlineClassName}>{online}</span>
      <span className="text-[var(--theme-secondary-text)]/46">/</span>
      <span className="text-[var(--theme-secondary-text)]/58">{total}</span>
    </span>
  );
}

function TabButton({ active, label, count, countNode, onClick }: { active: boolean; label: string; count?: number; countNode?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-9 min-w-11 px-0 text-[11.5px] font-bold active:scale-[0.98] sm:flex-1 ${active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/66'}`}
      aria-pressed={active}
    >
      {label}
      {countNode}
      {typeof count === 'number' && (
        <span
          className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black"
          style={{
            background: active ? 'rgba(var(--theme-accent-rgb),0.16)' : 'rgba(var(--glass-tint),0.05)',
            color: active ? 'var(--theme-accent)' : 'rgba(var(--glass-tint),0.62)',
          }}
        >
          {count}
        </span>
      )}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: 'rgba(var(--theme-accent-rgb),0.82)' }} />}
    </button>
  );
}

function ListSection({
  children,
  emptyIcon,
  emptyTitle,
  emptyText,
}: {
  children: React.ReactNode;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyText: string;
}) {
  const hasChildren = React.Children.count(children) > 0;

  if (!hasChildren) {
    return (
      <section className="rounded-[16px] px-4 py-4 text-center" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}>
          {emptyIcon}
        </div>
        <h3 className="text-[13px] font-bold text-[var(--theme-text)]/88">{emptyTitle}</h3>
        <p className="mx-auto mt-1 max-w-[240px] text-[11px] leading-5 text-[var(--theme-secondary-text)]/56">{emptyText}</p>
      </section>
    );
  }

  return <section className="space-y-1">{children}</section>;
}

function SidePanel({
  title,
  emptyText,
  items,
  onOpenProfile,
}: {
  title: string;
  emptyText: string;
  items: MobileFriendItem[];
  onOpenProfile?: (id: string, x: number, y: number) => void;
}) {
  return (
    <section className="rounded-[16px] px-3 py-2.5" style={{ background: 'rgba(var(--glass-tint),0.022)' }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">{title}</h3>
        <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/45">{items.length}</span>
      </div>
      <div className="space-y-1">
        {items.length > 0 ? items.map(item => (
          <MobileUserListItem
            key={item.id}
            id={item.id}
            name={item.name}
            avatarUrl={item.avatarUrl}
            subtitle={item.subtitle || 'Cevrimici'}
            statusText={item.statusText}
            serverName={item.serverName}
            gameActivity={item.gameActivity}
            lastSeenText={item.lastSeenText}
            platform={item.platform}
            status={item.status ?? 'online'}
            onClick={onOpenProfile}
          />
        )) : (
          <div className="rounded-[13px] px-3 py-2.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/54" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function RequestActions({
  id,
  onAcceptRequest,
  onDeclineRequest,
}: {
  id: string;
  onAcceptRequest?: (id: string) => void;
  onDeclineRequest?: (id: string) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={(event) => { event.stopPropagation(); onAcceptRequest?.(id); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-300" style={{ background: 'rgba(34,197,94,0.10)' }} aria-label="Kabul et">
        <Check size={14} />
      </button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onDeclineRequest?.(id); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-300" style={{ background: 'rgba(239,68,68,0.10)' }} aria-label="Reddet">
        <X size={14} />
      </button>
    </span>
  );
}

function CompactRequestRow({
  item,
  onAcceptRequest,
  onDeclineRequest,
}: {
  key?: unknown;
  item: MobileRequestItem;
  onAcceptRequest?: (id: string) => void;
  onDeclineRequest?: (id: string) => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-[13px] px-3 py-1.5" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-[var(--theme-text)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}>
        {item.name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold text-[var(--theme-text)]/84">{item.name}</span>
        <span className="block truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/50">{item.subtitle || 'Arkadaslik istegi'}</span>
      </span>
      <RequestActions id={item.id} onAcceptRequest={onAcceptRequest} onDeclineRequest={onDeclineRequest} />
    </div>
  );
}

function QuickAction({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      className="flex min-h-11 items-center gap-2 rounded-[13px] px-3 text-left text-[var(--theme-secondary-text)]/72 active:scale-[0.995]"
      style={{ background: 'rgba(var(--glass-tint),0.024)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.024)' }}
    >
      <span className="text-[var(--theme-accent)]" aria-hidden="true">{icon}</span>
      <span className="truncate text-[11px] font-bold">{title}</span>
      <Plus size={13} className="ml-auto shrink-0 text-[var(--theme-secondary-text)]/38" aria-hidden="true" />
    </button>
  );
}

function getActiveCount(
  selectedTab: MobileSocialTab,
  dmItems: MobileDmItem[],
  friendItems: MobileFriendItem[],
  requestItems: MobileRequestItem[],
  onlineItems: MobileFriendItem[],
) {
  if (selectedTab === 'dm') return dmItems.length;
  if (selectedTab === 'friends') return friendItems.length;
  if (selectedTab === 'requests') return requestItems.length;
  if (selectedTab === 'blocked') return 0;
  if (selectedTab === 'messageSettings') return 4;
  return onlineItems.length;
}

function MobileConversationPreview({
  item,
  isFriend,
  onBack,
}: {
  item: MobileDmItem;
  isFriend: boolean;
  onBack: () => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar">
      <section className="mb-2 border-b border-[rgba(var(--glass-tint),0.055)] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 min-w-10 items-center justify-center rounded-[12px] text-[var(--theme-secondary-text)]/72 active:scale-[0.98]"
            style={{ background: 'rgba(var(--glass-tint),0.035)' }}
            aria-label="Gelen mesajlara don"
          >
            <Inbox size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/48">Sohbet</p>
            <h2 className="truncate text-[17px] font-black text-[var(--theme-text)]">{item.name}</h2>
            <p className="truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/54">{item.subtitle || 'Son mesaj preview'}</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <ConversationAction icon={<Info size={15} />} label="Detay" />
          {!isFriend && <ConversationAction icon={<UserPlus size={15} />} label="Ekle" />}
          <ConversationAction icon={<Flag size={15} />} label="Bildir" />
          <ConversationAction icon={<Ban size={15} />} label="Engelle" tone="danger" />
        </div>
      </section>

      <section className="space-y-2">
        <MessageBubble author={item.name} text="Selam, mobil DM ekraninin yeni akisi burada gorunecek." />
        <MessageBubble own text="Tamam, sohbet detaylari ve guvenlik aksiyonlari ustte." />
        <MessageBubble author={item.name} text="Gercek DM entegrasyonu sonraki fazda baglanabilir." />
      </section>
    </div>
  );
}

function ConversationAction({ icon, label, tone }: { icon: React.ReactNode; label: string; tone?: 'danger' }) {
  return (
    <button
      type="button"
      className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[13px] text-[10px] font-bold active:scale-[0.98] ${
        tone === 'danger' ? 'text-red-300/78' : 'text-[var(--theme-secondary-text)]/72'
      }`}
      style={{ background: 'rgba(var(--glass-tint),0.032)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.028)' }}
    >
      <span className={tone === 'danger' ? 'text-red-300/82' : 'text-[var(--theme-accent)]'}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function MessageBubble({ author, text, own }: { author?: string; text: string; own?: boolean }) {
  return (
    <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[76%] rounded-[15px] px-3 py-2 ${own ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text)]/88'}`}
        style={{
          background: own ? 'rgba(var(--theme-accent-rgb),0.11)' : 'rgba(var(--glass-tint),0.035)',
          boxShadow: own ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.08)' : 'inset 0 0 0 1px rgba(var(--glass-tint),0.028)',
        }}
      >
        {author && <p className="mb-0.5 text-[10px] font-black text-[var(--theme-accent)]/82">{author}</p>}
        <p className="text-[12px] leading-5">{text}</p>
      </div>
    </div>
  );
}

function MessageSettingsList() {
  const rows = [
    { id: 'dm-privacy', title: 'DM gizliligi', subtitle: 'Kimler direkt mesaj gonderebilir', icon: <ShieldOff size={15} /> },
    { id: 'read-receipts', title: 'Okundu bilgisi', subtitle: 'Mesaj okundu durumunu goster', icon: <Info size={15} /> },
    { id: 'message-tone', title: 'Mesaj sesi secimi', subtitle: '3 ses arasindan secim', icon: <Volume2 size={15} /> },
    { id: 'message-volume', title: 'Ses seviyesi', subtitle: 'DM ses seviyesi', icon: <SlidersHorizontal size={15} /> },
    { id: 'room-message-sound', title: 'Sohbet odasinda mesaj sesi', subtitle: 'Oda mesajlari icin ses', icon: <Volume2 size={15} /> },
    { id: 'send-sound', title: 'Mesaj gonderim sesi', subtitle: 'Gonderince ses cal', icon: <Send size={15} /> },
    { id: 'desktop-notifications', title: 'Masaustu bildirimi', subtitle: 'DM icin sistem bildirimi', icon: <Bell size={15} /> },
    { id: 'group-messages', title: 'Ardisik mesajlari grupla', subtitle: 'Ayni kisiden gelenleri birlestir', icon: <Layers size={15} /> },
  ];

  return (
    <section className="space-y-1">
      {rows.map(row => (
        <button
          key={row.id}
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-[13px] px-3 py-1.5 text-left active:scale-[0.995]"
          style={{ background: 'rgba(var(--glass-tint),0.032)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.028)' }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}>
            {row.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold text-[var(--theme-text)]/88">{row.title}</span>
            <span className="block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/52">{row.subtitle}</span>
          </span>
        </button>
      ))}
    </section>
  );
}

function statusLabel(status?: MobileUserStatus) {
  if (status === 'online') return 'Cevrimici';
  if (status === 'idle') return 'Bosta';
  if (status === 'dnd') return 'Rahatsiz etmeyin';
  return 'Cevrimdisi';
}
