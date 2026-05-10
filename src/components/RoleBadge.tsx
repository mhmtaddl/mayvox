import { Crown, Shield, ShieldCheck, UserRound } from 'lucide-react';
import type { User } from '../types';

export type VisualRole = 'owner' | 'admin' | 'mod' | 'member';

type RoleLikeUser = Pick<User, 'isPrimaryAdmin' | 'isAdmin' | 'isModerator'> & {
  role?: string | null;
  is_primary_admin?: boolean;
  is_admin?: boolean;
  is_moderator?: boolean;
};

export function getUserRoleBadge(user?: RoleLikeUser | null): VisualRole {
  if (!user) return 'member';
  const explicitRole = String(user.role ?? '').toLowerCase();
  if (explicitRole === 'owner' || user.isPrimaryAdmin || user.is_primary_admin) return 'owner';
  if (explicitRole === 'admin' || user.isAdmin || user.is_admin) return 'admin';
  if (explicitRole === 'mod' || explicitRole === 'moderator' || user.isModerator || user.is_moderator) return 'mod';
  return 'member';
}

const ROLE_META = {
  owner: {
    label: 'Kurucu',
    short: 'Owner',
    icon: Crown,
    className: 'border-amber-400/24 bg-amber-400/10 text-amber-300',
    inlineClassName: 'text-amber-300/72 hover:text-amber-300',
  },
  admin: {
    label: 'Yönetici',
    short: 'Admin',
    icon: ShieldCheck,
    className: 'border-cyan-400/22 bg-cyan-400/10 text-cyan-300',
    inlineClassName: 'text-cyan-300/72 hover:text-cyan-300',
  },
  mod: {
    label: 'Moderatör',
    short: 'Mod',
    icon: Shield,
    className: 'border-violet-400/22 bg-violet-400/10 text-violet-300',
    inlineClassName: 'text-violet-300/72 hover:text-violet-300',
  },
  member: {
    label: 'Üye',
    short: 'Üye',
    icon: UserRound,
    className: 'border-[var(--theme-border)]/45 bg-[rgba(var(--glass-tint),0.035)] text-[var(--theme-secondary-text)]/70',
    inlineClassName: 'text-[var(--theme-secondary-text)]/55 hover:text-[var(--theme-secondary-text)]/78',
  },
} satisfies Record<VisualRole, { label: string; short: string; icon: typeof Crown; className: string; inlineClassName: string }>;

export default function RoleBadge({
  role,
  size = 'xs',
  showLabel = false,
  subtle = false,
  variant = 'badge',
}: {
  role: VisualRole;
  size?: 'xs' | 'sm';
  showLabel?: boolean;
  subtle?: boolean;
  variant?: 'badge' | 'inlineIcon';
}) {
  if (role === 'member' && !showLabel) return null;
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const compact = size === 'xs';
  const iconSize = compact ? 9 : 11;
  const label = meta.label;

  if (variant === 'inlineIcon') {
    return (
      <span
        title={label}
        aria-label={label}
        className={[
          'inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none transition-colors duration-150',
          subtle ? 'opacity-80 hover:opacity-100' : '',
          meta.inlineClassName,
        ].join(' ')}
      >
        <Icon size={compact ? 12 : 13} strokeWidth={2.25} />
        {showLabel && <span className="sr-only">{compact ? meta.short : label}</span>}
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-1 rounded-md border font-bold leading-none',
        compact ? 'h-4 min-w-4 px-1 text-[9px]' : 'h-5 min-w-5 px-1.5 text-[10px]',
        subtle ? 'opacity-82' : '',
        meta.className,
      ].join(' ')}
    >
      <Icon size={iconSize} strokeWidth={2.4} />
      {showLabel && <span>{compact ? meta.short : label}</span>}
    </span>
  );
}
