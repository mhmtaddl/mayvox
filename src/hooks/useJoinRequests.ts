import { useCallback, useEffect, useState } from 'react';
import {
  acceptJoinRequest,
  listJoinRequests,
  rejectJoinRequest,
  type JoinRequestListItem,
} from '../lib/serverService';

interface UseJoinRequestsOptions {
  serverId: string;
  includeHistory?: boolean;
  enabled?: boolean;
}

export function useJoinRequests({
  serverId,
  includeHistory = false,
  enabled = true,
}: UseJoinRequestsOptions) {
  const [items, setItems] = useState<JoinRequestListItem[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !serverId) {
      setItems(null);
      setError('');
      return;
    }
    setError('');
    try {
      const r = await listJoinRequests(serverId, includeHistory);
      setItems(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Başvurular yüklenemedi');
    }
  }, [serverId, includeHistory, enabled]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!enabled || !serverId) return;
    const onLocalUpdate = () => { void load(); };
    window.addEventListener('pigevox:join-request:local-update', onLocalUpdate);
    return () => window.removeEventListener('pigevox:join-request:local-update', onLocalUpdate);
  }, [enabled, serverId, load]);

  const onAccept = useCallback(async (id: string) => {
    if (busyId || !enabled || !serverId) return;
    setBusyId(id);
    try {
      await acceptJoinRequest(serverId, id);
      await load();
      window.dispatchEvent(new Event('pigevox:join-request:local-update'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kabul işlemi başarısız');
    } finally {
      setBusyId(null);
    }
  }, [busyId, enabled, serverId, load]);

  const onReject = useCallback(async (id: string) => {
    if (busyId || !enabled || !serverId) return;
    setBusyId(id);
    try {
      await rejectJoinRequest(serverId, id);
      await load();
      window.dispatchEvent(new Event('pigevox:join-request:local-update'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Red işlemi başarısız');
    } finally {
      setBusyId(null);
    }
  }, [busyId, enabled, serverId, load]);

  return {
    items,
    error,
    busyId,
    load,
    onAccept,
    onReject,
  };
}
