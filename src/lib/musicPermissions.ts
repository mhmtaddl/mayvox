import type { MusicCapability, RoomMusicPermissions } from '../types';
import { normalizeRole, type ServerRole } from './permissionBundles';

const STAFF_ROLES = new Set<ServerRole>(['owner', 'super_admin', 'admin', 'super_mod', 'mod']);

export function isUltraServerPlan(serverPlan: unknown): boolean {
  return String(serverPlan ?? '').toLowerCase() === 'ultra';
}

export function isSuperMemberPlus(userLevel: unknown): boolean {
  const numeric = Number.parseInt(String(userLevel ?? ''), 10);
  return Number.isFinite(numeric) && numeric >= 2;
}

export function isMusicStaffRole(serverRole: unknown): boolean {
  return STAFF_ROLES.has(normalizeRole(serverRole));
}

export interface RoomMusicPermissionInput {
  serverPlan?: string | null;
  userLevel?: string | number | null;
  serverRole?: string | null;
}

export function getRoomMusicPermissions(input: RoomMusicPermissionInput): RoomMusicPermissions {
  const isUltra = isUltraServerPlan(input.serverPlan);
  const staff = isMusicStaffRole(input.serverRole);
  const superMemberPlus = isSuperMemberPlus(input.userLevel);
  const canControl = isUltra && (staff || superMemberPlus);
  const capabilities: MusicCapability[] = [];

  if (isUltra) {
    capabilities.push('music.listen', 'music.volume');
    if (canControl) {
      capabilities.push('music.control', 'music.skip', 'music.stop');
    }
    if (staff) {
      capabilities.push('music.manage_sources', 'music.queue.add', 'music.queue.priority');
    }
  }

  return {
    isUltra,
    locked: !isUltra,
    canListen: isUltra,
    canControl,
    canSkip: canControl,
    canStop: canControl,
    canChangeSource: canControl,
    canManageSources: isUltra && staff,
    canUseLocalVolume: isUltra,
    readOnly: isUltra && !canControl,
    capabilities,
  };
}
