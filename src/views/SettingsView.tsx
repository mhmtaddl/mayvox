import React, { useState } from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

// ── Section components ──
import AccountSection from '../components/settings/sections/AccountSection';
import { AppearanceSection, SoundsSection, AudioProfileSection, PerformanceSection, VoiceChannelSection } from '../components/settings/sections/SettingsSections';
import AdminUserManagement from '../components/settings/sections/AdminUserManagement';
import { InviteCodeSection, InviteRequestsSection, UpdatePolicySection } from '../components/settings/sections/AdminPanelSections';

export default function SettingsView() {
  const { currentUser } = useUser();

  // Tab state: 'settings' | 'admin'
  const [activeTab, setActiveTab] = useState<'settings' | 'admin'>('settings');

  return (
    <div className="w-full max-w-2xl mx-auto pb-14">

      {/* ── Page header ── */}
      <div className="flex items-center gap-4 pt-10 pb-6">
        <div className="w-11 h-11 rounded-2xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
          <Settings size={20} className="text-[var(--theme-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-[var(--theme-text)] tracking-tight">Ayarlar</h2>
          <p className="text-xs text-[var(--theme-secondary-text)] mt-0.5">Profil ve uygulama tercihleri</p>
        </div>
      </div>

      {/* ── Tab bar — only visible for admins ── */}
      {currentUser.isAdmin && (
        <div className="flex gap-1 mb-8 p-1 bg-[var(--theme-sidebar)]/50 rounded-xl border border-[var(--theme-border)]">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 flex-1 justify-center py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'settings'
                ? 'bg-[var(--theme-accent)] text-white shadow-md shadow-[var(--theme-accent)]/20'
                : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-bg)]/50'
            }`}
          >
            <Settings size={15} />
            Ayarlar
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex items-center gap-2 flex-1 justify-center py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'admin'
                ? 'bg-[var(--theme-accent)] text-white shadow-md shadow-[var(--theme-accent)]/20'
                : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-bg)]/50'
            }`}
          >
            <ShieldCheck size={15} />
            Yönetim
          </button>
        </div>
      )}

      {/* ── Ayarlar Tab ── */}
      {(activeTab === 'settings' || !currentUser.isAdmin) && (
        <div className="space-y-8">
          <AccountSection />
          <AppearanceSection />
          <SoundsSection />
          <AudioProfileSection />
          <VoiceChannelSection />
          <PerformanceSection />
        </div>
      )}

      {/* ── Yönetim Tab (sadece admin) ── */}
      {currentUser.isAdmin && activeTab === 'admin' && (
        <div className="space-y-8">
          <InviteCodeSection />
          <InviteRequestsSection />
          <AdminUserManagement />
          <UpdatePolicySection />
        </div>
      )}

    </div>
  );
}
