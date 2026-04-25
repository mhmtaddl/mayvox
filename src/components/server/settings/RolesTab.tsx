import React, { useEffect, useMemo, useState } from 'react';
import {
  Crown, Shield, ShieldCheck, ShieldPlus, ShieldAlert,
  User, UserCheck, Check, Lock, AlertCircle, Sparkles,
  ChevronDown, Hash, Mic, Server, UserCog, Mail, ArrowRight,
} from 'lucide-react';
import { getServerRoles, type ServerRoleSummary } from '../../../lib/serverService';
import {
  bundleDisplayForRole,
  type BundleDisplay,
  type ServerRole,
  ROLE_LABEL,
  ROLE_SHORT,
  ROLE_DESCRIPTION,
  ROLE_DISPLAY_ORDER,
  rolesActorCanManage,
  normalizeRole,
  CAP_LABEL,
} from '../../../lib/permissionBundles';

interface Props { serverId: string; }

interface RoleMeta {
  icon: React.ReactNode;
  iconLg: React.ReactNode;
  accent: string;
  rgb: string;
  isSuper: boolean;
}

const ROLE_META: Record<ServerRole, RoleMeta> = {
  owner:        { icon: <Crown size={15} />,       iconLg: <Crown size={22} strokeWidth={1.8} />,       accent: '#f59e0b', rgb: '245,158,11',  isSuper: false },
  super_admin:  { icon: <ShieldPlus size={15} />,  iconLg: <ShieldPlus size={20} strokeWidth={1.9} />,  accent: '#1d4ed8', rgb: '29,78,216',   isSuper: true  },
  admin:        { icon: <Shield size={15} />,      iconLg: <Shield size={20} strokeWidth={1.9} />,      accent: '#2563eb', rgb: '37,99,235',   isSuper: false },
  super_mod:    { icon: <ShieldAlert size={15} />, iconLg: <ShieldAlert size={20} strokeWidth={1.9} />, accent: '#6d28d9', rgb: '109,40,217',  isSuper: true  },
  mod:          { icon: <ShieldCheck size={15} />, iconLg: <ShieldCheck size={20} strokeWidth={1.9} />, accent: '#7c3aed', rgb: '124,58,237',  isSuper: false },
  super_member: { icon: <UserCheck size={15} />,   iconLg: <UserCheck size={20} strokeWidth={1.9} />,   accent: '#475569', rgb: '71,85,105',   isSuper: true  },
  member:       { icon: <User size={15} />,        iconLg: <User size={20} strokeWidth={1.9} />,        accent: '#64748b', rgb: '100,116,139', isSuper: false },
};

// Capability kategorileri (Gelişmiş Yetkiler)
interface CapCategory { key: string; label: string; icon: React.ReactNode; caps: string[]; }
const CAP_CATEGORIES: CapCategory[] = [
  { key: 'server',   label: 'Sunucu',          icon: <Server size={12} />,  caps: ['server.view','server.join','server.manage','server.moderation.update'] },
  { key: 'roles',    label: 'Rol Yönetimi',    icon: <Crown size={12} />,   caps: ['role.manage','role.manage.lower','role.assign.lower','role.permissions.edit.lower'] },
  { key: 'members',  label: 'Üyeler',          icon: <UserCog size={12} />, caps: ['member.kick','member.move'] },
  { key: 'voice',    label: 'Ses Moderasyonu', icon: <Mic size={12} />,     caps: ['member.mute','member.timeout','member.room_kick','member.chat_ban'] },
  { key: 'channels', label: 'Kanallar',        icon: <Hash size={12} />,    caps: ['channel.create','channel.update','channel.delete','channel.reorder','channel.view_private','channel.join_private'] },
  { key: 'invites',  label: 'Davet',           icon: <Mail size={12} />,    caps: ['invite.create','invite.revoke'] },
];

// ServerRoleSummary synth — API'nin döndürmediği roller için placeholder.
// Backend migration 030 henüz uygulanmamışsa super_* rolleri ve mod (hâlâ 'moderator')
// API'de eksik olabilir. UI yine 7 rolü çizer, eksik olana "yüklenmedi" işareti koyar.
function synthRole(name: ServerRole): ServerRoleSummary {
  return {
    id: `synthetic-${name}`,
    name,
    memberCount: 0,
    capabilities: [],
  } as ServerRoleSummary;
}

export default function RolesTab({ serverId }: Props) {
  const [roles, setRoles] = useState<ServerRoleSummary[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ServerRole>('owner');

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

  // Role map — API response'unu wire formata normalleştir.
  // Backend roles.name hâlâ 'moderator' (migration 030 öncesi) dönebilir; normalizeRole
  // 'moderator' → 'mod' mapping'ini uygular. Bilinmeyen rol adları yok sayılır.
  const rolesByName = new Map<ServerRole, ServerRoleSummary>();
  for (const r of roles) {
    const norm = normalizeRole(r.name);
    // Bilinmeyen rol 'member'a fallback eder; ama API 'member' zaten gönderiyor olabilir —
    // dupe ÜZERİNE yazmayalım. Sadece wire adı API'de bire-bir eşleşirse set et.
    // Bu sayede bilinmeyen/bozuk satırlar member'ı ezmez.
    if (r.name === norm || (r.name === 'moderator' && norm === 'mod')) {
      rolesByName.set(norm, { ...r, name: norm });
    }
  }

  // Tam 7 rol — API'de yoksa synth placeholder.
  const fullRoles: ServerRoleSummary[] = ROLE_DISPLAY_ORDER.map(
    n => rolesByName.get(n) ?? synthRole(n),
  );
  const missing = new Set<ServerRole>(
    ROLE_DISPLAY_ORDER.filter(n => !rolesByName.has(n)),
  );

  const ownerRole = fullRoles.find(r => r.name === 'owner')!;
  const otherRoles = fullRoles.filter(r => r.name !== 'owner');
  const selectedRole = fullRoles.find(r => r.name === selected) ?? ownerRole;

  return (
    <div className="max-w-[1280px] mx-auto pb-4">
      <p className="text-[11.5px] text-[var(--theme-secondary-text)] leading-relaxed mb-4 px-1">
        Roller, kullanıcıların sunucuda neler yapabileceğini belirler. Bir rol seçerek yetkileri görüntüleyebilirsiniz.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3.5 items-start">
        {/* Sol — rol listesi (her zaman 7 satır) */}
        <aside
          className="rounded-2xl p-2.5"
          style={{
            background: 'var(--roles-layer-base)',
            boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.06)',
          }}
        >
          <div className="px-2 pt-1.5 pb-2.5">
            <div className="text-[11px] font-semibold text-[var(--theme-secondary-text)] uppercase" style={{ letterSpacing: '0.14em' }}>
              Roller
            </div>
          </div>

          {/* Owner — pinned */}
          <RoleListItem
            role={ownerRole}
            selected={selected === 'owner'}
            onSelect={() => setSelected('owner')}
            pinned
            unavailable={missing.has('owner')}
          />
          <div className="h-px my-2.5 mx-2" style={{ background: 'var(--roles-hairline)' }} />

          {/* Diğer 6 rol */}
          <ul className="space-y-1.5">
            {otherRoles.map(r => {
              const n = r.name as ServerRole;
              return (
                <li key={r.id}>
                  <RoleListItem
                    role={r}
                    selected={selected === n}
                    onSelect={() => setSelected(n)}
                    unavailable={missing.has(n)}
                  />
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Sağ — seçili rol detay paneli */}
        <RoleDetailsPanel role={selectedRole} unavailable={missing.has(selectedRole.name as ServerRole)} />
      </div>

      <style>{`
        /* ─── Layer tokens (3-seviye depth) ─── */
        :root {
          --roles-layer-base:     rgba(var(--glass-tint), 0.020);
          --roles-layer-surface:  rgba(var(--glass-tint), 0.035);
          --roles-layer-hover:    rgba(var(--glass-tint), 0.050);
          --roles-layer-top:      rgba(var(--glass-tint), 0.068);
          --roles-hairline:       rgba(var(--glass-tint), 0.070);
          /* Apple-grade easing */
          --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
          --ease-snap:   cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes roleFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .roleFadeIn { animation: roleFadeIn 260ms var(--ease-smooth); }

        @keyframes capExpandIn {
          from { opacity: 0; transform: translateY(-2px); max-height: 0; }
          to   { opacity: 1; transform: translateY(0);    max-height: 520px; }
        }
        .capExpandIn {
          animation: capExpandIn 220ms var(--ease-smooth);
          overflow: hidden;
        }

        /* ─── Role list item ─── */
        .roleItem {
          transition:
            background 240ms var(--ease-smooth) 40ms,
            box-shadow 280ms var(--ease-smooth),
            transform 160ms var(--ease-smooth);
        }
        .roleItem:hover {
          background: var(--roles-layer-hover) !important;
        }
        .roleItem:active {
          transform: scale(0.985);
          transition: transform 80ms var(--ease-snap);
        }
        .roleItem:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px rgba(var(--role-accent-rgb), 0.28),
            0 0 0 6px rgba(var(--role-accent-rgb), 0.08) !important;
        }

        /* ─── Bundle card ─── */
        .bundleCard {
          transition:
            background 200ms var(--ease-smooth) 50ms,
            box-shadow 220ms var(--ease-smooth),
            transform 200ms var(--ease-smooth),
            filter 200ms var(--ease-smooth),
            opacity 200ms var(--ease-smooth);
        }
        .bundleCard:hover {
          transform: translateY(-1px);
          filter: brightness(1.025);
          box-shadow: var(--bundle-hover-shadow, 0 4px 14px rgba(0,0,0,0.12));
        }
        .bundleCard:active {
          transform: translateY(0);
          filter: brightness(0.98);
          transition: transform 80ms var(--ease-snap), filter 80ms var(--ease-snap);
        }

        /* ─── Cap category row ─── */
        .capCategoryRow {
          transition: background 180ms var(--ease-smooth) 40ms;
        }
        .capCategoryRow:focus-visible {
          outline: none;
          box-shadow:
            inset 0 0 0 1px rgba(var(--glass-tint),0.08),
            0 0 0 2px rgba(var(--glass-tint),0.06);
        }

        /* ─── Typography rhythm ─── */
        .clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Sol panel — rol list item (kompakt)
// ══════════════════════════════════════════════════════════
function RoleListItem({
  role, selected, onSelect, pinned = false, unavailable = false,
}: {
  role: ServerRoleSummary;
  selected: boolean;
  onSelect: () => void;
  pinned?: boolean;
  unavailable?: boolean;
}) {
  const name = role.name as ServerRole;
  const meta = ROLE_META[name];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="roleItem w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left"
      style={{
        ['--role-accent-rgb' as string]: meta.rgb,
        ...(selected ? {
          background: `linear-gradient(180deg, rgba(${meta.rgb}, 0.095), rgba(${meta.rgb}, 0.025))`,
          boxShadow:
            `inset 0 1px 0 rgba(${meta.rgb}, 0.12), ` +
            `inset 0 0 0 1px rgba(${meta.rgb}, 0.15), ` +
            `0 0 0 3px rgba(${meta.rgb}, 0.04), ` +
            `0 4px 16px rgba(${meta.rgb}, 0.06)`,
          transform: 'scale(1.008)',
        } : meta.isSuper ? {
          background: 'var(--roles-layer-base)',
        } : {
          background: 'transparent',
        }),
      } as React.CSSProperties}
    >
      <div
        className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
        style={{
          background: selected
            ? `linear-gradient(160deg, rgba(${meta.rgb}, 0.18), rgba(${meta.rgb}, 0.08))`
            : `rgba(${meta.rgb}, 0.08)`,
          boxShadow: selected
            ? `inset 0 1px 0 rgba(${meta.rgb}, 0.18), 0 0 10px rgba(${meta.rgb}, 0.14)`
            : `inset 0 1px 0 rgba(${meta.rgb}, 0.08)`,
          color: meta.accent,
          opacity: unavailable ? 0.8 : 1,
        }}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12.5px] font-semibold text-[var(--theme-text)] truncate" style={{ opacity: 0.92 }}>
            {ROLE_LABEL[name]}
          </span>
          {pinned && (
            <span
              className="text-[9px] font-semibold uppercase px-1.5 py-[1px] rounded shrink-0"
              style={{
                background: `rgba(${meta.rgb}, 0.10)`,
                color: meta.accent,
                letterSpacing: '0.10em',
                opacity: 0.9,
              }}
            >
              Sahip
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-[var(--theme-secondary-text)] truncate mt-[2px] flex items-center gap-1 leading-relaxed">
          {unavailable && (
            <span
              className="w-1 h-1 rounded-full shrink-0"
              style={{ background: 'rgba(251,191,36,0.65)' }}
              aria-hidden="true"
            />
          )}
          <span className="truncate">
            {unavailable ? 'Henüz aktif değil' : ROLE_SHORT[name]}
          </span>
        </div>
      </div>
      <div
        className="text-[10.5px] font-medium tabular-nums shrink-0 px-2 py-0.5 rounded-md transition-colors"
        style={{
          color: selected ? meta.accent : 'var(--theme-secondary-text)',
          background: selected ? `rgba(${meta.rgb}, 0.08)` : 'rgba(var(--glass-tint),0.022)',
          opacity: unavailable ? 0.5 : selected ? 0.92 : 0.85,
        }}
      >
        {role.memberCount}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════
// Sağ panel — seçili rol detayı (kompakt)
// ══════════════════════════════════════════════════════════
function RoleDetailsPanel({ role, unavailable }: { role: ServerRoleSummary; unavailable: boolean }) {
  const name = role.name as ServerRole;
  const meta = ROLE_META[name];
  const bundles = bundleDisplayForRole(name);
  const caps = role.capabilities ?? [];
  const capSet = useMemo(() => new Set(caps), [caps]);
  const managedRoles = useMemo(() => rolesActorCanManage(name), [name]);
  const isMember = name === 'member';
  const visibleBundles = isMember ? bundles.filter(b => b.active) : bundles;

  return (
    <section
      key={role.id}
      className="roleFadeIn rounded-2xl overflow-hidden"
      style={{
        background: 'var(--roles-layer-surface)',
        boxShadow:
          'inset 0 1px 0 rgba(var(--glass-tint),0.06), ' +
          '0 6px 24px rgba(0,0,0,0.16)',
      }}
    >
      {/* Header — compact, borderless, soft radial accent behind icon */}
      <header
        className="relative overflow-hidden px-5 py-4"
        style={{
          background:
            `radial-gradient(circle at 32px 50%, rgba(${meta.rgb}, 0.11), transparent 160px), ` +
            `linear-gradient(135deg, rgba(${meta.rgb}, 0.05), transparent 70%)`,
          boxShadow: 'inset 0 -1px 0 var(--roles-hairline)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-[38px] h-[38px] rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: `linear-gradient(160deg, rgba(${meta.rgb}, 0.20), rgba(${meta.rgb}, 0.07))`,
              color: meta.accent,
              boxShadow:
                `inset 0 1px 0 rgba(${meta.rgb}, 0.20), ` +
                `0 0 16px rgba(${meta.rgb}, 0.14)`,
            }}
          >
            {meta.iconLg}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3
                className="text-[16px] font-semibold text-[var(--theme-text)] tracking-tight leading-tight"
                style={{ letterSpacing: '-0.01em' }}
              >
                {ROLE_LABEL[name]}
              </h3>
              {/* Üye sayısı — inline soft pill */}
              <span
                className="inline-flex items-center gap-1 text-[10.5px] font-medium tabular-nums px-2 py-0.5 rounded-md"
                style={{
                  background: `rgba(${meta.rgb}, 0.07)`,
                  color: meta.accent,
                  opacity: unavailable ? 0.55 : 0.9,
                }}
                title={`${role.memberCount} üye`}
              >
                {role.memberCount}
                <span className="text-[9px] font-medium uppercase opacity-55" style={{ letterSpacing: '0.08em' }}>üye</span>
              </span>
              {meta.isSuper && (
                <span
                  className="inline-flex items-center gap-1 text-[9px] font-medium uppercase px-1.5 py-0.5 rounded-md"
                  style={{
                    background: `rgba(${meta.rgb}, 0.08)`,
                    color: meta.accent,
                    opacity: 0.85,
                    letterSpacing: '0.10em',
                  }}
                  title="Aynı seviyedeki standart rolden daha güçlü"
                >
                  <Sparkles size={9} strokeWidth={2} /> Üst Düzey
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 text-[9px] font-medium uppercase px-1.5 py-0.5 rounded-md"
                style={{
                  background: 'rgba(var(--glass-tint),0.028)',
                  color: 'var(--theme-secondary-text)',
                  letterSpacing: '0.10em',
                }}
                title="Sistem rolleri düzenlenemez"
              >
                <Lock size={9} strokeWidth={2} /> Sistem
              </span>
              {unavailable && (
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-normal normal-case pl-1.5 pr-2 py-0.5 rounded-md"
                  style={{
                    background: 'rgba(251,191,36,0.04)',
                    color: 'rgba(251,191,36,0.70)',
                  }}
                  title="Bu rol sunucuya henüz aktif değil"
                >
                  <span
                    className="w-1 h-1 rounded-full inline-block"
                    style={{ background: 'rgba(251,191,36,0.65)', boxShadow: '0 0 3px rgba(251,191,36,0.4)' }}
                    aria-hidden="true"
                  />
                  Henüz aktif değil
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-[var(--theme-secondary-text)] leading-relaxed mt-1 clamp-1 max-w-[640px]">
              {ROLE_DESCRIPTION[name]}
            </p>
          </div>
        </div>
      </header>

      {/* Hızlı Yetkiler — primary (borderless soft glow) */}
      {visibleBundles.length > 0 && (
        <div className="px-5 pt-5 pb-2">
          <SectionLabel accent={meta.accent} prominent>Hızlı Yetkiler</SectionLabel>
          <div
            className="mt-3 p-2.5 rounded-2xl"
            style={{
              background: `linear-gradient(180deg, rgba(${meta.rgb}, 0.030), rgba(${meta.rgb}, 0.006))`,
              boxShadow:
                `inset 0 1px 0 rgba(${meta.rgb}, 0.07), ` +
                `inset 0 0 0 1px rgba(${meta.rgb}, 0.07), ` +
                `0 0 28px rgba(${meta.rgb}, 0.035)`,
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {visibleBundles.map(b => (
                <BundleCard key={b.bundle} data={b} accent={meta.accent} rgb={meta.rgb} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Yönetebildiği Roller — secondary */}
      <div className="px-5 pt-5 pb-2">
        <SectionLabel>Yönetebildiği Roller</SectionLabel>
        {managedRoles.length === 0 ? (
          <div className="mt-2.5 px-1 text-[11.5px] text-[var(--theme-secondary-text)] leading-relaxed">
            Bu rol diğer kullanıcıların rollerini yönetemez.
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {managedRoles.map((r, i) => {
              const m = ROLE_META[r];
              return (
                <React.Fragment key={r}>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[10.5px] font-medium transition-colors"
                    style={{
                      background: `rgba(${m.rgb}, 0.07)`,
                      color: m.accent,
                      opacity: 0.88,
                    }}
                  >
                    <span className="shrink-0" style={{ transform: 'scale(0.75)', display: 'inline-flex', opacity: 0.9 }}>{m.icon}</span>
                    {ROLE_LABEL[r]}
                  </span>
                  {i < managedRoles.length - 1 && (
                    <ArrowRight size={9} className="text-[var(--theme-secondary-text)]/45 shrink-0" strokeWidth={2} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Tüm Yetkiler — tertiary (advanced reference) */}
      <div className="px-5 pt-5 pb-6" style={{ opacity: 0.8 }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[11px] font-semibold text-[var(--theme-secondary-text)] uppercase" style={{ letterSpacing: '0.14em' }}>
            Tüm Yetkiler
          </span>
          <span className="text-[10.5px] font-medium text-[var(--theme-secondary-text)]/75 tabular-nums">
            ({caps.length})
          </span>
          <span className="text-[10.5px] font-medium text-[var(--theme-secondary-text)]/70 ml-1 normal-case tracking-normal italic">
            · gelişmiş
          </span>
        </div>

        {caps.length === 0 ? (
          <div
            className="mt-2.5 px-3 py-3 rounded-lg text-center text-[11px] text-[var(--theme-secondary-text)] leading-relaxed"
            style={{ background: 'rgba(var(--glass-tint),0.012)' }}
          >
            {unavailable
              ? 'Bu rol sunucuda henüz aktif değil.'
              : 'Özel yetki yok — yalnızca temel erişim.'}
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {CAP_CATEGORIES.map(cat => {
              const present = cat.caps.filter(c => capSet.has(c));
              if (isMember && present.length === 0) return null;
              return (
                <CapCategorySection
                  key={cat.key}
                  category={cat}
                  capSet={capSet}
                  accent={meta.accent}
                  rgb={meta.rgb}
                  minimalMode={isMember}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════
// Atoms (kompakt)
// ══════════════════════════════════════════════════════════

function SectionLabel({ children, accent, prominent = false }: { children: React.ReactNode; accent?: string; prominent?: boolean }) {
  if (prominent && accent) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="w-[3px] h-[12px] rounded-full shrink-0"
          style={{ background: accent, boxShadow: `0 0 6px ${accent}44` }}
          aria-hidden="true"
        />
        <span
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--theme-text)', letterSpacing: '0.14em', opacity: 0.9 }}
        >
          {children}
        </span>
      </div>
    );
  }
  return (
    <div
      className="text-[11px] font-semibold text-[var(--theme-secondary-text)] uppercase"
      style={{ letterSpacing: '0.14em' }}
    >
      {children}
    </div>
  );
}

function BundleCard({ data, accent, rgb }: { data: BundleDisplay; accent: string; rgb: string; key?: React.Key }) {
  const { label, hint, active, partialPending } = data;
  return (
    <div
      className="bundleCard flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
      style={active ? {
        background: `linear-gradient(180deg, rgba(${rgb}, 0.06), rgba(${rgb}, 0.018))`,
        boxShadow:
          `inset 0 1px 0 rgba(${rgb}, 0.10), ` +
          `inset 0 0 0 1px rgba(${rgb}, 0.12)`,
        ['--bundle-hover-shadow' as string]:
          `inset 0 1px 0 rgba(${rgb}, 0.14), ` +
          `inset 0 0 0 1px rgba(${rgb}, 0.18), ` +
          `0 4px 12px rgba(${rgb}, 0.085)`,
      } as React.CSSProperties : {
        background: 'var(--roles-layer-base)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.06)',
        opacity: 0.68,
      }}
      title={hint}
    >
      <div
        className="w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0"
        style={active ? {
          background: `linear-gradient(160deg, rgba(${rgb}, 0.20), rgba(${rgb}, 0.09))`,
          color: accent,
          boxShadow: `inset 0 1px 0 rgba(${rgb}, 0.18)`,
        } : {
          background: 'rgba(var(--glass-tint),0.028)',
          color: 'var(--theme-secondary-text)',
        }}
        aria-hidden="true"
      >
        {active ? <Check size={11} strokeWidth={2.6} /> : <Lock size={9} strokeWidth={2.2} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[12px] font-medium leading-snug truncate"
            style={{ color: active ? 'var(--theme-text)' : 'var(--theme-secondary-text)' }}
          >
            {label}
          </span>
          {partialPending && (
            <span
              className="text-[9px] font-semibold uppercase px-1.5 py-[1px] rounded shrink-0"
              style={{
                background: 'rgba(251,191,36,0.08)',
                color: 'rgba(251,191,36,0.85)',
                letterSpacing: '0.06em',
              }}
            >
              kısmi
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-[var(--theme-secondary-text)] clamp-1 leading-relaxed mt-[2px]">
          {hint}
        </div>
      </div>
    </div>
  );
}

function CapCategorySection({
  category, capSet, accent, rgb, minimalMode = false,
}: {
  category: CapCategory;
  capSet: Set<string>;
  accent: string;
  rgb: string;
  minimalMode?: boolean;
  key?: React.Key;
}) {
  const present = category.caps.filter(c => capSet.has(c));
  const hasAny = present.length > 0;
  // Default collapsed — daha az görsel gürültü, kullanıcı ilgilendiği kategoriyi açar
  const [open, setOpen] = useState(false);
  const renderCaps = minimalMode ? present : category.caps;

  return (
    <div
      className="rounded-lg overflow-hidden transition-colors"
      style={{ background: 'rgba(var(--glass-tint),0.012)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="capCategoryRow w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[rgba(var(--glass-tint),0.028)]"
      >
        <div
          className="w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0"
          style={{
            background: hasAny ? `rgba(${rgb}, 0.09)` : 'rgba(var(--glass-tint),0.022)',
            color: hasAny ? accent : 'var(--theme-secondary-text)',
            opacity: hasAny ? 0.9 : 1,
          }}
        >
          {category.icon}
        </div>
        <span className="text-[11.5px] font-medium text-[var(--theme-text)] flex-1 leading-relaxed">
          {category.label}
        </span>
        <span
          className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded"
          style={{
            background: hasAny ? `rgba(${rgb}, 0.10)` : 'rgba(var(--glass-tint),0.022)',
            color: hasAny ? accent : 'var(--theme-secondary-text)',
            letterSpacing: '0.04em',
          }}
        >
          {minimalMode ? `${present.length}` : `${present.length}/${category.caps.length}`}
        </span>
        <ChevronDown
          size={12}
          className="text-[var(--theme-secondary-text)] shrink-0"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms var(--ease-smooth)',
          }}
        />
      </button>

      {open && (
        <div className="px-3 pb-2.5 pt-1.5 flex flex-wrap gap-1 capExpandIn">
          {renderCaps.map(c => {
            const has = capSet.has(c);
            return (
              <span
                key={c}
                className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-[3px] rounded transition-colors"
                style={has ? {
                  background: `rgba(${rgb}, 0.07)`,
                  color: 'var(--theme-text)',
                } : {
                  background: 'rgba(var(--glass-tint),0.018)',
                  color: 'var(--theme-secondary-text)',
                }}
                title={c}
              >
                {has
                  ? <Check size={9} strokeWidth={2.6} style={{ color: accent }} />
                  : <Lock size={8} strokeWidth={2} />}
                {CAP_LABEL[c] ?? c}
              </span>
            );
          })}
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
      <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin" />
    </div>
  );
}
