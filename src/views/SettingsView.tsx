import React, { useState } from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

// ── Section components ──
import AccountSection from '../components/settings/sections/AccountSection';
import { AppearanceSection, SoundsSection, AudioProfileSection, PerformanceSection, VoiceChannelSection, VoiceModeSection, LastSeenSection } from '../components/settings/sections/SettingsSections';
import AdminUserManagement from '../components/settings/sections/AdminUserManagement';
import { InviteCodeSection, InviteRequestsSection } from '../components/settings/sections/AdminPanelSections';
import PermissionSection from '../components/settings/sections/PermissionSection';

export default function SettingsView() {
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'settings' | 'admin'>('settings');

  return (
    <div className="w-full max-w-2xl xl:max-w-4xl 2xl:max-w-5xl mx-auto pb-28 px-2 sm:px-4">

      {/* ── Page header ── */}
      <div className="flex items-center gap-4 pt-8 pb-8">
        <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/8 flex items-center justify-center shrink-0">
          <Settings size={18} className="text-[var(--theme-accent)] opacity-70" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-[var(--theme-text)] tracking-tight leading-none">Ayarlar</h2>
          <p className="text-[11px] text-[var(--theme-secondary-text)] mt-1.5">Profil ve uygulama tercihleri</p>
        </div>
      </div>

      {/* ── Tab bar — only for admins ── */}
      {currentUser.isAdmin && (
        <div className="flex gap-1 mb-8 p-1 bg-[var(--theme-surface-card)] rounded-xl">
          {([
            { key: 'settings' as const, icon: <Settings size={14} />, label: 'Ayarlar' },
            { key: 'admin' as const, icon: <ShieldCheck size={14} />, label: 'Yönetim' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 flex-1 justify-center py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 ${
                activeTab === tab.key
                  ? 'bg-[rgba(255,255,255,0.06)] text-[var(--theme-text)] border border-[rgba(255,255,255,0.06)]'
                  : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(255,255,255,0.02)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Ayarlar Tab ── */}
      {(activeTab === 'settings' || !currentUser.isAdmin) && (
        <div className="space-y-10">
          <AccountSection />
          <PermissionSection />
          <LastSeenSection />
          <AppearanceSection />
          <SoundsSection />
          <AudioProfileSection />
          <VoiceModeSection />
          <VoiceChannelSection />
          <PerformanceSection />
        </div>
      )}

      {/* ── Yönetim Tab ── */}
      {currentUser.isAdmin && activeTab === 'admin' && (
        <div className="space-y-10">
          <InviteCodeSection />
          <InviteRequestsSection />
          <AdminUserManagement />
        </div>
      )}

    </div>
  );
}
