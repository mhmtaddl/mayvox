import React, { useState } from 'react';
import { Settings, ShieldCheck, Users, Server } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

// ── Components ──
import QuickSettingsBar from '../components/settings/QuickSettingsBar';
import AccountSection from '../components/settings/sections/AccountSection';
import { AppearanceSection, SoundsSection, AudioProfileSection, PerformanceSection, VoiceModeSection, LastSeenSection } from '../components/settings/sections/SettingsSections';
import AdminUserManagement from '../components/settings/sections/AdminUserManagement';
import { InviteCodeSection, InviteRequestsSection } from '../components/settings/sections/AdminPanelSections';
import PermissionSection from '../components/settings/sections/PermissionSection';
import SystemServersPanel from '../components/settings/sections/SystemServersPanel';
import ManagementUsersPanel from '../components/settings/sections/ManagementUsersPanel';

type AdminSubTab = 'users' | 'servers';

export default function SettingsView() {
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'settings' | 'admin'>('settings');
  const [adminSub, setAdminSub] = useState<AdminSubTab>('users');

  const showServersSub = !!currentUser.isPrimaryAdmin;
  // Primary admin yetkisi kaybolursa safe default'a dön
  const effectiveSub: AdminSubTab = adminSub === 'servers' && !showServersSub ? 'users' : adminSub;

  return (
    <div className="w-full max-w-[1100px] mx-auto pb-28 px-2 md:px-4 xl:px-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 pt-4 pb-3 md:gap-4 md:pt-6 md:pb-4">
        <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[var(--theme-accent)]/8 flex items-center justify-center shrink-0">
          <Settings size={15} className="text-[var(--theme-accent)] opacity-70" />
        </div>
        <h2 className="text-sm md:text-base xl:text-lg font-bold text-[var(--theme-text)] tracking-tight leading-none">Ayarlar</h2>
      </div>

      {/* ── Quick Settings Bar ── */}
      <div className="mb-3 md:mb-4 xl:mb-5">
        <QuickSettingsBar />
      </div>

      {/* ── Tab bar — only for admins ── */}
      {currentUser.isAdmin && (
        <div className="grid grid-cols-2 gap-1 mb-4 md:mb-5 xl:mb-6 p-1 bg-[var(--theme-surface-card)] rounded-xl">
          {([
            { key: 'settings' as const, icon: <Settings size={13} />, label: 'Ayarlar' },
            { key: 'admin' as const, icon: <ShieldCheck size={13} />, label: 'Yönetim' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 justify-center min-w-0 py-1.5 md:py-2 rounded-lg text-[11px] md:text-[12px] font-semibold transition-all duration-150 truncate ${
                activeTab === tab.key
                  ? 'bg-[rgba(255,255,255,0.06)] text-[var(--theme-text)] border border-[rgba(255,255,255,0.06)]'
                  : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(255,255,255,0.02)]'
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Ayarlar Tab ── */}
      {(activeTab === 'settings' || !currentUser.isAdmin) && (
        <>
          {/* xl: 2-kolon grid */}
          <div className="hidden xl:grid xl:grid-cols-2 gap-4 xl:gap-5 items-start">
            <div className="flex flex-col gap-4">
              <AccountSection />
              <LastSeenSection />
              <PermissionSection />
              <VoiceModeSection />
            </div>
            <div className="flex flex-col gap-4">
              <AppearanceSection />
              <SoundsSection />
              <AudioProfileSection />
              <PerformanceSection />
            </div>
          </div>

          {/* base–lg: tek kolon, wireframe sırası */}
          <div className="flex flex-col gap-3 md:gap-4 xl:hidden">
            <AccountSection />
            <LastSeenSection />
            <PermissionSection />
            <VoiceModeSection />
            <AppearanceSection />
            <SoundsSection />
            <AudioProfileSection />
            <PerformanceSection />
          </div>
        </>
      )}

      {/* ── Yönetim Tab ── */}
      {currentUser.isAdmin && activeTab === 'admin' && (
        <div className="space-y-4 md:space-y-5 xl:space-y-6">
          {/* Yönetim başlık — hiyerarşi: Ayarlar → Yönetim → [subsection] */}
          <div className="flex items-baseline gap-2">
            <h3 className="text-[13px] md:text-[14px] font-bold text-[var(--theme-text)] tracking-tight">Yönetim</h3>
            <span className="text-[10px] md:text-[11px] text-[var(--theme-secondary-text)]/60">
              {effectiveSub === 'users' ? '/ Kullanıcılar' : '/ Sunucular'}
            </span>
          </div>

          {/* Alt-sekme seçici */}
          {(() => {
            const subTabs: { key: AdminSubTab; icon: React.ReactNode; label: string; visible: boolean }[] = [
              { key: 'users', icon: <Users size={12} />, label: 'Kullanıcılar', visible: true },
              { key: 'servers', icon: <Server size={12} />, label: 'Sunucular', visible: showServersSub },
            ];
            const visible = subTabs.filter(t => t.visible);
            return (
              <div className={`grid gap-1 p-1 bg-[var(--theme-surface-card)] rounded-xl ${visible.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
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

          {/* Alt-sekme içeriği — tek seferde tek içerik render edilir */}
          {effectiveSub === 'users' && (
            <div className="space-y-4 md:space-y-5 xl:space-y-6">
              {/* Yeni ölçeklenebilir panel — server-side pagination, filtreler, plan yönetimi */}
              {currentUser.isPrimaryAdmin ? (
                <ManagementUsersPanel />
              ) : (
                <AdminUserManagement />
              )}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-4 pt-2 border-t border-[var(--theme-border)]/30">
                <InviteCodeSection />
                <InviteRequestsSection />
              </div>
            </div>
          )}

          {effectiveSub === 'servers' && showServersSub && (
            <SystemServersPanel />
          )}
        </div>
      )}

    </div>
  );
}
