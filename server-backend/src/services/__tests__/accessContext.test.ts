import { describe, it, expect } from 'vitest';
import { CAPABILITIES, SYSTEM_ROLE_CAPS } from '../../capabilities';
import {
  legacyCapabilitiesFor,
  hasCapability,
  assertCapability,
  assertServerMember,
  type ServerAccessContext,
} from '../accessContextService';
import { AppError } from '../serverService';

function makeCtx(overrides: Partial<ServerAccessContext> = {}): ServerAccessContext {
  return {
    userId: 'u1',
    serverId: 's1',
    membership: { exists: true, isOwner: false, baseRole: 'member' },
    roles: [],
    capabilities: [],
    plan: { type: 'free' },
    limits: {},
    flags: {
      canCreateChannel: false,
      canUpdateChannel: false,
      canDeleteChannel: false,
      canReorderChannels: false,
      canManageServer: false,
      canCreateInvite: false,
      canRevokeInvite: false,
      canJoinPrivateChannel: false,
      canViewPrivateChannel: false,
      canMoveMembers: false,
      canKickMembers: false,
      canManageRoles: false,
    },
    ...overrides,
  };
}

describe('SYSTEM_ROLE_CAPS — built-in role mapping', () => {
  it('owner has all capabilities including role.manage', () => {
    expect(SYSTEM_ROLE_CAPS.owner).toContain(CAPABILITIES.ROLE_MANAGE);
    expect(SYSTEM_ROLE_CAPS.owner.length).toBe(Object.values(CAPABILITIES).length);
  });

  it('admin has everything except role.manage', () => {
    expect(SYSTEM_ROLE_CAPS.admin).not.toContain(CAPABILITIES.ROLE_MANAGE);
    expect(SYSTEM_ROLE_CAPS.admin).toContain(CAPABILITIES.CHANNEL_CREATE);
    expect(SYSTEM_ROLE_CAPS.admin).toContain(CAPABILITIES.INVITE_CREATE);
    expect(SYSTEM_ROLE_CAPS.admin).toContain(CAPABILITIES.SERVER_MANAGE);
  });

  it('moderator can kick/move + revoke invite but cannot manage server/channels', () => {
    expect(SYSTEM_ROLE_CAPS.moderator).toContain(CAPABILITIES.MEMBER_KICK);
    expect(SYSTEM_ROLE_CAPS.moderator).toContain(CAPABILITIES.MEMBER_MOVE);
    expect(SYSTEM_ROLE_CAPS.moderator).toContain(CAPABILITIES.INVITE_REVOKE);
    expect(SYSTEM_ROLE_CAPS.moderator).not.toContain(CAPABILITIES.SERVER_MANAGE);
    expect(SYSTEM_ROLE_CAPS.moderator).not.toContain(CAPABILITIES.CHANNEL_CREATE);
    expect(SYSTEM_ROLE_CAPS.moderator).not.toContain(CAPABILITIES.INVITE_CREATE);
  });

  it('member has only minimal view/join', () => {
    expect(SYSTEM_ROLE_CAPS.member).toEqual([
      CAPABILITIES.SERVER_VIEW,
      CAPABILITIES.SERVER_JOIN,
    ]);
  });
});

describe('legacyCapabilitiesFor — fallback for unbackfilled users', () => {
  it('owner → full set', () => {
    const caps = legacyCapabilitiesFor('owner');
    expect(caps).toContain(CAPABILITIES.ROLE_MANAGE);
    expect(caps.length).toBe(Object.values(CAPABILITIES).length);
  });

  it('admin → full minus role.manage', () => {
    const caps = legacyCapabilitiesFor('admin');
    expect(caps).not.toContain(CAPABILITIES.ROLE_MANAGE);
    expect(caps).toContain(CAPABILITIES.CHANNEL_CREATE);
  });

  it('mod legacy → moderator system caps', () => {
    const caps = legacyCapabilitiesFor('mod');
    expect(caps).toContain(CAPABILITIES.MEMBER_KICK);
    expect(caps).not.toContain(CAPABILITIES.CHANNEL_CREATE);
  });

  it('member → server.view + server.join', () => {
    const caps = legacyCapabilitiesFor('member');
    expect(caps).toEqual([CAPABILITIES.SERVER_VIEW, CAPABILITIES.SERVER_JOIN]);
  });

  it('unknown role → empty', () => {
    expect(legacyCapabilitiesFor('banana')).toEqual([]);
  });
});

describe('hasCapability', () => {
  it('returns true when capability in set', () => {
    const ctx = makeCtx({ capabilities: [CAPABILITIES.CHANNEL_CREATE] });
    expect(hasCapability(ctx, CAPABILITIES.CHANNEL_CREATE)).toBe(true);
  });

  it('returns false when capability missing', () => {
    const ctx = makeCtx({ capabilities: [CAPABILITIES.SERVER_VIEW] });
    expect(hasCapability(ctx, CAPABILITIES.CHANNEL_CREATE)).toBe(false);
  });
});

describe('assertServerMember', () => {
  it('passes when membership exists', () => {
    expect(() => assertServerMember(makeCtx())).not.toThrow();
  });

  it('throws 403 when membership missing', () => {
    const ctx = makeCtx({ membership: { exists: false, isOwner: false, baseRole: null } });
    try { assertServerMember(ctx); throw new Error('should have thrown'); }
    catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
    }
  });
});

describe('assertCapability', () => {
  it('passes when capability is present', () => {
    const ctx = makeCtx({ capabilities: [CAPABILITIES.CHANNEL_CREATE] });
    expect(() => assertCapability(ctx, CAPABILITIES.CHANNEL_CREATE)).not.toThrow();
  });

  it('throws 403 when capability missing', () => {
    const ctx = makeCtx({ capabilities: [CAPABILITIES.SERVER_VIEW] });
    try { assertCapability(ctx, CAPABILITIES.CHANNEL_CREATE); throw new Error('should have thrown'); }
    catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
    }
  });

  it('throws 403 when user is not a member (membership.exists=false)', () => {
    const ctx = makeCtx({
      membership: { exists: false, isOwner: false, baseRole: null },
      capabilities: [CAPABILITIES.CHANNEL_CREATE],
    });
    try { assertCapability(ctx, CAPABILITIES.CHANNEL_CREATE); throw new Error('should have thrown'); }
    catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
    }
  });
});
