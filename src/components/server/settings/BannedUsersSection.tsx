import React, { useCallback, useEffect, useState } from 'react';
import { Ban, ChevronDown, ChevronRight, Shield } from 'lucide-react';
import {
  type ServerBan,
  getBans, unbanMember,
} from '../../../lib/serverService';
import { fmtDate } from './shared';

interface Props {
  serverId: string;
  showToast: (m: string) => void;
}

/**
 * Yasaklı kullanıcılar — sunucudan ban'lanmış kişiler.
 * Banlı kullanıcı üye listesinde görünmez, o yüzden MembersTab'ın altında
 * ayrı bir collapsible section olarak yer alır.
 *
 * Default kapalı (ban listesi sık erişilmez). Açınca getBans fetch.
 * ServerBan shape dar (userId, reason, bannedBy, createdAt) — avatar/isim yok.
 */
export default function BannedUsersSection({ serverId, showToast }: Props) {
  const [open, setOpen] = useState(false);
  const [bans, setBans] = useState<ServerBan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getBans(serverId);
      setBans(r);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Yasaklı liste yüklenemedi');
      setBans([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, showToast]);

  // Açılınca ilk kez yükle
  useEffect(() => {
    if (open && bans === null) {
      void load();
    }
  }, [open, bans, load]);

  const handleUnban = async (b: ServerBan) => {
    setBusyId(b.userId);
    try {
      await unbanMember(serverId, b.userId);
      showToast('Yasak kaldırıldı');
      setBans(prev => (prev ?? []).filter(x => x.userId !== b.userId));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Yasak kaldırılamadı');
    } finally {
      setBusyId(null);
    }
  };

  const count = bans?.length ?? 0;

  return (
    <section
      className="rounded-2xl"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[rgba(var(--glass-tint),0.03)]"
      >
        {open
          ? <ChevronDown size={13} className="text-[var(--theme-secondary-text)]/60 shrink-0" />
          : <ChevronRight size={13} className="text-[var(--theme-secondary-text)]/60 shrink-0" />}
        <Ban size={13} className="text-red-400 shrink-0" />
        <span className="text-[12.5px] font-bold text-[var(--theme-text)]">Yasaklı kullanıcılar</span>
        {bans && count > 0 && (
          <span
            className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
            style={{
              background: 'rgba(239,68,68,0.10)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.22)',
            }}
          >
            {count}
          </span>
        )}
        {!open && (
          <span className="ml-auto text-[10.5px] text-[var(--theme-secondary-text)]/45">
            Göster
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-3" style={{ borderTop: '1px solid rgba(var(--glass-tint),0.06)' }}>
          {loading && bans === null ? (
            <div className="py-6 text-center text-[11px] text-[var(--theme-secondary-text)]/50">
              Yükleniyor…
            </div>
          ) : !bans || bans.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-[var(--theme-secondary-text)]/50">
              Yasaklı kullanıcı yok
            </div>
          ) : (
            <ul className="space-y-1 pt-2">
              {bans.map(b => {
                const reason = b.reason?.trim() || 'Sebep belirtilmedi';
                return (
                  <li
                    key={b.userId}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors hover:bg-[rgba(var(--glass-tint),0.04)]"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.16)',
                      }}
                    >
                      <Ban size={12} className="text-red-400/85" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: 'rgba(var(--glass-tint),0.05)',
                            color: 'var(--theme-text)',
                            border: '1px solid rgba(var(--glass-tint),0.08)',
                          }}
                          title={`Kullanıcı ID: ${b.userId}`}
                        >
                          {b.userId.slice(0, 8)}
                        </span>
                        <span className="text-[11.5px] text-[var(--theme-text)]/85 truncate">
                          {reason}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--theme-secondary-text)]/50 mt-0.5">
                        {fmtDate(b.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnban(b)}
                      disabled={busyId === b.userId}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[10.5px] font-semibold shrink-0 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      style={{
                        background: 'rgba(52,211,153,0.10)',
                        color: '#34d399',
                        border: '1px solid rgba(52,211,153,0.22)',
                      }}
                      title="Yasağı kaldır"
                    >
                      {busyId === b.userId
                        ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <Shield size={10} />}
                      Yasağı kaldır
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
