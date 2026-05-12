// PATCH 2 MOCK ONLY — no API, no WS, no LiveKit, no backend state.
import { useCallback, useMemo, useState } from 'react';
import type { MusicSource, RoomMusicSession, RoomMusicStatus } from '../../../types';
import { getRoomMusicPermissions } from '../../../lib/musicPermissions';

interface UseRoomMusicMockInput {
  serverId?: string | null;
  channelId?: string | null;
  serverPlan?: string | null;
  userLevel?: string | number | null;
  serverRole?: string | null;
}

export function useRoomMusicMock({
  serverId,
  channelId,
  serverPlan,
  userLevel,
  serverRole,
}: UseRoomMusicMockInput) {
  const permissions = useMemo(
    () => getRoomMusicPermissions({ serverPlan, userLevel, serverRole }),
    [serverPlan, userLevel, serverRole],
  );
  const [status, setStatus] = useState<RoomMusicStatus>('stopped');

  const source = useMemo<MusicSource>(() => ({
    id: 'mayvox-mood-preview',
    title: 'MAYVox Mood Preview',
    mood: 'Hazirlik modu',
    category: 'Mood',
    sourceType: 'mayvox_mood',
    sourceUrl: null,
    artworkUrl: null,
    durationMs: null,
    isEnabled: true,
  }), []);

  const session = useMemo<RoomMusicSession>(() => ({
    id: `mock:${serverId || 'server'}:${channelId || 'channel'}`,
    serverId: serverId || '',
    channelId: channelId || '',
    status,
    currentSourceId: source.id,
    startedBy: null,
    startedAt: null,
    pausedAt: null,
    positionMs: 0,
    volume: 70,
  }), [channelId, serverId, source.id, status]);

  const togglePlayPause = useCallback(() => {
    if (!permissions.canControl) return;
    setStatus(prev => prev === 'playing' ? 'paused' : 'playing');
  }, [permissions.canControl]);

  const stop = useCallback(() => {
    if (!permissions.canStop) return;
    setStatus('stopped');
  }, [permissions.canStop]);

  return {
    permissions,
    source,
    session,
    togglePlayPause,
    stop,
  };
}
