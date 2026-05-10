import { pool, queryMany, queryOne } from '../repositories/db';
import { getServerAccessContext } from './accessContextService';
import { AppError } from './serverService';
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
  createdAt: string;
  updatedAt: string;
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
  created_at: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

async function requireMember(serverId: string, userId: string): Promise<Awaited<ReturnType<typeof getServerAccessContext>>> {
  const ctx = await getServerAccessContext(userId, serverId);
  if (!ctx.membership.exists) throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  return ctx;
}

async function loadItem(serverId: string, itemId: string, includeHidden = false): Promise<RecommendationItemDto> {
  const row = await queryOne<RecommendationRow>(
    `SELECT
        ri.id::text,
        ri.server_id::text,
        ri.created_by::text,
        COALESCE(NULLIF(p.name, ''), p.email, 'Bir üye') AS created_by_name,
        NULL::text AS created_by_avatar,
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
        ri.created_at::text,
        ri.updated_at::text
       FROM recommendation_items ri
       LEFT JOIN profiles p ON p.id = ri.created_by
      WHERE ri.server_id = $1
        AND ri.id = $2
        AND ($3::boolean OR ri.status = 'active')
      LIMIT 1`,
    [serverId, itemId, includeHidden],
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
    `SELECT
        ri.id::text,
        ri.server_id::text,
        ri.created_by::text,
        COALESCE(NULLIF(p.name, ''), p.email, 'Bir üye') AS created_by_name,
        NULL::text AS created_by_avatar,
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
        ri.created_at::text,
        ri.updated_at::text
       FROM recommendation_items ri
       LEFT JOIN profiles p ON p.id = ri.created_by
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
  await requireMember(serverId, userId);

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

  const item = await loadItem(serverId, result.rows[0].id, true);
  broadcastRecommendationCreated(serverId, item);
  return item;
}

export async function getRecommendation(
  serverId: string,
  itemId: string,
): Promise<RecommendationItemDto> {
  return loadItem(serverId, itemId);
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

  const category = current.category;
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

  const item = await loadItem(serverId, itemId, true);
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
  const item = await loadItem(serverId, itemId, true);
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
  const item = await loadItem(serverId, itemId, true);
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
  const item = await loadItem(serverId, itemId, true);
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
  const item = await loadItem(serverId, itemId, true);
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

  const item = await loadItem(serverId, itemId, true);
  broadcastRecommendationHidden(serverId, item);
  return item;
}

export async function deleteRecommendation(
  serverId: string,
  itemId: string,
  actorId: string,
): Promise<void> {
  const ctx = await requireMember(serverId, actorId);
  const current = await loadItem(serverId, itemId, true);
  if (current.createdBy !== actorId && !canModerate(ctx)) {
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
  broadcastRecommendationDeleted(serverId, itemId);
}
