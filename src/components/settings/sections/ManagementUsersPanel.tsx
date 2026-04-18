import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import AvatarContent from '../../AvatarContent';
import { createPortal } from 'react-dom';
import {
  Users, Search, Shield, ShieldCheck, Crown, ChevronLeft, ChevronRight,
  ChevronDown, Lock, Server as ServerIcon, Filter, X, RefreshCw, AlertTriangle,
  MoreVertical, Trash2, VolumeX, Volume2, Ban, KeyRound, ShieldOff, Check,
  Monitor, Smartphone, Globe, Circle,
} from 'lucide-react';
import { CardSection, cardCls } from '../shared';
import Modal from '../../Modal';
import ConfirmModal from '../../ConfirmModal';
import { useUI } from '../../../contexts/UIContext';
import { useUser } from '../../../contexts/UserContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { supabase } from '../../../lib/supabase';
import {
  listAdminUsers,
  listUserOwnedServers,
  setUserPlan,
  revokeUserPlan,
  setUserLevel,
  revokeUserLevel,
  type AdminUserRow,
  type PlanKey,
  type PlanStatus,
  type DurationType,
  type OwnedServerRow,
  type UserSort,
  type AdminUserSession,
  AdminApiError,
} from '../../../lib/systemAdminApi';
import { useAdminUserSessions } from '../../../hooks/useAdminUserSessions';
import { displayVersion, isOutdatedVersion } from '../../../lib/compareVersions';

type Tab = 'all' | 'admin' | 'mod' | 'user' | 'owners';
type OwnershipFilter = 'all' | 'has-server' | 'no-server';

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 30;

const SORT_OPTIONS: Array<{ v: UserSort; l: string }> = [
  { v: 'name-asc', l: 'Ad (A → Z)' },
  { v: 'name-desc', l: 'Ad (Z → A)' },
  { v: 'created-desc', l: 'Kayıt: Yeni → Eski' },
  { v: 'created-asc', l: 'Kayıt: Eski → Yeni' },
];
const PLAN_LABEL: Record<PlanKey | 'none', string> = { none: 'Plan yok', free: 'Free', pro: 'Pro', ultra: 'Ultra' };
const STATUS_LABEL: Record<PlanStatus, string> = {
  active: 'Aktif', expired: 'Süresi doldu', unlimited: 'Sınırsız', none: '—',
};

type RowConfirm =
  | { type: 'delete'; user: AdminUserRow }
  | { type: 'toggleAdmin'; user: AdminUserRow; makeAdmin: boolean }
  | { type: 'toggleMod'; user: AdminUserRow; makeMod: boolean }
  | { type: 'mute'; user: AdminUserRow; minutes: number }
  | { type: 'ban'; user: AdminUserRow; days: number }
  | { type: 'unmute'; user: AdminUserRow }
  | { type: 'unban'; user: AdminUserRow }
  | { type: 'resetPassword'; user: AdminUserRow };

export default function ManagementUsersPanel() {
  const { setToastMsg } = useUI();
  const { currentUser } = useUser();
  const canDelete = !!currentUser.isPrimaryAdmin;
  const {
    handleMuteUser, handleBanUser, handleUnmuteUser, handleUnbanUser,
    handleDeleteUser, handleToggleAdmin, handleToggleModerator,
  } = useAppState();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<UserSort>('created-desc');
  const [items, setItems] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtreler
  const [fPlan, setFPlan] = useState<PlanKey | ''>('');
  const [fPlanStatus, setFPlanStatus] = useState<PlanStatus | ''>('');
  const [fOwnership, setFOwnership] = useState<OwnershipFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Expandable rows (owners tab)
  const [expanded, setExpanded] = useState<string | null>(null);

  // Plan modal
  const [planModalUser, setPlanModalUser] = useState<AdminUserRow | null>(null);
  // Role (seviye) modal
  const [roleModalUser, setRoleModalUser] = useState<AdminUserRow | null>(null);

  // User detail modal (mute/ban/admin/mod/delete/reset)
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);

  // Row confirm (mute/ban/admin/mod/delete/reset)
  const [rowConfirm, setRowConfirm] = useState<RowConfirm | null>(null);
  const [rowConfirmLoading, setRowConfirmLoading] = useState(false);

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setDebounced(search.trim());
      setOffset(0);
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search]);

  // Tab değişince reset
  useEffect(() => { setOffset(0); setExpanded(null); }, [tab]);

  const effectiveRole = tab === 'admin' ? 'admin'
    : tab === 'mod' ? 'mod'
    : tab === 'user' ? 'user'
    : undefined;
  const effectiveOwnership = tab === 'owners' ? 'only-owners'
    : fOwnership === 'has-server' ? 'has-server'
    : fOwnership === 'no-server' ? 'no-server'
    : undefined;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await listAdminUsers({
        role: effectiveRole,
        plan: fPlan || undefined,
        planStatus: fPlanStatus || undefined,
        ownership: effectiveOwnership,
        search: debounced || undefined,
        sort,
        limit: pageSize,
        offset,
      });
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Liste yüklenemedi');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveRole, fPlan, fPlanStatus, effectiveOwnership, debounced, sort, pageSize, offset]);

  useEffect(() => { void load(); }, [load]);

  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(total, offset + pageSize);

  // Sort/pageSize değişince sayfa 1'e dön; offset taşmasın
  useEffect(() => { setOffset(0); }, [sort, pageSize]);
  // Total küçülürse current page invalid olmasın
  useEffect(() => {
    if (offset > 0 && offset >= total && total > 0) {
      setOffset(Math.max(0, (Math.ceil(total / pageSize) - 1) * pageSize));
    }
  }, [total, pageSize, offset]);

  const resetFilters = () => {
    setFPlan(''); setFPlanStatus(''); setFOwnership('all'); setSearch(''); setOffset(0);
  };

  // ── Row confirm config + runner ──
  const rowConfirmConfig = useMemo(() => {
    if (!rowConfirm) return null;
    const n = rowConfirm.user.full_name || rowConfirm.user.username || rowConfirm.user.email || rowConfirm.user.id.slice(0, 8);
    switch (rowConfirm.type) {
      case 'delete':
        return { title: 'Kullanıcıyı Sil', description: `${n} kalıcı olarak silinecek. Bu işlem geri alınamaz.`, confirmText: 'Kalıcı Sil', danger: true };
      case 'toggleAdmin':
        return rowConfirm.makeAdmin
          ? { title: 'Admin Yap', description: `${n} sistem admin yetkisi alacak.`, confirmText: 'Admin Yap', danger: false }
          : { title: 'Admin Yetkisi Kaldır', description: `${n} admin yetkileri iptal edilecek.`, confirmText: 'Kaldır', danger: true };
      case 'toggleMod':
        return rowConfirm.makeMod
          ? { title: 'Moderatör Yap', description: `${n} moderatör yetkisi alacak.`, confirmText: 'Mod Yap', danger: false }
          : { title: 'Mod Yetkisi Kaldır', description: `${n} moderatör yetkileri iptal edilecek.`, confirmText: 'Kaldır', danger: true };
      case 'mute':
        return { title: 'Sustur', description: `${n} ${rowConfirm.minutes} dakika susturulacak (yazı & ses).`, confirmText: 'Sustur', danger: true };
      case 'ban':
        return { title: 'Sesten Yasakla', description: `${n} ${rowConfirm.days} gün sesli katılımdan yasaklanacak.`, confirmText: 'Yasakla', danger: true };
      case 'unmute':
        return { title: 'Susturma Kaldır', description: `${n} susturması kaldırılacak.`, confirmText: 'Kaldır', danger: false };
      case 'unban':
        return { title: 'Yasağı Kaldır', description: `${n} sesli yasağı kaldırılacak.`, confirmText: 'Kaldır', danger: false };
      case 'resetPassword':
        return { title: 'Şifre Sıfırla', description: `${rowConfirm.user.email || 'Email yok'} adresine geçici parola gönderilecek. Kullanıcı bu parolayla giriş yapınca yeni parola belirlemesi istenecek.`, confirmText: 'Sıfırla', danger: false };
    }
  }, [rowConfirm]);

  // Tek-rol kuralı: makeAdmin → mod varsa kaldır; makeMod → admin varsa kaldır.
  const enforceRoleExclusion = useCallback(async (u: AdminUserRow, becameAdmin: boolean, becameMod: boolean) => {
    if (becameAdmin && u.is_moderator) await handleToggleModerator(u.id);
    if (becameMod && u.is_admin) await handleToggleAdmin(u.id);
  }, [handleToggleAdmin, handleToggleModerator]);

  const runRowConfirm = useCallback(async () => {
    if (!rowConfirm) return;
    const u = rowConfirm.user;
    const n = u.full_name || u.username || u.email || u.id.slice(0, 8);
    setRowConfirmLoading(true);
    try {
      switch (rowConfirm.type) {
        case 'delete':
          await handleDeleteUser(u.id);
          setToastMsg(`${n} silindi`);
          setDetailUser(null);
          break;
        case 'toggleAdmin':
          await handleToggleAdmin(u.id);
          if (rowConfirm.makeAdmin) await enforceRoleExclusion(u, true, false);
          setToastMsg(rowConfirm.makeAdmin ? `${n} admin yapıldı` : `${n} admin yetkisi kaldırıldı`);
          break;
        case 'toggleMod':
          await handleToggleModerator(u.id);
          if (rowConfirm.makeMod) await enforceRoleExclusion(u, false, true);
          setToastMsg(rowConfirm.makeMod ? `${n} moderatör yapıldı` : `${n} mod yetkisi kaldırıldı`);
          break;
        case 'mute':
          await handleMuteUser(u.id, rowConfirm.minutes);
          setToastMsg(`${n} ${rowConfirm.minutes} dk susturuldu`);
          break;
        case 'ban':
          await handleBanUser(u.id, rowConfirm.days * 1440);
          setToastMsg(`${n} ${rowConfirm.days} gün yasaklandı`);
          break;
        case 'unmute':
          await handleUnmuteUser(u.id);
          setToastMsg(`${n} susturması kaldırıldı`);
          break;
        case 'unban':
          await handleUnbanUser(u.id);
          setToastMsg(`${n} yasağı kaldırıldı`);
          break;
        case 'resetPassword': {
          if (!u.email) {
            setToastMsg('Email yok, şifre sıfırlama maili gönderilemedi');
            break;
          }
          const SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'https://api.mayvox.com';
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            setToastMsg('Oturum bulunamadı');
            break;
          }
          const res = await fetch(`${SERVER_URL}/api/admin-reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ targetUserId: u.id }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setToastMsg(data.error ?? 'Şifre sıfırlama maili gönderilemedi');
          } else {
            setToastMsg(`${u.email} adresine geçici parola gönderildi`);
          }
          break;
        }
      }
      setRowConfirm(null);
      // Liste tazele + detail modaldaki user objesini güncel verisiyle değiştir
      try {
        const r = await listAdminUsers({
          role: effectiveRole,
          plan: fPlan || undefined,
          planStatus: fPlanStatus || undefined,
          ownership: effectiveOwnership,
          search: debounced || undefined,
          limit: pageSize,
          offset,
        });
        setItems(r.items);
        setTotal(r.total);
        setDetailUser(prev => {
          if (!prev) return prev;
          const fresh = r.items.find(x => x.id === prev.id);
          return fresh ?? prev;
        });
      } catch {
        await load();
      }
    } catch (e) {
      setToastMsg(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setRowConfirmLoading(false);
    }
  }, [rowConfirm, handleDeleteUser, handleToggleAdmin, handleToggleModerator, handleMuteUser, handleBanUser, handleUnmuteUser, handleUnbanUser, enforceRoleExclusion, effectiveRole, fPlan, fPlanStatus, effectiveOwnership, debounced, offset, load, setToastMsg]);

  const activeFilterCount = [fPlan, fPlanStatus, fOwnership !== 'all' ? fOwnership : ''].filter(Boolean).length;

  return (
    <>
      <CardSection
        icon={<Users size={12} />}
        title="Sistem — Tüm Kullanıcılar"
        subtitle={loading ? 'yükleniyor...' : `${total} kullanıcı`}
      >
        {/* Tabs — iOS segmented control: sliding indicator via layoutId */}
        <div
          className="relative grid grid-cols-5 p-1 mb-3 rounded-xl"
          style={{
            background: 'var(--theme-surface-card)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), inset 0 0 0 1px rgba(var(--glass-tint),0.06)',
          }}
        >
          {([
            { k: 'all' as const, label: 'Tümü' },
            { k: 'admin' as const, label: 'Admin' },
            { k: 'mod' as const, label: 'Mod' },
            { k: 'user' as const, label: 'Kullanıcı' },
            { k: 'owners' as const, label: 'Sahipler' },
          ]).map(t => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`relative py-1.5 rounded-lg text-[10.5px] md:text-[11.5px] font-semibold truncate transition-colors duration-150 outline-none ${
                  active
                    ? 'text-[var(--theme-accent)]'
                    : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)]'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {active && (
                  <motion.span
                    layoutId="adminUsersTabIndicator"
                    aria-hidden
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    style={{
                      background: 'rgba(var(--theme-accent-rgb),0.14)',
                      border: '1px solid rgba(var(--theme-accent-rgb),0.26)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }}
                  />
                )}
                <span className="relative z-[1]">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1 group/search">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150 text-[var(--theme-secondary-text)]/50 group-focus-within/search:text-[var(--theme-accent)]/70"
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ad, kullanıcı adı, email ile ara..."
              className="w-full rounded-xl pl-9 pr-3 py-2 md:py-2.5 text-[12px] md:text-[13px] outline-none
                bg-[var(--theme-input-bg)] border
                border-[var(--theme-input-border)]
                text-[var(--theme-input-text)] placeholder:text-[var(--theme-input-placeholder)]
                focus:border-[rgba(var(--theme-accent-rgb),0.55)]
                focus:shadow-[0_0_0_3px_rgba(var(--theme-accent-rgb),0.14)]
                transition-[background,border-color,box-shadow] duration-200"
              style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`shrink-0 px-3 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all ${
              showFilters || activeFilterCount > 0
                ? 'bg-[rgba(var(--theme-accent-rgb),0.12)] border-[rgba(var(--theme-accent-rgb),0.3)] text-[var(--theme-accent)]'
                : 'bg-[var(--theme-input-bg)] border-[var(--theme-input-border)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)]'
            }`}
          >
            <Filter size={12} />
            Filtrele
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-[var(--theme-accent)] text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <ThemedSelect
            value={sort}
            onChange={(v) => setSort(v as UserSort)}
            options={SORT_OPTIONS.map(o => ({ value: o.v, label: o.l }))}
            title="Sıralama"
          />
          <ThemedSelect
            value={String(pageSize)}
            onChange={(v) => setPageSize(parseInt(v, 10))}
            options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n}/sayfa` }))}
            title="Sayfa başına"
            minWidth={92}
          />
        </div>

        {/* Filters drawer */}
        {showFilters && (
          <div className="mb-3 p-3 rounded-xl bg-[var(--theme-surface-card)] border border-[var(--theme-border)]/50 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <FilterSelect label="Plan" value={fPlan} onChange={v => { setFPlan(v as PlanKey | ''); setOffset(0); }}
                options={[{ v: '', l: 'Hepsi' }, { v: 'free', l: 'Free' }, { v: 'pro', l: 'Pro' }, { v: 'ultra', l: 'Ultra' }]} />
              <FilterSelect label="Plan Durumu" value={fPlanStatus} onChange={v => { setFPlanStatus(v as PlanStatus | ''); setOffset(0); }}
                options={[{ v: '', l: 'Hepsi' }, { v: 'active', l: 'Aktif' }, { v: 'expired', l: 'Süresi dolmuş' }, { v: 'unlimited', l: 'Sınırsız' }, { v: 'none', l: 'Plan yok' }]} />
              {tab !== 'owners' && (
                <FilterSelect label="Sunucu Sahipliği" value={fOwnership} onChange={v => { setFOwnership(v as OwnershipFilter); setOffset(0); }}
                  options={[{ v: 'all', l: 'Hepsi' }, { v: 'has-server', l: 'Sunucusu var' }, { v: 'no-server', l: 'Sunucusu yok' }]} />
              )}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-[10.5px] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] inline-flex items-center gap-1">
                <X size={10} /> Filtreleri temizle
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 mb-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-[12px] flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Hata</div>
              <div className="opacity-80">{error}</div>
            </div>
            <button onClick={() => void load()} className="shrink-0 p-1 hover:bg-red-500/10 rounded" title="Yeniden dene">
              <RefreshCw size={12} />
            </button>
          </div>
        )}

        {/* List */}
        <div className={`${cardCls}`}>
          {loading && !items ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin" />
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[var(--theme-secondary-text)]">
              <Users size={24} className="opacity-30 mb-2" />
              <p className="text-[12px] font-medium">Kullanıcı bulunamadı</p>
              {(debounced || activeFilterCount > 0) && <p className="text-[10px] opacity-60 mt-1">Farklı filtre veya arama dene</p>}
            </div>
          ) : (
            <div className="p-1 space-y-[2px]">
              {items.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  expanded={expanded === u.id}
                  canExpand={tab === 'owners' || u.owned_server_count > 0}
                  isSelf={u.id === currentUser.id}
                  canAssignRole={!!(currentUser.isPrimaryAdmin || currentUser.isAdmin)}
                  onToggle={() => setExpanded(expanded === u.id ? null : u.id)}
                  onManagePlan={() => setPlanModalUser(u)}
                  onOpenDetail={() => setDetailUser(u)}
                  onManageRole={() => setRoleModalUser(u)}
                  onQuickAction={setRowConfirm}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination + range info */}
        <div className="flex items-center justify-between mt-3 px-1 gap-3">
          <span className="text-[11px] text-[var(--theme-secondary-text)]/70 tabular-nums">
            {total === 0 ? 'Sonuç yok' : `${rangeStart}–${rangeEnd} / ${total} kullanıcı`}
          </span>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              loading={loading}
              onChange={(p) => setOffset((p - 1) * pageSize)}
            />
          )}
        </div>
      </CardSection>

      {planModalUser && (
        <PlanManageModal
          user={planModalUser}
          onClose={() => setPlanModalUser(null)}
          onSuccess={() => { setPlanModalUser(null); void load(); setToastMsg('Plan güncellendi'); }}
          onError={(msg) => setToastMsg(msg)}
        />
      )}

      {roleModalUser && (
        <UserLevelModal
          user={roleModalUser}
          onClose={() => setRoleModalUser(null)}
          onSuccess={() => { setRoleModalUser(null); void load(); setToastMsg('Seviye güncellendi'); }}
          onError={(msg) => setToastMsg(msg)}
        />
      )}

      {detailUser && (
        <UserDetailModal
          user={detailUser}
          canDelete={canDelete}
          onClose={() => setDetailUser(null)}
          onAction={(a) => setRowConfirm(a)}
          onOpenPlan={() => { const u = detailUser; setDetailUser(null); setPlanModalUser(u); }}
        />
      )}

      {rowConfirmConfig && (
        <ConfirmModal
          isOpen={!!rowConfirm}
          title={rowConfirmConfig.title}
          description={rowConfirmConfig.description}
          confirmText={rowConfirmConfig.confirmText}
          cancelText="Vazgeç"
          onConfirm={runRowConfirm}
          onCancel={() => setRowConfirm(null)}
          danger={rowConfirmConfig.danger}
          loading={rowConfirmLoading}
        />
      )}
    </>
  );
}

// ── Row ──

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/70">{label}</span>
      <ThemedSelect
        value={value}
        onChange={onChange}
        options={options.map(o => ({ value: o.v, label: o.l }))}
        size="md"
      />
    </label>
  );
}

// ── ThemedSelect — premium custom dropdown (native <select> yerine) ──
function ThemedSelect({ value, onChange, options, title, minWidth, size }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  title?: string;
  minWidth?: number;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Anchor pozisyonu — açıkken scroll/resize sırasında sürekli güncellenir
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const measure = () => {
      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPosition({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, minWidth ?? 140) });
    };
    measure();
    window.addEventListener('scroll', measure, true); // capture: nested scroll'lerde de yakala
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, minWidth]);

  const current = options.find(o => o.value === value);
  const isMd = size === 'md';

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        title={title}
        className={`w-full inline-flex items-center justify-between gap-2 ${isMd ? 'px-2.5 py-1.5 text-[11.5px]' : 'px-2.5 py-1.5 text-[11px]'} bg-[var(--theme-input-bg)] border ${open ? 'border-[var(--theme-accent)]/55' : 'border-[var(--theme-input-border)]'} rounded-xl font-semibold text-[var(--theme-text)] hover:border-[var(--theme-accent)]/30 transition-colors outline-none cursor-pointer`}
        style={{ minWidth: minWidth ?? undefined }}
      >
        <span className="truncate">{current?.label ?? '—'}</span>
        <ChevronDown size={12} className={`opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && position && createPortal(
        <div
          ref={(el) => {
            // Outside-click için wrapper içine sayılması gerek; portal dışarı taşıdığı için
            // wrapperRef.contains(e.target) çalışmaz. data-attr ile çapraz kontrol yapıyoruz.
            if (el) el.setAttribute('data-themed-select-panel', 'true');
          }}
          className="py-1 rounded-xl overflow-hidden max-h-[280px] overflow-y-auto"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            minWidth: position.width,
            zIndex: 9999,
            background: 'var(--theme-popover-bg, var(--surface-3))',
            border: '1px solid var(--theme-popover-border, rgba(255,255,255,0.10))',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(20px) saturate(150%)',
          }}
          role="listbox"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map(o => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-left transition-colors ${
                  active
                    ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)]'
                    : 'text-[var(--theme-text)] hover:bg-[var(--theme-panel-hover,rgba(255,255,255,0.05))]'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && <Check size={12} className="shrink-0 opacity-90" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

interface UserRowProps {
  user: AdminUserRow;
  expanded: boolean;
  canExpand: boolean;
  isSelf: boolean;
  canAssignRole: boolean;
  onToggle: () => void;
  onManagePlan: () => void;
  onOpenDetail: () => void;
  onManageRole: () => void;
  onQuickAction: (c: RowConfirm) => void;
}

const UserRow: React.FC<UserRowProps> = ({ user, expanded, canExpand, isSelf, canAssignRole, onToggle, onManagePlan, onOpenDetail, onManageRole, onQuickAction }) => {
  const isVoiceBanned = !!user.is_voice_banned && (!user.ban_expires || user.ban_expires > Date.now());
  const isMuted = !!user.is_muted && (!user.mute_expires || user.mute_expires > Date.now());
  const displayName = user.full_name || user.username || user.email || user.id.slice(0, 8);
  // Live status look-up — admin DTO'nun statusText'i yok. allUsers (realtime presence)
  // içinden çek; yoksa 'Online' default → pipeline status PNG'yi (online.png) döner,
  // initial harfe düşmez.
  const { allUsers } = useUser();
  const liveUser = allUsers.find(u => u.id === user.id);
  const resolvedStatusText = liveUser?.statusText || 'Online';

  // Role picker inline — sadece yetki sahibi + self değil + primary değil
  const canEditRole = canAssignRole && !isSelf && !user.is_primary_admin;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.995 }}
      className="group rounded-xl"
      style={{
        background: 'transparent',
        border: '1px solid transparent',
        boxShadow: '0 0 0 rgba(0,0,0,0)',
        transition:
          'background 140ms cubic-bezier(0.22,1,0.36,1), ' +
          'border-color 140ms cubic-bezier(0.22,1,0.36,1), ' +
          'box-shadow 160ms cubic-bezier(0.22,1,0.36,1)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--theme-panel-hover)';
        el.style.borderColor = 'rgba(var(--glass-tint), 0.08)';
        el.style.boxShadow = '0 2px 10px -2px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.05)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'transparent';
        el.style.borderColor = 'transparent';
        el.style.boxShadow = '0 0 0 rgba(0,0,0,0)';
      }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Avatar */}
        <div className="shrink-0 w-9 h-9 rounded-lg bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] font-bold text-[11px] flex items-center justify-center overflow-hidden ring-1 ring-[rgba(var(--glass-tint),0.06)]">
          <AvatarContent avatar={user.avatar} statusText={resolvedStatusText} firstName={user.first_name} name={displayName} letterClassName="text-[11px] font-bold text-[var(--theme-accent)]" />
        </div>

        {/* Meta — 3-tier typography hierarchy */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate tracking-[-0.01em]">{displayName}</span>
            {user.is_primary_admin ? (
              <RoleBadge type="primary" />
            ) : canEditRole ? (
              <InlineRolePicker user={user} onChange={onQuickAction} />
            ) : (
              <>
                {user.is_admin && <RoleBadge type="admin" />}
                {!user.is_admin && user.is_moderator && <RoleBadge type="mod" />}
              </>
            )}
            <LevelBadge level={user.user_level} />
            <PlanBadge plan={user.plan} />
            <StatusBadge status={user.plan_status} />
            {user.plan_source === 'paid' && <PaidBadge />}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10.5px] text-[var(--theme-secondary-text)]/75 truncate">
            {user.username && <span className="truncate">@{user.username}</span>}
            {user.email && <span className="truncate">{user.email}</span>}
            {user.owned_server_count > 0 && (
              <span className="inline-flex items-center gap-1 text-[var(--theme-accent)]/75">
                <ServerIcon size={10} /> {user.owned_server_count} sunucu
              </span>
            )}
          </div>
        </div>

        {/* Actions — hover ile emphasis artar, layout sabit */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Moderation göstergeleri — sadece aktif durumda görünür, pasif (chip).
              Mute/ban işlemi Detay panelinden yapılır; burada sadece "bu kullanıcı
              susturulmuş/yasaklanmış" bilgisi. */}
          {isMuted && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-orange-500/15 text-orange-400 text-[9px] font-bold uppercase tracking-wide"
              title="Susturulmuş (Detay panelinden yönet)"
            >
              <VolumeX size={10} /> muted
            </span>
          )}
          {isVoiceBanned && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-red-500/15 text-red-400 text-[9px] font-bold uppercase tracking-wide"
              title="Ses yasaklı (Detay panelinden yönet)"
            >
              <Ban size={10} /> sesban
            </span>
          )}

          {canAssignRole && !isSelf && (
            <button
              onClick={onManageRole}
              className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/18 inline-flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
              title="Kullanıcı seviyesini değiştir"
            >
              <ShieldCheck size={11} />
              Seviye
            </button>
          )}

          <button
            onClick={onManagePlan}
            className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/18 inline-flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
            title={user.plan_source === 'paid' ? 'Ücretli plan — sadece görüntüleme' : 'Plan yönet'}
          >
            {user.plan_source === 'paid' ? <Lock size={11} /> : <Crown size={11} />}
            Plan
          </button>

          <button
            onClick={onOpenDetail}
            className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--theme-surface-card)] border border-[var(--theme-border)]/50 text-[var(--theme-text)] hover:bg-[var(--theme-panel-hover)] inline-flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
            title="Detaylı kullanıcı yönetimi"
          >
            <MoreVertical size={11} />
            Detay
          </button>

          {canExpand && (
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] text-[var(--theme-secondary-text)]"
              title={expanded ? 'Kapat' : 'Sunucuları göster'}
            >
              <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {expanded && <OwnedServersDrawer userId={user.id} />}
    </motion.div>
  );
};

// ── Inline Role Picker — RoleBadge yerine tıklanabilir pill ──────────────
// Mevcut rolü gösterir; click ile compact dropdown açılır; rol seçimi
// toggleAdmin/toggleMod rowConfirm akışına yönlendirilir (enforceRoleExclusion
// parent tarafta mutual-exclusion'ı zaten uygular).
function InlineRolePicker({ user, onChange }: { user: AdminUserRow; onChange: (c: RowConfirm) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current: 'admin' | 'mod' | 'none' = user.is_admin ? 'admin' : user.is_moderator ? 'mod' : 'none';

  const pillCls =
    current === 'admin' ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/22'
    : current === 'mod' ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/22'
    : 'bg-white/5 text-[var(--theme-secondary-text)]/80 hover:bg-white/10';
  const icon = current === 'admin' ? <Shield size={8} /> : current === 'mod' ? <ShieldCheck size={8} /> : <UserIconPlaceholder />;
  const label = current === 'admin' ? 'ADMIN' : current === 'mod' ? 'MOD' : 'ÜYE';

  const select = (next: 'admin' | 'mod' | 'none') => {
    setOpen(false);
    if (next === current) return;
    if (next === 'admin') onChange({ type: 'toggleAdmin', user, makeAdmin: true });
    else if (next === 'mod') onChange({ type: 'toggleMod', user, makeMod: true });
    else if (current === 'admin') onChange({ type: 'toggleAdmin', user, makeAdmin: false });
    else if (current === 'mod') onChange({ type: 'toggleMod', user, makeMod: false });
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide transition-colors ${pillCls}`}
        title="Rolü değiştir"
      >
        {icon} {label}
        <ChevronDown size={8} className={`ml-0.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-30 min-w-[140px] rounded-lg py-1 shadow-lg"
          style={{
            background: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 8px 24px rgba(var(--shadow-base), 0.35)',
          }}
        >
          <RoleOption active={current === 'admin'} icon={<Shield size={11} />} label="Admin" tone="rose" onClick={() => select('admin')} />
          <RoleOption active={current === 'mod'} icon={<ShieldCheck size={11} />} label="Moderatör" tone="blue" onClick={() => select('mod')} />
          <RoleOption active={current === 'none'} icon={<ShieldOff size={11} />} label="Üye (rol yok)" tone="muted" onClick={() => select('none')} />
        </div>
      )}
    </div>
  );
}

function RoleOption({ active, icon, label, tone, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; tone: 'rose' | 'blue' | 'muted'; onClick: () => void;
}) {
  const toneCls =
    tone === 'rose' ? 'text-rose-400' : tone === 'blue' ? 'text-blue-400' : 'text-[var(--theme-secondary-text)]';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-semibold text-left transition-colors ${
        active ? 'bg-[var(--theme-accent)]/10' : 'hover:bg-[var(--theme-panel-hover)]'
      }`}
    >
      <span className={toneCls}>{icon}</span>
      <span className="flex-1 text-[var(--theme-text)]">{label}</span>
      {active && <Check size={11} className="text-[var(--theme-accent)]" />}
    </button>
  );
}

// "Üye" (rol yok) için RoleBadge ikonu — küçük dot
function UserIconPlaceholder() {
  return <span className="inline-block w-[6px] h-[6px] rounded-full bg-current opacity-60" />;
}

function OwnedServersDrawer({ userId }: { userId: string }) {
  const [rows, setRows] = useState<OwnedServerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const r = await listUserOwnedServers(userId);
        if (!ignore) setRows(r.items);
      } catch (e) {
        if (!ignore) setErr(e instanceof AdminApiError ? e.message : 'Sunucu listesi alınamadı');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [userId]);

  return (
    <div className="px-3 pb-3 pl-12 border-l border-[var(--theme-border)]/60 ml-8">
      {loading && <div className="py-2 text-[10.5px] text-[var(--theme-secondary-text)]/60">Yükleniyor...</div>}
      {err && <div className="py-2 text-[10.5px] text-red-400">{err}</div>}
      {rows && rows.length === 0 && <div className="py-2 text-[10.5px] text-[var(--theme-secondary-text)]/60">Sahip olunan sunucu yok</div>}
      {rows && rows.length > 0 && (
        <div className="space-y-1 mt-1">
          {rows.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-1 px-2 rounded-lg bg-[var(--theme-surface-card)] text-[11px]">
              <ServerIcon size={11} className="opacity-50" />
              <span className="font-semibold truncate">{s.name}</span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                s.plan === 'ultra' ? 'bg-violet-500/15 text-violet-400'
                : s.plan === 'pro' ? 'bg-sky-500/15 text-sky-400'
                : 'bg-white/5 text-[var(--theme-secondary-text)]'
              }`}>{s.plan}</span>
              {s.is_banned && <span className="shrink-0 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[8.5px] font-bold uppercase">kısıtlı</span>}
              <span className="ml-auto text-[10px] text-[var(--theme-secondary-text)]/70 shrink-0">{s.member_count} üye</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Badges ──

function RoleBadge({ type }: { type: 'primary' | 'admin' | 'mod' }) {
  if (type === 'primary') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold uppercase tracking-wide">
      <Crown size={8} /> primary
    </span>
  );
  if (type === 'admin') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 text-[9px] font-bold uppercase tracking-wide">
      <Shield size={8} /> admin
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[9px] font-bold uppercase tracking-wide">
      <ShieldCheck size={8} /> mod
    </span>
  );
}

function PlanBadge({ plan }: { plan: PlanKey | 'none' }) {
  const cls =
    plan === 'ultra' ? 'bg-violet-500/15 text-violet-400'
    : plan === 'pro' ? 'bg-sky-500/15 text-sky-400'
    : plan === 'free' ? 'bg-emerald-500/15 text-emerald-400'
    : 'bg-white/5 text-[var(--theme-secondary-text)]';
  return (
    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}>
      {PLAN_LABEL[plan]}
    </span>
  );
}

function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  const cls =
    level === '3' ? 'bg-amber-500/15 text-amber-400'
    : level === '2' ? 'bg-fuchsia-500/15 text-fuchsia-400'
    : level === '1' ? 'bg-teal-500/15 text-teal-400'
    : 'bg-white/5 text-[var(--theme-secondary-text)]';
  const label = level === '1' ? 'Üye' : level === '2' ? 'VIP' : level === '3' ? 'Elit' : level;
  return (
    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  if (status === 'none') return null;
  const cls =
    status === 'active' ? 'bg-emerald-500/10 text-emerald-400'
    : status === 'unlimited' ? 'bg-indigo-500/10 text-indigo-400'
    : status === 'expired' ? 'bg-red-500/10 text-red-400'
    : 'bg-white/5 text-[var(--theme-secondary-text)]';
  return (
    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8.5px] font-semibold uppercase tracking-wide ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function PaidBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-bold uppercase tracking-wide" title="Satın alınmış plan — admin override edemez">
      <Lock size={8} /> paid
    </span>
  );
}

// ── Numbered pagination — premium minimal ──
function Pagination({ page, totalPages, loading, onChange }: {
  page: number;
  totalPages: number;
  loading: boolean;
  onChange: (page: number) => void;
}) {
  const pages = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  return (
    <div className="flex items-center gap-0.5">
      <button
        disabled={page <= 1 || loading}
        onClick={() => onChange(page - 1)}
        className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] text-[var(--theme-secondary-text)] disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Önceki sayfa"
      >
        <ChevronLeft size={14} />
      </button>
      {pages.map((p, i) => p === '…' ? (
        <span key={`ellipsis-${i}`} className="px-1.5 text-[11px] text-[var(--theme-secondary-text)]/45 select-none">…</span>
      ) : (
        <button
          key={p}
          onClick={() => onChange(p)}
          disabled={loading}
          className={`min-w-[26px] h-[26px] px-1.5 rounded-md text-[11.5px] font-semibold tabular-nums transition-colors ${
            p === page
              ? 'bg-[rgba(var(--theme-accent-rgb),0.16)] text-[var(--theme-accent)] border border-[rgba(var(--theme-accent-rgb),0.30)]'
              : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-panel-hover)]'
          }`}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}
      <button
        disabled={page >= totalPages || loading}
        onClick={() => onChange(page + 1)}
        className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] text-[var(--theme-secondary-text)] disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Sonraki sayfa"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

/** Görünür sayfa listesi: 1 … current-1 current current+1 … last (max ~7 element) */
function buildPageList(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const result: Array<number | '…'> = [1];
  if (current > 4) result.push('…');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) result.push(i);
  if (current < total - 3) result.push('…');
  result.push(total);
  return result;
}

function membershipDuration(createdAt: string): string {
  const ms = Date.now() - Date.parse(createdAt);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'bugün katıldı';
  if (days < 7) return `${days} gündür üye`;
  if (days < 30) return `${Math.floor(days / 7)} haftadır üye`;
  if (days < 365) return `${Math.floor(days / 30)} aydır üye`;
  return `${Math.floor(days / 365)} yıldır üye`;
}

// ── User Detail Modal ──

function UserDetailModal({ user, canDelete, onClose, onAction, onOpenPlan }: {
  user: AdminUserRow;
  canDelete: boolean;
  onClose: () => void;
  onAction: (a: RowConfirm) => void;
  onOpenPlan: () => void;
}) {
  const displayName = user.full_name || user.username || user.email || user.id.slice(0, 8);
  const isVoiceBanned = !!user.is_voice_banned && (!user.ban_expires || user.ban_expires > Date.now());
  const isMuted = !!user.is_muted && (!user.mute_expires || user.mute_expires > Date.now());
  const { allUsers } = useUser();
  const { appVersion } = useAppState();
  const liveUser = allUsers.find(u => u.id === user.id);
  const resolvedStatusText = liveUser?.statusText || 'Online';

  // Presence-backed sessions (device + version)
  const sessions = useAdminUserSessions(user.id);

  // Submenu states
  const [muteMin, setMuteMin] = useState('5');
  const [banDays, setBanDays] = useState('1');

  const MUTE_PRESETS = [5, 15, 60, 240, 1440];
  const BAN_PRESETS = [1, 3, 7, 30];

  return (
    <Modal open={true} onClose={onClose} width="md" padded={false}>
      {/* Header */}
      <div className="p-5 border-b border-[var(--theme-border)]">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] font-bold text-[15px] flex items-center justify-center overflow-hidden">
            <AvatarContent avatar={user.avatar} statusText={resolvedStatusText} firstName={user.first_name} name={displayName} letterClassName="text-[14px] font-bold text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-[var(--theme-text)] truncate">{displayName}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {user.is_primary_admin && <RoleBadge type="primary" />}
              {!user.is_primary_admin && user.is_admin && <RoleBadge type="admin" />}
              {!user.is_admin && user.is_moderator && <RoleBadge type="mod" />}
              {isMuted && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 text-[9px] font-bold uppercase tracking-wide"><VolumeX size={9} />muted</span>}
              {isVoiceBanned && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[9px] font-bold uppercase tracking-wide"><Ban size={9} />sesban</span>}
            </div>
            <div className="text-[11px] text-[var(--theme-secondary-text)] mt-1.5 space-y-0.5">
              {user.username && <div>@{user.username}</div>}
              {user.email && <div className="truncate">{user.email}</div>}
              {user.created_at && (
                <div className="text-[10.5px] opacity-75">
                  Üyelik: <span className="text-[var(--theme-text)]/80">{new Date(user.created_at).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  <span className="opacity-60"> · {membershipDuration(user.created_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">

        {/* Cihazlar & Versiyon — presence-backed session listesi */}
        <DetailSection
          title="Cihazlar & Versiyon"
          hint={
            sessions.loading && sessions.data.length === 0
              ? 'Yükleniyor…'
              : sessions.error
                ? 'Yüklenemedi'
                : sessions.data.some(s => s.is_active)
                  ? `${sessions.data.filter(s => s.is_active).length} aktif oturum`
                  : sessions.data.length > 0
                    ? 'Şu an çevrimdışı'
                    : 'Kayıt yok'
          }
        >
          <DevicesSection sessions={sessions.data} loading={sessions.loading} error={sessions.error} currentAppVersion={appVersion} />
        </DetailSection>

        {/* Plan kısayolu */}
        <DetailSection title="Plan" hint={user.plan_source === 'paid' ? 'Ücretli plan — admin override edemez' : undefined}>
          <div className="flex items-center gap-2">
            <PlanBadge plan={user.plan} />
            <StatusBadge status={user.plan_status} />
            {user.plan_source === 'paid' && <PaidBadge />}
            <button
              onClick={onOpenPlan}
              className="ml-auto px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/20 inline-flex items-center gap-1.5"
            >
              {user.plan_source === 'paid' ? <Lock size={12} /> : <Crown size={12} />}
              Plan Yönet
            </button>
          </div>
          {user.plan_end_at && (
            <div className="mt-2 text-[10.5px] text-[var(--theme-secondary-text)]">
              Bitiş: <span className="font-mono">{new Date(user.plan_end_at).toLocaleString('tr-TR')}</span>
            </div>
          )}
        </DetailSection>

        {/* Roller */}
        {!user.is_primary_admin && (
          <DetailSection title="Roller" hint="Sistem rolleri">
            <div className="grid grid-cols-2 gap-2">
              <DetailButton
                icon={user.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
                label={user.is_admin ? 'Admin Yetkisini Kaldır' : 'Admin Yap'}
                description={user.is_admin ? 'Sistem admin yetkileri iptal' : 'Sistem admin yetkisi ata'}
                tone={user.is_admin ? 'danger' : 'primary'}
                onClick={() => onAction({ type: 'toggleAdmin', user, makeAdmin: !user.is_admin })}
              />
              <DetailButton
                icon={user.is_moderator ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                label={user.is_moderator ? 'Mod Yetkisini Kaldır' : 'Moderatör Yap'}
                description={user.is_moderator ? 'Mod yetkileri iptal' : 'Moderatör yetkisi ata'}
                tone={user.is_moderator ? 'danger' : 'primary'}
                onClick={() => onAction({ type: 'toggleMod', user, makeMod: !user.is_moderator })}
              />
            </div>
          </DetailSection>
        )}

        {/* Susturma */}
        <DetailSection
          title="Susturma"
          hint={isMuted
            ? (user.mute_expires ? `Aktif: ${new Date(user.mute_expires).toLocaleString('tr-TR')} sonuna kadar` : 'Aktif (süresiz)')
            : 'Yazı + ses susturma süresi seç'}
        >
          {isMuted ? (
            <DetailButton
              icon={<Volume2 size={13} />}
              label="Susturmayı Kaldır"
              description="Yazı ve ses kısıtlaması iptal"
              tone="primary"
              onClick={() => onAction({ type: 'unmute', user })}
            />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {MUTE_PRESETS.map(m => (
                  <button
                    key={m}
                    onClick={() => onAction({ type: 'mute', user, minutes: m })}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] text-[var(--theme-text)] hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400"
                  >
                    {m < 60 ? `${m} dk` : m === 60 ? '1 saat' : m === 240 ? '4 saat' : '1 gün'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={10080}
                  value={muteMin}
                  onChange={e => setMuteMin(e.target.value)}
                  className="w-24 bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-lg px-2.5 py-1.5 text-[11.5px] outline-none focus:border-[var(--theme-accent)]/50"
                  placeholder="Özel"
                />
                <span className="text-[11px] text-[var(--theme-secondary-text)]">dakika</span>
                <button
                  onClick={() => {
                    const m = parseInt(muteMin, 10);
                    if (!Number.isFinite(m) || m < 1) return;
                    onAction({ type: 'mute', user, minutes: m });
                  }}
                  className="ml-auto px-3 py-1.5 rounded-lg text-[11.5px] font-bold bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                >
                  Sustur
                </button>
              </div>
            </div>
          )}
        </DetailSection>

        {/* Sesli Yasak */}
        <DetailSection
          title="Sesli Yasak"
          hint={isVoiceBanned
            ? (user.ban_expires ? `Aktif: ${new Date(user.ban_expires).toLocaleString('tr-TR')} sonuna kadar` : 'Aktif (süresiz)')
            : 'Sesli kanal katılım yasağı'}
        >
          {isVoiceBanned ? (
            <DetailButton
              icon={<ShieldOff size={13} />}
              label="Yasağı Kaldır"
              description="Sesli kanal katılım yasağı iptal"
              tone="primary"
              onClick={() => onAction({ type: 'unban', user })}
            />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {BAN_PRESETS.map(d => (
                  <button
                    key={d}
                    onClick={() => onAction({ type: 'ban', user, days: d })}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] text-[var(--theme-text)] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                  >
                    {d === 1 ? '1 gün' : `${d} gün`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={365}
                  value={banDays}
                  onChange={e => setBanDays(e.target.value)}
                  className="w-24 bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-lg px-2.5 py-1.5 text-[11.5px] outline-none focus:border-[var(--theme-accent)]/50"
                  placeholder="Özel"
                />
                <span className="text-[11px] text-[var(--theme-secondary-text)]">gün</span>
                <button
                  onClick={() => {
                    const d = parseInt(banDays, 10);
                    if (!Number.isFinite(d) || d < 1) return;
                    onAction({ type: 'ban', user, days: d });
                  }}
                  className="ml-auto px-3 py-1.5 rounded-lg text-[11.5px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25"
                >
                  Yasakla
                </button>
              </div>
            </div>
          )}
        </DetailSection>

        {/* Hesap */}
        <DetailSection title="Hesap" hint="Kalıcı işlemler">
          <div className="grid grid-cols-1 gap-2">
            {user.email && (
              <DetailButton
                icon={<KeyRound size={13} />}
                label="Şifre Sıfırla"
                description={`${user.email} adresine geçici parola gönderilir`}
                tone="warning"
                onClick={() => onAction({ type: 'resetPassword', user })}
              />
            )}
            {!user.is_primary_admin && canDelete && (
              <DetailButton
                icon={<Trash2 size={13} />}
                label="Kullanıcıyı Sil"
                description="Hesabı kalıcı olarak kaldır (geri alınamaz)"
                tone="danger"
                onClick={() => onAction({ type: 'delete', user })}
              />
            )}
          </div>
        </DetailSection>
      </div>

      {/* Footer */}
      <div className="flex border-t border-[var(--theme-border)]">
        <button onClick={onClose} className="flex-1 py-3.5 text-[13px] font-semibold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-panel-hover)]">
          Kapat
        </button>
      </div>
    </Modal>
  );
}

function DetailSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]">{title}</h4>
        {hint && <span className="text-[10px] text-[var(--theme-secondary-text)]/60">{hint}</span>}
      </div>
      <div className="rounded-xl bg-[var(--theme-surface-card)] border border-[var(--theme-border)]/40 p-3">
        {children}
      </div>
    </section>
  );
}

function DetailButton({ icon, label, description, tone, onClick }: {
  icon: React.ReactNode;
  label: string;
  description: string;
  tone: 'primary' | 'warning' | 'danger';
  onClick: () => void;
}) {
  const cls =
    tone === 'danger' ? 'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50'
    : tone === 'warning' ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/50'
    : 'border-[var(--theme-accent)]/30 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 hover:border-[var(--theme-accent)]/50';
  const iconBg =
    tone === 'danger' ? 'bg-red-500/15'
    : tone === 'warning' ? 'bg-orange-500/15'
    : 'bg-[var(--theme-accent)]/15';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${cls}`}
    >
      <span className={`shrink-0 w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold leading-tight">{label}</div>
        <div className="text-[10.5px] opacity-70 mt-0.5">{description}</div>
      </div>
    </button>
  );
}

// ── Plan Manage Modal ──

function PlanManageModal({ user, onClose, onSuccess, onError }: {
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const readOnly = user.plan_source === 'paid';
  const [plan, setPlan] = useState<PlanKey>(user.plan === 'none' ? 'pro' : user.plan);
  const [duration, setDuration] = useState<DurationType>(user.plan_end_at ? 'custom' : 'unlimited');
  const [customEndAt, setCustomEndAt] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const displayName = user.full_name || user.username || user.email || user.id.slice(0, 8);

  const submit = async () => {
    if (readOnly) return;
    setSubmitting(true); setLocalError(null);
    try {
      await setUserPlan(user.id, { plan, durationType: duration, customEndAt: duration === 'custom' ? customEndAt : undefined });
      onSuccess();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'İşlem başarısız';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const performRevoke = async () => {
    setSubmitting(true); setLocalError(null);
    try {
      await revokeUserPlan(user.id);
      setConfirmingRevoke(false);
      onSuccess();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : 'Kaldırma başarısız';
      setLocalError(msg);
      onError(msg);
      setConfirmingRevoke(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} width="md" padded={false}>
      <div className="p-5 border-b border-[var(--theme-border)]">
        <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-1">Plan Yönetimi</h3>
        <p className="text-[12px] text-[var(--theme-secondary-text)]">
          {displayName} <span className="opacity-60">• {user.email || user.id}</span>
        </p>
        {readOnly && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] flex items-center gap-2">
            <Lock size={12} /> Bu kullanıcının planı <b>paid</b> — admin override edemez. Sadece görüntüleme.
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Mevcut plan özeti */}
        <div className="p-3 rounded-xl bg-[var(--theme-surface-card)] border border-[var(--theme-border)]/50 text-[11.5px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[var(--theme-secondary-text)]">Mevcut plan</span>
            <div className="flex items-center gap-1.5">
              <PlanBadge plan={user.plan} />
              <StatusBadge status={user.plan_status} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--theme-secondary-text)]">Kaynak</span>
            <span className="font-semibold text-[var(--theme-text)]">{user.plan_source ?? '—'}</span>
          </div>
          {user.plan_start_at && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-secondary-text)]">Başlangıç</span>
              <span className="font-mono text-[10.5px]">{new Date(user.plan_start_at).toLocaleString('tr-TR')}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[var(--theme-secondary-text)]">Bitiş</span>
            <span className="font-mono text-[10.5px]">
              {user.plan_end_at ? new Date(user.plan_end_at).toLocaleString('tr-TR') : 'sınırsız'}
            </span>
          </div>
        </div>

        {!readOnly && (
          <>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/70">Plan</label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {(['free','pro','ultra'] as PlanKey[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={`py-2 rounded-lg text-[12px] font-semibold uppercase tracking-wide border ${
                      plan === p
                        ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border-[var(--theme-accent)]/40'
                        : 'bg-[var(--theme-input-bg)] text-[var(--theme-secondary-text)] border-[var(--theme-input-border)] hover:text-[var(--theme-text)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/70">Süre</label>
              <div className="grid grid-cols-5 gap-1.5 mt-1.5">
                {([
                  { v: '1week' as const, l: '1 hafta' },
                  { v: '1month' as const, l: '1 ay' },
                  { v: '1year' as const, l: '1 yıl' },
                  { v: 'custom' as const, l: 'Özel' },
                  { v: 'unlimited' as const, l: 'Sınırsız' },
                ]).map(d => (
                  <button
                    key={d.v}
                    onClick={() => setDuration(d.v)}
                    className={`py-2 rounded-lg text-[10.5px] font-semibold border ${
                      duration === d.v
                        ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border-[var(--theme-accent)]/40'
                        : 'bg-[var(--theme-input-bg)] text-[var(--theme-secondary-text)] border-[var(--theme-input-border)] hover:text-[var(--theme-text)]'
                    }`}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
              {duration === 'custom' && (
                <input
                  type="datetime-local"
                  value={customEndAt}
                  onChange={e => setCustomEndAt(e.target.value)}
                  className="mt-2 w-full bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-lg px-3 py-1.5 text-[11.5px] outline-none focus:border-[var(--theme-accent)]/50"
                />
              )}
            </div>

            {localError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-[11px]">{localError}</div>
            )}
          </>
        )}
      </div>

      <div className="flex border-t border-[var(--theme-border)]">
        <button onClick={onClose} className="flex-1 py-3.5 text-[13px] font-semibold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-panel-hover)]">
          Kapat
        </button>
        {!readOnly && (
          <>
            <div className="w-px bg-[var(--theme-border)]" />
            {user.plan !== 'none' && (
              <>
                <button
                  onClick={() => setConfirmingRevoke(true)}
                  disabled={submitting}
                  className="flex-1 py-3.5 text-[13px] font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                >
                  Planı Kaldır
                </button>
                <div className="w-px bg-[var(--theme-border)]" />
              </>
            )}
            <button
              onClick={submit}
              disabled={submitting || (duration === 'custom' && !customEndAt)}
              className="flex-1 py-3.5 text-[13px] font-bold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Kaydediliyor...' : (user.plan === 'none' ? 'Plan Ata' : 'Planı Güncelle')}
            </button>
          </>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmingRevoke}
        title="Planı Kaldır"
        description={`${displayName} kullanıcısının manuel planı kaldırılacak. Sunucu oluşturma yetkisi sıfırlanacak.`}
        confirmText="Planı Kaldır"
        cancelText="Vazgeç"
        onConfirm={performRevoke}
        onCancel={() => setConfirmingRevoke(false)}
        danger
        loading={submitting}
      />
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Kullanıcı Seviye Yönetimi — Plan Modal ile simetrik UX
// Kademeli üye seviyeleri (tema/özellik kilidi açar). Moderatör/Admin yetkisi
// BURADA YÖNETİLMEZ — o toggle'lar ayrı (primaryAdmin manuel verir).
// ═══════════════════════════════════════════════════════════════════════════

const AVAILABLE_LEVELS = ['1', '2', '3'] as const;
type LevelKey = typeof AVAILABLE_LEVELS[number];

const USER_LEVEL_LABEL: Record<string, string> = {
  '': 'Seviyesiz',
  '1': 'Üye',
  '2': 'VIP',
  '3': 'Elit',
};

function labelFor(level: string | null | undefined): string {
  if (!level) return 'Seviyesiz';
  return USER_LEVEL_LABEL[level] ?? level;
}

function UserLevelModal({ user, onClose, onSuccess, onError }: {
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const currentLevel: string | null = user.user_level ?? null;
  const initialLevel: LevelKey = (AVAILABLE_LEVELS.includes((currentLevel ?? '') as LevelKey)
    ? (currentLevel as LevelKey)
    : '1');
  const [level, setLevel] = useState<LevelKey>(initialLevel);
  const [duration, setDuration] = useState<DurationType>(user.user_level_end_at ? 'custom' : 'unlimited');
  const [customEndAt, setCustomEndAt] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const displayName = user.full_name || user.username || user.email || user.id.slice(0, 8);

  const submit = async () => {
    setSubmitting(true); setLocalError(null);
    try {
      await setUserLevel(user.id, {
        level,
        durationType: duration,
        customEndAt: duration === 'custom' ? customEndAt : undefined,
      });
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'İşlem başarısız';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const performRevoke = async () => {
    setSubmitting(true); setLocalError(null);
    try {
      await revokeUserLevel(user.id);
      setConfirmingRevoke(false);
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kaldırma başarısız';
      setLocalError(msg);
      onError(msg);
      setConfirmingRevoke(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} width="md" padded={false}>
      <div className="p-5 border-b border-[var(--theme-border)]">
        <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-1">Seviye Yönetimi</h3>
        <p className="text-[12px] text-[var(--theme-secondary-text)]">
          {displayName} <span className="opacity-60">• {user.email || user.id}</span>
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Mevcut seviye özeti */}
        <div className="p-3 rounded-xl bg-[var(--theme-surface-card)] border border-[var(--theme-border)]/50 text-[11.5px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[var(--theme-secondary-text)]">Mevcut seviye</span>
            <span className="font-semibold text-[var(--theme-text)]">{labelFor(currentLevel)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--theme-secondary-text)]">Kaynak</span>
            <span className="font-semibold text-[var(--theme-text)]">{user.user_level_source ?? '—'}</span>
          </div>
          {user.user_level_start_at && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--theme-secondary-text)]">Başlangıç</span>
              <span className="font-mono text-[10.5px]">{new Date(user.user_level_start_at).toLocaleString('tr-TR')}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[var(--theme-secondary-text)]">Bitiş</span>
            <span className="font-mono text-[10.5px]">
              {user.user_level_end_at ? new Date(user.user_level_end_at).toLocaleString('tr-TR') : 'sınırsız'}
            </span>
          </div>
        </div>

        {/* Seviye seçimi */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/70">Seviye</label>
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {AVAILABLE_LEVELS.map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`py-2 rounded-lg text-[12px] font-semibold uppercase tracking-wide border transition-colors ${
                  level === l
                    ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border-[var(--theme-accent)]/40'
                    : 'bg-[var(--theme-input-bg)] text-[var(--theme-secondary-text)] border-[var(--theme-input-border)] hover:text-[var(--theme-text)]'
                }`}
              >
                {labelFor(l)}
              </button>
            ))}
          </div>
        </div>

        {/* Süre seçimi */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/70">Süre</label>
          <div className="grid grid-cols-5 gap-1.5 mt-1.5">
            {([
              { v: '1week' as const, l: '1 hafta' },
              { v: '1month' as const, l: '1 ay' },
              { v: '1year' as const, l: '1 yıl' },
              { v: 'custom' as const, l: 'Özel' },
              { v: 'unlimited' as const, l: 'Sınırsız' },
            ]).map(d => (
              <button
                key={d.v}
                onClick={() => setDuration(d.v)}
                className={`py-2 rounded-lg text-[10.5px] font-semibold border ${
                  duration === d.v
                    ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border-[var(--theme-accent)]/40'
                    : 'bg-[var(--theme-input-bg)] text-[var(--theme-secondary-text)] border-[var(--theme-input-border)] hover:text-[var(--theme-text)]'
                }`}
              >
                {d.l}
              </button>
            ))}
          </div>
          {duration === 'custom' && (
            <input
              type="datetime-local"
              value={customEndAt}
              onChange={e => setCustomEndAt(e.target.value)}
              className="mt-2 w-full bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-lg px-3 py-1.5 text-[11.5px] outline-none focus:border-[var(--theme-accent)]/50"
            />
          )}
        </div>

        {localError && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-[11px]">{localError}</div>
        )}
      </div>

      <div className="flex border-t border-[var(--theme-border)]">
        <button onClick={onClose} className="flex-1 py-3.5 text-[13px] font-semibold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-panel-hover)]">
          Kapat
        </button>
        {currentLevel && (
          <>
            <div className="w-px bg-[var(--theme-border)]" />
            <button
              onClick={() => setConfirmingRevoke(true)}
              disabled={submitting}
              className="flex-1 py-3.5 text-[13px] font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            >
              Seviyeyi Geri Al
            </button>
          </>
        )}
        <div className="w-px bg-[var(--theme-border)]" />
        <button
          onClick={submit}
          disabled={submitting || (duration === 'custom' && !customEndAt)}
          className="flex-1 py-3.5 text-[13px] font-bold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Kaydediliyor...' : 'Seviye Belirle'}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmingRevoke}
        title="Seviyeyi Geri Al"
        description={`${displayName} kullanıcısının seviyesi kaldırılacak. Kademeli tema ve özellikler kapanacak.`}
        confirmText="Seviyeyi Geri Al"
        cancelText="Vazgeç"
        onConfirm={performRevoke}
        onCancel={() => setConfirmingRevoke(false)}
        danger
        loading={submitting}
      />
    </Modal>
  );
}

// ── Devices & Version section ─────────────────────────────────────────
// Presence-backed session list. Aktifler üstte, sonra geçmiş son session'lar.
// Versiyon current appVersion'dan geride ise outdated uyarısı.

function formatRelativeMs(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'az önce';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} gün önce`;
  return new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PlatformBadge({ platform }: { platform: AdminUserSession['platform'] }) {
  const cfg = (() => {
    switch (platform) {
      case 'mobile':
        return { label: 'Mobile', icon: <Smartphone size={11} strokeWidth={1.9} />, bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(168,85,247,0.28)' };
      case 'web':
        return { label: 'Web', icon: <Globe size={11} strokeWidth={1.9} />, bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.28)' };
      case 'desktop':
      default:
        return { label: 'Desktop', icon: <Monitor size={11} strokeWidth={1.9} />, bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: 'rgba(96,165,250,0.28)' };
    }
  })();
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.06em] shrink-0"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function VersionChip({ version, current }: { version: string | null; current?: string }) {
  const label = displayVersion(version);
  if (!label) {
    return (
      <span className="text-[10.5px] text-[var(--theme-secondary-text)]/60 italic shrink-0">bilinmiyor</span>
    );
  }
  const outdated = isOutdatedVersion(version, current || null);
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold shrink-0 tabular-nums"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: outdated ? 'rgba(251,191,36,0.10)' : 'rgba(var(--glass-tint), 0.05)',
        color: outdated ? '#f59e0b' : 'var(--theme-text)',
        border: `1px solid ${outdated ? 'rgba(251,191,36,0.28)' : 'rgba(var(--glass-tint), 0.09)'}`,
        letterSpacing: '-0.01em',
      }}
      title={outdated ? `Mevcut sürüm: v${current}` : undefined}
    >
      v{label}
      {outdated && <AlertTriangle size={10} strokeWidth={2.2} />}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 text-[10.5px] font-medium"
      style={{ color: active ? '#10b981' : 'var(--theme-secondary-text)' }}
    >
      <Circle
        size={7}
        strokeWidth={0}
        fill={active ? '#10b981' : 'var(--theme-secondary-text)'}
        style={{ opacity: active ? 1 : 0.5 }}
      />
      {active ? 'Çevrimiçi' : 'Çevrimdışı'}
    </span>
  );
}

function DevicesSection({
  sessions,
  loading,
  error,
  currentAppVersion,
}: {
  sessions: AdminUserSession[];
  loading: boolean;
  error: string | null;
  currentAppVersion: string;
}) {
  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2">
        <RefreshCw size={12} className="animate-spin text-[var(--theme-secondary-text)]/50" />
        <span className="text-[11px] text-[var(--theme-secondary-text)]/60">Oturumlar yükleniyor…</span>
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
        <AlertTriangle size={12} className="text-red-400 shrink-0" />
        <span className="text-[11px] text-red-400/90">{error}</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-[rgba(var(--glass-tint),0.04)] border border-[rgba(var(--glass-tint),0.08)]">
        <Circle size={8} strokeWidth={0} fill="currentColor" className="text-[var(--theme-secondary-text)]/40 shrink-0" />
        <span className="text-[11px] text-[var(--theme-secondary-text)]/70">Bu kullanıcıya ait oturum kaydı yok.</span>
      </div>
    );
  }

  // Görünür set: aktif session'lar varsa onlar (multi-device), yoksa sadece
  // en güncel 1 kapalı session (last known version fallback). Geçmiş session
  // listesi gösterilmez — admin sadece "şu anki versiyon" ister.
  const active = sessions.filter(s => s.is_active);
  const visible = active.length > 0 ? active : sessions.slice(0, 1);

  return (
    <div className="space-y-1.5">
      {visible.map((s) => {
        const timeLabel = s.is_active
          ? `Son aktivite: ${formatRelativeMs(s.last_heartbeat_at)}`
          : s.disconnected_at
            ? `Son görülme: ${formatRelativeMs(s.disconnected_at)}`
            : '';
        return (
          <div
            key={s.session_key}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
            style={{
              background: s.is_active
                ? 'rgba(16,185,129,0.05)'
                : 'rgba(var(--glass-tint), 0.04)',
              border: `1px solid ${s.is_active ? 'rgba(16,185,129,0.14)' : 'rgba(var(--glass-tint), 0.08)'}`,
            }}
          >
            <PlatformBadge platform={s.platform} />
            <VersionChip version={s.app_version} current={currentAppVersion} />
            <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
              <span className="text-[10.5px] text-[var(--theme-secondary-text)]/70 truncate">
                {timeLabel}
              </span>
              <StatusDot active={s.is_active} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
