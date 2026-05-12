import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MusicSource, RoomMusicPermissions, RoomMusicSession } from '../../../types';
import { getRoomMusicPermissions } from '../../../lib/musicPermissions';
import { ApiError, getRoomMusicSession, getRoomMusicSources } from '../../../lib/serverService';

interface UseRoomMusicInput {
  serverId?: string | null;
  channelId?: string | null;
  enabled?: boolean;
  serverPlan?: string | null;
  userLevel?: string | number | null;
  serverRole?: string | null;
  useMockFallback?: boolean;
}

export function useRoomMusic({
  serverId,
  channelId,
  enabled = true,
  serverPlan,
  userLevel,
  serverRole,
}: UseRoomMusicInput) {
  const [sources, setSources] = useState<MusicSource[]>([]);
  const [session, setSession] = useState<RoomMusicSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const basePermissions = useMemo(
    () => getRoomMusicPermissions({ serverPlan, userLevel, serverRole }),
    [serverPlan, userLevel, serverRole],
  );

  const permissions = useMemo<RoomMusicPermissions>(() => {
    if (errorCode === 'MUSIC_ULTRA_REQUIRED') {
      return {
        ...basePermissions,
        isUltra: false,
        locked: true,
        canListen: false,
        canControl: false,
        canSkip: false,
        canStop: false,
        canChangeSource: false,
        canManageSources: false,
        readOnly: true,
        capabilities: [],
      };
    }
    if (errorCode === 'MUSIC_CONTROL_FORBIDDEN') {
      return {
        ...basePermissions,
        canControl: false,
        canSkip: false,
        canStop: false,
        canChangeSource: false,
        canManageSources: false,
        readOnly: true,
        capabilities: basePermissions.capabilities.filter(capability => capability === 'music.listen' || capability === 'music.volume'),
      };
    }
    return basePermissions;
  }, [basePermissions, errorCode]);

  const refresh = useCallback(async () => {
    if (!enabled || !serverId || !channelId) {
      setSources([]);
      setSession(null);
      setError(null);
      setErrorCode(null);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const [nextSources, nextSession] = await Promise.all([
        getRoomMusicSources(serverId),
        getRoomMusicSession(serverId, channelId),
      ]);
      setSources(nextSources);
      setSession(nextSession);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setSources([]);
      setSession(null);
      setError(apiError?.message || 'MAYVox Music bilgisi alınamadı');
      setErrorCode(apiError?.code || null);
    } finally {
      setLoading(false);
    }
  }, [channelId, enabled, serverId]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !serverId || !channelId) {
      setSources([]);
      setSession(null);
      setError(null);
      setErrorCode(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);

    Promise.all([
      getRoomMusicSources(serverId),
      getRoomMusicSession(serverId, channelId),
    ])
      .then(([nextSources, nextSession]) => {
        if (cancelled) return;
        setSources(nextSources);
        setSession(nextSession);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err instanceof ApiError ? err : null;
        setSources([]);
        setSession(null);
        setError(apiError?.message || 'MAYVox Music bilgisi alınamadı');
        setErrorCode(apiError?.code || null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, enabled, serverId]);

  const activeSource = useMemo(() => {
    if (session?.source) return session.source;
    if (session?.currentSourceId) {
      return sources.find(source => source.id === session.currentSourceId) ?? null;
    }
    return sources[0] ?? null;
  }, [session, sources]);

  return {
    sources,
    session,
    activeSource,
    loading,
    error,
    errorCode,
    permissions,
    refresh,
    shouldRender: errorCode !== 'MUSIC_CHANNEL_NOT_VOICE',
  };
}
