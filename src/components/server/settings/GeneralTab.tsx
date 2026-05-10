import React, { useState, useRef, useEffect } from 'react';
import {
  Trash2, Camera, Copy, Check,
  Globe, Lock, Mail, UserPlus, LogOut, Sparkles,
} from 'lucide-react';
import { type Server, type ServerMember, getMembers } from '../../../lib/serverService';
import { uploadServerLogo } from '../../../lib/backendClient';
import { verifyCurrentPassword } from '../../../lib/authClient';
import AvatarCropModal from '../../AvatarCropModal';
import AvatarContent from '../../AvatarContent';
import { fmtDate, memberDisplayName } from './shared';
import { useUser } from '../../../contexts/UserContext';

export interface GeneralActions {
  onSave: () => void;
  onReset: () => void;
}

interface Props {
  server: Server;
  canEdit: boolean;
  isOwner: boolean;
  onSave: (u: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
  onLeave: () => Promise<void>;
  showToast: (m: string) => void;
  /** Parent'a dirty/saving state'ini iletir — tab bar sağında Kaydet pill'i göstermek için. */
  onStateChange?: (state: { dirty: boolean; saving: boolean }) => void;
  /** Parent'ın action pill'leri tetiklemesi için handler ref. Her render'da güncellenir. */
  actionsRef?: React.MutableRefObject<GeneralActions | null>;
}

// ══════════════════════════════════════════════════════════════════
// Design tokens — local, premium glassmorphism + 8pt grid
// ══════════════════════════════════════════════════════════════════

const INPUT_BASE =
  'w-full h-10 rounded-lg px-3.5 text-[13px] text-[var(--theme-text)] tracking-tight ' +
  'placeholder:text-[var(--theme-secondary-text)]/45 outline-none gtInput ' +
  'disabled:opacity-55 disabled:cursor-default';

const DANGER_BTN_STYLE: React.CSSProperties = {
  background: 'rgba(248,113,113,0.12)',
  color: 'rgba(248,113,113,0.95)',
  boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.22)',
};

// ══════════════════════════════════════════════════════════════════
// Primitives (local)
// ══════════════════════════════════════════════════════════════════

function Field({ label, children, locked }: { label: string; children: React.ReactNode; locked?: boolean }) {
  return (
    <div className={locked ? 'opacity-55 pointer-events-none' : ''}>
      <label className="block text-[11px] font-medium text-[var(--theme-secondary-text)]/80 mb-1.5 tracking-normal">
        {label}
      </label>
      {children}
    </div>
  );
}

function GroupLabel({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'danger'; key?: React.Key }) {
  const color = tone === 'danger' ? 'rgba(220,38,38,0.78)' : 'var(--theme-secondary-text)';
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-[3px] h-[11px] rounded-full shrink-0"
        style={{
          background: color,
          boxShadow: tone === 'danger' ? '0 0 6px rgba(248,113,113,0.30)' : 'none',
        }}
        aria-hidden="true"
      />
      <h3
        className="text-[11px] font-semibold uppercase"
        style={{ color, letterSpacing: '0.12em' }}
      >
        {children}
      </h3>
    </div>
  );
}

interface SegOption<T extends string> {
  value: T;
  label: string;
  icon: React.ReactNode;
}

function Segmented<T extends string>({ options, value, onChange, disabled }: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex p-[3px] rounded-full w-full"
      style={{
        background: 'rgba(var(--glass-tint),0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.08)',
      }}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            className={`gtSegBtn relative flex-1 h-[30px] px-3 rounded-full text-[12px] font-medium inline-flex items-center justify-center gap-1.5 ${
              disabled ? 'cursor-default opacity-60' : ''
            }`}
            style={active ? {
              background: 'rgba(var(--theme-accent-rgb),0.12)',
              color: 'var(--theme-accent)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.22)',
            } : {
              color: 'var(--theme-secondary-text)',
              background: 'transparent',
            }}
          >
            <span className="opacity-80 shrink-0">{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanRow({
  plan, capacity, createdAt, current,
}: {
  plan: string;
  capacity: number;
  createdAt: string;
  current: number;
}) {
  const pct = Math.max(0, Math.min(100, capacity > 0 ? (current / capacity) * 100 : 0));
  const near = pct >= 85;
  const full = pct >= 98;
  const fillColor = full
    ? 'rgba(248,113,113,0.65)'
    : near
      ? 'rgba(251,191,36,0.65)'
      : 'rgba(var(--theme-accent-rgb),0.60)';

  return (
    <div
      className="rounded-lg px-3.5 pt-2.5 pb-2"
      style={{
        background: 'rgba(var(--glass-tint),0.025)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.08)',
      }}
    >
      <div className="flex items-center gap-3 h-6">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide"
          style={{
            background: 'rgba(var(--theme-accent-rgb),0.12)',
            color: 'var(--theme-accent)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.24)',
          }}
        >
          {plan.toUpperCase()}
        </span>
        <span className="text-[var(--theme-secondary-text)]/35">·</span>
        <span className="text-[13px] font-semibold text-[var(--theme-text)] tabular-nums">
          {current} <span className="text-[var(--theme-secondary-text)]/65 font-medium">/</span> {capacity}
          <span className="font-medium text-[var(--theme-secondary-text)] ml-1 text-[12px]">üye</span>
        </span>
        <span className="text-[var(--theme-secondary-text)]/35 hidden sm:inline">·</span>
        <span className="text-[12px] text-[var(--theme-secondary-text)] tabular-nums truncate hidden sm:inline">
          {fmtDate(createdAt)}
        </span>
      </div>
      {/* Thin progress bar */}
      <div
        className="mt-2 h-1 rounded-full overflow-hidden"
        style={{ background: 'rgba(var(--glass-tint),0.08)' }}
        aria-label={`Üye kullanımı: ${current} / ${capacity}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: fillColor,
            transition: 'width 400ms cubic-bezier(0.22, 1, 0.36, 1), background 300ms ease',
          }}
        />
      </div>
    </div>
  );
}

function DangerButton({
  onClick, disabled, children, size = 'md',
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gtPressable inline-flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold tracking-tight disabled:opacity-35 disabled:cursor-default ${
        size === 'sm' ? 'h-8 px-3.5' : 'h-9 px-4'
      }`}
      style={DANGER_BTN_STYLE}
    >
      {children}
    </button>
  );
}

function GhostButton({
  onClick, children, tone = 'neutral', size = 'md',
}: { onClick: () => void; children: React.ReactNode; tone?: 'neutral' | 'danger'; size?: 'sm' | 'md' }) {
  const isDanger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`gtPressable inline-flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold tracking-tight ${
        size === 'sm' ? 'h-8 px-3.5' : 'h-9 px-4'
      }`}
      style={isDanger ? {
        background: 'rgba(248,113,113,0.10)',
        color: 'rgba(248,113,113,0.92)',
        boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.22)',
      } : {
        background: 'rgba(var(--glass-tint),0.04)',
        color: 'var(--theme-text)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.08)',
      }}
    >
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// GENEL — UI redesign (logic 1:1 korunuyor)
// ══════════════════════════════════════════════════════════════════

export default function GeneralTab({ server, canEdit, isOwner, onSave, onDelete, onLeave, showToast, onStateChange, actionsRef }: Props) {
  const [name, setName] = useState(server.name);
  const [desc, setDesc] = useState(server.description);
  const [motto, setMotto] = useState(server.motto ?? '');
  const [isPublic, setIsPublic] = useState(server.isPublic ?? true);
  const [joinPolicy, setJoinPolicy] = useState(server.joinPolicy ?? 'invite_only');
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Owner bilgisi — read-only, hafif fetch (getMembers mevcut endpoint)
  const [ownerMember, setOwnerMember] = useState<ServerMember | null>(null);
  const { allUsers } = useUser();
  useEffect(() => {
    let cancelled = false;
    getMembers(server.id).then(list => {
      if (cancelled) return;
      const o = list.find(m => m.role === 'owner');
      setOwnerMember(o ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [server.id]);

  // AI Insight — contextual, single sentence, null ise hiç render edilmez
  // Dev preview: import.meta.env.DEV ise eşikler düşürülür ki geliştirme sırasında örnek görünür.
  // Production'da spec'e uygun (normal = null).
  const insight = ((): string | null => {
    const cap = server.capacity;
    const cur = server.memberCount;
    const isDev = import.meta.env.DEV;
    if (cap > 0) {
      const pct = (cur / cap) * 100;
      if (pct >= 98) return 'Sunucu kapasitesi neredeyse dolu.';
      if (pct >= 85) return `Sunucu kapasitesinin %${Math.round(pct)}'i dolu.`;
      if (pct >= 75) return 'Sunucu kapasitesi dolmaya yaklaşıyor.';
      if (isDev && pct >= 15) return `Sunucu kapasitesinin %${Math.round(pct)}'i kullanılıyor.`;
    }
    if (cur <= 2 && cap >= 10) return 'Sunucu aktivitesi düşük görünüyor.';
    return null;
  })();

  // Last updated — Server.updatedAt varsa kullan (backend camelize), yoksa createdAt'a düş.
  const lastUpdatedIso = server.updatedAt ?? server.createdAt;
  const lastUpdatedLabel = (() => {
    const d = new Date(lastUpdatedIso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  // Otomatik slug — backend `generateBaseSlug` ile paralel: max 6 karakter, no hyphen.
  const autoSlug = name.trim().toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);

  const dirty = name !== server.name
    || desc !== server.description
    || motto !== (server.motto ?? '')
    || isPublic !== (server.isPublic ?? true)
    || joinPolicy !== (server.joinPolicy ?? 'invite_only');

  // Prop-sync: server prop dışarıdan güncellenince (parent save sonrası reload,
  // concurrent update, realtime refresh) local state'i uyumla. Dirty iken kullanıcının
  // düzenlemesini ezmemek için yalnızca clean state'te override et.
  useEffect(() => {
    if (dirty) return;
    setName(server.name);
    setDesc(server.description);
    setMotto(server.motto ?? '');
    setIsPublic(server.isPublic ?? true);
    setJoinPolicy(server.joinPolicy ?? 'invite_only');
    // `dirty` comparison sırasında mevcut state okunur — effect zamanlama güvenli:
    // eğer dirty true ise hiçbir setState çağrılmaz, infinite loop riski yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.name, server.description, server.motto, server.isPublic, server.joinPolicy]);

  const save = async () => {
    if (!dirty || saving) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 15) { showToast('Sunucu adı 3-15 karakter olmalı'); return; }
    setSaving(true);
    const u: Record<string, unknown> = {};
    if (trimmedName !== server.name) u.name = trimmedName;
    if (desc !== server.description) u.description = desc.trim();
    if (motto !== (server.motto ?? '')) u.motto = motto.trim();
    if (isPublic !== (server.isPublic ?? true)) u.isPublic = isPublic;
    if (joinPolicy !== (server.joinPolicy ?? 'invite_only')) u.joinPolicy = joinPolicy;
    try { await onSave(u); } finally { setSaving(false); }
  };

  const handleReset = () => {
    setName(server.name);
    setDesc(server.description);
    setMotto(server.motto ?? '');
    setIsPublic(server.isPublic ?? true);
    setJoinPolicy(server.joinPolicy ?? 'invite_only');
  };

  // Parent'a dirty/saving state + save/reset handler'larını ilet → tab bar sağı Kaydet pill'i.
  useEffect(() => {
    onStateChange?.({ dirty, saving });
  }, [dirty, saving, onStateChange]);
  if (actionsRef) {
    actionsRef.current = { onSave: save, onReset: handleReset };
  }

  const nameChanged = name.trim() !== server.name;
  const realSlug = (server.slug || '').replace(/\.mv$/, '');
  const shownSlug = nameChanged ? autoSlug : (realSlug || autoSlug);

  const handleCopySlug = () => {
    navigator.clipboard.writeText((shownSlug || '') + '.mv');
    setCopied(true);
    showToast('Adres kopyalandı');
    setTimeout(() => setCopied(false), 1800);
  };

  const closeDeleteModal = () => {
    setDeleteModal(false);
    setDeleteConfirm('');
    setDeletePassword('');
    setDeletePasswordError('');
  };

  return (
    <div className="max-w-[880px] mx-auto pb-3 generalTab">

      {/* ═════════════ GROUP 1 — Temel Bilgiler ═════════════ */}
      <section>
        <GroupLabel>Temel Bilgiler</GroupLabel>

        {/* Avatar block — üstte, left-aligned, belirgin */}
        <div data-server-command-target="server-avatar" className="mt-3 flex items-center gap-4 rounded-2xl p-2 -m-2">
          <button
            type="button"
            onClick={() => canEdit && logoRef.current?.click()}
            disabled={!canEdit}
            className="gtAvatar group relative w-[76px] h-[76px] rounded-2xl overflow-hidden shrink-0 disabled:cursor-default"
            style={{
              background: server.avatarUrl
                ? 'transparent'
                : 'linear-gradient(160deg, rgba(var(--theme-accent-rgb),0.10), rgba(var(--theme-accent-rgb),0.03))',
              boxShadow: server.avatarUrl
                ? 'inset 0 0 0 1px rgba(var(--glass-tint),0.08), 0 4px 14px rgba(0,0,0,0.16)'
                : 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.20), 0 2px 10px rgba(var(--theme-accent-rgb),0.08)',
            }}
          >
            {server.avatarUrl
              ? <img src={server.avatarUrl} alt="" className="w-full h-full object-cover" />
              : <span className="flex items-center justify-center w-full h-full text-[22px] font-semibold text-[var(--theme-accent)] tracking-tight">{server.shortName}</span>
            }
            {canEdit && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'rgba(0,0,0,0.55)' }}>
                {logoLoading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={17} className="text-white" strokeWidth={1.8} />}
              </div>
            )}
            <input
              ref={logoRef} type="file" accept="image/*" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                e.target.value = '';
                if (f.size > 5 * 1024 * 1024) { showToast('Maks 5 MB'); return; }
                const r = new FileReader();
                r.onload = () => setCropSrc(r.result as string);
                r.readAsDataURL(f);
              }}
            />
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-[var(--theme-text)] tracking-tight truncate">
              {name || server.name}
            </div>
            <div className="mt-1 inline-flex items-center gap-2 h-7 pl-2.5 pr-1 rounded-md"
              style={{
                background: 'rgba(var(--theme-accent-rgb),0.05)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.14)',
              }}
            >
              <span className="text-[11.5px] font-mono font-medium text-[var(--theme-accent)] truncate">
                {shownSlug || '...'}<span className="opacity-55">.mv</span>
                {nameChanged && <span className="opacity-50 ml-1.5 text-[10px] font-sans">(önizleme)</span>}
              </span>
              <button
                type="button"
                onClick={handleCopySlug}
                className="gtIconBtn w-6 h-6 rounded flex items-center justify-center text-[var(--theme-secondary-text)] shrink-0"
                aria-label="Adresi kopyala"
              >
                {copied ? <Check size={11} strokeWidth={2.5} className="text-emerald-400" /> : <Copy size={11} />}
              </button>
            </div>

            {/* Owner info — read-only inline */}
            {ownerMember && (
              <div className="mt-1.5 flex items-center gap-2 opacity-70">
                <span className="text-[10.5px] font-medium text-[var(--theme-secondary-text)] shrink-0">Sahip</span>
                <span className="text-[var(--theme-secondary-text)]/40">·</span>
                <div
                  className="w-[22px] h-[22px] rounded-full overflow-hidden flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(var(--glass-tint),0.04)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.08)',
                  }}
                >
                  <AvatarContent
                    avatar={ownerMember.avatar}
                    statusText={allUsers.find(u => u.id === ownerMember.userId)?.statusText ?? 'Online'}
                    firstName={ownerMember.firstName}
                    name={memberDisplayName(ownerMember)}
                    letterClassName="text-[9px] font-semibold text-[var(--theme-text)]"
                  />
                </div>
                <span className="text-[12px] font-medium text-[var(--theme-text)] truncate">
                  {memberDisplayName(ownerMember)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 6/6 grid — balanced */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-3.5">
          <div className="md:col-span-6">
            <Field label="Sunucu Adı" locked={!canEdit}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={15}
                disabled={!canEdit}
                className={INPUT_BASE}
              />
            </Field>
          </div>
          <div className="md:col-span-6">
            <Field label="Motto" locked={!canEdit}>
              <input
                value={motto}
                onChange={e => setMotto(e.target.value.slice(0, 15))}
                maxLength={15}
                disabled={!canEdit}
                placeholder="voice & chat"
                className={INPUT_BASE}
              />
            </Field>
          </div>
          <div className="md:col-span-12">
            <Field label="Açıklama" locked={!canEdit}>
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                maxLength={200}
                disabled={!canEdit}
                placeholder="Kısa açıklama"
                className={INPUT_BASE}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* ═════════════ GROUP 2 — Erişim ═════════════ */}
      <section className="mt-7">
        <GroupLabel>Erişim</GroupLabel>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-3.5">
          <div className="md:col-span-6">
            <Field label="Görünürlük" locked={!canEdit}>
              <Segmented<'public' | 'private'>
                value={isPublic ? 'public' : 'private'}
                disabled={!canEdit}
                onChange={v => setIsPublic(v === 'public')}
                options={[
                  { value: 'public', label: 'Açık', icon: <Globe size={12} strokeWidth={1.8} /> },
                  { value: 'private', label: 'Gizli', icon: <Lock size={12} strokeWidth={1.8} /> },
                ]}
              />
            </Field>
          </div>
          <div className="md:col-span-6">
            <Field label="Katılım" locked={!canEdit}>
              <Segmented<'invite_only' | 'open'>
                value={joinPolicy === 'open' ? 'open' : 'invite_only'}
                disabled={!canEdit}
                onChange={v => setJoinPolicy(v)}
                options={[
                  { value: 'invite_only', label: 'Davetli', icon: <Mail size={12} strokeWidth={1.8} /> },
                  { value: 'open', label: 'Açık', icon: <UserPlus size={12} strokeWidth={1.8} /> },
                ]}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* ═════════════ GROUP 3 — Plan ═════════════ */}
      <section className="mt-7">
        <GroupLabel>Plan</GroupLabel>
        <div className="mt-3">
          <PlanRow
            plan={server.plan ?? 'free'}
            capacity={server.capacity}
            createdAt={server.createdAt}
            current={server.memberCount}
          />
        </div>

        {/* AI Insight — subtle, single sentence, only when contextually relevant */}
        {insight && (
          <div
            className="gtInsight mt-2.5 flex items-center gap-1.5 px-0.5 text-[11.5px] font-medium leading-relaxed"
            style={{
              color: 'rgba(var(--theme-accent-rgb),0.78)',
            }}
          >
            <Sparkles size={11} strokeWidth={1.9} className="shrink-0 opacity-80" />
            <span className="truncate">{insight}</span>
          </div>
        )}
      </section>

      {/* ═════════════ GROUP 4 — Tehlikeli Bölge ═════════════ */}
      <section className="mt-7">
        <GroupLabel tone="danger">Tehlikeli Bölge</GroupLabel>
        <div className="mt-3">
          {isOwner ? (
            <div
              className="rounded-xl h-14 flex items-center justify-between gap-3 px-4"
              style={{
                background: 'rgba(248,113,113,0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.18)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(248,113,113,0.12)',
                    boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.22)',
                  }}
                >
                  <Trash2 size={14} className="text-red-400/90" strokeWidth={1.9} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--theme-text)] tracking-tight truncate">
                    Sunucuyu Sil
                  </div>
                  <div className="text-[10.5px] text-[var(--theme-secondary-text)] mt-0.5 leading-snug truncate">
                    Bu işlem geri alınamaz — tüm veriler kalıcı olarak silinir.
                  </div>
                </div>
              </div>
              <DangerButton onClick={() => setDeleteModal(true)}>
                Sil
              </DangerButton>
            </div>
          ) : (
            <div
              className="rounded-xl h-14 flex items-center justify-between gap-3 px-4"
              style={{
                background: 'rgba(248,113,113,0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.14)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(248,113,113,0.10)',
                    boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.18)',
                  }}
                >
                  <LogOut size={14} className="text-red-400/90" strokeWidth={1.9} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--theme-text)] tracking-tight truncate">
                    Sunucudan Ayrıl
                  </div>
                  <div className="text-[10.5px] text-[var(--theme-secondary-text)] mt-0.5 leading-snug truncate">
                    Üyelik kaldırılır — tekrar katılmak için davet gerekir.
                  </div>
                </div>
              </div>
              <GhostButton tone="danger" onClick={() => setLeaveModal(true)}>
                Ayrıl
              </GhostButton>
            </div>
          )}
        </div>
      </section>

      {/* ── Last updated — subtle bottom-right ── */}
      {lastUpdatedLabel && (
        <div className="mt-6 text-right text-[11px] text-[var(--theme-secondary-text)]/70 tabular-nums">
          Son güncelleme: {lastUpdatedLabel}
        </div>
      )}

      {/* ═════════════ Silme Modal ═════════════ */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(10,15,25,0.55)', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
          onClick={() => setDeleteModal(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-[22px] p-6 animate-[modalIn_220ms_cubic-bezier(0.22,1,0.36,1)]"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--theme-popover-bg, var(--surface-elevated))',
              boxShadow:
                'var(--surface-floating-shadow, 0 20px 60px rgba(0,0,0,0.25))',
              border: '1px solid var(--theme-popover-border, var(--theme-border))',
            }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.25)',
                boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.12)',
              }}
            >
              <Trash2 size={18} className="text-red-400" strokeWidth={1.8} />
            </div>
            <h3 className="text-[15.5px] font-bold text-[var(--theme-text)] tracking-tight mb-1.5">Sunucuyu Sil</h3>
            <p className="text-[11.5px] text-[var(--theme-secondary-text)]/70 leading-relaxed mb-5">
              <strong className="text-[var(--theme-text)]/90">{server.name}</strong> ve tüm verileri kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--theme-secondary-text)]/55 mb-2">
              Onay için sunucu adını yaz
            </label>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={server.name}
              autoFocus
              className={
                INPUT_BASE +
                ' !border-red-500/25 focus:!border-red-500/55 focus:!shadow-[0_0_0_4px_rgba(239,68,68,0.10)] focus:!bg-red-500/[0.04]'
              }
            />
            <label className="block text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--theme-secondary-text)]/55 mt-4 mb-2">
              Hesap parolanı gir
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={e => {
                setDeletePassword(e.target.value);
                if (deletePasswordError) setDeletePasswordError('');
              }}
              placeholder="Parola"
              autoComplete="current-password"
              className={
                INPUT_BASE +
                ' !border-red-500/25 focus:!border-red-500/55 focus:!shadow-[0_0_0_4px_rgba(239,68,68,0.10)] focus:!bg-red-500/[0.04]'
              }
            />
            {deletePasswordError && (
              <p className="mt-2 text-[11px] font-medium text-red-400">
                {deletePasswordError}
              </p>
            )}
            <div className="flex gap-2 justify-end mt-5">
              <GhostButton onClick={closeDeleteModal}>
                Vazgeç
              </GhostButton>
              <DangerButton
                onClick={async () => {
                  setDeleting(true);
                  setDeletePasswordError('');
                  try {
                    await verifyCurrentPassword(deletePassword);
                    await onDelete();
                    closeDeleteModal();
                  } catch (err: any) {
                    setDeletePasswordError(err?.message || 'Parola doğrulanamadı');
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleteConfirm !== server.name || !deletePassword || deleting}
              >
                {deleting ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}
              </DangerButton>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════ Ayrılma Modal ═════════════ */}
      {leaveModal && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(10,15,25,0.55)', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
          onClick={() => setLeaveModal(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-[22px] p-6 animate-[modalIn_220ms_cubic-bezier(0.22,1,0.36,1)]"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--theme-popover-bg, var(--surface-elevated))',
              boxShadow:
                'var(--surface-floating-shadow, 0 20px 60px rgba(0,0,0,0.25))',
              border: '1px solid var(--theme-popover-border, var(--theme-border))',
            }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.20)',
                boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.08)',
              }}
            >
              <LogOut size={18} className="text-red-400" strokeWidth={1.8} />
            </div>
            <h3 className="text-[15.5px] font-bold text-[var(--theme-text)] tracking-tight mb-1.5">Sunucudan Ayrıl</h3>
            <p className="text-[11.5px] text-[var(--theme-secondary-text)]/70 leading-relaxed mb-5">
              <strong className="text-[var(--theme-text)]/90">{server.name}</strong> sunucusundan ayrılmak istediğinden emin misin? Tekrar katılmak için davet gerekir.
            </p>
            <div className="flex gap-2 justify-end">
              <GhostButton onClick={() => setLeaveModal(false)}>
                Vazgeç
              </GhostButton>
              <DangerButton
                onClick={async () => { setLeaving(true); try { await onLeave(); } finally { setLeaving(false); } }}
                disabled={leaving}
              >
                {leaving ? 'Ayrılıyor...' : 'Ayrıl'}
              </DangerButton>
            </div>
          </div>
        </div>
      )}

      {/* Avatar crop */}
      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={async blob => {
            setCropSrc(null); setLogoLoading(true);
            try {
              const url = await uploadServerLogo(server.id, new File([blob], 'logo.jpg', { type: 'image/jpeg' }));
              await onSave({ avatarUrl: url });
              showToast('Logo güncellendi');
            } catch { showToast('Logo yüklenemedi'); }
            finally { setLogoLoading(false); }
          }}
        />
      )}

      {/* Local keyframes + interaction utilities */}
      <style>{`
        .generalTab { --ease: cubic-bezier(0.22, 1, 0.36, 1); }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0);    }
        }

        /* Inputs — borderless inset ring + focus accent */
        .gtInput {
          background: rgba(var(--glass-tint),0.03);
          box-shadow: inset 0 0 0 1px rgba(var(--glass-tint),0.08);
          transition: background 180ms var(--ease), box-shadow 220ms var(--ease);
        }
        .gtInput:hover:not(:disabled):not(:focus) {
          background: rgba(var(--glass-tint),0.04);
          box-shadow: inset 0 0 0 1px rgba(var(--glass-tint),0.12);
        }
        .gtInput:focus {
          background: rgba(var(--glass-tint),0.045);
          box-shadow:
            inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.28),
            0 0 0 4px rgba(var(--theme-accent-rgb),0.08);
        }

        /* Segmented buttons */
        .gtSegBtn {
          transition:
            background 200ms var(--ease) 40ms,
            color 200ms var(--ease) 40ms,
            box-shadow 220ms var(--ease);
        }
        .gtSegBtn:hover:not(:disabled) {
          color: var(--theme-text);
        }
        .gtSegBtn:active:not(:disabled) { transform: scale(0.97); }
        .gtSegBtn:focus-visible {
          outline: none;
          box-shadow:
            inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.32),
            0 0 0 4px rgba(var(--theme-accent-rgb),0.08) !important;
        }

        /* Pressable buttons (Danger + Ghost) */
        .gtPressable {
          transition:
            filter 180ms var(--ease),
            background 180ms var(--ease),
            transform 140ms var(--ease);
        }
        .gtPressable:hover:not(:disabled) { filter: brightness(1.08); }
        .gtPressable:active:not(:disabled) { transform: scale(0.97); }
        .gtPressable:focus-visible {
          outline: none;
          box-shadow:
            inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.32),
            0 0 0 4px rgba(var(--theme-accent-rgb),0.08) !important;
        }

        /* Icon button (slug copy) */
        .gtIconBtn {
          transition: background 180ms var(--ease), color 180ms var(--ease);
        }
        .gtIconBtn:hover {
          color: var(--theme-accent);
          background: rgba(var(--theme-accent-rgb),0.08);
        }
        .gtIconBtn:active { transform: scale(0.94); }

        /* Avatar hover scale — subtle */
        .gtAvatar {
          transition: transform 180ms var(--ease);
        }
        .gtAvatar:not(:disabled):hover { transform: scale(1.02); }
        .gtAvatar:not(:disabled):active { transform: scale(0.98); }

        /* AI Insight — calm, low weight */
        @keyframes gtInsightIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .gtInsight {
          animation: gtInsightIn 140ms ease-out;
          transition: color 150ms ease, opacity 150ms ease;
        }
        .gtInsight:hover {
          color: var(--theme-accent) !important;
        }
      `}</style>
    </div>
  );
}
