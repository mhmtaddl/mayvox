import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hash, Search, Settings, UserRound } from 'lucide-react';
import type { User, VoiceChannel } from '../types';
import type { SettingsTarget } from '../contexts/UIContext';
import { getPublicDisplayName } from '../lib/formatName';
import { readCommandShortcut, shortcutMatchesEvent, type CommandShortcut } from '../lib/commandShortcut';
import EmptyState from './EmptyState';
import Modal from './Modal';

type CommandKind = 'user' | 'room' | 'setting' | 'discover';

type CommandItem = {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle: string;
  keywords: string;
  action: () => void;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  users: User[];
  friendIds: string[];
  channels: VoiceChannel[];
  activeChannelId: string | null;
  hasActiveServer: boolean;
  canManageServer: boolean;
  canCreateRoom: boolean;
  canManageAnnouncements: boolean;
  canKickMembers: boolean;
  canCreateInvite: boolean;
  canRevokeInvite: boolean;
  canViewInsights: boolean;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
  onJoinChannel: (channelId: string) => void | Promise<void>;
  onOpenSettings: (target: SettingsTarget, highlightId?: string) => void;
  onOpenServerSettings: (highlightId?: string, tab?: string) => void;
  onOpenDm: (userId: string) => void;
  onOpenUserProfile: (userId: string) => void;
  onInviteUserToRoom: (userId: string) => void;
  onOpenUserSearch: () => void;
  onOpenMessages: (settings?: boolean) => void;
  onOpenLegal: (kind: 'kvkk' | 'storage' | 'terms') => void;
  onOpenAdmin: (target?: 'users' | 'servers' | 'invite-codes' | 'invite-requests' | 'user-filters' | 'user-search') => void;
  onOpenDiscover: () => void;
  onCreateAnnouncement: (type: 'announcement' | 'event') => void;
  onCreateRoom: () => void;
  onOpenInputSettings: () => void;
  onOpenOutputSettings: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
};

const SETTINGS_ITEMS: Array<{ id: string; title: string; subtitle: string; target: SettingsTarget; highlightId?: string; keywords: string }> = [
  { id: 'settings-app', title: 'Uygulama Ayarları', subtitle: 'Ses, performans, bildirim ve oyun davranışları', target: 'app', keywords: 'ayar uygulama ses bildirim performans oyun davranış' },
  { id: 'settings-appearance', title: 'Görünüm Ayarları', subtitle: 'Tema, arayüz yoğunluğu ve oyun içi gösterge', target: 'appearance', highlightId: 'appearance', keywords: 'görünüm gorunum tema arayüz arayuz overlay oyun içi gösterge yazı yazi dock' },
  { id: 'settings-account', title: 'Hesap Ayarları', subtitle: 'Profil, gizlilik ve otomatik oyun algılama', target: 'account', keywords: 'hesap profil gizlilik oyun algılama otomatik' },
  { id: 'settings-profile-photo', title: 'Profil Resmini Değiştir', subtitle: 'Hesap ayarlarında profil fotoğrafı', target: 'account', highlightId: 'profile-photo', keywords: 'resim foto profil avatar pp değiştirme hesap' },
  { id: 'settings-game-activity', title: 'Otomatik Oyun Algılama', subtitle: 'Oynadığın oyunu durum olarak göster', target: 'app', highlightId: 'game-activity', keywords: 'oyun otomatik algılama durum activity game' },
  { id: 'settings-overlay', title: 'Oyun İçi Ses Göstergesi', subtitle: 'Overlay konum, stil ve görünürlük ayarları', target: 'appearance', highlightId: 'voice-overlay', keywords: 'oyun içi gösterge overlay ses konuşan rozet konum masaüstü' },
  { id: 'settings-theme', title: 'Tema Ayarları', subtitle: 'Görünüm ve tema paketleri', target: 'appearance', highlightId: 'appearance', keywords: 'tema görünüm renk dark light arayüz' },
  { id: 'settings-sounds', title: 'Ses Ayarları', subtitle: 'Bildirim ve uygulama sesleri', target: 'app', highlightId: 'sounds', keywords: 'ses bildirim ton mute ptt davet' },
  { id: 'settings-performance', title: 'Performans Ayarları', subtitle: 'Düşük veri ve performans tercihleri', target: 'app', highlightId: 'performance', keywords: 'performans düşük veri low data kasma fps' },
  { id: 'settings-close-behavior', title: 'Kapatma Davranışı', subtitle: 'Çarpıya basınca simgeye küçült veya uygulamayı kapat', target: 'app', highlightId: 'close-behavior', keywords: 'kapatma davranışı carpi çarpı x pencere kapat gizli simge tray küçült kucult tamamen kapat çıkış cikis close quit minimize system tray' },
  { id: 'settings-shortcuts', title: 'Kısayollar', subtitle: 'Uygulama kısayollarını değiştir', target: 'shortcuts', highlightId: 'shortcuts', keywords: 'kısayol kısayollar kisayol kisayollar komut paleti ctrl k command shortcut tuş kombinasyonu tus kombinasyonu' },
  { id: 'settings-invites', title: 'Davet Talepleri', subtitle: 'Sunucu başvuruları ve davet yönetimi', target: 'invite_requests', keywords: 'davet talep başvuru invite request' },
];

const normalize = (value: string) =>
  value.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{Diacritic}/gu, '');

function scoreItem(item: CommandItem, query: string): number {
  if (!query) return item.kind === 'setting' ? 70 : item.kind === 'room' ? 60 : 50;
  const haystack = normalize(`${item.title} ${item.subtitle} ${item.keywords}`);
  const needle = normalize(query);
  if (haystack === needle) return 1000;
  if (normalize(item.title).startsWith(needle)) return 800;
  if (haystack.includes(needle)) return 500;
  const parts = needle.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every(part => haystack.includes(part))) return 360;
  return 0;
}

function kindLabel(kind: CommandKind) {
  if (kind === 'user') return 'Kullanıcı';
  if (kind === 'room') return 'Oda';
  if (kind === 'discover') return 'Keşfet';
  return 'Ayar';
}

function KindIcon({ kind }: { kind: CommandKind }) {
  if (kind === 'user') return <UserRound size={15} />;
  if (kind === 'room') return <Hash size={15} />;
  if (kind === 'discover') return <Search size={15} />;
  return <Settings size={15} />;
}

function kindBadgeStyle(kind: CommandKind) {
  if (kind === 'user') {
    return {
      color: '#67e8f9',
      background: 'rgba(34, 211, 238, 0.055)',
      border: 'rgba(34, 211, 238, 0.12)',
    };
  }
  if (kind === 'room') {
    return {
      color: '#a7f3d0',
      background: 'rgba(52, 211, 153, 0.055)',
      border: 'rgba(52, 211, 153, 0.12)',
    };
  }
  if (kind === 'discover') {
    return {
      color: '#c4b5fd',
      background: 'rgba(167, 139, 250, 0.055)',
      border: 'rgba(167, 139, 250, 0.12)',
    };
  }
  return {
    color: '#f8d68a',
    background: 'rgba(var(--glass-tint), 0.045)',
    border: 'rgba(251, 191, 36, 0.11)',
  };
}

function KindBadge({ kind }: { kind: CommandKind }) {
  const style = kindBadgeStyle(kind);
  return (
    <span
      className="hidden sm:inline-flex h-5 min-w-[52px] shrink-0 items-center justify-center rounded-full px-2 text-[8.5px] font-bold uppercase tracking-[0.07em]"
      style={{
        color: style.color,
        background: style.background,
        border: `1px solid ${style.border}`,
        opacity: 0.72,
      }}
    >
      {kindLabel(kind)}
    </span>
  );
}

export default function CommandPalette({
  open,
  onOpenChange,
  currentUserId,
  users,
  friendIds,
  channels,
  activeChannelId,
  hasActiveServer,
  canManageServer,
  canCreateRoom,
  canManageAnnouncements,
  canKickMembers,
  canCreateInvite,
  canRevokeInvite,
  canViewInsights,
  isAdmin,
  isPrimaryAdmin,
  onJoinChannel,
  onOpenSettings,
  onOpenServerSettings,
  onOpenDm,
  onOpenUserProfile,
  onInviteUserToRoom,
  onOpenUserSearch,
  onOpenMessages,
  onOpenLegal,
  onOpenAdmin,
  onOpenDiscover,
  onCreateAnnouncement,
  onCreateRoom,
  onOpenInputSettings,
  onOpenOutputSettings,
  onToggleMute,
  onToggleDeafen,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [shortcut, setShortcut] = useState<CommandShortcut>(() => readCommandShortcut());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const onShortcutChanged = (event: Event) => {
      const next = (event as CustomEvent<{ shortcut?: CommandShortcut }>).detail?.shortcut;
      setShortcut(next ?? readCommandShortcut());
    };
    window.addEventListener('mayvox:command-shortcut-changed', onShortcutChanged);
    window.addEventListener('storage', onShortcutChanged);
    return () => {
      window.removeEventListener('mayvox:command-shortcut-changed', onShortcutChanged);
      window.removeEventListener('storage', onShortcutChanged);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, [contenteditable="true"]');
      if (shortcutMatchesEvent(shortcut, event)) {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (!open || typing) return;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open, shortcut]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const friendIdSet = new Set(friendIds);
    const userItems = users
      .filter(u => u.id && u.id !== currentUserId && friendIdSet.has(u.id))
      .flatMap((u): CommandItem[] => {
        const title = getPublicDisplayName(u) || u.name || 'Kullanıcı';
        const keywords = [u.name, u.displayName, u.firstName, u.lastName, u.email, u.statusText].filter(Boolean).join(' ');
        const commands: CommandItem[] = [
          {
            id: `user-profile:${u.id}`,
            kind: 'user',
            title,
            subtitle: 'Profil kartını görüntüle',
            keywords: `${keywords} profil kart görüntüle bilgi arkadaş`,
            action: () => onOpenUserProfile(u.id),
          },
          {
            id: `user-dm:${u.id}`,
            kind: 'user',
            title,
            subtitle: 'DM aç',
            keywords: `${keywords} dm mesaj sohbet yaz`,
            action: () => onOpenDm(u.id),
          },
        ];
        if (activeChannelId) {
          commands.push({
            id: `user-invite:${u.id}`,
            kind: 'user',
            title,
            subtitle: 'Aktif odaya davet et',
            keywords: `${keywords} davet çağır oda arama invite`,
            action: () => onInviteUserToRoom(u.id),
          });
        }
        return commands;
      });

    const roomItems = channels.map((channel): CommandItem => ({
      id: `room:${channel.id}`,
      kind: 'room',
      title: channel.name,
      subtitle: channel.id === activeChannelId ? 'Şu an bu odadasın' : 'Ses odasına git',
      keywords: [channel.name, channel.mode, channel.iconName].filter(Boolean).join(' '),
      action: () => { void onJoinChannel(channel.id); },
    }));

    const settingItems = SETTINGS_ITEMS.map((s): CommandItem => ({
      id: s.id,
      kind: 'setting',
      title: s.title,
      subtitle: s.subtitle,
      keywords: s.keywords,
      action: () => onOpenSettings(s.target, s.highlightId),
    }));

    settingItems.push(
      {
        id: 'settings-privacy',
        kind: 'setting',
        title: 'Gizlilik',
        subtitle: 'Son görülme ve oyun algılama tercihleri',
        keywords: 'gizlilik privacy son görülme son gorulme oyun algılama hesap',
        action: () => onOpenSettings('account', 'privacy'),
      },
      {
        id: 'settings-last-seen',
        kind: 'setting',
        title: 'Son Görülme',
        subtitle: 'Arkadaşlarının son görülme bilgisini yönet',
        keywords: 'son görülme son gorulme çevrimiçi online offline gizlilik arkadaşlar',
        action: () => onOpenSettings('account', 'privacy'),
      },
      {
        id: 'settings-legal',
        kind: 'setting',
        title: 'Hukuki',
        subtitle: 'KVKK, yerel depolama ve kullanım şartları',
        keywords: 'hukuki yasal kvkk yerel depolama kullanım şartları sartlari çerez localstorage',
        action: () => onOpenSettings('account', 'legal'),
      },
      {
        id: 'settings-legal-kvkk',
        kind: 'setting',
        title: 'KVKK Aydınlatma Metni',
        subtitle: 'Kişisel veriler ve başvuru hakları',
        keywords: 'kvkk aydınlatma metni aydinlatma kişisel veri kisisel veri haklar hukuki',
        action: () => onOpenLegal('kvkk'),
      },
      {
        id: 'settings-legal-storage',
        kind: 'setting',
        title: 'Yerel Depolama',
        subtitle: 'Çerezler, localStorage ve uygulama tercihleri',
        keywords: 'yerel depolama localstorage çerez cerez storage cache tercih hukuki',
        action: () => onOpenLegal('storage'),
      },
      {
        id: 'settings-legal-terms',
        kind: 'setting',
        title: 'Kullanım Şartları',
        subtitle: 'Hizmet kuralları ve kullanıcı sorumlulukları',
        keywords: 'kullanım şartları kullanim sartlari terms hizmet kuralları sorumluluk hukuki',
        action: () => onOpenLegal('terms'),
      },
      {
        id: 'settings-sound-join-leave',
        kind: 'setting',
        title: 'Giriş / Çıkış Sesi',
        subtitle: 'Odaya giriş ve çıkış sesini ayarla',
        keywords: 'giriş çıkış giris cikis ses odaya giriş çıkış ses a ses b',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-sound-mute-deafen',
        kind: 'setting',
        title: 'Mikrofon / Hoparlör Sesi',
        subtitle: 'Mikrofon veya hoparlör kapama sesini ayarla',
        keywords: 'mikrofon hoparlör hoparlor kulaklık kulaklik mute deafen ses ses a ses b',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-sound-ptt',
        kind: 'setting',
        title: 'Bas-Konuş Sesi',
        subtitle: 'PTT tuş sesini ayarla',
        keywords: 'bas konuş bas konus ptt push to talk ses ses a ses b',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-sound-call',
        kind: 'setting',
        title: 'Arama Sesi',
        subtitle: 'Gelen arama zil sesini seç',
        keywords: 'arama sesi çağrı cagri zil gelen arama ses 1 ses 2 ses 3',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-sound-notification',
        kind: 'setting',
        title: 'Bildirim Sesi',
        subtitle: 'Davet ve sistem bildirim sesini seç',
        keywords: 'bildirim sesi notification davet sistem ses 1 ses 2 ses 3',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-sound-in-room',
        kind: 'setting',
        title: 'Sesleri Sohbet Odasında Çal',
        subtitle: 'Odadayken uygulama seslerini yönet',
        keywords: 'sesleri sohbet odasında çal sohbet odasi oda içinde sesler',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-sound-master-volume',
        kind: 'setting',
        title: 'Genel Ses Seviyesi',
        subtitle: 'Uygulama özel seslerinin ana seviyesini ayarla',
        keywords: 'genel ses seviyesi master volume yüzde ses düzeyi sessiz',
        action: () => onOpenSettings('app', 'sounds'),
      },
      {
        id: 'settings-low-data',
        kind: 'setting',
        title: 'Düşük Veri Modu',
        subtitle: 'Performans bölümünde veri kullanımını azalt',
        keywords: 'düşük veri modu dusuk veri low data performans internet tasarruf',
        action: () => onOpenSettings('app', 'performance'),
      },
      {
        id: 'settings-noise-suppression',
        kind: 'setting',
        title: 'Gürültü Susturma',
        subtitle: 'Arka plan gürültüsünü filtrele',
        keywords: 'gürültü susturma gurultu susturma noise suppression arka plan ses filtre',
        action: () => onOpenSettings('app', 'performance'),
      },
      {
        id: 'settings-auto-leave',
        kind: 'setting',
        title: 'Boşta Ayrılma',
        subtitle: '5, 10, 15, 30 veya 60 dakika seçimi',
        keywords: 'boşta ayrılma bosta ayrilma idle auto leave 5 dk 10 dk 15 dk 30 dk 60 dk',
        action: () => onOpenSettings('app', 'performance'),
      },
      {
        id: 'settings-noise-strength',
        kind: 'setting',
        title: 'Gürültü Temizleme Gücü',
        subtitle: 'Hafif ve agresif filtre gücünü ayarla',
        keywords: 'gürültü temizleme gücü gurultu temizleme gucu hafif agresif yüzde noise strength',
        action: () => onOpenSettings('app', 'performance'),
      },
      {
        id: 'settings-ptt-release-delay',
        kind: 'setting',
        title: 'PTT Bırakma Gecikmesi',
        subtitle: 'Kapalı ile 500 ms arasında gecikme seç',
        keywords: 'ptt bırakma gecikmesi birakma gecikmesi kapalı kapali 500 ms push to talk delay',
        action: () => onOpenSettings('app', 'performance'),
      },
    );

    const canOpenServerSettings = hasActiveServer && (
      canManageServer ||
      canKickMembers ||
      canCreateInvite ||
      canRevokeInvite ||
      canViewInsights
    );

    if (canOpenServerSettings) {
      settingItems.push({
        id: 'server-settings-general',
        kind: 'setting',
        title: 'Sunucu Ayarları: Genel',
        subtitle: 'Sunucu adı, logo ve temel bilgiler',
        keywords: 'sunucu ayarları genel isim logo açıklama motto',
        action: () => onOpenServerSettings(undefined, 'general'),
      });
    }

    if (hasActiveServer && canManageServer) {
      settingItems.push(
        {
          id: 'server-settings-overview',
          kind: 'setting',
          title: 'Sunucu Ayarları: Özet',
          subtitle: 'Sunucu genel durumu ve limitler',
          keywords: 'sunucu ayarları özet genel durum limit overview',
          action: () => onOpenServerSettings(undefined, 'overview'),
        },
        {
          id: 'server-settings-avatar',
          kind: 'setting',
          title: 'Sunucu Resmini Değiştir',
          subtitle: 'Aktif sunucunun genel ayarları',
          keywords: 'resim foto sunucu avatar logo ikon server değiştirme',
          action: () => onOpenServerSettings('server-avatar', 'general'),
        },
        {
          id: 'server-settings-roles',
          kind: 'setting',
          title: 'Sunucu Ayarları: Roller',
          subtitle: 'Rol ve yetki yönetimi',
          keywords: 'sunucu ayarları roller rol yetki izin permission',
          action: () => onOpenServerSettings(undefined, 'roles'),
        },
        {
          id: 'server-settings-audit',
          kind: 'setting',
          title: 'Sunucu Ayarları: Denetim',
          subtitle: 'Moderasyon olayları ve kayıtlar',
          keywords: 'sunucu ayarları denetim audit kayıt log moderasyon olay',
          action: () => onOpenServerSettings(undefined, 'audit'),
        },
      );
    }

    if (hasActiveServer && canKickMembers) {
      settingItems.push(
        {
          id: 'server-settings-members',
          kind: 'setting',
          title: 'Sunucu Ayarları: Üyeler',
          subtitle: 'Üyeler, cezalar ve moderasyon',
          keywords: 'sunucu ayarları üyeler uyeler kullanıcılar moderasyon ban timeout mute',
          action: () => onOpenServerSettings(undefined, 'members'),
        },
        {
          id: 'server-settings-automod',
          kind: 'setting',
          title: 'Sunucu Ayarları: Oto-Mod',
          subtitle: 'Otomatik moderasyon kuralları',
          keywords: 'sunucu ayarları oto mod otomod auto moderation flood spam küfür',
          action: () => onOpenServerSettings(undefined, 'automod'),
        },
      );
    }

    if (hasActiveServer && (canCreateInvite || canRevokeInvite)) {
      settingItems.push(
        {
          id: 'server-settings-invites',
          kind: 'setting',
          title: 'Sunucu Ayarları: Davetler',
          subtitle: 'Davet linkleri ve başvurular',
          keywords: 'sunucu ayarları davetler davet link başvuru istek invite',
          action: () => onOpenServerSettings(undefined, 'invites'),
        },
        ...(canManageServer ? [{
          id: 'server-settings-invite-requests',
          kind: 'setting',
          title: 'Sunucu Ayarları: Davet Başvuruları',
          subtitle: 'Bekleyen topluluk katılım talepleri',
          keywords: 'sunucu ayarları davet başvuruları basvurular talepler istekler requests invite',
          action: () => onOpenServerSettings(undefined, 'requests'),
        } satisfies CommandItem] : []),
      );
    }

    if (hasActiveServer && canViewInsights) {
      settingItems.push({
        id: 'server-settings-insights',
        kind: 'setting',
        title: 'Sunucu Ayarları: İçgörüler',
        subtitle: 'Kullanım ve aktivite analizleri',
        keywords: 'sunucu ayarları içgörüler icgoruler analiz istatistik aktivite insights',
        action: () => onOpenServerSettings(undefined, 'insights'),
      });
    }

    if (isAdmin) {
      settingItems.push(
        {
          id: 'admin-panel',
          kind: 'setting',
          title: 'Yönetim Paneli',
          subtitle: 'Admin yönetim ekranını aç',
          keywords: 'yönetim paneli yonetim admin panel ayarlar sistem',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-users',
          kind: 'setting',
          title: 'Yönetim: Kullanıcılar',
          subtitle: 'Sistem kullanıcı listesini aç',
          keywords: 'yönetim kullanıcılar yonetim kullanicilar sistem tüm kullanıcılar tum kullanicilar admin users',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-invite-codes',
          kind: 'setting',
          title: 'Davet Kodu',
          subtitle: 'Davet kodu oluşturma ve geçmişi gör',
          keywords: 'davet kodu yeni kod üret uret invite code geçmiş gecmis admin',
          action: () => onOpenAdmin('invite-codes'),
        },
        {
          id: 'admin-generate-invite-code',
          kind: 'setting',
          title: 'Yeni Kod Üret',
          subtitle: 'Davet kodu panelini aç',
          keywords: 'yeni kod üret uret davet kodu oluştur olustur invite code',
          action: () => onOpenAdmin('invite-codes'),
        },
        {
          id: 'admin-invite-requests',
          kind: 'setting',
          title: 'Davet Talepleri',
          subtitle: 'Bekleyen kayıt/davet taleplerini yönet',
          keywords: 'davet talepleri bekleyen talep başvuru basvuru invite requests kayıt kayit',
          action: () => onOpenAdmin('invite-requests'),
        },
        {
          id: 'admin-user-search',
          kind: 'setting',
          title: 'Admin Kullanıcı Ara',
          subtitle: 'Yönetim kullanıcı aramasına odaklan',
          keywords: 'admin kullanıcı ara kullanici ara sistem kullanıcı arama email ad kullanıcı adı',
          action: () => onOpenAdmin('user-search'),
        },
        {
          id: 'admin-user-filter-all',
          kind: 'setting',
          title: 'Yönetim Kullanıcı Filtresi: Tümü',
          subtitle: 'Tüm kullanıcıları göster',
          keywords: 'tümü tumu tüm kullanıcılar tum kullanicilar yönetim filtre admin',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-filter-admin',
          kind: 'setting',
          title: 'Yönetim Kullanıcı Filtresi: Admin',
          subtitle: 'Admin kullanıcı filtresine git',
          keywords: 'admin kullanıcı filtresi sistem adminler yönetim',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-filter-mod',
          kind: 'setting',
          title: 'Yönetim Kullanıcı Filtresi: Mod',
          subtitle: 'Moderatör kullanıcı filtresine git',
          keywords: 'mod moderator moderatör kullanıcı filtresi yönetim',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-filter-user',
          kind: 'setting',
          title: 'Yönetim Kullanıcı Filtresi: Kullanıcı',
          subtitle: 'Normal kullanıcı filtresine git',
          keywords: 'kullanıcı kullanici üye uye normal kullanıcı filtresi yönetim',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-filter-owners',
          kind: 'setting',
          title: 'Yönetim Kullanıcı Filtresi: Sahipler',
          subtitle: 'Sunucu sahibi kullanıcıları bul',
          keywords: 'sahipler owner sahip sunucu sahipleri kullanıcı filtresi yönetim',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-filters',
          kind: 'setting',
          title: 'Yönetim Filtreleri',
          subtitle: 'Plan, plan durumu ve sunucu sahipliği filtreleri',
          keywords: 'filtrele filtreler plan plan durumu aktif süresi dolmuş sınırsız sunucu sahipliği',
          action: () => onOpenAdmin('user-filters'),
        },
        {
          id: 'admin-user-sort',
          kind: 'setting',
          title: 'Yönetim Sıralama',
          subtitle: 'Kullanıcı listesi sıralama seçenekleri',
          keywords: 'sıralama siralama kayıt yeni eski son aktif kullanıcı yönetim',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-page-size',
          kind: 'setting',
          title: 'Sayfa Başına Kullanıcı',
          subtitle: '30/sayfa ve sayfalama ayarları',
          keywords: 'sayfa başına sayfa basina 30 sayfa kullanıcı liste pagination',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-plan-management',
          kind: 'setting',
          title: 'Kullanıcı Plan Yönetimi',
          subtitle: 'Free, Pro, Ultra plan işlemlerine git',
          keywords: 'kullanıcı plan yönetimi free pro ultra plan ata güncelle kaldır',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-role-management',
          kind: 'setting',
          title: 'Kullanıcı Rol Yönetimi',
          subtitle: 'Admin ve moderatör yetkilerini yönet',
          keywords: 'admin yap admin yetkisi kaldır moderatör yap mod yetki rol yönetimi',
          action: () => onOpenAdmin('users'),
        },
        {
          id: 'admin-user-moderation',
          kind: 'setting',
          title: 'Kullanıcı Moderasyonu',
          subtitle: 'Sustur, yasağı kaldır, sesli yasak ve şifre sıfırla',
          keywords: 'sustur yasakla yasağı kaldır susturmayı kaldır sesli yasak şifre sıfırla kullanıcı sil',
          action: () => onOpenAdmin('users'),
        },
      );
    }

    if (isPrimaryAdmin) {
      settingItems.push(
        {
          id: 'admin-servers',
          kind: 'setting',
          title: 'Yönetim: Sunucular',
          subtitle: 'Sistem sunucu listesini aç',
          keywords: 'yönetim sunucular yonetim sistem tüm sunucular tum server owner id',
          action: () => onOpenAdmin('servers'),
        },
        {
          id: 'admin-server-search',
          kind: 'setting',
          title: 'Admin Sunucu Ara',
          subtitle: 'Sunucu adı veya owner ID ile ara',
          keywords: 'sunucu ara server ara owner id sistem sunucu arama yönetim',
          action: () => onOpenAdmin('servers'),
        },
        {
          id: 'admin-server-plan',
          kind: 'setting',
          title: 'Sunucu Planı Değiştir',
          subtitle: 'Free, Pro, Ultra sunucu plan yönetimi',
          keywords: 'sunucu planı değiştir plani degistir free pro ultra plan yükselt düşür',
          action: () => onOpenAdmin('servers'),
        },
        {
          id: 'admin-server-restrict',
          kind: 'setting',
          title: 'Sunucuyu Kısıtla',
          subtitle: 'Sunucu oda ve ses erişimini yönet',
          keywords: 'sunucuyu kısıtla kisitla ban kaldır erişim oda ses yönetim',
          action: () => onOpenAdmin('servers'),
        },
        {
          id: 'admin-server-delete',
          kind: 'setting',
          title: 'Sunucuyu Sil',
          subtitle: 'Sistem sunucuları panelindeki kalıcı işlem',
          keywords: 'sunucuyu sil server sil kalıcı sil yönetim sistem',
          action: () => onOpenAdmin('servers'),
        },
        {
          id: 'admin-server-force-owner-leave',
          kind: 'setting',
          title: "Owner'ı Zorla Çıkar",
          subtitle: 'Sunucu sahipliğini düşürme işlemi',
          keywords: 'owner zorla çıkar cikar sahip düşür üyelikten düşür sunucu yönetim',
          action: () => onOpenAdmin('servers'),
        },
      );
    }

    const discoverItems: CommandItem[] = [
      {
        id: 'user-search',
        kind: 'user',
        title: 'Kullanıcı Ara',
        subtitle: 'Sağ üstteki kullanıcı aramasına git',
        keywords: 'kullanıcı ara kullanici ara arkadaş ara arkadas ara kişi bul kisi bul profil ara sosyal arama',
        action: onOpenUserSearch,
      },
      {
        id: 'friend-search',
        kind: 'user',
        title: 'Arkadaş Ara',
        subtitle: 'Kullanıcı arama alanına odaklan',
        keywords: 'arkadaş ara arkadas ara kullanıcı ara kullanici ara arkadaş ekle arkadas ekle kişi bul kisi bul',
        action: onOpenUserSearch,
      },
      {
        id: 'messages-open',
        kind: 'setting',
        title: 'Mesajlar',
        subtitle: 'DM ve mesaj penceresini aç',
        keywords: 'mesaj mesajlar dm direkt mesaj özel mesaj sohbet konuşma inbox',
        action: () => onOpenMessages(false),
      },
      {
        id: 'toggle-mute',
        kind: 'setting',
        title: 'Mikrofon Aç-Kapat',
        subtitle: 'Mikrofonu hızlıca kapat veya geri aç',
        keywords: 'mikrofon mic aç kapat mute unmute ses kapat ses aç',
        action: onToggleMute,
      },
      {
        id: 'toggle-deafen',
        kind: 'setting',
        title: 'Hoparlör / Kulaklık Aç-Kapat',
        subtitle: 'Uygulama sesini hızlıca kapat veya geri aç',
        keywords: 'hoparlör kulaklık aç kapat sağırlaştır deafen undeafen ses kapat ses aç',
        action: onToggleDeafen,
      },
      {
        id: 'shortcut-toggle-room',
        kind: 'room',
        title: 'Son Odaya Katıl / Odadan Ayrıl',
        subtitle: 'Aktif odadan ayrıl veya son odaya geri dön',
        keywords: 'son oda katıl ayrıl odadan ayrıl geri dön voice room',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'toggle-room' } })),
      },
      {
        id: 'shortcut-toggle-room-chat-muted',
        kind: 'room',
        title: 'Aktif Odayı Sessize Al',
        subtitle: 'Aktif odanın yazılı sohbet sesini kapat veya aç',
        keywords: 'aktif oda sessize al oda sohbet sesi kapat aç mute chat',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'toggle-room-chat-muted' } })),
      },
      {
        id: 'shortcut-toggle-room-members',
        kind: 'room',
        title: 'Odadaki Kullanıcıları Göster/Gizle',
        subtitle: 'Aktif odadaki kullanıcı görünümünü değiştir',
        keywords: 'odadaki kullanıcılar göster gizle üyeler katılımcılar room members',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'toggle-room-members' } })),
      },
      {
        id: 'message-settings',
        kind: 'setting',
        title: 'Mesaj Ayarları',
        subtitle: 'DM gizliliği, ses ve bildirim tercihleri',
        keywords: 'mesaj ayarları dm gizliliği gizlilik okundu bilgisi mesaj sesi bildirim masaüstü ardışık grup',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-privacy',
        kind: 'setting',
        title: 'DM Gizliliği',
        subtitle: 'Mesaj ayarlarında kimlerin DM atabileceğini seç',
        keywords: 'dm gizliliği mesaj gizlilik herkesi ortak arkadaş kapalı özel mesaj izin',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-read-receipts',
        kind: 'setting',
        title: 'Okundu Bilgisini Göster',
        subtitle: 'Mesaj ayarlarında okundu bilgisini yönet',
        keywords: 'okundu bilgisi görüldü seen read receipt mesaj okundu göster gizle',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-sound',
        kind: 'setting',
        title: 'Mesaj Sesi',
        subtitle: 'Mesaj sesini, tonunu ve seviyesini ayarla',
        keywords: 'mesaj sesi ton ses seviyesi volume dm sesi bildirim sesi',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-room-sound',
        kind: 'setting',
        title: 'Sohbet Odasında Mesaj Sesi',
        subtitle: 'Odadayken mesaj sesini aç veya kapat',
        keywords: 'sohbet odasında mesaj sesi odada mesaj sesi oda içi dm sesi',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-send-sound',
        kind: 'setting',
        title: 'Mesaj Gönderim Sesi',
        subtitle: 'Mesaj gönderirken çalan sesi yönet',
        keywords: 'mesaj gönderim sesi gönderme sesi sent sound dm gönder',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-desktop-notification',
        kind: 'setting',
        title: 'Masaüstü Bildirimi',
        subtitle: 'Mesaj masaüstü bildirimlerini yönet',
        keywords: 'masaüstü bildirimi masaustu bildirim desktop notification mesaj dm',
        action: () => onOpenMessages(true),
      },
      {
        id: 'message-settings-grouping',
        kind: 'setting',
        title: 'Ardışık Mesajları Grupla',
        subtitle: 'Mesajların görünüm gruplamasını yönet',
        keywords: 'ardışık mesajları grupla ardisik mesaj grup grouping sohbet görünüm',
        action: () => onOpenMessages(true),
      },
      {
        id: 'discover-communities',
        kind: 'discover',
        title: 'Topluluk Keşfet',
        subtitle: 'Sunucu ara, topluluklara bak',
        keywords: 'sunucu ara sunucu keşfet topluluk ara topluluk keşfet community discover server katıl bul',
        action: onOpenDiscover,
      },
      {
        id: 'shortcut-server-home',
        kind: 'discover',
        title: 'Aktif Sunucu Ana Sayfası',
        subtitle: 'Aktif sunucunun ana sayfasına git',
        keywords: 'aktif sunucu ana sayfa home sunucu sayfası anasayfa',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'open-server-home' } })),
      },
      {
        id: 'shortcut-previous-server',
        kind: 'discover',
        title: 'Önceki Sunucuya Geç',
        subtitle: 'Sunucu listesindeki önceki sunucu',
        keywords: 'önceki sunucu onceki server geri sunucu değiştir',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'previous-server' } })),
      },
      {
        id: 'shortcut-next-server',
        kind: 'discover',
        title: 'Sonraki Sunucuya Geç',
        subtitle: 'Sunucu listesindeki sonraki sunucu',
        keywords: 'sonraki sunucu next server ileri sunucu değiştir',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'next-server' } })),
      },
      {
        id: 'shortcut-previous-room',
        kind: 'room',
        title: 'Önceki Odaya Geç',
        subtitle: 'Aktif sunucudaki önceki ses odasına git',
        keywords: 'önceki oda onceki room kanal ses odası geri',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'previous-room' } })),
      },
      {
        id: 'shortcut-next-room',
        kind: 'room',
        title: 'Sonraki Odaya Geç',
        subtitle: 'Aktif sunucudaki sonraki ses odasına git',
        keywords: 'sonraki oda next room kanal ses odası ileri',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'next-room' } })),
      },
      {
        id: 'shortcut-open-unread-dm',
        kind: 'setting',
        title: 'Okunmamış İlk DM’ye Git',
        subtitle: 'Mesaj panelini aç',
        keywords: 'okunmamış okunmamis ilk dm mesaj git aç unread',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'open-unread-dm' } })),
      },
      {
        id: 'shortcut-close-dm',
        kind: 'setting',
        title: 'Aktif DM’yi Kapat',
        subtitle: 'Açık mesaj panelini kapat',
        keywords: 'aktif dm kapat mesaj panel kapat close dm',
        action: () => window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'close-dm' } })),
      },
      ...(hasActiveServer && canManageAnnouncements ? [
        {
          id: 'announcement-create',
          kind: 'setting',
          title: 'Duyuru Ekle',
          subtitle: 'Sunucu ana sayfasına yeni duyuru',
          keywords: 'duyuru ekle duyurular announcement haber paylaş',
          action: () => onCreateAnnouncement('announcement'),
        } satisfies CommandItem,
        {
          id: 'event-create',
          kind: 'setting',
          title: 'Etkinlik Ekle',
          subtitle: 'Sunucu ana sayfasına yeni etkinlik',
          keywords: 'etkinlik ekle etkinlikler event aktivite toplantı oyun',
          action: () => onCreateAnnouncement('event'),
        } satisfies CommandItem,
      ] : []),
      ...(canCreateRoom ? [{
        id: 'room-create',
        kind: 'room',
        title: 'Oda Oluştur',
        subtitle: 'Yeni ses odası oluştur',
        keywords: 'oda oluştur kanal oluştur ses kanalı yeni oda room create',
        action: onCreateRoom,
      } satisfies CommandItem] : []),
      {
        id: 'audio-input-settings',
        kind: 'setting',
        title: 'Mikrofon Ayarları',
        subtitle: 'Giriş cihazını seç',
        keywords: 'mikrofon mic giriş input ayar cihaz ses',
        action: onOpenInputSettings,
      },
      {
        id: 'audio-output-settings',
        kind: 'setting',
        title: 'Hoparlör / Kulaklık Ayarları',
        subtitle: 'Çıkış cihazını seç',
        keywords: 'hoparlör kulaklık headset headphone speaker çıkış output ayar cihaz ses',
        action: onOpenOutputSettings,
      },
    ];

    return [...discoverItems, ...settingItems, ...roomItems, ...userItems];
  }, [activeChannelId, canCreateInvite, canCreateRoom, canKickMembers, canManageAnnouncements, canManageServer, canRevokeInvite, canViewInsights, channels, currentUserId, friendIds, hasActiveServer, isAdmin, isPrimaryAdmin, onCreateAnnouncement, onCreateRoom, onInviteUserToRoom, onJoinChannel, onOpenAdmin, onOpenDiscover, onOpenDm, onOpenInputSettings, onOpenLegal, onOpenMessages, onOpenOutputSettings, onOpenServerSettings, onOpenSettings, onOpenUserProfile, onOpenUserSearch, onToggleDeafen, onToggleMute, users]);

  const results = useMemo(() => {
    return items
      .map(item => ({ item, score: scoreItem(item, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'tr'))
      .slice(0, 10)
      .map(entry => entry.item);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  useEffect(() => {
    if (activeIndex > results.length - 1) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  useLayoutEffect(() => {
    itemRefs.current.length = results.length;
    const container = listRef.current;
    const selected = itemRefs.current[activeIndex];
    if (!open || !container || !selected) return;

    const containerRect = container.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const topOverflow = selectedRect.top - containerRect.top;
    const bottomOverflow = selectedRect.bottom - containerRect.bottom;

    if (topOverflow < 0) {
      container.scrollTop += topOverflow;
    } else if (bottomOverflow > 0) {
      container.scrollTop += bottomOverflow;
    }
  }, [activeIndex, open, results.length]);

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    item.action();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      width={660}
      padded={false}
      className="rounded-[20px]"
    >
      <div
        className="overflow-hidden rounded-[20px]"
        style={{
          color: 'var(--theme-text)',
        }}
      >
        <div className="px-4 pb-3 pt-4" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.07)' }}>
          <div
            className="flex h-12 items-center gap-3 rounded-2xl px-3.5 transition-[border-color,box-shadow,background-color] duration-150 focus-within:shadow-[0_0_0_3px_rgba(var(--theme-accent-rgb),0.10)]"
            style={{
              background: 'rgba(var(--glass-tint), 0.045)',
              border: '1px solid rgba(var(--glass-tint), 0.085)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
            }}
          >
            <Search size={18} className="shrink-0 text-[var(--theme-accent)] opacity-90" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex(i => Math.min(results.length - 1, i + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex(i => Math.max(0, i - 1));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  run(results[activeIndex]);
                }
              }}
              placeholder="Kullanıcı, oda veya ayar ara..."
              className="mv-font-title h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--theme-secondary-text)]/55"
            />
            <kbd
              className="inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[9.5px] font-bold tracking-[0.08em]"
              style={{
                background: 'rgba(var(--glass-tint), 0.055)',
                border: '1px solid rgba(var(--glass-tint), 0.09)',
                color: 'var(--theme-secondary-text)',
              }}
            >
              ESC
            </kbd>
          </div>
        </div>

        <div
          ref={listRef}
          className="max-h-[430px] overflow-y-auto p-2.5 custom-scrollbar"
          style={{
            scrollbarColor: 'rgba(var(--glass-tint), 0.16) transparent',
          }}
        >
          {results.length === 0 ? (
            <div className="px-2 py-8">
              <EmptyState
                size="xs"
                icon={<Search size={16} />}
                title="Sonuç bulunamadı"
                description="Komut, oda, kullanıcı veya ayar adı deneyin."
              />
            </div>
          ) : results.map((item, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => run(item)}
                className="group w-full min-w-0 rounded-2xl px-3 py-2 text-left transition-[background-color,box-shadow] duration-150"
                style={{
                  minHeight: 56,
                  background: active ? 'rgba(var(--theme-accent-rgb), 0.095)' : 'transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.11)' : 'inset 0 0 0 1px transparent',
                  color: 'var(--theme-text)',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-[background-color,color,box-shadow] duration-150"
                    style={{
                      background: active ? 'rgba(var(--theme-accent-rgb), 0.145)' : 'rgba(var(--glass-tint), 0.055)',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.16)' : 'inset 0 0 0 1px rgba(var(--glass-tint), 0.035)',
                      color: active ? 'var(--theme-accent)' : 'var(--theme-secondary-text)',
                    }}
                  >
                    <KindIcon kind={item.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mv-font-message block truncate text-[13px] font-semibold">{item.title}</span>
                    <span className="mv-font-meta block truncate text-[11px] text-[var(--theme-secondary-text)]/65">{item.subtitle}</span>
                  </span>
                  <KindBadge kind={item.kind} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
