import { pool, queryMany, queryOne } from '../repositories/db';
import { getServerAccessContext } from './accessContextService';
import { AppError } from './serverService';
import { logAction } from './auditLogService';
import {
  broadcastRecommendationCreated,
  broadcastRecommendationDeleted,
  broadcastRecommendationHidden,
  broadcastRecommendationCommentDeleted,
  broadcastRecommendationCommentUpdated,
  broadcastRecommendationRatingUpdated,
  broadcastRecommendationUpdated,
} from './recommendationBroadcast';

export type RecommendationCategory = 'film' | 'series' | 'game' | 'music' | 'book' | 'hardware';
export type RecommendationStatus = 'active' | 'hidden' | 'deleted';

const CATEGORIES = new Set<RecommendationCategory>(['film', 'series', 'game', 'music', 'book', 'hardware']);

export interface RecommendationFilters {
  category?: string;
  q?: string;
  includeHidden?: boolean;
  limit?: unknown;
  userId?: string;
}

export interface RecommendationPayload {
  title?: unknown;
  category?: unknown;
  description?: unknown;
  coverUrl?: unknown;
  cover_url?: unknown;
  tags?: unknown;
  links?: unknown;
  metadata?: unknown;
}

export interface RecommendationItemDto {
  id: string;
  serverId: string;
  createdBy: string;
  createdByName: string | null;
  createdByAvatar: string | null;
  title: string;
  category: RecommendationCategory;
  description: string | null;
  coverUrl: string | null;
  tags: string[];
  links: unknown[];
  metadata: Record<string, unknown>;
  status: RecommendationStatus;
  averageRating: number;
  ratingCount: number;
  commentCount: number;
  watchedCount: number;
  myWatched: boolean;
  myWatchlisted: boolean;
  myRatingScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationUserStateDto {
  itemId: string;
  serverId: string;
  userId: string;
  isWatched: boolean;
  isWatchlisted: boolean;
  watchedAt: string | null;
  watchlistedAt: string | null;
  updatedAt: string;
}

export interface RecommendationCreatorProfileDto {
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  discoveryScore: number;
  informationScore: number;
  recommendationCount: number;
  ratedRecommendationCount: number;
  commentCount: number;
  byCategory: Array<{
    category: RecommendationCategory;
    averageRating: number;
    recommendationCount: number;
    ratedRecommendationCount: number;
  }>;
}

export interface RecommendationRatingDto {
  id: string;
  itemId: string;
  serverId: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  score: number;
  updatedAt: string;
}

export interface RecommendationCommentDto {
  id: string;
  itemId: string;
  serverId: string;
  createdBy: string;
  createdByName: string | null;
  createdByAvatar: string | null;
  body: string;
  isSpoiler: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RecommendationRow {
  id: string;
  server_id: string;
  created_by: string;
  created_by_name: string | null;
  created_by_avatar: string | null;
  title: string;
  category: RecommendationCategory;
  description: string | null;
  cover_url: string | null;
  tags: string[];
  links: unknown;
  metadata: Record<string, unknown> | null;
  status: RecommendationStatus;
  average_rating: string | number;
  rating_count: number;
  comment_count: number;
  watched_count: number;
  my_watched: boolean;
  my_watchlisted: boolean;
  my_rating_score: string | number | null;
  created_at: string;
  updated_at: string;
}

interface RecommendationUserStateRow {
  item_id: string;
  server_id: string;
  user_id: string;
  is_watched: boolean;
  is_watchlisted: boolean;
  watched_at: string | null;
  watchlisted_at: string | null;
  updated_at: string;
}

interface RecommendationRatingRow {
  id: string;
  item_id: string;
  server_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  score: string | number;
  updated_at: string;
}

interface RecommendationCommentRow {
  id: string;
  item_id: string;
  server_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  body: string;
  is_spoiler: boolean;
  created_at: string;
  updated_at: string;
}

function clampLimit(raw: unknown): number {
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, parsed));
}

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function normalizeCategory(value: unknown): RecommendationCategory {
  const category = typeof value === 'string' ? value.trim() : '';
  if (!CATEGORIES.has(category as RecommendationCategory)) {
    throw new AppError(400, 'Geçersiz öneri kategorisi');
  }
  return category as RecommendationCategory;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/\s+/g, ' ').slice(0, 32);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeLinks(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === 'object').slice(0, 12);
}

function mapRow(row: RecommendationRow): RecommendationItemDto {
  const links = Array.isArray(row.links) ? row.links : [];
  return {
    id: row.id,
    serverId: row.server_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdByAvatar: row.created_by_avatar,
    title: row.title,
    category: row.category,
    description: row.description,
    coverUrl: row.cover_url,
    tags: row.tags ?? [],
    links,
    metadata: row.metadata ?? {},
    status: row.status,
    averageRating: Number(row.average_rating) || 0,
    ratingCount: row.rating_count,
    commentCount: row.comment_count,
    watchedCount: row.watched_count ?? 0,
    myWatched: row.my_watched === true,
    myWatchlisted: row.my_watchlisted === true,
    myRatingScore: row.my_rating_score === null || row.my_rating_score === undefined ? null : Number(row.my_rating_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserStateRow(row: RecommendationUserStateRow): RecommendationUserStateDto {
  return {
    itemId: row.item_id,
    serverId: row.server_id,
    userId: row.user_id,
    isWatched: row.is_watched,
    isWatchlisted: row.is_watchlisted,
    watchedAt: row.watched_at,
    watchlistedAt: row.watchlisted_at,
    updatedAt: row.updated_at,
  };
}

function recommendationSelect(userIdParam = 'NULL::uuid'): string {
  return `SELECT
        ri.id::text,
        ri.server_id::text,
        ri.created_by::text,
        COALESCE(NULLIF(p.name, ''), p.email, 'Bir üye') AS created_by_name,
        p.avatar AS created_by_avatar,
        ri.title,
        ri.category,
        ri.description,
        ri.cover_url,
        ri.tags,
        ri.links,
        ri.metadata,
        ri.status,
        ri.average_rating,
        ri.rating_count,
        ri.comment_count,
        COALESCE(ws.watched_count, 0)::int AS watched_count,
        COALESCE(rus.is_watched, false) AS my_watched,
        COALESCE(rus.is_watchlisted, false) AS my_watchlisted,
        rr.score AS my_rating_score,
        ri.created_at::text,
        ri.updated_at::text
       FROM recommendation_items ri
       LEFT JOIN profiles p ON p.id = ri.created_by
       LEFT JOIN (
         SELECT item_id, COUNT(*)::int AS watched_count
           FROM recommendation_user_states
          WHERE is_watched = true
          GROUP BY item_id
       ) ws ON ws.item_id = ri.id
       LEFT JOIN recommendation_user_states rus
         ON rus.item_id = ri.id
        AND rus.user_id = ${userIdParam}
       LEFT JOIN recommendation_ratings rr
         ON rr.item_id = ri.id
        AND rr.user_id = ${userIdParam}`;
}

function mapRatingRow(row: RecommendationRatingRow): RecommendationRatingDto {
  return {
    id: row.id,
    itemId: row.item_id,
    serverId: row.server_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar,
    score: Number(row.score) || 0,
    updatedAt: row.updated_at,
  };
}

function mapCommentRow(row: RecommendationCommentRow): RecommendationCommentDto {
  return {
    id: row.id,
    itemId: row.item_id,
    serverId: row.server_id,
    createdBy: row.user_id,
    createdByName: row.user_name,
    createdByAvatar: row.user_avatar,
    body: row.body,
    isSpoiler: row.is_spoiler,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canModerate(ctx: Awaited<ReturnType<typeof getServerAccessContext>>): boolean {
  return ctx.membership.isOwner || ctx.flags.canManageServer || ctx.flags.canKickMembers;
}

function maxServerRolePriority(ctx: Awaited<ReturnType<typeof getServerAccessContext>>): number {
  if (ctx.membership.isOwner) return 100;
  return Math.max(
    ...ctx.roles.map(role => Number(role.priority) || 0),
    ctx.membership.baseRole === 'super_admin' ? 90 :
    ctx.membership.baseRole === 'admin' ? 80 :
    ctx.membership.baseRole === 'super_mod' ? 70 :
    ctx.membership.baseRole === 'mod' || ctx.membership.baseRole === 'moderator' ? 60 :
    ctx.membership.baseRole === 'super_member' ? 30 :
    ctx.membership.baseRole === 'member' ? 20 : 0,
  );
}

async function requireMember(serverId: string, userId: string): Promise<Awaited<ReturnType<typeof getServerAccessContext>>> {
  const ctx = await getServerAccessContext(userId, serverId);
  if (!ctx.membership.exists) throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  return ctx;
}

async function loadItem(serverId: string, itemId: string, includeHidden = false, userId?: string): Promise<RecommendationItemDto> {
  const userIdSql = userId ? '$4::uuid' : 'NULL::uuid';
  const params: unknown[] = userId ? [serverId, itemId, includeHidden, userId] : [serverId, itemId, includeHidden];
  const row = await queryOne<RecommendationRow>(
    `${recommendationSelect(userIdSql)}
      WHERE ri.server_id = $1
        AND ri.id = $2
        AND ($3::boolean OR ri.status = 'active')
      LIMIT 1`,
    params,
  );
  if (!row) throw new AppError(404, 'Öneri bulunamadı');
  return mapRow(row);
}

async function requireActiveItem(serverId: string, itemId: string): Promise<RecommendationItemDto> {
  const item = await loadItem(serverId, itemId);
  if (item.status !== 'active') throw new AppError(404, 'Öneri bulunamadı');
  return item;
}

async function refreshRatingAggregate(serverId: string, itemId: string): Promise<void> {
  await pool.query(
    `UPDATE recommendation_items ri
        SET average_rating = COALESCE(src.avg_score, 0),
            rating_count = COALESCE(src.rating_count, 0),
            updated_at = now()
       FROM (
         SELECT $2::uuid AS item_id,
                ROUND(AVG(score)::numeric, 2) AS avg_score,
                COUNT(*)::int AS rating_count
           FROM recommendation_ratings
          WHERE server_id = $1 AND item_id = $2
       ) src
      WHERE ri.server_id = $1 AND ri.id = src.item_id`,
    [serverId, itemId],
  );
}

async function refreshCommentAggregate(serverId: string, itemId: string): Promise<void> {
  await pool.query(
    `UPDATE recommendation_items ri
        SET comment_count = COALESCE(src.comment_count, 0),
            updated_at = now()
       FROM (
         SELECT $2::uuid AS item_id,
                COUNT(*)::int AS comment_count
           FROM recommendation_comments
          WHERE server_id = $1 AND item_id = $2 AND is_hidden = false
       ) src
      WHERE ri.server_id = $1 AND ri.id = src.item_id`,
    [serverId, itemId],
  );
}

function normalizeScore(value: unknown): number {
  const score = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new AppError(400, 'Puan 0 ile 10 arasında olmalı');
  }
  return Math.round(score * 10) / 10;
}

function normalizeCommentBody(value: unknown): string {
  const body = normalizeText(value, 2000);
  if (!body) throw new AppError(400, 'Yorum boş olamaz');
  return body;
}

export async function listRecommendations(
  serverId: string,
  filters: RecommendationFilters = {},
): Promise<RecommendationItemDto[]> {
  const clauses = ['ri.server_id = $1'];
  const params: unknown[] = [serverId];
  let index = 2;
  const userStateParam = filters.userId ? `$${index++}::uuid` : 'NULL::uuid';
  if (filters.userId) params.push(filters.userId);

  if (!filters.includeHidden) clauses.push("ri.status = 'active'");

  if (filters.category) {
    const category = normalizeCategory(filters.category);
    clauses.push(`ri.category = $${index++}`);
    params.push(category);
  }

  const q = normalizeText(filters.q, 80);
  if (q) {
    clauses.push(`(ri.title ILIKE $${index} OR ri.description ILIKE $${index} OR EXISTS (
      SELECT 1 FROM unnest(ri.tags) AS tag WHERE tag ILIKE $${index}
    ))`);
    params.push(`%${q}%`);
    index++;
  }

  params.push(clampLimit(filters.limit));

  const rows = await queryMany<RecommendationRow>(
    `${recommendationSelect(userStateParam)}
      WHERE ${clauses.join(' AND ')}
      ORDER BY ri.created_at DESC
      LIMIT $${index}`,
    params,
  );

  return rows.map(mapRow);
}

export async function createRecommendation(
  serverId: string,
  userId: string,
  payload: RecommendationPayload,
): Promise<RecommendationItemDto> {
  const ctx = await requireMember(serverId, userId);
  if (maxServerRolePriority(ctx) < 30) throw new AppError(403, 'Keşif önerisi ekleme yetkin yok');

  const title = normalizeText(payload.title, 140);
  if (!title) throw new AppError(400, 'Başlık gerekli');

  const category = normalizeCategory(payload.category);
  const description = normalizeText(payload.description, 2000);
  const coverUrl = normalizeText(payload.coverUrl ?? payload.cover_url, 600);
  const tags = normalizeTags(payload.tags);
  const links = normalizeLinks(payload.links);
  const metadata = normalizeJsonObject(payload.metadata);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO recommendation_items
       (server_id, created_by, title, category, description, cover_url, tags, links, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     RETURNING id::text`,
    [serverId, userId, title, category, description, coverUrl, tags, JSON.stringify(links), JSON.stringify(metadata)],
  );

  const item = await loadItem(serverId, result.rows[0].id, true, userId);
  broadcastRecommendationCreated(serverId, item);
  return item;
}

export async function getRecommendation(
  serverId: string,
  itemId: string,
  userId?: string,
): Promise<RecommendationItemDto> {
  return loadItem(serverId, itemId, false, userId);
}

export async function setRecommendationUserState(
  serverId: string,
  itemId: string,
  userId: string,
  payload: { isWatched?: unknown; is_watched?: unknown; isWatchlisted?: unknown; is_watchlisted?: unknown },
): Promise<{ item: RecommendationItemDto; state: RecommendationUserStateDto }> {
  await requireMember(serverId, userId);
  await requireActiveItem(serverId, itemId);
  const watchedProvided = payload.isWatched !== undefined || payload.is_watched !== undefined;
  const watchlistedProvided = payload.isWatchlisted !== undefined || payload.is_watchlisted !== undefined;
  if (!watchedProvided && !watchlistedProvided) throw new AppError(400, 'Güncellenecek durum yok');

  const watchedValue = payload.isWatched ?? payload.is_watched;
  const watchlistedValue = payload.isWatchlisted ?? payload.is_watchlisted;
  const result = await pool.query<RecommendationUserStateRow>(
    `INSERT INTO recommendation_user_states
       (server_id, item_id, user_id, is_watched, is_watchlisted, watched_at, watchlisted_at)
     VALUES ($1, $2, $3, COALESCE($4::boolean, false), COALESCE($5::boolean, false),
             CASE WHEN COALESCE($4::boolean, false) THEN now() ELSE NULL END,
             CASE WHEN COALESCE($5::boolean, false) THEN now() ELSE NULL END)
     ON CONFLICT (item_id, user_id)
     DO UPDATE SET
       is_watched = COALESCE($4::boolean, recommendation_user_states.is_watched),
       is_watchlisted = COALESCE($5::boolean, recommendation_user_states.is_watchlisted),
       watched_at = CASE
         WHEN $4::boolean IS TRUE AND recommendation_user_states.watched_at IS NULL THEN now()
         WHEN $4::boolean IS FALSE THEN NULL
         ELSE recommendation_user_states.watched_at
       END,
       watchlisted_at = CASE
         WHEN $5::boolean IS TRUE AND recommendation_user_states.watchlisted_at IS NULL THEN now()
         WHEN $5::boolean IS FALSE THEN NULL
         ELSE recommendation_user_states.watchlisted_at
       END,
       updated_at = now()
     RETURNING item_id::text, server_id::text, user_id::text, is_watched, is_watchlisted,
       watched_at::text, watchlisted_at::text, updated_at::text`,
    [
      serverId,
      itemId,
      userId,
      watchedProvided ? watchedValue === true : null,
      watchlistedProvided ? watchlistedValue === true : null,
    ],
  );
  const item = await loadItem(serverId, itemId, true, userId);
  broadcastRecommendationUpdated(serverId, item);
  return { item, state: mapUserStateRow(result.rows[0]) };
}

export async function listRecommendationWatchlist(serverId: string, userId: string): Promise<RecommendationItemDto[]> {
  await requireMember(serverId, userId);
  const rows = await queryMany<RecommendationRow>(
    `${recommendationSelect('$2::uuid')}
      WHERE ri.server_id = $1
        AND ri.status = 'active'
        AND rus.is_watchlisted = true
      ORDER BY rus.watchlisted_at DESC NULLS LAST, rus.updated_at DESC
      LIMIT 100`,
    [serverId, userId],
  );
  return rows.map(mapRow);
}

function categoryInfoKeys(category: RecommendationCategory): string[] {
  if (category === 'film') return ['year', 'durationMinutes', 'genres', 'platform', 'externalRating'];
  if (category === 'series') return ['year', 'status', 'seasonCount', 'episodeCount', 'episodeDurationMinutes', 'platform', 'externalRating'];
  if (category === 'game') return ['platforms', 'genres', 'playerModes', 'idealPartySize', 'voiceChatFunScore'];
  return [];
}

function metadataCompleteness(category: RecommendationCategory, metadata: Record<string, unknown> | null): number {
  const keys = categoryInfoKeys(category);
  if (keys.length === 0) return 0;
  const filled = keys.filter(key => {
    const value = metadata?.[key];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return true;
    return value !== null && value !== undefined && String(value).trim() !== '';
  }).length;
  return Math.round((filled / keys.length) * 100);
}

export async function getRecommendationCreatorProfile(
  serverId: string,
  viewerId: string,
  creatorId: string,
): Promise<RecommendationCreatorProfileDto> {
  await requireMember(serverId, viewerId);
  const rows = await queryMany<RecommendationRow>(
    `${recommendationSelect('NULL::uuid')}
      WHERE ri.server_id = $1
        AND ri.created_by = $2
        AND ri.status = 'active'`,
    [serverId, creatorId],
  );
  const items = rows.map(mapRow);
  const profile = await queryOne<{ user_id: string; user_name: string | null; user_avatar: string | null }>(
    `SELECT p.id::text AS user_id,
            COALESCE(NULLIF(p.display_name, ''), NULLIF(p.name, ''), p.email, 'Bir üye') AS user_name,
            p.avatar AS user_avatar
       FROM profiles p
      WHERE p.id = $1
      LIMIT 1`,
    [creatorId],
  );
  if (!profile) throw new AppError(404, 'Kullanıcı bulunamadı');

  const rated = items.filter(item => item.ratingCount > 0);
  const discoveryScore = rated.length
    ? Math.round((rated.reduce((sum, item) => sum + item.averageRating, 0) / rated.length) * 10) / 10
    : 0;
  const informationScore = items.length
    ? Math.round(items.reduce((sum, item) => sum + metadataCompleteness(item.category, item.metadata), 0) / items.length)
    : 0;
  const byCategory = (['film', 'series', 'game'] as RecommendationCategory[]).map(category => {
    const categoryItems = items.filter(item => item.category === category);
    const categoryRated = categoryItems.filter(item => item.ratingCount > 0);
    return {
      category,
      averageRating: categoryRated.length
        ? Math.round((categoryRated.reduce((sum, item) => sum + item.averageRating, 0) / categoryRated.length) * 10) / 10
        : 0,
      recommendationCount: categoryItems.length,
      ratedRecommendationCount: categoryRated.length,
    };
  });
  const commentCountRow = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*) AS count
       FROM recommendation_comments
      WHERE server_id = $1
        AND user_id = $2
        AND is_hidden = false`,
    [serverId, creatorId],
  );

  return {
    userId: profile.user_id,
    userName: profile.user_name,
    userAvatar: profile.user_avatar,
    discoveryScore,
    informationScore,
    recommendationCount: items.length,
    ratedRecommendationCount: rated.length,
    commentCount: Number(commentCountRow?.count) || 0,
    byCategory,
  };
}

export async function updateRecommendation(
  serverId: string,
  itemId: string,
  userId: string,
  payload: RecommendationPayload,
): Promise<RecommendationItemDto> {
  const ctx = await requireMember(serverId, userId);
  const current = await loadItem(serverId, itemId, true);
  if (current.status === 'deleted') throw new AppError(404, 'Öneri bulunamadı');
  if (current.createdBy !== userId && !canModerate(ctx)) throw new AppError(403, 'Bu öneriyi düzenleme yetkin yok');

  const title = normalizeText(payload.title, 140);
  if (!title) throw new AppError(400, 'Başlık gerekli');

  const category = normalizeCategory(payload.category ?? current.category);
  const description = normalizeText(payload.description, 2000);
  const coverUrl = normalizeText(payload.coverUrl ?? payload.cover_url, 600);
  const tags = normalizeTags(payload.tags);
  const links = normalizeLinks(payload.links);
  const metadata = normalizeJsonObject(payload.metadata);

  await pool.query(
    `UPDATE recommendation_items
        SET title = $1,
            category = $2,
            description = $3,
            cover_url = $4,
            tags = $5,
            links = $6::jsonb,
            metadata = $7::jsonb,
            updated_at = now()
      WHERE server_id = $8
        AND id = $9`,
    [title, category, description, coverUrl, tags, JSON.stringify(links), JSON.stringify(metadata), serverId, itemId],
  );

  const item = await loadItem(serverId, itemId, true, userId);
  broadcastRecommendationUpdated(serverId, item);
  return item;
}

export async function listRecommendationRatings(
  serverId: string,
  itemId: string,
  userId: string,
): Promise<RecommendationRatingDto[]> {
  await requireMember(serverId, userId);
  await requireActiveItem(serverId, itemId);
  const rows = await queryMany<RecommendationRatingRow>(
    `SELECT
        rr.id::text,
        rr.item_id::text,
        rr.server_id::text,
        rr.user_id::text,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(p.name, ''), p.email, 'Bir üye') AS user_name,
        p.avatar AS user_avatar,
        rr.score,
        rr.updated_at::text
       FROM recommendation_ratings rr
       LEFT JOIN profiles p ON p.id = rr.user_id
      WHERE rr.server_id = $1 AND rr.item_id = $2
      ORDER BY rr.updated_at DESC`,
    [serverId, itemId],
  );
  return rows.map(mapRatingRow);
}

export async function setRecommendationRating(
  serverId: string,
  itemId: string,
  userId: string,
  scoreInput: unknown,
): Promise<{ item: RecommendationItemDto; myRating: RecommendationRatingDto }> {
  await requireMember(serverId, userId);
  await requireActiveItem(serverId, itemId);
  const score = normalizeScore(scoreInput);
  const result = await pool.query<RecommendationRatingRow>(
    `INSERT INTO recommendation_ratings (server_id, item_id, user_id, score)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id, user_id)
     DO UPDATE SET score = EXCLUDED.score, updated_at = now()
     RETURNING id::text, item_id::text, server_id::text, user_id::text,
       NULL::text AS user_name, NULL::text AS user_avatar, score, updated_at::text`,
    [serverId, itemId, userId, score],
  );
  await refreshRatingAggregate(serverId, itemId);
  const item = await loadItem(serverId, itemId, true, userId);
  const ratings = await listRecommendationRatings(serverId, itemId, userId);
  const myRating = ratings.find(r => r.userId === userId) ?? mapRatingRow(result.rows[0]);
  broadcastRecommendationRatingUpdated(serverId, itemId, item, myRating);
  return { item, myRating };
}

export async function deleteRecommendationRating(
  serverId: string,
  itemId: string,
  userId: string,
): Promise<{ item: RecommendationItemDto }> {
  await requireMember(serverId, userId);
  await requireActiveItem(serverId, itemId);
  await pool.query(
    `DELETE FROM recommendation_ratings
      WHERE server_id = $1 AND item_id = $2 AND user_id = $3`,
    [serverId, itemId, userId],
  );
  await refreshRatingAggregate(serverId, itemId);
  const item = await loadItem(serverId, itemId, true, userId);
  broadcastRecommendationRatingUpdated(serverId, itemId, item);
  return { item };
}

export async function listRecommendationComments(
  serverId: string,
  itemId: string,
  userId: string,
): Promise<RecommendationCommentDto[]> {
  await requireMember(serverId, userId);
  await requireActiveItem(serverId, itemId);
  const rows = await queryMany<RecommendationCommentRow>(
    `SELECT
        rc.id::text,
        rc.item_id::text,
        rc.server_id::text,
        rc.user_id::text,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(p.name, ''), p.email, 'Bir üye') AS user_name,
        p.avatar AS user_avatar,
        rc.body,
        rc.is_spoiler,
        rc.created_at::text,
        rc.updated_at::text
       FROM recommendation_comments rc
       LEFT JOIN profiles p ON p.id = rc.user_id
      WHERE rc.server_id = $1
        AND rc.item_id = $2
        AND rc.is_hidden = false
      ORDER BY rc.created_at DESC`,
    [serverId, itemId],
  );
  return rows.map(mapCommentRow);
}

export async function upsertRecommendationComment(
  serverId: string,
  itemId: string,
  userId: string,
  payload: { body?: unknown; isSpoiler?: unknown; is_spoiler?: unknown },
): Promise<{ item: RecommendationItemDto; comment: RecommendationCommentDto }> {
  await requireMember(serverId, userId);
  await requireActiveItem(serverId, itemId);
  const body = normalizeCommentBody(payload.body);
  const isSpoiler = payload.isSpoiler === true || payload.is_spoiler === true;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO recommendation_comments (server_id, item_id, user_id, body, is_spoiler, is_hidden)
     VALUES ($1, $2, $3, $4, $5, false)
     ON CONFLICT (item_id, user_id)
     DO UPDATE SET body = EXCLUDED.body,
                   is_spoiler = EXCLUDED.is_spoiler,
                   is_hidden = false,
                   updated_at = now()
     RETURNING id::text`,
    [serverId, itemId, userId, body, isSpoiler],
  );
  await refreshCommentAggregate(serverId, itemId);
  const item = await loadItem(serverId, itemId, true, userId);
  const comments = await listRecommendationComments(serverId, itemId, userId);
  const comment = comments.find(c => c.id === result.rows[0].id);
  if (!comment) throw new AppError(500, 'Yorum kaydedildi ama okunamadı');
  broadcastRecommendationCommentUpdated(serverId, itemId, item, comment);
  return { item, comment };
}

export async function hideRecommendationComment(
  serverId: string,
  itemId: string,
  commentId: string,
  actorId: string,
): Promise<{ item: RecommendationItemDto }> {
  const ctx = await requireMember(serverId, actorId);
  await requireActiveItem(serverId, itemId);
  const row = await queryOne<{ id: string; user_id: string }>(
    `SELECT id::text, user_id::text
       FROM recommendation_comments
      WHERE server_id = $1 AND item_id = $2 AND id = $3 AND is_hidden = false
      LIMIT 1`,
    [serverId, itemId, commentId],
  );
  if (!row) throw new AppError(404, 'Yorum bulunamadı');
  if (row.user_id !== actorId && !canModerate(ctx)) {
    throw new AppError(403, 'Yorumu silme yetkin yok');
  }
  await pool.query(
    `UPDATE recommendation_comments
        SET is_hidden = true,
            updated_at = now()
      WHERE server_id = $1 AND item_id = $2 AND id = $3`,
    [serverId, itemId, commentId],
  );
  await refreshCommentAggregate(serverId, itemId);
  const item = await loadItem(serverId, itemId, true, actorId);
  broadcastRecommendationCommentDeleted(serverId, itemId, item, commentId);
  return { item };
}

export async function hideRecommendation(
  serverId: string,
  itemId: string,
  actorId: string,
): Promise<RecommendationItemDto> {
  const ctx = await requireMember(serverId, actorId);
  if (!canModerate(ctx)) throw new AppError(403, 'Öneriyi gizlemek için yetkin yok');
  await loadItem(serverId, itemId, true);

  await pool.query(
    `UPDATE recommendation_items
        SET status = 'hidden',
            updated_at = now()
      WHERE server_id = $1
        AND id = $2
        AND status <> 'deleted'`,
    [serverId, itemId],
  );

  const item = await loadItem(serverId, itemId, true, actorId);
  await logAction({
    serverId,
    actorId,
    action: 'recommendation.hide',
    resourceType: 'recommendation',
    resourceId: itemId,
    metadata: {
      title: item.title,
      targetName: item.title,
      category: item.category,
      creatorId: item.createdBy,
      creatorName: item.createdByName,
    },
  });
  broadcastRecommendationHidden(serverId, item);
  return item;
}

export async function restoreRecommendation(
  serverId: string,
  itemId: string,
  actorId: string,
): Promise<RecommendationItemDto> {
  const ctx = await requireMember(serverId, actorId);
  if (!canModerate(ctx)) throw new AppError(403, 'Önerinin gizliliğini kaldırmak için yetkin yok');
  await loadItem(serverId, itemId, true);

  await pool.query(
    `UPDATE recommendation_items
        SET status = 'active',
            updated_at = now()
      WHERE server_id = $1
        AND id = $2
        AND status = 'hidden'`,
    [serverId, itemId],
  );

  const item = await loadItem(serverId, itemId, true, actorId);
  await logAction({
    serverId,
    actorId,
    action: 'recommendation.restore',
    resourceType: 'recommendation',
    resourceId: itemId,
    metadata: {
      title: item.title,
      targetName: item.title,
      category: item.category,
      creatorId: item.createdBy,
      creatorName: item.createdByName,
    },
  });
  broadcastRecommendationUpdated(serverId, item);
  return item;
}

export async function deleteRecommendation(
  serverId: string,
  itemId: string,
  actorId: string,
): Promise<void> {
  const ctx = await requireMember(serverId, actorId);
  const current = await loadItem(serverId, itemId, true);
  if (!canModerate(ctx)) {
    throw new AppError(403, 'Öneriyi silmek için yetkin yok');
  }

  await pool.query(
    `UPDATE recommendation_items
        SET status = 'deleted',
            updated_at = now()
      WHERE server_id = $1
        AND id = $2`,
    [serverId, itemId],
  );
  await logAction({
    serverId,
    actorId,
    action: 'recommendation.delete',
    resourceType: 'recommendation',
    resourceId: itemId,
    metadata: {
      title: current.title,
      targetName: current.title,
      category: current.category,
      creatorId: current.createdBy,
      creatorName: current.createdByName,
    },
  });
  broadcastRecommendationDeleted(serverId, itemId);
}
