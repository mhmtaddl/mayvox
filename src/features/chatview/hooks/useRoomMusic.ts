import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MusicSource, RoomMusicPermissions, RoomMusicSession, RoomMusicStatus } from '../../../types';
import { getRoomMusicPermissions } from '../../../lib/musicPermissions';
import {
  ApiError,
  getRoomMusicSession,
  getRoomMusicSources,
  pauseRoomMusicSession,
  resumeRoomMusicSession,
  startRoomMusicSession,
  stopRoomMusicSession,
} from '../../../lib/serverService';

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
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<RoomMusicStatus | null>(null);

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
      setOptimisticStatus(null);
      return;
    }

      setLoading(true);
      setError(null);
      setErrorCode(null);
      setActionError(null);
      setOptimisticStatus(null);
    try {
      const [nextSources, nextSession] = await Promise.all([
        getRoomMusicSources(serverId),
        getRoomMusicSession(serverId, channelId),
      ]);
      setSources(nextSources);
      setSession(nextSession);
      setOptimisticStatus(null);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setSources([]);
      setSession(null);
      setOptimisticStatus(null);
      setError(apiError?.message || 'MAYVox Music bilgisi alınamadı');
      setErrorCode(apiError?.code || null);
    } finally {
      setLoading(false);
    }
  }, [channelId, enabled, serverId]);

  const handleActionError = useCallback((err: unknown) => {
    const apiError = err instanceof ApiError ? err : null;
    setOptimisticStatus(null);
    setActionError(apiError?.message || 'MAYVox Music işlemi tamamlanamadı');
    if (apiError?.code) setErrorCode(apiError.code);
    if (apiError?.code === 'MUSIC_ULTRA_REQUIRED' || apiError?.code === 'MUSIC_CONTROL_FORBIDDEN' || apiError?.code === 'MUSIC_CHANNEL_NOT_VOICE') {
      setError(apiError.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !serverId || !channelId) {
      setSources([]);
      setSession(null);
      setError(null);
      setErrorCode(null);
      setLoading(false);
      setOptimisticStatus(null);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    setActionError(null);
    setOptimisticStatus(null);

    Promise.all([
      getRoomMusicSources(serverId),
      getRoomMusicSession(serverId, channelId),
    ])
      .then(([nextSources, nextSession]) => {
        if (cancelled) return;
        setSources(nextSources);
        setSession(nextSession);
        setOptimisticStatus(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err instanceof ApiError ? err : null;
        setSources([]);
        setSession(null);
        setOptimisticStatus(null);
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

  const start = useCallback(async (sourceId?: string) => {
    if (!enabled || !serverId || !channelId || actionLoading || !permissions.canControl) return;
    const nextSourceId = sourceId || (activeSource?.isEnabled ? activeSource.id : undefined) || sources.find(source => source.isEnabled)?.id;
    if (!nextSourceId) {
      setActionError('MAYVox Music kaynağı bulunamadı');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setOptimisticStatus('playing');
    try {
      const nextSession = await startRoomMusicSession(serverId, channelId, nextSourceId);
      setSession(nextSession);
      setOptimisticStatus(null);
      setError(null);
      setErrorCode(null);
    } catch (err) {
      handleActionError(err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, activeSource?.id, channelId, enabled, handleActionError, permissions.canControl, serverId, sources]);

  const pause = useCallback(async () => {
    if (!enabled || !serverId || !channelId || actionLoading || !permissions.canControl) return;
    setActionLoading(true);
    setActionError(null);
    setOptimisticStatus('paused');
    try {
      const nextSession = await pauseRoomMusicSession(serverId, channelId);
      setSession(nextSession);
      setOptimisticStatus(null);
      setError(null);
      setErrorCode(null);
    } catch (err) {
      handleActionError(err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, channelId, enabled, handleActionError, permissions.canControl, serverId]);

  const resume = useCallback(async () => {
    if (!enabled || !serverId || !channelId || actionLoading || !permissions.canControl) return;
    setActionLoading(true);
    setActionError(null);
    setOptimisticStatus('playing');
    try {
      const nextSession = await resumeRoomMusicSession(serverId, channelId);
      setSession(nextSession);
      setOptimisticStatus(null);
      setError(null);
      setErrorCode(null);
    } catch (err) {
      handleActionError(err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, channelId, enabled, handleActionError, permissions.canControl, serverId]);

  const stop = useCallback(async () => {
    if (!enabled || !serverId || !channelId || actionLoading || !permissions.canStop) return;
    if (!session || session.status === 'stopped') return;
    setActionLoading(true);
    setActionError(null);
    setOptimisticStatus('stopped');
    try {
      const nextSession = await stopRoomMusicSession(serverId, channelId);
      setSession(nextSession);
      setOptimisticStatus(null);
      setError(null);
      setErrorCode(null);
    } catch (err) {
      handleActionError(err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, channelId, enabled, handleActionError, permissions.canStop, serverId, session]);

  const togglePlayPause = useCallback(() => {
    const currentStatus = optimisticStatus ?? session?.status;
    if (currentStatus === 'playing') {
      void pause();
      return;
    }
    if (currentStatus === 'paused') {
      void resume();
      return;
    }
    void start();
  }, [optimisticStatus, pause, resume, session?.status, start]);

  const visibleSession = useMemo<RoomMusicSession | null>(() => {
    if (!optimisticStatus) return session;
    if (session) {
      return { ...session, status: optimisticStatus };
    }
    if (!serverId || !channelId) return null;
    const fallbackSource = activeSource ?? sources.find(source => source.isEnabled) ?? sources[0] ?? null;
    return {
      id: 'optimistic-room-music-session',
      serverId,
      channelId,
      status: optimisticStatus,
      currentSourceId: fallbackSource?.id ?? null,
      source: fallbackSource,
      startedBy: null,
      startedAt: null,
      pausedAt: null,
      positionMs: 0,
      volume: 70,
    };
  }, [activeSource, channelId, optimisticStatus, serverId, session, sources]);

  return {
    sources,
    session: visibleSession,
    activeSource,
    loading,
    actionLoading,
    error,
    errorCode,
    actionError,
    permissions,
    refresh,
    start,
    pause,
    resume,
    stop,
    togglePlayPause,
    shouldRender: errorCode !== 'MUSIC_CHANNEL_NOT_VOICE',
  };
}
