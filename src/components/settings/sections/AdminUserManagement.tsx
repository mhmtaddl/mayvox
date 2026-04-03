import React, { useState, useMemo } from 'react';
import { Users, Search, X, Check, Trash2, ShieldCheck, Recycle, KeyRound, VolumeX, Ban } from 'lucide-react';
import { AccordionSection, cardCls } from '../shared';
import { formatFullName } from '../../../lib/formatName';
import { useUser } from '../../../contexts/UserContext';
import { useAppState } from '../../../contexts/AppStateContext';
import type { User } from '../../../types';

export default function AdminUserManagement() {
  const { currentUser, allUsers } = useUser();
  const {
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
    handleToggleModerator,
    passwordResetRequests,
    handleAdminManualReset,
    appVersion: currentAppVersion,
  } = useAppState();

  // Helper
  const isOutdated = (userVersion: string, appVer: string): boolean => {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
    const [uMaj, uMin, uPat] = parse(userVersion);
    const [aMaj, aMin, aPat] = parse(appVer);
    if (uMaj !== aMaj) return uMaj < aMaj;
    if (uMin !== aMin) return uMin < aMin;
    return uPat < aPat;
  };

  // Memoized user lists
  const otherUsers = useMemo(
    () => allUsers.filter(u => u.id !== currentUser.id),
    [allUsers, currentUser.id]
  );

  // Local state
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'moderator' | 'user'>('all');
  const [muteInputs, setMuteInputs] = useState<Record<string, string>>({});
  const [banInputs, setBanInputs] = useState<Record<string, string>>({});
  const [keyResetConfirm, setKeyResetConfirm] = useState<string | null>(null);

  // Filtered user list
  const filteredUsers = useMemo(() => {
    let list = otherUsers;
    if (userRoleFilter === 'admin') list = list.filter(u => u.isAdmin);
    else if (userRoleFilter === 'moderator') list = list.filter(u => u.isModerator && !u.isAdmin);
    else if (userRoleFilter === 'user') list = list.filter(u => !u.isAdmin && !u.isModerator);
    if (userSearch.trim()) {
      const q = userSearch.toLocaleLowerCase('tr');
      list = list.filter(u =>
        `${u.firstName} ${u.lastName}`.toLocaleLowerCase('tr').includes(q) ||
        (u.name || '').toLocaleLowerCase('tr').includes(q) ||
        (u.email || '').toLocaleLowerCase('tr').includes(q)
      );
    }
    return list;
  }, [otherUsers, userRoleFilter, userSearch]);

  // Stats
  const adminCount = useMemo(() => otherUsers.filter(u => u.isAdmin).length, [otherUsers]);
  const modCount = useMemo(() => otherUsers.filter(u => u.isModerator && !u.isAdmin).length, [otherUsers]);
  const userCount = useMemo(() => otherUsers.filter(u => !u.isAdmin && !u.isModerator).length, [otherUsers]);

  // Role filter tabs
  const roleFilters = [
    { key: 'all' as const, label: 'Tümü', count: otherUsers.length },
    { key: 'admin' as const, label: 'Admin', count: adminCount },
    { key: 'moderator' as const, label: 'Moderatör', count: modCount },
    { key: 'user' as const, label: 'Kullanıcı', count: userCount },
  ];

  return (
    <AccordionSection icon={<Users size={12} />} title="Kullanıcı Yönetimi" defaultOpen>

      {/* Search + filter bar (sticky) */}
      <div className="sticky top-0 z-10 bg-[var(--theme-bg)] pb-3 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50" size={15} />
          <input
            type="text"
            placeholder="Kullanıcı ara..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="w-full bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/10 outline-none transition-all"
          />
          {userSearch && (
            <button onClick={() => setUserSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)]">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-1.5">
          {roleFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setUserRoleFilter(f.key)}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                userRoleFilter === f.key
                  ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border-[var(--theme-accent)]/30 shadow-sm shadow-[var(--theme-accent)]/10'
                  : 'bg-transparent text-[var(--theme-secondary-text)]/50 border-[var(--theme-border)] hover:text-[var(--theme-secondary-text)] hover:border-[var(--theme-border)]/80'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* Result count */}
        <p className="text-[10px] text-[var(--theme-secondary-text)] font-medium">
          {filteredUsers.length} kullanıcı bulundu
        </p>
      </div>

      {/* User list — fixed height, inner scroll */}
      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-sidebar)]/20">
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--theme-secondary-text)]">
            <Users size={28} className="opacity-30 mb-2" />
            <p className="text-sm font-medium">Kullanıcı bulunamadı</p>
            <p className="text-xs opacity-60 mt-1">Arama veya filtreyi değiştirmeyi deneyin</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--theme-border)]">
            {filteredUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--theme-accent)]/[0.03] transition-colors group/row">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-[var(--theme-accent)]/20 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-xs shrink-0 ring-1 ring-[var(--theme-border)]">
                    {user.avatar?.startsWith('http')
                      ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : user.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--theme-text)] truncate" title={formatFullName(user.firstName, user.lastName)}>{formatFullName(user.firstName, user.lastName)}</span>
                      {!user.isAdmin && user.isModerator && (
                        <span className="shrink-0 w-4 h-4 rounded flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                          <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-2.5 h-2.5"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
                        </span>
                      )}
                      {(() => {
                        const hasVersion = !!user.appVersion;
                        const outdated = !hasVersion || (currentAppVersion ? isOutdated(user.appVersion!, currentAppVersion) : false);
                        return (
                          <span className={`text-[9px] font-semibold shrink-0 px-1.5 py-0.5 rounded-full border ${outdated ? 'text-red-400 border-red-500/20 bg-red-500/8 animate-pulse' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/8'}`}>
                            {hasVersion ? `v${user.appVersion}` : 'Eski'}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {user.isMuted && <span className="text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded-full border border-orange-500/20 font-medium">Susturuldu</span>}
                      {user.isVoiceBanned && <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20 font-medium">Konuşma Yasaklı</span>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 items-center shrink-0 ml-3">
                  <div className="flex flex-col gap-1.5">
                    {/* Susturma */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="dk"
                          value={muteInputs[user.id] || ''}
                          onChange={e => setMuteInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-14 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-2 py-1 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--theme-secondary-text)] pointer-events-none">dk</span>
                      </div>
                      <button
                        onClick={() => { const m = parseInt(muteInputs[user.id]); if (m > 0) handleMuteUser(user.id, m); }}
                        title="Sustur"
                        className="flex items-center justify-center w-7 h-7 bg-[var(--theme-accent)] text-white rounded hover:opacity-90 transition-all"
                      >
                        <VolumeX size={13} />
                      </button>
                      {user.isMuted && (
                        <>
                          <span className="text-[10px] font-mono text-orange-500 font-bold">{Math.ceil((user.muteExpires! - Date.now()) / 60000)}dk</span>
                          <button onClick={() => handleUnmuteUser(user.id)} title="Susturmayı Kaldır" className="flex items-center justify-center w-7 h-7 bg-orange-500 text-white rounded hover:opacity-90 transition-all">
                            <Recycle size={13} />
                          </button>
                        </>
                      )}
                    </div>
                    {/* Yasaklama */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="gün"
                          value={banInputs[user.id] || ''}
                          onChange={e => setBanInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-14 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-2 py-1 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--theme-secondary-text)] pointer-events-none">gün</span>
                      </div>
                      <button
                        onClick={() => { const d = parseInt(banInputs[user.id]); if (d > 0) handleBanUser(user.id, d * 1440); }}
                        title="Yasakla"
                        className="flex items-center justify-center w-7 h-7 bg-red-500 text-white rounded hover:opacity-90 transition-all"
                      >
                        <Ban size={13} />
                      </button>
                      {user.isVoiceBanned && (
                        <>
                          <span className="text-[10px] font-mono text-red-500 font-bold">{Math.ceil((user.banExpires! - Date.now()) / (1000 * 60 * 60 * 24))}g</span>
                          <button onClick={() => handleUnbanUser(user.id)} title="Yasağı Kaldır" className="flex items-center justify-center w-7 h-7 bg-red-500 text-white rounded hover:opacity-90 transition-all">
                            <Recycle size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 border-l border-[var(--theme-border)]/50 pl-3">
                    {/* Yetki grubu */}
                    {currentUser.isPrimaryAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleAdmin(user.id)}
                          title={user.isAdmin ? 'Admin Yetkisini Kaldır' : 'Admin Yap'}
                          className={`flex items-center justify-center w-7 h-7 rounded transition-all ${
                            user.isAdmin
                              ? 'bg-orange-500 text-white border border-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.3)] hover:bg-orange-600'
                              : 'bg-emerald-500/8 text-emerald-500/60 border border-emerald-500/15 hover:bg-emerald-500/20 hover:text-emerald-500'
                          }`}
                        >
                          <ShieldCheck size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleModerator(user.id)}
                          title={user.isModerator ? 'Moderatör Yetkisini Kaldır' : 'Moderatör Yap'}
                          className={`flex items-center justify-center w-7 h-7 rounded transition-all ${
                            user.isModerator
                              ? 'bg-violet-500 text-white border border-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.35)] hover:bg-violet-600'
                              : 'bg-violet-500/8 text-violet-400/60 border border-violet-500/15 hover:bg-violet-500/20 hover:text-violet-400'
                          }`}
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
                        </button>
                      </div>
                    )}
                    {/* Sistem grubu */}
                    <div className="flex items-center gap-1 border-l border-[var(--theme-border)]/30 pl-2 ml-1">
                      {keyResetConfirm === user.id ? (
                        <div className="flex items-center gap-1 p-1 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-lg">
                          <span className="text-[9px] text-[var(--theme-secondary-text)] px-1">Sıfırla?</span>
                          <button
                            onClick={async () => { await handleAdminManualReset(user.id, user.name, user.email || ''); setKeyResetConfirm(null); }}
                            className="flex items-center justify-center w-6 h-6 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all"
                            title="Onayla"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            onClick={() => setKeyResetConfirm(null)}
                            className="flex items-center justify-center w-6 h-6 rounded bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                            title="İptal"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setKeyResetConfirm(user.id)}
                          title={passwordResetRequests.some(r => r.userId === user.id) ? 'Şifre sıfırlama isteği var!' : 'Şifre Sıfırla'}
                          className={`flex items-center justify-center w-7 h-7 rounded transition-all ${
                            passwordResetRequests.some(r => r.userId === user.id)
                              ? 'bg-red-500/15 text-red-500 border border-red-500/25 hover:bg-red-500 hover:text-white'
                              : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                          }`}
                        >
                          <KeyRound size={13} />
                        </button>
                      )}
                      {(!user.isPrimaryAdmin && (currentUser.isPrimaryAdmin || !user.isAdmin)) && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          title="Kullanıcıyı Sil"
                          className="flex items-center justify-center w-7 h-7 bg-red-500/10 text-red-500 border border-red-500/20 rounded hover:bg-red-500 hover:text-white transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AccordionSection>
  );
}
