import React, { useState, useMemo, useCallback } from 'react';
import AvatarContent from '../../AvatarContent';
import { Users, Search, X, Trash2, ShieldCheck, Recycle, KeyRound, VolumeX, Ban, Server } from 'lucide-react';
import { cardCls } from '../shared';
import { getPublicDisplayName } from '../../../lib/formatName';
import { useUser } from '../../../contexts/UserContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { useUI } from '../../../contexts/UIContext';
import ConfirmModal from '../../ConfirmModal';
import RoleBadge, { getUserRoleBadge } from '../../RoleBadge';

// ── Confirmation dialog state ──
type ConfirmAction =
  | { type: 'delete'; userId: string; userName: string }
  | { type: 'makeAdmin'; userId: string; userName: string }
  | { type: 'removeAdmin'; userId: string; userName: string }
  | { type: 'makeModerator'; userId: string; userName: string }
  | { type: 'removeModerator'; userId: string; userName: string }
  | { type: 'mute'; userId: string; userName: string; minutes: number }
  | { type: 'ban'; userId: string; userName: string; days: number }
  | { type: 'unmute'; userId: string; userName: string }
  | { type: 'unban'; userId: string; userName: string }
  | { type: 'resetPassword'; userId: string; userName: string; email: string };

export default function AdminUserManagement() {
  const { currentUser, allUsers } = useUser();
  const { setToastMsg } = useUI();
  const {
    handleMuteUser, handleBanUser, handleUnmuteUser, handleUnbanUser,
    handleDeleteUser, handleToggleAdmin, handleToggleModerator,
    handleSetServerCreationPlan,
    passwordResetRequests, handleAdminManualReset,
    appVersion: currentAppVersion,
  } = useAppState();

  // ── Server creation plan cycle ──
  const PLAN_CYCLE: Array<'none' | 'free' | 'pro' | 'ultra'> = ['none', 'free', 'pro', 'ultra'];
  const PLAN_LABEL: Record<'none' | 'free' | 'pro' | 'ultra', string> = { none: '—', free: 'F', pro: 'P', ultra: 'U' };
  const PLAN_STYLE: Record<'none' | 'free' | 'pro' | 'ultra', string> = {
    none: 'bg-[var(--theme-border)]/15 text-[var(--theme-secondary-text)]/60',
    free: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
    pro: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    ultra: 'bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30',
  };
  const cyclePlan = async (userId: string, current: 'none' | 'free' | 'pro' | 'ultra') => {
    const idx = PLAN_CYCLE.indexOf(current);
    const next = PLAN_CYCLE[(idx + 1) % PLAN_CYCLE.length];
    await handleSetServerCreationPlan(userId, next);
    setToastMsg(`Sunucu oluşturma yetkisi: ${next.toUpperCase()}`);
  };

  const isOutdated = (userVersion: string, appVer: string): boolean => {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
    const [uMaj, uMin, uPat] = parse(userVersion);
    const [aMaj, aMin, aPat] = parse(appVer);
    if (uMaj !== aMaj) return uMaj < aMaj;
    if (uMin !== aMin) return uMin < aMin;
    return uPat < aPat;
  };

  const otherUsers = useMemo(() => allUsers.filter(u => u.id !== currentUser.id), [allUsers, currentUser.id]);

  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'moderator' | 'user'>('all');
  const [muteInputs, setMuteInputs] = useState<Record<string, string>>({});
  const [banInputs, setBanInputs] = useState<Record<string, string>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const filteredUsers = useMemo(() => {
    let list = otherUsers;
    if (userRoleFilter === 'admin') list = list.filter(u => u.isAdmin);
    else if (userRoleFilter === 'moderator') list = list.filter(u => u.isModerator && !u.isAdmin);
    else if (userRoleFilter === 'user') list = list.filter(u => !u.isAdmin && !u.isModerator);
    if (userSearch.trim()) {
      const q = userSearch.toLocaleLowerCase('tr');
      list = list.filter(u =>
        getPublicDisplayName(u).toLocaleLowerCase('tr').includes(q) ||
        `${u.firstName} ${u.lastName}`.toLocaleLowerCase('tr').includes(q) ||
        (u.name || '').toLocaleLowerCase('tr').includes(q) ||
        (u.email || '').toLocaleLowerCase('tr').includes(q)
      );
    }
    return list;
  }, [otherUsers, userRoleFilter, userSearch]);

  const adminCount = useMemo(() => otherUsers.filter(u => u.isAdmin).length, [otherUsers]);
  const modCount = useMemo(() => otherUsers.filter(u => u.isModerator && !u.isAdmin).length, [otherUsers]);
  const userCount = useMemo(() => otherUsers.filter(u => !u.isAdmin && !u.isModerator).length, [otherUsers]);

  const roleFilters = [
    { key: 'all' as const, label: 'Tümü', count: otherUsers.length },
    { key: 'admin' as const, label: 'Admin', count: adminCount },
    { key: 'moderator' as const, label: 'Mod', count: modCount },
    { key: 'user' as const, label: 'Kullanıcı', count: userCount },
  ];

  const toast = (msg: string) => { setToastMsg(msg); };

  // ── Confirm handler ──
  const handleConfirm = useCallback(async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      const n = confirmAction.userName;
      switch (confirmAction.type) {
        case 'delete':
          await handleDeleteUser(confirmAction.userId);
          toast(`${n} silindi`);
          break;
        case 'makeAdmin':
          await handleToggleAdmin(confirmAction.userId);
          toast(`${n} admin yapıldı`);
          break;
        case 'removeAdmin':
          await handleToggleAdmin(confirmAction.userId);
          toast(`${n} admin yetkisi kaldırıldı`);
          break;
        case 'makeModerator':
          await handleToggleModerator(confirmAction.userId);
          toast(`${n} moderatör yapıldı`);
          break;
        case 'removeModerator':
          await handleToggleModerator(confirmAction.userId);
          toast(`${n} moderatör yetkisi kaldırıldı`);
          break;
        case 'mute':
          await handleMuteUser(confirmAction.userId, confirmAction.minutes);
          setExpandedUser(null);
          toast(`${n} ${confirmAction.minutes} dk susturuldu`);
          break;
        case 'ban':
          await handleBanUser(confirmAction.userId, confirmAction.days * 1440);
          setExpandedUser(null);
          toast(`${n} ${confirmAction.days} gün yasaklandı`);
          break;
        case 'unmute':
          await handleUnmuteUser(confirmAction.userId);
          toast(`${n} susturması kaldırıldı`);
          break;
        case 'unban':
          await handleUnbanUser(confirmAction.userId);
          toast(`${n} yasağı kaldırıldı`);
          break;
        case 'resetPassword':
          await handleAdminManualReset(confirmAction.userId, confirmAction.userName, confirmAction.email);
          toast(`${n} şifresi sıfırlandı`);
          break;
      }
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  }, [confirmAction, handleDeleteUser, handleToggleAdmin, handleToggleModerator, handleMuteUser, handleBanUser, handleUnmuteUser, handleUnbanUser]);

  // ── Confirm modal config ──
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const n = confirmAction.userName;
    switch (confirmAction.type) {
      case 'delete':
        return { title: 'Kullanıcıyı Sil', description: `${n} adlı kullanıcıyı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`, confirmText: 'Sil', danger: true };
      case 'makeAdmin':
        return { title: 'Admin Yetkisi Ver', description: `${n} adlı kullanıcıya admin yetkisi vermek istediğinizden emin misiniz? Bu kullanıcı tüm yönetim işlemlerini yapabilecek.`, confirmText: 'Admin Yap', danger: false };
      case 'removeAdmin':
        return { title: 'Admin Yetkisini Kaldır', description: `${n} adlı kullanıcının admin yetkisini kaldırmak istediğinizden emin misiniz?`, confirmText: 'Kaldır', danger: true };
      case 'makeModerator':
        return { title: 'Moderatör Yetkisi Ver', description: `${n} adlı kullanıcıya moderatör yetkisi vermek istediğinizden emin misiniz?`, confirmText: 'Moderatör Yap', danger: false };
      case 'removeModerator':
        return { title: 'Moderatör Yetkisini Kaldır', description: `${n} adlı kullanıcının moderatör yetkisini kaldırmak istediğinizden emin misiniz?`, confirmText: 'Kaldır', danger: true };
      case 'mute':
        return { title: 'Kullanıcıyı Sustur', description: `${n} adlı kullanıcıyı ${confirmAction.minutes} dakika susturmak istediğinizden emin misiniz?`, confirmText: 'Sustur', danger: true };
      case 'ban':
        return { title: 'Kullanıcıyı Yasakla', description: `${n} adlı kullanıcıyı ${confirmAction.days} gün yasaklamak istediğinizden emin misiniz?`, confirmText: 'Yasakla', danger: true };
      case 'unmute':
        return { title: 'Susturmayı Kaldır', description: `${n} adlı kullanıcının susturmasını kaldırmak istediğinizden emin misiniz?`, confirmText: 'Kaldır', danger: false };
      case 'unban':
        return { title: 'Yasağı Kaldır', description: `${n} adlı kullanıcının yasağını kaldırmak istediğinizden emin misiniz?`, confirmText: 'Kaldır', danger: false };
      case 'resetPassword':
        return { title: 'Şifre Sıfırla', description: `${n} adlı kullanıcının şifresini sıfırlamak istediğinizden emin misiniz? Bu işlem kullanıcı girişini etkileyebilir.`, confirmText: 'Sıfırla', danger: true };
    }
  }, [confirmAction]);

  const IconBtn = ({ onClick, title, icon, className }: { onClick: () => void; title: string; icon: React.ReactNode; className: string }) => (
    <button onClick={onClick} title={title} className={`flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded transition-all active:scale-90 ${className}`}>
      {icon}
    </button>
  );

  return (
    <div>
      {confirmConfig && (
        <ConfirmModal
          isOpen={!!confirmAction}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmText={confirmConfig.confirmText}
          cancelText="İptal"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
          danger={confirmConfig.danger}
          loading={confirmLoading}
        />
      )}

      {/* Search + filter bar */}
      <div className="space-y-2 md:space-y-3 mb-3 md:mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50" size={14} />
          <input
            type="text"
            placeholder="Kullanıcı ara..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="w-full bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-xl pl-9 pr-3 py-1.5 md:pl-10 md:pr-4 md:py-2 text-[11px] md:text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/10 outline-none transition-all"
          />
          {userSearch && (
            <button onClick={() => setUserSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)]">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {roleFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setUserRoleFilter(f.key)}
              className={`flex-1 min-w-[60px] py-1.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wider transition-all border truncate active:scale-95 ${
                userRoleFilter === f.key
                  ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border-[var(--theme-accent)]/30'
                  : 'bg-transparent text-[var(--theme-secondary-text)]/50 border-[var(--theme-border)] hover:text-[var(--theme-secondary-text)]'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <p className="text-[9px] md:text-[10px] text-[var(--theme-secondary-text)] font-medium">
          {filteredUsers.length} kullanıcı
        </p>
      </div>

      {/* User list */}
      <div className={`${cardCls} max-h-[380px] md:max-h-[420px] xl:max-h-[520px] overflow-y-auto scroll-smooth overscroll-contain`}>
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--theme-secondary-text)]">
            <Users size={24} className="opacity-30 mb-2" />
            <p className="text-[12px] font-medium">Kullanıcı bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--theme-border)]">
            {filteredUsers.map(user => {
              const isExpanded = expandedUser === user.id;
              const hasVersion = !!user.appVersion;
              const outdated = !hasVersion || (currentAppVersion ? isOutdated(user.appVersion!, currentAppVersion) : false);
              const publicName = getPublicDisplayName(user);

              return (
                <div key={user.id} className="px-2.5 py-2 md:px-4 md:py-3 hover:bg-[var(--theme-accent)]/[0.03] transition-colors">
                  {/* User row — stacked on narrow, inline on wide */}
                  <div className="flex flex-col xl:flex-row xl:items-center gap-2">
                    {/* User info */}
                    <div className="flex items-center gap-2 md:gap-2.5 min-w-0 flex-1">
                      <div className="h-7 w-7 md:h-8 md:w-8 avatar-squircle bg-[var(--theme-accent)]/20 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-[9px] md:text-[10px] shrink-0 ring-1 ring-[var(--theme-border)]">
                        <AvatarContent avatar={user.avatar} statusText={user.statusText} firstName={user.displayName || user.firstName} name={publicName} letterClassName="text-[9px] md:text-[10px] font-bold text-[var(--theme-text)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 md:gap-1.5 min-w-0">
                          <span className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)] truncate">{publicName}</span>
                          <RoleBadge role={getUserRoleBadge(user)} size="xs" subtle />
                          <span className={`text-[7px] md:text-[8px] font-semibold shrink-0 px-1 py-0.5 rounded-full border ${outdated ? 'text-red-400 border-red-500/20 bg-red-500/8 animate-pulse' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/8'}`}>
                            {hasVersion ? `v${user.appVersion}` : 'Eski'}
                          </span>
                          {(() => {
                            const p = (user.serverCreationPlan ?? 'none') as 'none' | 'free' | 'pro' | 'ultra';
                            if (p === 'none') return null;
                            const style = p === 'free'
                              ? { background: 'rgba(148,163,184,0.10)', color: 'rgb(203,213,225)', border: '1px solid rgba(148,163,184,0.25)' }
                              : p === 'pro'
                              ? { background: 'rgba(245,158,11,0.10)', color: 'rgb(251,191,36)', border: '1px solid rgba(245,158,11,0.28)' }
                              : { background: 'rgba(217,70,239,0.10)', color: 'rgb(232,121,249)', border: '1px solid rgba(217,70,239,0.28)' };
                            return (
                              <span title={`Sunucu oluşturma: ${p.toUpperCase()}`}
                                className="text-[7px] md:text-[8px] font-bold shrink-0 px-1 py-0.5 rounded-full leading-none"
                                style={style}>
                                {p === 'free' ? 'F' : p === 'pro' ? 'P' : 'U'}
                              </span>
                            );
                          })()}
                        </div>
                        {(user.isMuted || user.isVoiceBanned) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {user.isMuted && <span className="text-[7px] md:text-[8px] bg-orange-500/10 text-orange-500 px-1 py-0.5 rounded-full border border-orange-500/20 font-medium">Susturuldu</span>}
                            {user.isVoiceBanned && <span className="text-[7px] md:text-[8px] bg-red-500/10 text-red-500 px-1 py-0.5 rounded-full border border-red-500/20 font-medium">Yasaklı</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action groups — wrap on narrow */}
                    <div className="flex flex-wrap items-center gap-0.5 shrink-0">

                      {/* Moderasyon */}
                      <div className="flex items-center gap-0.5">
                        {user.isMuted ? (
                          <IconBtn onClick={() => setConfirmAction({ type: 'unmute', userId: user.id, userName: publicName })} title={`Susturmayı kaldır (${Math.ceil((user.muteExpires! - Date.now()) / 60000)} dk)`} icon={<Recycle size={12} />} className="bg-orange-500/15 text-orange-400 hover:bg-orange-500 hover:text-white" />
                        ) : (
                          <IconBtn onClick={() => setExpandedUser(isExpanded ? null : user.id)} title="Sustur" icon={<VolumeX size={12} />} className="bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)] hover:bg-orange-500/20 hover:text-orange-400" />
                        )}
                        {user.isVoiceBanned ? (
                          <IconBtn onClick={() => setConfirmAction({ type: 'unban', userId: user.id, userName: publicName })} title={`Yasağı kaldır (${Math.ceil((user.banExpires! - Date.now()) / (1000 * 60 * 60 * 24))} gün)`} icon={<Recycle size={12} />} className="bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white" />
                        ) : (
                          <IconBtn onClick={() => setExpandedUser(isExpanded ? null : user.id)} title="Yasakla" icon={<Ban size={12} />} className="bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)] hover:bg-red-500/20 hover:text-red-400" />
                        )}
                      </div>

                      <div className="w-px h-5 bg-[var(--theme-border)]/30 mx-0.5 md:mx-1" />

                      {/* Yetki */}
                      {currentUser.isPrimaryAdmin && (
                        <>
                          <div className="flex items-center gap-0.5">
                            <IconBtn
                              onClick={() => setConfirmAction({ type: user.isAdmin ? 'removeAdmin' : 'makeAdmin', userId: user.id, userName: publicName })}
                              title={user.isAdmin ? 'Admin yetkisini kaldır' : 'Admin yap'}
                              icon={<ShieldCheck size={12} />}
                              className={user.isAdmin
                                ? 'bg-orange-500 text-white border border-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.3)] hover:bg-orange-600'
                                : 'bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)]/60 hover:bg-emerald-500/20 hover:text-emerald-400'
                              }
                            />
                            <IconBtn
                              onClick={() => setConfirmAction({ type: user.isModerator ? 'removeModerator' : 'makeModerator', userId: user.id, userName: publicName })}
                              title={user.isModerator ? 'Moderatör kaldır' : 'Moderatör yap'}
                              icon={<svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>}
                              className={user.isModerator
                                ? 'bg-violet-500 text-white border border-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.3)] hover:bg-violet-600'
                                : 'bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)]/60 hover:bg-violet-500/20 hover:text-violet-400'
                              }
                            />
                          </div>
                          <div className="w-px h-5 bg-[var(--theme-border)]/30 mx-0.5 md:mx-1" />
                        </>
                      )}

                      {/* Sunucu oluşturma planı — cycle (NONE → F → P → U → NONE) */}
                      {(currentUser.isPrimaryAdmin || currentUser.isAdmin) && (() => {
                        const plan = (user.serverCreationPlan ?? 'none') as 'none' | 'free' | 'pro' | 'ultra';
                        return (
                          <>
                            <button
                              onClick={() => cyclePlan(user.id, plan)}
                              title={`Sunucu oluşturma: ${plan.toUpperCase()} — tıklayıp sırala`}
                              className={`flex items-center gap-1 h-7 md:h-8 px-1.5 rounded transition-all active:scale-90 ${PLAN_STYLE[plan]}`}
                            >
                              <Server size={10} className="shrink-0" />
                              <span className="text-[9px] font-bold leading-none">{PLAN_LABEL[plan]}</span>
                            </button>
                            <div className="w-px h-5 bg-[var(--theme-border)]/30 mx-0.5 md:mx-1" />
                          </>
                        );
                      })()}

                      {/* Sistem */}
                      <div className="flex items-center gap-0.5">
                        <IconBtn
                          onClick={() => setConfirmAction({ type: 'resetPassword', userId: user.id, userName: publicName, email: user.email || '' })}
                          title={passwordResetRequests.some(r => r.userId === user.id) ? 'Şifre sıfırlama isteği var!' : 'Şifre sıfırla'}
                          icon={<KeyRound size={12} />}
                          className={passwordResetRequests.some(r => r.userId === user.id)
                            ? 'bg-red-500/15 text-red-500 border border-red-500/25 hover:bg-red-500 hover:text-white'
                            : 'bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)] hover:bg-emerald-500/20 hover:text-emerald-400'
                          }
                        />
                        {(!user.isPrimaryAdmin && (currentUser.isPrimaryAdmin || !user.isAdmin)) && (
                          <IconBtn
                            onClick={() => setConfirmAction({ type: 'delete', userId: user.id, userName: publicName })}
                            title="Kullanıcıyı sil"
                            icon={<Trash2 size={12} />}
                            className="bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)] hover:bg-red-500 hover:text-white"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded — Sustur/Ban süresi girişi */}
                  {isExpanded && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30">
                        <VolumeX size={11} className="text-orange-400 shrink-0" />
                        <input
                          type="number"
                          placeholder="dk"
                          value={muteInputs[user.id] || ''}
                          onChange={e => setMuteInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-12 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => { const m = parseInt(muteInputs[user.id]); if (m > 0) setConfirmAction({ type: 'mute', userId: user.id, userName: publicName, minutes: m }); }}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-400 hover:bg-orange-500/80 hover:text-white active:scale-95 transition-all"
                        >
                          Sustur
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30">
                        <Ban size={11} className="text-red-400 shrink-0" />
                        <input
                          type="number"
                          placeholder="gün"
                          value={banInputs[user.id] || ''}
                          onChange={e => setBanInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-12 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => { const d = parseInt(banInputs[user.id]); if (d > 0) setConfirmAction({ type: 'ban', userId: user.id, userName: publicName, days: d }); }}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500/80 hover:text-white active:scale-95 transition-all"
                        >
                          Yasakla
                        </button>
                      </div>
                      <button
                        onClick={() => setExpandedUser(null)}
                        className="px-2 py-0.5 rounded text-[9px] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors"
                      >
                        İptal
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
