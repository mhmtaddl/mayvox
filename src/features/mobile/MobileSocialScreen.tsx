import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Ban, Bell, Check, Flag, Info, Inbox, Layers, MessageCircle, Plus, Search, Send, ShieldOff, SlidersHorizontal, UserPlus, UsersRound, Volume2, X } from 'lucide-react';
import MobileUserListItem, { type MobileUserStatus } from './MobileUserListItem';
import type { VisualRole } from '../../components/RoleBadge';

type MobileSocialTab = 'dm' | 'friends' | 'serverMembers' | 'requests' | 'online' | 'blocked' | 'messageSettings';
type MobileSocialMode = 'full' | 'friends';
const MOBILE_LIST_WINDOW = 72;

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
  role?: VisualRole;
}

interface MobileRequestItem {
  id: string;
  name: string;
  avatarUrl?: string;
  subtitle?: string;
}

const MESSAGE_SETTINGS_ROWS = [
  { id: 'dm-privacy', title: 'DM gizliligi', subtitle: 'Kimler direkt mesaj gonderebilir', icon: <ShieldOff size={15} /> },
  { id: 'read-receipts', title: 'Okundu bilgisi', subtitle: 'Mesaj okundu durumunu goster', icon: <Info size={15} /> },
  { id: 'message-tone', title: 'Mesaj sesi secimi', subtitle: '3 ses arasindan secim', icon: <Volume2 size={15} /> },
  { id: 'message-volume', title: 'Ses seviyesi', subtitle: 'DM ses seviyesi', icon: <SlidersHorizontal size={15} /> },
  { id: 'room-message-sound', title: 'Sohbet odasinda mesaj sesi', subtitle: 'Oda mesajlari icin ses', icon: <Volume2 size={15} /> },
  { id: 'send-sound', title: 'Mesaj gonderim sesi', subtitle: 'Gonderince ses cal', icon: <Send size={15} /> },
  { id: 'desktop-notifications', title: 'Masaustu bildirimi', subtitle: 'DM icin sistem bildirimi', icon: <Bell size={15} /> },
  { id: 'group-messages', title: 'Ardisik mesajlari grupla', subtitle: 'Ayni kisiden gelenleri birlestir', icon: <Layers size={15} /> },
] as const;

interface MobileSocialScreenProps {
  mode?: MobileSocialMode;
  dmCount?: number;
  friendCount?: number;
  onlineCount?: number;
  requestCount?: number;
  serverName?: string;
  serverMemberCount?: number;
  serverOnlineCount?: number;
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
  onTabChange?: (tab: MobileSocialTab) => void;
}

export default function MobileSocialScreen({
  mode = 'full',
  dmCount,
  friendCount,
  onlineCount,
  requestCount,
  serverName,
  serverMemberCount,
  serverOnlineCount,
  activeTab,
  dmItems = [],
  friendItems = [],
  serverMemberItems = [],
  requestItems = [],
  onOpenProfile,
  onOpenRequests,
  onAcceptRequest,
  onDeclineRequest,
  onTabChange,
}: MobileSocialScreenProps) {
  const [localTab, setLocalTab] = useState<MobileSocialTab>(activeTab ?? (mode === 'friends' ? 'friends' : 'dm'));
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<MobileDmItem | null>(null);
  const selectedTab = activeTab ?? localTab;
  const compactFriendsMode = mode === 'friends';
  const hasRealServerMembers = serverMemberItems.length > 0;
  const deferredDmItems = useDeferredValue(dmItems);
  const deferredFriendItems = useDeferredValue(friendItems);
  const deferredServerMemberItems = useDeferredValue(serverMemberItems);
  const deferredRequestItems = useDeferredValue(requestItems);
  const visibleDmItems = deferredDmItems;
  const visibleFriendItems = deferredFriendItems;
  const visibleServerMemberItems = hasRealServerMembers ? deferredServerMemberItems : [];
  const visibleRequestItems = deferredRequestItems;
  const friendPresence = useMemo(() => splitPresenceItems(visibleFriendItems), [visibleFriendItems]);
  const serverPresence = useMemo(() => splitPresenceItems(visibleServerMemberItems), [visibleServerMemberItems]);
  const onlineItems = friendPresence.online;
  const visibleFriendOnlineCount = friendPresence.online.length;
  const visibleServerOnlineCount = serverPresence.online.length;
  const friendOnlineCount = onlineCount ?? visibleFriendOnlineCount;
  const friendTotalCount = friendCount ?? friendItems.length;
  const serverVisibleOnlineCount = serverOnlineCount ?? visibleServerOnlineCount;
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
    const nextTab = tabOrder[nextIndex];
    setLocalTab(nextTab);
    onTabChange?.(nextTab);
  };

  const handleTabChange = useCallback((tab: MobileSocialTab) => {
    setActiveConversation(null);
    setLocalTab(tab);
    onTabChange?.(tab);
  }, [onTabChange]);
  const handleRequestsTab = useCallback(() => {
    handleTabChange('requests');
    onOpenRequests?.();
  }, [handleTabChange, onOpenRequests]);
  const handleOpenDm = useCallback((item: MobileDmItem) => setActiveConversation(item), []);
  useEffect(() => {
    if (selectedTab === 'serverMembers') onTabChange?.('serverMembers');
  }, [onTabChange, selectedTab]);
  const activeList = useMemo(() => renderActiveList({
    selectedTab,
    dmItems: visibleDmItems,
    friendItems: visibleFriendItems,
    serverMemberItems: visibleServerMemberItems,
    requestItems: visibleRequestItems,
    onlineItems,
    onOpenDm: handleOpenDm,
    onOpenProfile,
    onAcceptRequest,
    onDeclineRequest,
  }), [
    selectedTab,
    visibleDmItems,
    visibleFriendItems,
    visibleServerMemberItems,
    visibleRequestItems,
    onlineItems,
    handleOpenDm,
    onOpenProfile,
    onAcceptRequest,
    onDeclineRequest,
  ]);

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
            scrollbar-color: rgba(var(--glass-tint), 0.18) transparent;
            scrollbar-gutter: stable;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar {
            width: 2px;
            height: 2px;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar-track,
          .mobile-social-panel-scrollbar::-webkit-scrollbar-track-piece {
            background: transparent;
          }
          .mobile-social-panel-scrollbar::-webkit-scrollbar-thumb {
            min-height: 12px;
            border-radius: 999px;
            border: 0;
            background:
              linear-gradient(
                180deg,
                transparent 0%,
                rgba(var(--glass-tint), 0.04) 12%,
                rgba(var(--glass-tint), 0.20) 38%,
                rgba(var(--glass-tint), 0.20) 62%,
                rgba(var(--glass-tint), 0.04) 88%,
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
                rgba(var(--glass-tint), 0.06) 12%,
                rgba(var(--glass-tint), 0.28) 38%,
                rgba(var(--glass-tint), 0.28) 62%,
                rgba(var(--glass-tint), 0.06) 88%,
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
            <TabButton active={selectedTab === 'dm'} tab="dm" label="Gelen" count={dmCount ?? dmItems.length} onSelect={handleTabChange} />
            <TabButton active={selectedTab === 'requests'} label="Istekler" count={requestCount ?? requestItems.length} onClick={handleRequestsTab} />
            <TabButton active={selectedTab === 'blocked'} tab="blocked" label="Engellenenler" onSelect={handleTabChange} />
            <TabButton active={selectedTab === 'messageSettings'} tab="messageSettings" label="Ayarlar" onSelect={handleTabChange} />
          </div>
        </div>}

        {compactFriendsMode && (
          <div className="mb-1.5 grid grid-cols-2 gap-2 border-b border-[rgba(var(--glass-tint),0.055)]">
            <TabButton active={selectedTab === 'friends'} tab="friends" label="Arkadaslar" countNode={<OnlineFraction online={friendOnlineCount} total={friendTotalCount} />} fillRatio={ratio(friendOnlineCount, friendTotalCount)} onSelect={handleTabChange} stretch />
            <TabButton active={selectedTab === 'serverMembers'} tab="serverMembers" label={serverName || 'Sunucu'} countNode={<OnlineFraction online={serverVisibleOnlineCount} total={serverTotalCount} />} fillRatio={ratio(serverVisibleOnlineCount, serverTotalCount)} onSelect={handleTabChange} stretch />
          </div>
        )}

        <div className={compactFriendsMode ? 'min-h-0 flex-1 overflow-y-auto pr-0.5 mobile-social-panel-scrollbar' : 'grid gap-1.5 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]'}>
          <section className={listSectionClassName} style={{ background: 'transparent', boxShadow: 'none' }}>
            {!compactFriendsMode && <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[12.5px] font-black text-[var(--theme-text)]/90">{selectedItemsTitle}</h3>
                <p className="truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/52">
                  {selectedTab === 'dm' ? 'Direkt mesajlar' : selectedTab === 'requests' ? 'Bekleyen istekler' : 'Kisi listesi'}
                </p>
              </div>
              <MetricPill label={compactFriendsMode ? 'Aktif' : 'Mesaj'} value={getActiveCount(selectedTab, visibleDmItems, visibleFriendItems, visibleRequestItems, onlineItems)} />
            </div>}
            {activeList}
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
                <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/45">Kisa yol</span>
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
                    onAcceptRequest={onAcceptRequest}
                    onDeclineRequest={onDeclineRequest}
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
  const dmWindow = windowItems(dmItems);
  const friendWindow = windowItems(friendItems);
  const serverMemberWindow = windowItems(serverMemberItems);
  const requestWindow = windowItems(requestItems);
  const onlineWindow = windowItems(onlineItems);

  if (selectedTab === 'dm') {
    return (
      <ListSection emptyIcon={<Inbox size={20} />} emptyTitle="DM listesi bos" emptyText="Henuz aktif bir mesajlasma yok.">
        {dmWindow.items.map(item => (
          <MobileDmRow
            key={item.id}
            item={item}
            onOpenDm={onOpenDm}
          />
        ))}
        {dmWindow.hiddenCount > 0 && <ListMoreHint hiddenCount={dmWindow.hiddenCount} />}
      </ListSection>
    );
  }

  if (selectedTab === 'friends') {
    return (
      <ListSection emptyIcon={<UsersRound size={20} />} emptyTitle="Arkadas listesi bos" emptyText="Arkadas eklediginde burada gorunecek.">
        {renderUserItemsWithDivider(friendWindow.items, onOpenProfile, 'friend')}
        {friendWindow.hiddenCount > 0 && <ListMoreHint hiddenCount={friendWindow.hiddenCount} />}
      </ListSection>
    );
  }

  if (selectedTab === 'serverMembers') {
    return (
      <ListSection emptyIcon={<UsersRound size={20} />} emptyTitle="Sunucu uyesi bulunamadi" emptyText="Bu sunucudaki uyeler burada gorunecek.">
        {renderUserItemsWithDivider(serverMemberWindow.items, onOpenProfile, 'server')}
        {serverMemberWindow.hiddenCount > 0 && <ListMoreHint hiddenCount={serverMemberWindow.hiddenCount} />}
      </ListSection>
    );
  }

  if (selectedTab === 'requests') {
    return (
      <ListSection emptyIcon={<UserPlus size={20} />} emptyTitle="Mesaj istegi yok" emptyText="Bilinmeyen kisilerden gelen mesaj istekleri burada listelenecek.">
        {requestWindow.items.map(item => (
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
        {requestWindow.hiddenCount > 0 && <ListMoreHint hiddenCount={requestWindow.hiddenCount} />}
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
      {onlineWindow.items.map(item => (
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
          presenceLayout="friend"
          onClick={onOpenProfile}
        />
      ))}
      {onlineWindow.hiddenCount > 0 && <ListMoreHint hiddenCount={onlineWindow.hiddenCount} />}
    </ListSection>
  );
}

function windowItems<T>(items: T[], limit = MOBILE_LIST_WINDOW) {
  if (items.length <= limit) return { items, hiddenCount: 0 };
  return { items: items.slice(0, limit), hiddenCount: items.length - limit };
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

function ratio(online: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, online / total));
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

function TabButton({
  active,
  tab,
  label,
  count,
  countNode,
  fillRatio,
  stretch = false,
  onClick,
  onSelect,
}: {
  active: boolean;
  tab?: MobileSocialTab;
  label: string;
  count?: number;
  countNode?: React.ReactNode;
  fillRatio?: number;
  stretch?: boolean;
  onClick?: () => void;
  onSelect?: (tab: MobileSocialTab) => void;
}) {
  const fillPercent = `${Math.round((fillRatio ?? 1) * 100)}%`;
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (tab) onSelect?.(tab);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative inline-flex h-9 items-center justify-center px-0 text-center text-[11.5px] font-bold active:scale-[0.98] ${stretch ? 'w-full min-w-0' : 'min-w-11 sm:flex-1'} ${active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/66'}`}
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
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden rounded-full bg-[rgba(var(--glass-tint),0.10)]">
          <span className="block h-full rounded-full bg-[rgba(var(--theme-accent-rgb),0.82)]" style={{ width: fillPercent }} />
        </span>
      )}
    </button>
  );
}

function splitPresenceItems(items: MobileFriendItem[]) {
  const online: MobileFriendItem[] = [];
  const offline: MobileFriendItem[] = [];
  for (const item of items) {
    if (isVisibleOnline(item)) online.push(item);
    else offline.push(item);
  }
  return { online, offline };
}

function renderUserItemsWithDivider(items: MobileFriendItem[], onOpenProfile?: (id: string, x: number, y: number) => void, presenceLayout: 'friend' | 'server' = 'server') {
  const { online: onlineItems, offline: offlineItems } = splitPresenceItems(items);
  const rows: React.ReactNode[] = [];

  onlineItems.forEach(item => rows.push(renderUserItem(item, onOpenProfile, presenceLayout)));
  if (onlineItems.length > 0 && offlineItems.length > 0) {
    rows.push(
      <div key="online-offline-divider" className="flex items-center gap-2 py-1.5">
        <span className="h-px flex-1 bg-[rgba(var(--glass-tint),0.075)]" />
        <span className="text-[8.5px] font-black uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/38">Cevrimdisi</span>
        <span className="h-px flex-1 bg-[rgba(var(--glass-tint),0.075)]" />
      </div>
    );
  }
  offlineItems.forEach(item => rows.push(renderUserItem(item, onOpenProfile, presenceLayout)));
  return rows;
}

function renderUserItem(item: MobileFriendItem, onOpenProfile?: (id: string, x: number, y: number) => void, presenceLayout: 'friend' | 'server' = 'server') {
  return (
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
      role={item.role}
      presenceLayout={presenceLayout}
      status={item.status ?? 'offline'}
      onClick={onOpenProfile}
    />
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
  const hasChildren = React.Children.toArray(children).length > 0;

  if (!hasChildren) {
    return (
      <section className="px-3 py-3 text-center">
        <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center text-[var(--theme-secondary-text)]/42 [&_svg]:h-4 [&_svg]:w-4">
          {emptyIcon}
        </div>
        <h3 className="text-[11.5px] font-semibold text-[var(--theme-text)]/72">{emptyTitle}</h3>
        <p className="mx-auto mt-0.5 max-w-[220px] text-[10px] leading-4 text-[var(--theme-secondary-text)]/46">{emptyText}</p>
      </section>
    );
  }

  return <section className="space-y-1">{children}</section>;
}

function ListMoreHint({ hiddenCount }: { hiddenCount: number }) {
  return (
    <div className="rounded-[10px] px-2.5 py-2 text-center text-[10px] font-bold text-[var(--theme-secondary-text)]/44" style={{ background: 'rgba(var(--glass-tint),0.016)' }}>
      +{hiddenCount} kişi daha
    </div>
  );
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

const MobileDmRow = React.memo(function MobileDmRow({
  item,
  onOpenDm,
}: {
  item: MobileDmItem;
  onOpenDm?: (item: MobileDmItem) => void;
}) {
  const handleOpen = useCallback(() => {
    onOpenDm?.(item);
  }, [item, onOpenDm]);

  return (
    <MobileUserListItem
      id={item.id}
      name={item.name}
      avatarUrl={item.avatarUrl}
      subtitle={item.subtitle || 'Son mesaj burada gorunecek'}
      status={item.online ? 'online' : 'offline'}
      unreadCount={item.unreadCount}
      onClick={handleOpen}
    />
  );
});

const RequestActions = React.memo(function RequestActions({
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
});

const CompactRequestRow = React.memo(function CompactRequestRow({
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
});

const QuickAction = React.memo(function QuickAction({ icon, title }: { icon: React.ReactNode; title: string }) {
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
});

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
            <p className="truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/54">{item.subtitle || 'Son mesaj'}</p>
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
        <MessageBubble author={item.name} text={item.subtitle || 'Henuz mesaj yok.'} />
      </section>
    </div>
  );
}

const ConversationAction = React.memo(function ConversationAction({ icon, label, tone }: { icon: React.ReactNode; label: string; tone?: 'danger' }) {
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
});

const MessageBubble = React.memo(function MessageBubble({ author, text, own }: { author?: string; text: string; own?: boolean }) {
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
});

function MessageSettingsList() {
  return (
    <section className="space-y-1">
      {MESSAGE_SETTINGS_ROWS.map(row => (
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
