import React, { useCallback, useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { type ServerBan, getBans, unbanMember } from '../../../lib/serverService';
import { fmtDate, Empty, Loader } from './shared';

interface Props {
  serverId: string;
  showToast: (m: string) => void;
}

// ══════════════════════════════════════
// YASAKLAR
// ══════════════════════════════════════
export default function BansTab({ serverId, showToast }: Props) {
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setLoading(true); setBans(await getBans(serverId)); } catch { showToast('Yüklenemedi'); } finally { setLoading(false); } }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <Loader />;
  return bans.length === 0 ? <Empty text="Yasaklı kullanıcı yok" /> : (
    <div className="space-y-0.5">{bans.map(b => (
      <div key={b.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] group transition-colors">
        <div className="w-7 h-7 rounded-[8px] bg-red-500/8 flex items-center justify-center shrink-0"><Ban size={11} className="text-red-400/40" /></div>
        <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{b.userId.slice(0, 8)}</div><div className="text-[8px] text-[var(--theme-secondary-text)]/25">{b.reason || 'Neden belirtilmedi'} · {fmtDate(b.createdAt)}</div></div>
        <button onClick={() => unbanMember(serverId, b.userId).then(load).catch((e: Error) => showToast(e.message))} className="text-[8px] font-semibold px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 opacity-80 group-hover:opacity-100 transition-all">Kaldır</button>
      </div>
    ))}</div>
  );
}
