import React from 'react';
import { type ServerMember } from '../../../lib/serverService';

// ══════════════════════════════════════
// Constants — input class, role labels, role tone classes
// ══════════════════════════════════════

export const IC = 'w-full bg-[rgba(var(--glass-tint),0.04)] border border-[rgba(var(--glass-tint),0.06)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/20 outline-none focus:border-[var(--theme-accent)]/20 transition-colors';

export const ROLE_CLS: Record<string, string> = {
  owner: 'bg-amber-500/12 text-amber-400',
  admin: 'bg-blue-500/12 text-blue-400',
  mod: 'bg-purple-500/12 text-purple-400',
  member: 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]/45',
};

// ══════════════════════════════════════
// Pure helpers
// ══════════════════════════════════════

export function fmtDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'][d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Göreli zaman (TR). Audit/Moderation/Overview paylaşımlı.
 * withDateFallback=true: 7 günden eski olaylar tarih olarak (örn "12 Mar 2026")
 * withDateFallback=false/varsayılan: hep "Xg önce"
 */
export function timeAgo(iso: string, opts: { withDateFallback?: boolean } = {}): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa önce`;
  if (s < 604800 || !opts.withDateFallback) return `${Math.floor(s / 86400)}g önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function displaySlug(slug: string): string {
  return slug.endsWith('.mv') ? slug : slug + '.mv';
}

export function memberDisplayName(m: ServerMember): string {
  if (m.username) return m.username;
  const full = [m.firstName, m.lastName].filter(Boolean).join(' ');
  return full || 'Kullanıcı';
}

export function memberInitials(m: ServerMember): string {
  if (m.firstName && m.lastName) return (m.firstName[0] + m.lastName[0]).toUpperCase();
  if (m.username) return m.username.slice(0, 2).toUpperCase();
  return '?';
}

// ══════════════════════════════════════
// UI primitives
// ══════════════════════════════════════

export function SettingsCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}
    >
      <div className="flex items-baseline justify-between mb-3.5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--theme-secondary-text)]/85">{title}</h3>
        {hint && <span className="text-[10px] text-[var(--theme-secondary-text)]/55 truncate ml-3">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function DangerSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="pt-2">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-1 h-3.5 rounded bg-red-500/60" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-400">Tehlikeli Bölge</h3>
      </div>
      {children}
    </section>
  );
}

export function Fld({ label, children, off }: { label: string; children: React.ReactNode; off?: boolean }) {
  return (
    <div className={off ? 'opacity-40 pointer-events-none' : ''}>
      <label className="block text-[11px] font-semibold text-[var(--theme-secondary-text)]/45 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function Pill({ a, o, children }: { a: boolean; o: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={o}
      className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
        a
          ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border border-[var(--theme-accent)]/15'
          : 'bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)]/30 border border-transparent hover:bg-[rgba(var(--glass-tint),0.06)]'
      }`}
    >
      {children}
    </button>
  );
}

export function IC2({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div
      className="p-3.5 rounded-xl text-center"
      style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}
    >
      <div className={`${small ? 'text-[12px]' : 'text-[16px]'} font-bold ${accent ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>{value}</div>
      <div className="text-[9px] text-[var(--theme-secondary-text)]/30 mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-[12px] text-[var(--theme-secondary-text)]/30">{text}</div>
      {sub && <div className="text-[10px] text-[var(--theme-secondary-text)]/20 mt-1.5">{sub}</div>}
    </div>
  );
}

export function Loader() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin" />
    </div>
  );
}
