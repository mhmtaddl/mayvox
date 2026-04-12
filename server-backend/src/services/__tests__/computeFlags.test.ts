import { describe, it, expect } from 'vitest';
import { computeFlags } from '../accessContextService';
import { CAPABILITIES } from '../../capabilities';

describe('computeFlags — centralized flag derivation', () => {
  it('tüm capability yoksa tüm flag false', () => {
    const flags = computeFlags(new Set(), {}, 0);
    expect(flags.canCreateChannel).toBe(false);
    expect(flags.canUpdateChannel).toBe(false);
    expect(flags.canManageServer).toBe(false);
    expect(flags.canManageRoles).toBe(false);
  });

  it('CHANNEL_CREATE capability → canCreateChannel true (limit undefined)', () => {
    const flags = computeFlags(new Set([CAPABILITIES.CHANNEL_CREATE]), {}, 0);
    expect(flags.canCreateChannel).toBe(true);
  });

  it('CHANNEL_CREATE ama plan limitini aştıysa false', () => {
    const flags = computeFlags(new Set([CAPABILITIES.CHANNEL_CREATE]), { maxChannels: 2 }, 20);
    expect(flags.canCreateChannel).toBe(false);
  });

  it('CHANNEL_CREATE ama limit+buffer içinde ise true', () => {
    const flags = computeFlags(new Set([CAPABILITIES.CHANNEL_CREATE]), { maxChannels: 2 }, 5);
    expect(flags.canCreateChannel).toBe(true);
  });

  it('admin cap seti tam — rol.manage hariç hepsi true', () => {
    const caps = new Set([
      CAPABILITIES.SERVER_MANAGE,
      CAPABILITIES.CHANNEL_CREATE,
      CAPABILITIES.CHANNEL_UPDATE,
      CAPABILITIES.CHANNEL_DELETE,
      CAPABILITIES.CHANNEL_REORDER,
      CAPABILITIES.CHANNEL_JOIN_PRIVATE,
      CAPABILITIES.CHANNEL_VIEW_PRIVATE,
      CAPABILITIES.INVITE_CREATE,
      CAPABILITIES.INVITE_REVOKE,
      CAPABILITIES.MEMBER_MOVE,
      CAPABILITIES.MEMBER_KICK,
    ]);
    const flags = computeFlags(caps, {}, 0);
    expect(flags.canManageServer).toBe(true);
    expect(flags.canReorderChannels).toBe(true);
    expect(flags.canCreateInvite).toBe(true);
    expect(flags.canKickMembers).toBe(true);
    expect(flags.canManageRoles).toBe(false); // admin role.manage yok
  });

  it('moderator: member.kick+move var, channel.create yok', () => {
    const caps = new Set([CAPABILITIES.MEMBER_KICK, CAPABILITIES.MEMBER_MOVE, CAPABILITIES.INVITE_REVOKE]);
    const flags = computeFlags(caps, {}, 0);
    expect(flags.canKickMembers).toBe(true);
    expect(flags.canMoveMembers).toBe(true);
    expect(flags.canRevokeInvite).toBe(true);
    expect(flags.canCreateChannel).toBe(false);
    expect(flags.canCreateInvite).toBe(false);
  });
});
