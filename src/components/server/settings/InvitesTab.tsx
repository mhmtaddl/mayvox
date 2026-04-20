import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mail, Search, Plus, Copy, Trash2 } from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import {
  type ServerInvite, type SentInvite,
  getInvites, createInvite, deleteInvite,
  getMembers, sendServerInvite, getSentInvites, cancelSentInvite,
} from '../../../lib/serverService';
import { supabase } from '../../../lib/supabase';
import { IC, fmtDate, Empty, Loader } from './shared';

interface Props {
  serverId: string;
  showToast: (m: string) => void;
}

// ══════════════════════════════════════
// DAVETLER — Kod + Kullanıcı
// ══════════════════════════════════════
export default function InvitesTab({ serverId, showToast }: Props) {
  const [mode, setMode] = useState<'code' | 'user'>('code');
  return (
    <div className="space-y-3">
      <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'rgba(var(--glass-tint), 0.03)' }}>
        <button onClick={() => setMode('code')} className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${mode === 'code' ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/30 hover:text-[var(--theme-text)]'}`}>Kod ile Davet</button>
        <button onClick={() => setMode('user')} className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${mode === 'user' ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/30 hover:text-[var(--theme-text)]'}`}>Kullanıcı Davet Et</button>
      </div>
      {mode === 'code' ? <CodeInvites serverId={serverId} showToast={showToast} /> : <UserInvites serverId={serverId} showToast={showToast} />}
    </div>
  );
}

function CodeInvites({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expHrs, setExpHrs] = useState('');

  const load = useCallback(async () => { try { setLoading(true); setInvites(await getInvites(serverId)); } catch { showToast('Yüklenemedi'); } finally { setLoading(false); } }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  return (
    <>
      <div className="p-3 rounded-lg" style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.05)' }}>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><label className="text-[8px] text-[var(--theme-secondary-text)]/25 mb-0.5 block">Maks kullanım</label><input value={maxUses} onChange={e => setMaxUses(e.target.value.replace(/\D/g, ''))} placeholder="∞" className={IC + ' !text-[10px] !py-1.5'} /></div>
          <div className="flex-1"><label className="text-[8px] text-[var(--theme-secondary-text)]/25 mb-0.5 block">Süre (saat)</label><input value={expHrs} onChange={e => setExpHrs(e.target.value.replace(/\D/g, ''))} placeholder="∞" className={IC + ' !text-[10px] !py-1.5'} /></div>
          <button onClick={async () => { try { setCreating(true); await createInvite(serverId, maxUses ? parseInt(maxUses) : null, expHrs ? parseInt(expHrs) : null); setMaxUses(''); setExpHrs(''); load(); showToast('Oluşturuldu'); } catch (e: any) { showToast(e.message); } finally { setCreating(false); } }} disabled={creating} className="h-8 px-3 rounded text-[9px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-40" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}><Plus size={10} /> Oluştur</button>
        </div>
      </div>
      {invites.length === 0 ? <Empty text="Aktif davet kodu yok" /> : invites.map(inv => (
        <div key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] group transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="text-[11px] font-mono font-bold text-[var(--theme-text)] tracking-wider">{inv.code}</span><button onClick={() => { navigator.clipboard.writeText(inv.code); showToast('Kopyalandı'); }} className="text-[var(--theme-accent)]/40 hover:text-[var(--theme-accent)]"><Copy size={9} /></button></div>
            <div className="text-[8px] text-[var(--theme-secondary-text)]/25">{inv.usedCount}{inv.maxUses ? `/${inv.maxUses}` : ''} · {inv.expiresAt ? fmtDate(inv.expiresAt) : 'Süresiz'}</div>
          </div>
          <button onClick={() => deleteInvite(serverId, inv.id).then(load).catch((e: Error) => showToast(e.message))} className="w-5 h-5 rounded flex items-center justify-center text-red-400/55 hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-all"><Trash2 size={10} /></button>
        </div>
      ))}
    </>
  );
}

interface SearchedUser { id: string; name: string; first_name: string; last_name: string; avatar: string | null; }

function UserInvites({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const seqRef = useRef(0);

  // Mevcut üyeler + gönderilmiş davetler
  useEffect(() => {
    getMembers(serverId).then(m => setMemberIds(new Set(m.map(x => x.userId)))).catch(() => {});
    getSentInvites(serverId).then(inv => { setSentInvites(inv); setSentIds(new Set(inv.map(i => i.invitedUserId))); }).catch(() => {});
  }, [serverId]);

  // Debounced arama
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.from('profiles').select('id, name, first_name, last_name, avatar').or(`name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`).order('name').limit(10);
        if (seq !== seqRef.current) return;
        setResults((data ?? []) as SearchedUser[]);
      } catch { if (seq === seqRef.current) setResults([]); }
      finally { if (seq === seqRef.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleInvite = async (userId: string) => {
    try { setInvitingId(userId); await sendServerInvite(serverId, userId); setSentIds(prev => new Set(prev).add(userId)); showToast('Davet gönderildi'); }
    catch (e: any) { showToast(e.message); } finally { setInvitingId(null); }
  };

  const filtered = results.filter(u => !memberIds.has(u.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 h-9 rounded-lg px-3" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
        <Search size={12} className="text-[var(--theme-secondary-text)]/20 shrink-0" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kullanıcı adı ile ara..." className="flex-1 bg-transparent text-[10px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/20 outline-none" />
        {loading && <div className="w-3 h-3 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />}
      </div>

      {!query.trim() ? (
        sentInvites.length > 0 ? (
          <div>
            <div className="text-[8px] font-bold text-[var(--theme-secondary-text)]/25 uppercase tracking-wider mb-2">Bekleyen Davetler</div>
            {sentInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] group transition-colors">
                <div className="w-7 h-7 rounded-[8px] bg-[rgba(var(--glass-tint),0.08)] flex items-center justify-center shrink-0"><Mail size={11} className="text-[var(--theme-accent)]/40" /></div>
                <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{inv.invitedUserName}</div><div className="text-[8px] text-[var(--theme-secondary-text)]/25">{fmtDate(inv.createdAt)}</div></div>
                <span className="text-[8px] font-semibold text-amber-400/60 px-2 py-0.5 rounded-full bg-amber-500/8">Bekliyor</span>
                <button onClick={() => cancelSentInvite(serverId, inv.id).then(() => { setSentInvites(p => p.filter(i => i.id !== inv.id)); setSentIds(p => { const n = new Set(p); n.delete(inv.invitedUserId); return n; }); showToast('İptal edildi'); }).catch((e: Error) => showToast(e.message))}
                  className="w-5 h-5 rounded flex items-center justify-center text-red-400/55 hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-all"><X size={10} /></button>
              </div>
            ))}
          </div>
        ) : <Empty text="Kullanıcı adı yazarak ara" sub="Davet gönder, kabul ederse sunucuna katılır" />
      ) : filtered.length === 0 && !loading ? <Empty text="Kullanıcı bulunamadı" /> : (
        <div className="space-y-0.5">
          {filtered.map(u => {
            const full = [u.first_name, u.last_name].filter(Boolean).join(' ');
            const alreadySent = sentIds.has(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] transition-colors">
                <div className="w-7 h-7 rounded-[8px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
                  <AvatarContent
                    avatar={u.avatar}
                    statusText="Online"
                    firstName={u.first_name}
                    name={u.name}
                    letterClassName="text-[8px] font-bold text-[var(--theme-secondary-text)]/40"
                  />
                </div>
                <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{u.name}</div>{full && <div className="text-[8px] text-[var(--theme-secondary-text)]/25 truncate">{full}</div>}</div>
                {alreadySent ? <span className="text-[8px] font-semibold text-amber-400/60 shrink-0">Gönderildi</span> : (
                  <button onClick={() => handleInvite(u.id)} disabled={invitingId === u.id} className="text-[8px] font-bold text-[var(--theme-accent)] px-2.5 py-1 rounded bg-[var(--theme-accent)]/8 hover:bg-[var(--theme-accent)]/15 transition-colors shrink-0 disabled:opacity-40">{invitingId === u.id ? '...' : 'Davet Et'}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
