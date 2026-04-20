import React, { useState, useRef } from 'react';
import {
  Save, Trash2, Camera, Copy, Check,
  Globe, Lock, Mail, UserPlus, LogOut,
} from 'lucide-react';
import { type Server } from '../../../lib/serverService';
import { uploadServerLogo } from '../../../lib/supabase';
import AvatarCropModal from '../../AvatarCropModal';
import { fmtDate } from './shared';

interface Props {
  server: Server;
  canEdit: boolean;
  isOwner: boolean;
  onSave: (u: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
  onLeave: () => Promise<void>;
  showToast: (m: string) => void;
}

// ══════════════════════════════════════════════════════════════════
// Design tokens — local, premium glassmorphism + 8pt grid
// ══════════════════════════════════════════════════════════════════

const INPUT_BASE =
  'w-full h-11 bg-[rgba(var(--glass-tint),0.035)] border border-[rgba(var(--glass-tint),0.08)] ' +
  'rounded-xl px-4 text-[13px] text-[var(--theme-text)] tracking-tight ' +
  'placeholder:text-[var(--theme-secondary-text)]/30 ' +
  'outline-none transition-all duration-200 ease-out ' +
  'hover:border-[rgba(var(--glass-tint),0.14)] ' +
  'focus:border-[var(--theme-accent)]/45 focus:bg-[rgba(var(--glass-tint),0.055)] ' +
  'focus:shadow-[0_0_0_4px_rgba(var(--theme-accent-rgb),0.08)] ' +
  'disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:border-[rgba(var(--glass-tint),0.08)]';

const CARD_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(var(--glass-tint), 0.045), rgba(var(--glass-tint), 0.02))',
  border: '1px solid rgba(var(--glass-tint), 0.08)',
  boxShadow:
    '0 1px 2px rgba(0,0,0,0.04), ' +
    '0 8px 24px rgba(0,0,0,0.08), ' +
    'inset 0 1px 0 rgba(var(--glass-tint), 0.05)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const PRIMARY_BTN_STYLE: React.CSSProperties = {
  background: 'var(--theme-accent)',
  color: 'var(--theme-text-on-accent, #000)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.22), ' +
    'inset 0 -1px 0 rgba(0,0,0,0.08), ' +
    '0 1px 2px rgba(0,0,0,0.08), ' +
    '0 6px 18px rgba(var(--theme-accent-rgb), 0.28)',
};

const DANGER_BTN_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgb(239,68,68), rgb(220,38,38))',
  color: '#fff',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.18), ' +
    'inset 0 -1px 0 rgba(0,0,0,0.12), ' +
    '0 1px 2px rgba(0,0,0,0.10), ' +
    '0 6px 18px rgba(239,68,68,0.30)',
};

// ══════════════════════════════════════════════════════════════════
// Primitives (local)
// ══════════════════════════════════════════════════════════════════

function GlassCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6" style={CARD_STYLE}>
      <header className="flex items-baseline justify-between mb-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/70">
          {title}
        </h3>
        {hint && (
          <span className="text-[10.5px] text-[var(--theme-secondary-text)]/45 truncate ml-4">{hint}</span>
        )}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children, locked }: { label: string; children: React.ReactNode; locked?: boolean }) {
  return (
    <div className={locked ? 'opacity-50 pointer-events-none' : ''}>
      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.10em] text-[var(--theme-secondary-text)]/55 mb-2">
        {label}
      </label>
      {children}
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
      className="inline-flex p-1 rounded-xl w-full"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.07)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
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
            className={`relative flex-1 h-9 px-3 rounded-lg text-[12px] font-semibold transition-all duration-200 ease-out inline-flex items-center justify-center gap-2 ${
              active
                ? 'text-[var(--theme-text)]'
                : 'text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)]/85'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            style={active ? {
              background: 'linear-gradient(180deg, rgba(var(--glass-tint), 0.16), rgba(var(--glass-tint), 0.08))',
              boxShadow:
                'inset 0 1px 0 rgba(var(--glass-tint), 0.14), ' +
                '0 1px 2px rgba(0,0,0,0.08), ' +
                '0 2px 6px rgba(0,0,0,0.04)',
            } : undefined}
          >
            <span className={active ? 'text-[var(--theme-accent)]' : ''}>{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCell({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-4"
      style={{
        background: 'linear-gradient(180deg, rgba(var(--glass-tint), 0.035), rgba(var(--glass-tint), 0.015))',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.05)',
      }}
    >
      {/* accent-row için üst şerit */}
      {accent && (
        <span
          className="absolute inset-x-4 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.40), transparent)' }}
        />
      )}
      <div className={`${small ? 'text-[13px]' : 'text-[18px]'} font-bold tabular-nums tracking-tight ${accent ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>
        {value}
      </div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/50 mt-1">
        {label}
      </div>
    </div>
  );
}

function PrimaryButton({
  onClick, disabled, icon, children,
}: { onClick: () => void; disabled?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-[13px] font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.97] hover:brightness-[1.06] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:scale-100"
      style={PRIMARY_BTN_STYLE}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function DangerButton({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-[12.5px] font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.97] hover:brightness-[1.08] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:scale-100"
      style={DANGER_BTN_STYLE}
    >
      {children}
    </button>
  );
}

function GhostButton({
  onClick, children, tone = 'neutral',
}: { onClick: () => void; children: React.ReactNode; tone?: 'neutral' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-[12.5px] font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.97] ${
        tone === 'danger'
          ? 'bg-red-500/[0.08] text-red-300 hover:bg-red-500/[0.14] hover:text-red-200 border border-red-500/20 hover:border-red-500/30'
          : 'bg-[rgba(var(--glass-tint),0.05)] text-[var(--theme-text)]/75 hover:bg-[rgba(var(--glass-tint),0.10)] hover:text-[var(--theme-text)] border border-[rgba(var(--glass-tint),0.08)]'
      }`}
    >
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// GENEL — UI redesign (logic 1:1 korunuyor)
// ══════════════════════════════════════════════════════════════════

export default function GeneralTab({ server, canEdit, isOwner, onSave, onDelete, onLeave, showToast }: Props) {
  const [name, setName] = useState(server.name);
  const [desc, setDesc] = useState(server.description);
  const [motto, setMotto] = useState(server.motto ?? '');
  const [isPublic, setIsPublic] = useState(server.isPublic ?? true);
  const [joinPolicy, setJoinPolicy] = useState(server.joinPolicy ?? 'invite_only');
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
    await onSave(u); setSaving(false);
  };

  const nameChanged = name.trim() !== server.name;
  const realSlug = (server.slug || '').replace(/\.mv$/, '');
  const shownSlug = nameChanged ? autoSlug : (realSlug || autoSlug);

  const handleCopySlug = () => {
    navigator.clipboard.writeText((shownSlug || '') + '.mv');
    setCopied(true);
    showToast('Adres kopyalandı');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6 pb-4">
      {/* ═════════════ Card 1 — Sunucu Kimliği ═════════════ */}
      <GlassCard title="Sunucu Kimliği" hint="Görünür isim ve tanıtım metinleri">
        <div className="flex items-start gap-5">
          {/* Avatar dropzone */}
          <button
            type="button"
            onClick={() => canEdit && logoRef.current?.click()}
            disabled={!canEdit}
            className="group relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 transition-all duration-200 ease-out disabled:cursor-not-allowed enabled:hover:scale-[1.02] enabled:active:scale-[0.98]"
            style={{
              background: server.avatarUrl
                ? 'transparent'
                : 'linear-gradient(180deg, rgba(var(--theme-accent-rgb), 0.10), rgba(var(--theme-accent-rgb), 0.04))',
              border: `1px ${server.avatarUrl ? 'solid' : 'dashed'} rgba(var(--theme-accent-rgb), ${server.avatarUrl ? '0.12' : '0.22'})`,
              boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.06), 0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {server.avatarUrl
              ? <img src={server.avatarUrl} alt="" className="w-full h-full object-cover" />
              : <span className="flex items-center justify-center w-full h-full text-[22px] font-bold text-[var(--theme-accent)]/60 tracking-tight">{server.shortName}</span>
            }
            {canEdit && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
                {logoLoading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={18} className="text-white" strokeWidth={1.8} />}
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

          <div className="flex-1 min-w-0 space-y-3">
            <Field label="Sunucu Adı" locked={!canEdit}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={15}
                disabled={!canEdit}
                className={INPUT_BASE}
              />
            </Field>

            {/* Adres önizleme */}
            <div
              className="group flex items-center gap-3 h-11 pl-4 pr-2 rounded-xl transition-all duration-200 hover:border-[rgba(var(--theme-accent-rgb),0.20)]"
              style={{
                background: 'rgba(var(--theme-accent-rgb), 0.04)',
                border: '1px solid rgba(var(--theme-accent-rgb), 0.12)',
              }}
            >
              <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/55 uppercase tracking-[0.18em] shrink-0">
                Adres
              </span>
              <div className="h-4 w-px shrink-0" style={{ background: 'rgba(var(--theme-accent-rgb), 0.18)' }} />
              <span className="text-[12.5px] font-mono font-semibold text-[var(--theme-accent)] flex-1 truncate">
                {shownSlug || '...'}<span className="opacity-55">.mv</span>
                {nameChanged && <span className="opacity-50 ml-1.5 text-[10.5px] font-sans not-italic">(önizleme)</span>}
              </span>
              <button
                type="button"
                onClick={handleCopySlug}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-all duration-150 active:scale-[0.92] shrink-0"
                aria-label="Adresi kopyala"
              >
                {copied ? <Check size={13} strokeWidth={2.5} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
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
      </GlassCard>

      {/* ═════════════ Card 2 — Erişim ═════════════ */}
      <GlassCard title="Erişim" hint="Sunucunun nasıl bulunabildiği ve katılım kuralları">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Görünürlük" locked={!canEdit}>
            <Segmented<'public' | 'private'>
              value={isPublic ? 'public' : 'private'}
              disabled={!canEdit}
              onChange={v => setIsPublic(v === 'public')}
              options={[
                { value: 'public', label: 'Açık', icon: <Globe size={13} strokeWidth={1.8} /> },
                { value: 'private', label: 'Gizli', icon: <Lock size={13} strokeWidth={1.8} /> },
              ]}
            />
          </Field>
          <Field label="Katılım" locked={!canEdit}>
            <Segmented<'invite_only' | 'open'>
              value={joinPolicy === 'open' ? 'open' : 'invite_only'}
              disabled={!canEdit}
              onChange={v => setJoinPolicy(v)}
              options={[
                { value: 'invite_only', label: 'Davetli', icon: <Mail size={13} strokeWidth={1.8} /> },
                { value: 'open', label: 'Açık', icon: <UserPlus size={13} strokeWidth={1.8} /> },
              ]}
            />
          </Field>
        </div>
      </GlassCard>

      {/* ═════════════ Card 3 — Plan ve Kapasite ═════════════ */}
      <GlassCard
        title="Plan ve Kapasite"
        hint={server.plan === 'ultra' ? 'Maksimum tier' : 'Detay için Özet sekmesi'}
      >
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="Plan" value={(server.plan ?? 'free').toUpperCase()} accent />
          <StatCell label="Üye Kapasitesi" value={String(server.capacity)} />
          <StatCell label="Kuruluş" value={fmtDate(server.createdAt)} small />
        </div>
      </GlassCard>

      {/* ═════════════ Save area (dirty olduğunda) ═════════════ */}
      {canEdit && dirty && (
        <div
          className="flex items-center justify-between gap-4 rounded-2xl px-5 py-3 animate-[fadeIn_200ms_ease-out]"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb), 0.06), rgba(var(--theme-accent-rgb), 0.025))',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.18)',
            boxShadow: 'inset 0 1px 0 rgba(var(--theme-accent-rgb), 0.08), 0 4px 14px rgba(var(--theme-accent-rgb), 0.10)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex shrink-0">
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-[var(--theme-accent)] opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--theme-accent)]" />
            </span>
            <span className="text-[12px] font-semibold text-[var(--theme-text)]/85 truncate">
              Kaydedilmemiş değişiklikler var
            </span>
          </div>
          <PrimaryButton
            onClick={save}
            disabled={saving}
            icon={<Save size={14} strokeWidth={2} />}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </PrimaryButton>
        </div>
      )}

      {/* ═════════════ Tehlikeli Bölge ═════════════ */}
      <section className="pt-2 space-y-3">
        <header className="flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-red-500/60" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-400/90">Tehlikeli Bölge</h3>
        </header>

        {isOwner ? (
          <div
            className="rounded-2xl p-5 flex items-center justify-between gap-4"
            style={{
              background: 'linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))',
              border: '1px solid rgba(239,68,68,0.22)',
              boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.08), 0 4px 14px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.22)',
                  boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.10)',
                }}
              >
                <Trash2 size={16} className="text-red-400" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-[var(--theme-text)] tracking-tight">Sunucuyu Sil</div>
                <div className="text-[11px] text-[var(--theme-secondary-text)]/70 mt-0.5 leading-snug">
                  Bu işlem geri alınamaz. Tüm kanallar, üyeler, mesajlar ve davetler kalıcı olarak silinir.
                </div>
              </div>
            </div>
            <DangerButton onClick={() => setDeleteModal(true)}>
              Sil
            </DangerButton>
          </div>
        ) : (
          <div
            className="rounded-2xl p-5 flex items-center justify-between gap-4"
            style={{
              background: 'linear-gradient(180deg, rgba(239,68,68,0.05), rgba(239,68,68,0.02))',
              border: '1px solid rgba(239,68,68,0.16)',
              boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.05)',
            }}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.18)',
                }}
              >
                <LogOut size={16} className="text-red-400" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-[var(--theme-text)] tracking-tight">Sunucudan Ayrıl</div>
                <div className="text-[11px] text-[var(--theme-secondary-text)]/70 mt-0.5 leading-snug">
                  Üyelik ve rollerin kaldırılır. Tekrar katılmak için davet gerekir.
                </div>
              </div>
            </div>
            <GhostButton onClick={() => setLeaveModal(true)} tone="danger">
              Ayrıl
            </GhostButton>
          </div>
        )}
      </section>

      {/* ═════════════ Silme Modal ═════════════ */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setDeleteModal(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-2xl p-6 animate-[modalIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, rgba(22,26,40,0.98), rgba(14,18,30,0.98))',
              border: '1px solid rgba(var(--glass-tint), 0.10)',
              boxShadow:
                '0 24px 60px rgba(0,0,0,0.55), ' +
                '0 8px 24px rgba(0,0,0,0.30), ' +
                'inset 0 1px 0 rgba(var(--glass-tint), 0.08)',
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
            <div className="flex gap-2 justify-end mt-5">
              <GhostButton onClick={() => { setDeleteModal(false); setDeleteConfirm(''); }}>
                Vazgeç
              </GhostButton>
              <DangerButton
                onClick={async () => { setDeleting(true); await onDelete(); }}
                disabled={deleteConfirm !== server.name || deleting}
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
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setLeaveModal(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-2xl p-6 animate-[modalIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, rgba(22,26,40,0.98), rgba(14,18,30,0.98))',
              border: '1px solid rgba(var(--glass-tint), 0.10)',
              boxShadow:
                '0 24px 60px rgba(0,0,0,0.55), ' +
                '0 8px 24px rgba(0,0,0,0.30), ' +
                'inset 0 1px 0 rgba(var(--glass-tint), 0.08)',
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

      {/* Local keyframes — Tailwind config'e eklenmediği için inline */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
