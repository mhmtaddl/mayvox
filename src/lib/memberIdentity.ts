import type { User } from '../types';

type MemberUser = Pick<User, 'id' | 'name' | 'email' | 'firstName' | 'lastName'> & {
  username?: string | null;
  displayName?: string | null;
};

const seenDebugKeys = new Set<string>();

const isDev = Boolean(import.meta.env?.DEV);

const normalize = (value: string | null | undefined) =>
  (value || '').trim().toLocaleLowerCase('tr');

const fullNameOf = (user: MemberUser) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

export function resolveUserByMemberKey<T extends MemberUser>(
  memberKey: string | null | undefined,
  allUsers: T[],
): T | null {
  if (!memberKey) return null;
  const rawKey = String(memberKey).trim();
  if (!rawKey) return null;

  const byId = allUsers.find(u => u.id === rawKey);
  if (byId) return byId;

  const key = normalize(rawKey);
  return allUsers.find(u => (
    normalize(u.name) === key ||
    normalize(u.username) === key ||
    normalize(fullNameOf(u)) === key ||
    normalize(u.email) === key ||
    normalize(u.displayName) === key
  )) ?? null;
}

export function normalizeMemberKeysToUserIds(
  memberKeys: string[],
  allUsers: MemberUser[],
  debugSource?: string,
): string[] {
  const ids: string[] = [];
  for (const key of memberKeys) {
    const user = resolveUserByMemberKey(key, allUsers);
    if (user) {
      if (!ids.includes(user.id)) ids.push(user.id);
    } else {
      logMemberIdentityDebug('unresolved_member_key', { source: debugSource, memberKey: key });
    }
  }
  return ids;
}

export function logMemberIdentityDebug(
  event: string,
  details: Record<string, unknown>,
  dedupeKey = `${event}:${JSON.stringify(details)}`,
) {
  if (!isDev || seenDebugKeys.has(dedupeKey)) return;
  seenDebugKeys.add(dedupeKey);
  if (seenDebugKeys.size > 200) seenDebugKeys.clear();
  console.debug('[member-identity]', event, details);
}
