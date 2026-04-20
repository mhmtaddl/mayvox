import React, { useEffect, useState } from 'react';
import {
  Crown, Shield, ShieldCheck, User, Check, Info, Sparkles,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { getServerRoles, type ServerRoleSummary } from '../../../lib/serverService';
import {
  bundleDisplayForRole,
  type BundleDisplay,
  type ServerRole,
  CAP_LABEL,
} from '../../../lib/permissionBundles';

interface Props { serverId: string; }

const ROLE_LABEL: Record<ServerRole, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  mod: 'Moderatör',
  member: 'Üye',
};

const ROLE_DESCRIPTION: Record<ServerRole, string> = {
  owner: 'Sunucunun yaratıcısı. Tüm yetkilere sahip, tek kişi.',
  admin: 'Sunucu ayarlarını düzenler, tam moderasyon yapar.',
  mod: 'Ses moderasyonu + davet yönetimi. Sunucu ayarlarına dokunamaz.',
  member: 'Varsayılan. Sesli kanallara katılır, mesaj gönderir.',
};

const ROLE_META: Record<ServerRole, { icon: React.ReactNode; accent: string; rgb: string }> = {
  owner: { icon: <Crown size={20} />, accent: '#f59e0b', rgb: '245,158,11' },
  admin: { icon: <Shield size={18} />, accent: '#60a5fa', rgb: '96,165,250' },
  mod: { icon: <ShieldCheck size={18} />, accent: '#a78bfa', rgb: '167,139,250' },
  member: { icon: <User size={18} />, accent: '#94a3b8', rgb: '148,163,184' },
};

export default function RolesTab({ serverId }: Props) {
  const [roles, setRoles] = useState<ServerRoleSummary[] | null>(null);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rs = await getServerRoles(serverId);
        if (!cancelled) setRoles(rs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Roller yüklenemedi');
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);

  if (error) return <ErrorBanner msg={error} />;
  if (!roles) return <Loading />;

  const owner = roles.find(r => r.name === 'owner');
  const adminRole = roles.find(r => r.name === 'admin');
  const modRole = roles.find(r => r.name === 'mod');
  const memberRole = roles.find(r => r.name === 'member');

  return (
    <div className="space-y-5 pb-4">
      {/* ── Info banner ── */}
      <div
        className="flex items-start gap-3 p-4 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.07), rgba(59,130,246,0.02))',
          border: '1px solid rgba(59,130,246,0.18)',
          boxShadow: 'inset 0 1px 0 rgba(59,130,246,0.08)',
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(59,130,246,0.14)',
            border: '1px solid rgba(59,130,246,0.22)',
          }}
        >
          <Info size={14} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[#e8ecf4] mb-0.5">
            Rol sistemi basit tutuldu
          </div>
          <div className="text-[11px] text-[#7b8ba8] leading-snug">
            4 sistem rolü sabit. Her rol otomatik yetki grupları alır — bireysel yetki değiştirme gerekmez.
            Rolleri <strong className="text-[#e8ecf4]/90">Üyeler</strong> sekmesinden ata.
          </div>
        </div>
      </div>

      {/* ── Owner bandı ── */}
      {owner && <OwnerBand role={owner} />}

      {/* ── 3 rol kartı ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {adminRole && <RoleCard role={adminRole} />}
        {modRole && <RoleCard role={modRole} />}
        {memberRole && <RoleCard role={memberRole} />}
      </div>

      {/* ── Gelişmiş Yetkiler (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setAdvancedOpen(v => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 hover:brightness-[1.08] active:scale-[0.995] text-left"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: advancedOpen ? 'inset 0 1px 0 rgba(255,255,255,0.05)' : undefined,
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Sparkles size={13} className="text-[#7b8ba8]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[#e8ecf4]">Gelişmiş Yetkiler</div>
            <div className="text-[10.5px] text-[#7b8ba8]/70 mt-0.5">
              Her rolün sahip olduğu ham capability listesi
            </div>
          </div>
          {advancedOpen
            ? <ChevronUp size={15} className="text-[#7b8ba8] shrink-0" />
            : <ChevronDown size={15} className="text-[#7b8ba8] shrink-0" />}
        </button>

        {advancedOpen && (
          <div
            className="mt-2 rounded-xl overflow-hidden animate-[expandIn_180ms_ease-out]"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {roles.map((r, idx) => (
              <AdvancedRoleRow
                key={r.id}
                role={r}
                isLast={idx === roles.length - 1}
              />
            ))}
          </div>
        )}

        <style>{`
          @keyframes expandIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Owner bandı — altın gradient, ayrı vurgu
// ══════════════════════════════════════════════════════════
function OwnerBand({ role }: { role: ServerRoleSummary }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03))',
        border: '1px solid rgba(245,158,11,0.28)',
        boxShadow:
          'inset 0 1px 0 rgba(245,158,11,0.14), ' +
          '0 6px 18px rgba(245,158,11,0.08)',
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(245,158,11,0.18)',
            border: '1px solid rgba(245,158,11,0.32)',
            color: '#fbbf24',
            boxShadow: 'inset 0 1px 0 rgba(245,158,11,0.18)',
          }}
        >
          <Crown size={22} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-[#e8ecf4] tracking-tight">{ROLE_LABEL.owner}</span>
            <span
              className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider"
              style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}
            >
              {role.memberCount === 1 ? 'Tek Kişi' : `${role.memberCount} kişi`}
            </span>
          </div>
          <div className="text-[11.5px] text-[#7b8ba8] mt-1 leading-snug">
            {ROLE_DESCRIPTION.owner}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Rol kartı — admin/mod/member
// ══════════════════════════════════════════════════════════
function RoleCard({ role }: { role: ServerRoleSummary }) {
  const name = role.name as ServerRole;
  const meta = ROLE_META[name] ?? ROLE_META.member;
  const bundles = bundleDisplayForRole(name);

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:brightness-[1.05]"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.05), ' +
          '0 4px 14px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <header className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `rgba(${meta.rgb}, 0.14)`,
            border: `1px solid rgba(${meta.rgb}, 0.24)`,
            color: meta.accent,
            boxShadow: `inset 0 1px 0 rgba(${meta.rgb}, 0.12)`,
          }}
        >
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-[#e8ecf4] tracking-tight">{ROLE_LABEL[name]}</div>
          <div className="text-[10px] text-[#7b8ba8]/70 mt-0.5 uppercase tracking-wider font-semibold">
            {role.memberCount} üye
          </div>
        </div>
      </header>

      <p className="text-[11.5px] text-[#7b8ba8] leading-relaxed">
        {ROLE_DESCRIPTION[name]}
      </p>

      <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

      {/* Bundle list */}
      {bundles.length === 0 ? (
        <div className="text-[10.5px] text-[#7b8ba8]/50 italic">
          Temel erişim — sesli kanallar, mesajlaşma
        </div>
      ) : (
        <ul className="space-y-1.5">
          {bundles.map(b => <BundleRow key={b.bundle} data={b} />)}
        </ul>
      )}
    </div>
  );
}

function BundleRow({ data }: { data: BundleDisplay; key?: React.Key }) {
  return (
    <li className="flex items-start gap-2" title={data.hint}>
      <span
        className={`w-4 h-4 rounded flex items-center justify-center mt-0.5 shrink-0 ${
          data.active
            ? 'bg-[rgba(59,130,246,0.15)] text-[#60a5fa]'
            : 'bg-[rgba(255,255,255,0.03)] text-[#7b8ba8]/25'
        }`}
      >
        {data.active && <Check size={10} strokeWidth={3} />}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
        <span
          className={`text-[11.5px] font-medium leading-snug ${
            data.active ? 'text-[#e8ecf4]/90' : 'text-[#7b8ba8]/35'
          }`}
        >
          {data.label}
        </span>
        {data.partialPending && (
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded"
            style={{
              background: 'rgba(251,191,36,0.12)',
              color: 'rgba(251,191,36,0.9)',
              border: '1px solid rgba(251,191,36,0.22)',
            }}
          >
            kısmi
          </span>
        )}
      </div>
    </li>
  );
}

// ══════════════════════════════════════════════════════════
// Gelişmiş Yetkiler — raw capability listesi
// ══════════════════════════════════════════════════════════
function AdvancedRoleRow({ role, isLast }: { role: ServerRoleSummary; isLast: boolean; key?: React.Key }) {
  const name = role.name as ServerRole;
  const meta = ROLE_META[name] ?? ROLE_META.member;
  const caps = role.capabilities ?? [];

  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: meta.accent }}>{meta.icon}</span>
        <span className="text-[11.5px] font-bold text-[#e8ecf4] tracking-tight">{ROLE_LABEL[name] ?? name}</span>
        <span className="ml-auto text-[9.5px] text-[#7b8ba8]/50 uppercase tracking-wider">
          {caps.length} yetki
        </span>
      </div>
      {caps.length === 0 ? (
        <div className="text-[10.5px] text-[#7b8ba8]/40 italic ml-1">Temel erişim (yetki atanmamış)</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {caps.map(c => (
            <span
              key={c}
              className="inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#e8ecf4',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              title={c}
            >
              {CAP_LABEL[c] ?? c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      className="flex items-center gap-2 p-3 rounded-lg text-[11px] text-red-400/85"
      style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
    >
      <AlertCircle size={12} />
      <span>{msg}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="w-5 h-5 border-2 border-[#60a5fa]/20 border-t-[#60a5fa] rounded-full animate-spin" />
    </div>
  );
}
