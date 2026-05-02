import { queryMany } from '../repositories/db';

export interface ProfileLookupRow {
  id: string;
  name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  avatar?: string | null;
}

export function profileDisplayName(p: Pick<ProfileLookupRow, 'name' | 'display_name' | 'first_name' | 'last_name'>): string {
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return p.display_name || full || p.name || '';
}

export async function fetchProfilesByIds(ids: string[]): Promise<ProfileLookupRow[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  return queryMany<ProfileLookupRow>(
    `SELECT id::text, name, display_name, first_name, last_name, email, avatar
       FROM profiles
      WHERE id::text = ANY($1::text[])`,
    [unique],
  );
}

export async function fetchProfileNameMap(ids: string[]): Promise<Map<string, string>> {
  const rows = await fetchProfilesByIds(ids);
  return new Map(rows.map((p) => [p.id, profileDisplayName(p)]));
}

export async function fetchProfileSummaryMap(ids: string[]): Promise<Map<string, { name: string; avatar: string | null }>> {
  const rows = await fetchProfilesByIds(ids);
  return new Map(rows.map((p) => [p.id, { name: profileDisplayName(p), avatar: p.avatar ?? null }]));
}
