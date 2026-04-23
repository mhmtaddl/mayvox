import React, { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Users, Server, User as UserIcon, Palette, Eye, Gamepad2 } from 'lucide-react';
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
