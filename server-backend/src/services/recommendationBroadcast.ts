import { postBroadcast } from './channelBroadcast';
import type { RecommendationItemDto } from './recommendationService';

export type RecommendationBroadcastPayload =
  | { serverId: string; item: RecommendationItemDto }
  | { serverId: string; itemId: string; item?: RecommendationItemDto };

export function broadcastRecommendationCreated(serverId: string, item: RecommendationItemDto): void {
  void postBroadcast('recommendation:item_created', { serverId, item });
}

export function broadcastRecommendationUpdated(serverId: string, item: RecommendationItemDto): void {
  void postBroadcast('recommendation:item_updated', { serverId, item });
}

export function broadcastRecommendationHidden(serverId: string, item: RecommendationItemDto): void {
  void postBroadcast('recommendation:item_hidden', { serverId, itemId: item.id, item });
}

export function broadcastRecommendationDeleted(serverId: string, itemId: string): void {
  void postBroadcast('recommendation:item_deleted', { serverId, itemId });
}

export function broadcastRecommendationRatingUpdated(serverId: string, itemId: string, item: RecommendationItemDto, rating?: unknown): void {
  void postBroadcast('recommendation:rating_updated', { serverId, itemId, item, rating });
}

export function broadcastRecommendationCommentUpdated(serverId: string, itemId: string, item: RecommendationItemDto, comment?: unknown): void {
  void postBroadcast('recommendation:comment_updated', { serverId, itemId, item, comment });
}

export function broadcastRecommendationCommentDeleted(serverId: string, itemId: string, item: RecommendationItemDto, commentId: string): void {
  void postBroadcast('recommendation:comment_deleted', { serverId, itemId, item, commentId });
}
