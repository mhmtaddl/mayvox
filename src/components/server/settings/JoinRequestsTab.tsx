import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, X, UserCheck, Clock } from 'lucide-react';
import {
  listJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  type JoinRequestListItem,
} from '../../../lib/serverService';

interface Props {
  serverId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} sa önce`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  accepted: 'Kabul edildi',
  rejected: 'Reddedildi',
};

export default function JoinRequestsTab({ serverId }: Props) {
  const [items, setItems] = useState<JoinRequestListItem[] | null>(null);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await listJoinRequests(serverId, showHistory);
      setItems(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Başvurular yüklenemedi');
    }
  }, [serverId, showHistory]);

  useEffect(() => { void load(); }, [load]);

  const onAccept = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await acceptJoinRequest(serverId, id);
      await load();
      // Admin'in kendi çanındaki pending özetini anında güncelle (WS push kendine gelmez).
      window.dispatchEvent(new Event('pigevox:join-request:local-update'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kabul işlemi başarısız');
    } finally { setBusyId(null); }
  };

  const onReject = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await rejectJoinRequest(serverId, id);
      await load();
      window.dispatchEvent(new Event('pigevox:join-request:local-update'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Red işlemi başarısız');
    } finally { setBusyId(null); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowHistory(false)}
          className={`h-6 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
            !showHistory ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/55 hover:bg-[rgba(var(--glass-tint),0.05)]'
          }`}
        >
          Bekleyen Başvurular
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className={`h-6 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
            showHistory ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/55 hover:bg-[rgba(var(--glass-tint),0.05)]'
          }`}
        >
          Geçmiş Başvurular
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] text-red-400/85"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}>
          <AlertCircle size={12} />
          <span className="truncate">{error}</span>
        </div>
      )}

      {!items ? (
        <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <UserCheck size={22} className="text-[var(--theme-secondary-text)] opacity-15 mb-2" />
          <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-40">
            {showHistory ? 'Geçmiş kayıt yok' : 'Bekleyen başvuru yok'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map(it => {
            const isPending = it.status === 'pending';
            const hasAvatar = typeof it.userAvatar === 'string' && it.userAvatar.startsWith('http');
            return (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(var(--glass-tint), 0.035)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
                <div className="shrink-0 w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)' }}>
                  {hasAvatar
                    ? <img src={it.userAvatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <span className="text-[10px] font-bold text-[var(--theme-accent)] opacity-60">{(it.userName[0] ?? '?').toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--theme-text)] truncate">{it.userName}</div>
                  <div className="text-[9px] text-[var(--theme-secondary-text)]/55 flex items-center gap-1.5">
                    <Clock size={9} />
                    <span>{formatDate(it.createdAt)}</span>
                    {!isPending && <span>· {STATUS_LABEL[it.status]}</span>}
                  </div>
                </div>
                {isPending ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onReject(it.id)}
                      disabled={busyId !== null}
                      title="Reddet"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors"
                    >
                      <X size={13} />
                    </button>
                    <button
                      onClick={() => onAccept(it.id)}
                      disabled={busyId !== null}
                      title="Kabul Et"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-400/80 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 transition-colors"
                    >
                      <Check size={13} />
                    </button>
                  </div>
                ) : (
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    it.status === 'accepted' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400/70 bg-red-500/10'
                  }`}>
                    {STATUS_LABEL[it.status]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
