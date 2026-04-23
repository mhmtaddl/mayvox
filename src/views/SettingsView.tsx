import React, { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Users, Server, User as UserIcon, Palette, Eye, Gamepad2, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { isCapacitor, isMobile, isElectron } from '../lib/platform';
import { Toggle } from '../components/settings/shared';
import { isGameActivityAvailable } from '../features/game-activity/useGameActivity';

// ── Components ──
import AccountSection from '../components/settings/sections/AccountSection';
import { AppearanceSection, SoundsSection, PerformanceSection, VoiceModeSection } from '../components/settings/sections/SettingsSections';
import AdminUserManagement from '../components/settings/sections/AdminUserManagement';
import AdminActionBar from '../components/settings/sections/AdminActionBar';
import PermissionSection from '../components/settings/sections/PermissionSection';
import SystemServersPanel from '../components/settings/sections/SystemServersPanel';
import ManagementUsersPanel from '../components/settings/sections/ManagementUsersPanel';

type MainTab = 'account' | 'app' | 'admin';
type AdminSubTab = 'users' | 'servers';

// Premium segmented control — motion layoutId ile active pill smooth kayar
function SegmentedTabs({ tabs, value, onChange }: {
  tabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }>;
  value: MainTab;
  onChange: (v: MainTab) => void;
}) {
  return (
    <div className="surface-card inline-flex p-1 rounded-xl">
      {tabs.map(tab => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold tracking-[-0.005em] transition-colors duration-150 z-10 whitespace-nowrap"
          >
            {active && (
              <motion.span
                layoutId="settings-tab-active"
                className="absolute inset-0 rounded-lg -z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                style={{
                  background: 'var(--surface-elevated)',
                  border: 'var(--surface-card-border)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
              />
            )}
            <span className={active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/70'}>
              {tab.icon}
            </span>
            <span className={active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/80'}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Domain başlığı — tutarlı tipografi, section öncesi küçük hiyerarşi işaretçisi
function DomainTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-[var(--theme-accent)]/70">{icon}</span>
      <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-text)]/85">{title}</h3>
    </div>
  );
}

// Son görülme inline toggle kartı — Hesap sekmesi için
function LastSeenCard() {
  const { showLastSeen, setShowLastSeen } = useSettings();
  return (
    <div
      className="surface-card flex items-center gap-3 px-4 py-3 rounded-xl"
    >
      <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
        <Eye size={14} className="text-[var(--theme-accent)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Son Görülme</p>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
          Kapalıyken arkadaşların seni en son ne zaman gördüğünü göremez.
        </p>
      </div>
      <Toggle checked={showLastSeen} onChange={() => setShowLastSeen(!showLastSeen)} />
    </div>
  );
}

// ── Görsel konum seçici — ekran mockup'ı + 12 anchor noktası ──
// 4 köşe + her kenarda 2 ara nokta = 12 unique anchor. Fraction-based konum.
type OverlayAnchor =
  | 'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right'
  | 'right-top-mid' | 'right-bot-mid'
  | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left'
  | 'left-bot-mid' | 'left-top-mid';

const ANCHOR_POINTS: Array<{ v: OverlayAnchor; fx: number; fy: number; label: string }> = [
  { v: 'top-left',         fx: 0,    fy: 0,    label: 'Sol üst' },
  { v: 'top-mid-left',     fx: 0.33, fy: 0,    label: 'Üst (sol orta)' },
  { v: 'top-mid-right',    fx: 0.67, fy: 0,    label: 'Üst (sağ orta)' },
  { v: 'top-right',        fx: 1,    fy: 0,    label: 'Sağ üst' },
  { v: 'right-top-mid',    fx: 1,    fy: 0.33, label: 'Sağ (üst orta)' },
  { v: 'right-bot-mid',    fx: 1,    fy: 0.67, label: 'Sağ (alt orta)' },
  { v: 'bottom-right',     fx: 1,    fy: 1,    label: 'Sağ alt' },
  { v: 'bottom-mid-right', fx: 0.67, fy: 1,    label: 'Alt (sağ orta)' },
  { v: 'bottom-mid-left',  fx: 0.33, fy: 1,    label: 'Alt (sol orta)' },
  { v: 'bottom-left',      fx: 0,    fy: 1,    label: 'Sol alt' },
  { v: 'left-bot-mid',     fx: 0,    fy: 0.67, label: 'Sol (alt orta)' },
  { v: 'left-top-mid',     fx: 0,    fy: 0.33, label: 'Sol (üst orta)' },
];

function OverlayPositionPicker({ value, onChange, disabled }: {
  value: OverlayAnchor;
  onChange: (v: OverlayAnchor) => void;
  disabled?: boolean;
}) {
  // Sadece dikey büyüme — genişlik sabit
  const W = 190, H = 160;
  const pad = 14;
  const inner = { w: W - pad * 2, h: H - pad * 2 };
  // Hit area — görsel pill'den daha büyük (Fitts yasası)
  const HIT_W = 26, HIT_H = 18;
  return (
    <div
      className="relative rounded-xl shrink-0"
      style={{
        width: W,
        height: H,
        background: 'rgba(0, 0, 0, 0.16)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.07)',
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        transition: 'opacity 180ms ease-out',
      }}
      aria-label="Ekran konum seçici"
    >
      {ANCHOR_POINTS.map(p => {
        const active = value === p.v;
        const x = pad + p.fx * inner.w;
        const y = pad + p.fy * inner.h;
        // Button wrapper'ı anchor noktasının etrafında HIT_W × HIT_H tampon alanda yayılır;
        // fx/fy oranına göre button'u kendi referans noktasına kaydırırız.
        const tx = `${-p.fx * 100}%`;
        const ty = `${-p.fy * 100}%`;
        return (
          <button
            key={p.v}
            onClick={() => onChange(p.v)}
            title={p.label}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: HIT_W,
              height: HIT_H,
              transform: `translate(${tx}, ${ty})`,
              // Görsel pill button içinde ortalanır (ama hit area tam button'un kendisi)
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
              zIndex: active ? 3 : 2,
            }}
            aria-label={p.label}
            aria-pressed={active}
          >
            {/* Görsel indicator — pill (rounded rectangle) */}
            <span
              aria-hidden="true"
              className="anchor-pill"
              style={{
                display: 'block',
                width: active ? 20 : 14,
                height: active ? 12 : 8,
                borderRadius: 4,
                background: active
                  ? 'rgba(var(--theme-accent-rgb), 0.22)'
                  : 'rgba(var(--glass-tint), 0.26)',
                boxShadow: active
                  ? '0 0 0 1px rgba(var(--theme-accent-rgb), 0.85), 0 0 8px rgba(var(--theme-accent-rgb), 0.35)'
                  : 'inset 0 0 0 1px rgba(var(--glass-tint), 0.16)',
                opacity: active ? 1 : 0.75,
                transition: 'all 140ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
            <style>{`
              button:hover > .anchor-pill { transform: scale(1.08); opacity: 1; }
            `}</style>
          </button>
        );
      })}
    </div>
  );
}

// İç-kart "Segmented control" (iOS tarzı)
function OverlaySizeSegmented({ value, onChange, disabled }: {
  value: 'small' | 'medium' | 'large';
  onChange: (v: 'small' | 'medium' | 'large') => void;
  disabled?: boolean;
}) {
  const opts: Array<{ v: 'small' | 'medium' | 'large'; label: string }> = [
    { v: 'small',  label: 'Küçük' },
    { v: 'medium', label: 'Orta' },
    { v: 'large',  label: 'Büyük' },
  ];
  return (
    <div
      className="inline-flex p-[2px] rounded-lg w-full"
      style={{
        background: 'rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.05)',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className="flex-1 text-[11px] font-medium h-8 rounded-[6px]"
            style={{
              background: active ? 'rgba(var(--theme-accent-rgb), 0.16)' : 'transparent',
              color: active ? 'var(--theme-accent)' : 'var(--theme-secondary-text)',
              boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.22)' : 'none',
              transition: 'all 140ms ease-out',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// İnce toggle satırı — label + switch
function OverlayToggleRow({ label, checked, onChange, disabled }: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center justify-between"
      style={{
        height: 34,
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <span className="text-[11px] text-[var(--theme-text)]/85 select-none">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

// Oyun içi ses overlay — Electron desktop only — 2 kolon premium layout
function VoiceOverlayCard() {
  const {
    overlayEnabled, setOverlayEnabled,
    overlayPosition, setOverlayPosition,
    overlaySize, setOverlaySize,
    overlayShowOnlySpeaking, setOverlayShowOnlySpeaking,
    overlayShowSelf, setOverlayShowSelf,
    overlayClickThrough, setOverlayClickThrough,
  } = useSettings();
  const off = !overlayEnabled;
  return (
    <div className="surface-card rounded-xl px-4 py-4">
      {/* Header — tek satır, separator yok */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
          <Layers size={13} className="text-[var(--theme-accent)]/80" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-[var(--theme-text)] leading-tight">Oyun İçi Ses Göstergesi</p>
          <p className="text-[10px] text-[var(--theme-secondary-text)]/55 mt-[2px] leading-snug truncate">
            Ses odasındaki kullanıcıları oyun üstünde gösterir.
          </p>
        </div>
        <Toggle checked={overlayEnabled} onChange={() => setOverlayEnabled(!overlayEnabled)} />
      </div>

      {/* Body — 2 kolon: preview (sol) + kontroller (sağ) */}
      <div
        className="mt-4 flex gap-4"
        style={{ opacity: off ? 0.5 : 1, transition: 'opacity 180ms ease-out' }}
      >
        {/* Sol: preview */}
        <OverlayPositionPicker value={overlayPosition} onChange={setOverlayPosition} disabled={off} />

        {/* Sağ: kontroller — dikey stack */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <OverlaySizeSegmented value={overlaySize} onChange={setOverlaySize} disabled={off} />
          <div className="flex flex-col gap-0.5 mt-0.5">
            <OverlayToggleRow
              label="Sadece konuşanları göster"
              checked={overlayShowOnlySpeaking}
              onChange={() => !off && setOverlayShowOnlySpeaking(!overlayShowOnlySpeaking)}
              disabled={off}
            />
            <OverlayToggleRow
              label="Kendimi göster"
              checked={overlayShowSelf}
              onChange={() => !off && setOverlayShowSelf(!overlayShowSelf)}
              disabled={off}
            />
            <OverlayToggleRow
              label="Tıklanamaz overlay"
              checked={overlayClickThrough}
              onChange={() => !off && setOverlayClickThrough(!overlayClickThrough)}
              disabled={off}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Otomatik oyun algılama — sadece Electron desktop'ta görünür (opt-in)
function GameActivityCard() {
  const { gameActivityEnabled, setGameActivityEnabled } = useSettings();
  return (
    <div className="surface-card flex items-center gap-3 px-4 py-3 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
        <Gamepad2 size={14} className="text-[var(--theme-accent)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Otomatik Oyun Algılama</p>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
          Açık oyunları algılayıp durum olarak gösterebilir. Sadece desteklenen oyunlar için; veriler cihazında kalır.
        </p>
      </div>
      <Toggle checked={gameActivityEnabled} onChange={() => setGameActivityEnabled(!gameActivityEnabled)} />
    </div>
  );
}

export default function SettingsView() {
  const { currentUser } = useUser();
  const { settingsTarget, setSettingsTarget } = useUI();
  const isAdmin = !!currentUser.isAdmin;
  const [activeTab, setActiveTab] = useState<MainTab>('account');
  const [adminSub, setAdminSub] = useState<AdminSubTab>('users');

  // Deep-link intent — bildirim tıklamasından / dock ikonundan gelen hedef
  // tab'ına otomatik geçer. 'invite_requests' AdminActionBar'da ek iş yapıyor;
  // 'app' / 'account' sadece tab seçer, sonra temizlenir.
  useEffect(() => {
    if (!settingsTarget) return;
    if (settingsTarget === 'invite_requests' && isAdmin) {
      setActiveTab('admin');
      setAdminSub('users');
      // temizlik AdminActionBar'da
    } else if (settingsTarget === 'app') {
      setActiveTab('app');
      setSettingsTarget(null);
    } else if (settingsTarget === 'account') {
      setActiveTab('account');
      setSettingsTarget(null);
    }
  }, [settingsTarget, isAdmin, setSettingsTarget]);

  const showServersSub = !!currentUser.isPrimaryAdmin;
  const effectiveSub: AdminSubTab = adminSub === 'servers' && !showServersSub ? 'users' : adminSub;
  const effectiveTab: MainTab = activeTab === 'admin' && !isAdmin ? 'account' : activeTab;

  // Platform-conditional sections — empty render engelleme
  const showPermissions = isCapacitor();
  const showVoiceMode = isMobile();

  const mainTabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }> = [
    { key: 'account', icon: <UserIcon size={13} strokeWidth={2} />, label: 'Hesap' },
    { key: 'app', icon: <Palette size={13} strokeWidth={2} />, label: 'Uygulama' },
    ...(isAdmin ? [{ key: 'admin' as MainTab, icon: <ShieldCheck size={13} strokeWidth={2} />, label: 'Yönetim' }] : []),
  ];

  return (
    <div className="w-full max-w-[1100px] mx-auto pb-28 px-2 md:px-4 xl:px-6">

      {/* ── Header — başlık ve segmented nav dikey hizalı, central ── */}
      <div className="flex flex-col gap-4 pt-4 pb-5 md:pt-6 md:pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Settings size={15} className="text-[var(--theme-accent)] opacity-75" />
          </div>
          <h2 className="text-base md:text-lg font-bold text-[var(--theme-text)] tracking-[-0.01em] leading-none">Ayarlar</h2>
        </div>
        <SegmentedTabs tabs={mainTabs} value={effectiveTab} onChange={setActiveTab} />
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={effectiveTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.08 } }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          {effectiveTab === 'account' && (
            <div className="flex flex-col gap-5 md:gap-6">
              <section>
                <DomainTitle icon={<UserIcon size={11} strokeWidth={2.2} />} title="Profil & Hesap" />
                <AccountSection />
              </section>
              <section>
                <DomainTitle icon={<Eye size={11} strokeWidth={2.2} />} title="Gizlilik" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <LastSeenCard />
                  {isElectron() && isGameActivityAvailable() && <GameActivityCard />}
                </div>
              </section>
              {showPermissions && (
                <section>
                  <DomainTitle icon={<ShieldCheck size={11} strokeWidth={2.2} />} title="İzinler" />
                  <PermissionSection />
                </section>
              )}
            </div>
          )}

          {effectiveTab === 'app' && (
            <div className="flex flex-col gap-5 md:gap-6">
              <div className="hidden xl:grid xl:grid-cols-2 gap-4 xl:gap-5 items-start">
                <div className="flex flex-col gap-5">
                  <section>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                    <AppearanceSection />
                  </section>
                  <section>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                    <SoundsSection />
                  </section>
                </div>
                <div className="flex flex-col gap-5">
                  <section>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                    <PerformanceSection />
                  </section>
                  {showVoiceMode && (
                    <section>
                      <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                      <VoiceModeSection />
                    </section>
                  )}
                  {isElectron() && (
                    <section>
                      <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                      <VoiceOverlayCard />
                    </section>
                  )}
                </div>
              </div>

              {/* base–lg: tek kolon */}
              <div className="flex flex-col gap-5 xl:hidden">
                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <AppearanceSection />
                </section>
                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </section>
                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                  <PerformanceSection />
                </section>
                {showVoiceMode && (
                  <section>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </section>
                )}
                {isElectron() && (
                  <section>
                    <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                    <VoiceOverlayCard />
                  </section>
                )}
              </div>
            </div>
          )}

          {effectiveTab === 'admin' && isAdmin && (
            <div className="space-y-5">
              <DomainTitle
                icon={<ShieldCheck size={11} strokeWidth={2.2} />}
                title={`Yönetim · ${effectiveSub === 'users' ? 'Kullanıcılar' : 'Sunucular'}`}
              />

              {(() => {
                const subTabs: { key: AdminSubTab; icon: React.ReactNode; label: string; visible: boolean }[] = [
                  { key: 'users', icon: <Users size={12} />, label: 'Kullanıcılar', visible: true },
                  { key: 'servers', icon: <Server size={12} />, label: 'Sunucular', visible: showServersSub },
                ];
                const visible = subTabs.filter(t => t.visible);
                return (
                  <div className={`surface-card grid gap-1 p-1 rounded-xl ${visible.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {visible.map(tab => {
                      const isActive = effectiveSub === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setAdminSub(tab.key)}
                          className={`flex items-center gap-1.5 justify-center min-w-0 py-1.5 rounded-lg text-[11px] md:text-[12px] font-semibold transition-all duration-150 truncate ${
                            isActive
                              ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)] border border-[rgba(var(--theme-accent-rgb),0.25)]'
                              : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(255,255,255,0.02)]'
                          }`}
                        >
                          {tab.icon}
                          <span className="truncate">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {effectiveSub === 'users' && (
                <div className="space-y-5">
                  <AdminActionBar />
                  {currentUser.isPrimaryAdmin ? <ManagementUsersPanel /> : <AdminUserManagement />}
                </div>
              )}

              {effectiveSub === 'servers' && showServersSub && <SystemServersPanel />}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}
