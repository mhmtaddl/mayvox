import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, Plus, Search, UserMinus, X, AlertCircle, Inbox } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  getChannelAccess,
  grantChannelAccess,
  revokeChannelAccess,
  getMembers,
  type ChannelAccessEntry,
  type ServerMember,
} from '../../lib/serverService';

interface Props {
  open: boolean;
  onClose: () => void;
  serverId: string;
  channelId: string;
  channelName: string;
}

export default function ChannelAccessModal({ open, onClose, serverId, channelId, channelName }: Props) {
  const [entries, setEntries] = useState<ChannelAccessEntry[]>([]);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Record<string, 'grant' | 'revoke' | undefined>>({});

  useEscapeKey(onClose, open);

  const loadAll = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      const [acc, mem] = await Promise.all([
        getChannelAccess(serverId, channelId),
        getMembers(serverId),
      ]);
      setEntries(acc);
      setMembers(mem);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erişim listesi yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [open, serverId, channelId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const grantedIds = new Set(entries.map(e => e.userId));
  const q = query.trim().toLowerCase();
  const candidates = members
    .filter(m => !grantedIds.has(m.userId))
    .filter(m => {
      if (!q) return true;
      const full = `${m.firstName ?? ''} ${m.lastName ?? ''} ${m.username ?? ''}`.toLowerCase();
      return full.includes(q);
    })
    .slice(0, 20);

  const setRowPending = (id: string, action: 'grant' | 'revoke' | undefined) => {
    setPending(prev => {
      const next = { ...prev };
      if (action) next[id] = action; else delete next[id];
      return next;
    });
  };

  const handleGrant = async (userId: string) => {
    if (pending[userId]) return;
    setRowPending(userId, 'grant');
    try {
      await grantChannelAccess(serverId, channelId, userId);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erişim verilemedi');
    } finally {
      setRowPending(userId, undefined);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (pending[userId]) return;
    setRowPending(userId, 'revoke');
    try {
      await revokeChannelAccess(serverId, channelId, userId);
      setEntries(prev => prev.filter(e => e.userId !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erişim kaldırılamadı');
    } finally {
      setRowPending(userId, undefined);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
        className="w-[480px] max-w-[92vw] rounded-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{
          maxHeight: 'min(80vh, 700px)',
          background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)',
          border: '1px solid rgba(var(--glass-tint), 0.1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div className="px-6 pt-6 pb-3 flex items-center gap-4 shrink-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.18), rgba(var(--theme-accent-rgb), 0.08))',
            }}
          >
            <Lock size={18} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-[var(--theme-text)] truncate">Kanal Erişimi</h3>
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-55 mt-0.5 truncate">{channelName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.05)] transition-colors shrink-0"
            title="Kapat"
          >
            <X size={15} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-red-400/85"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
          >
            <AlertCircle size={12} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        <div className="px-4 pb-4 overflow-y-auto flex-1">
          {/* Arama */}
          <div className="mb-3 flex items-center h-9 px-3 gap-2 rounded-xl"
            style={{ background: 'rgba(var(--glass-tint), 0.05)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}
          >
            <Search size={12} className="text-[var(--theme-secondary-text)]/40 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Üye ekle — ada göre ara"
              className="flex-1 bg-transparent text-[11px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none min-w-0"
            />
          </div>

          {/* Eklenebilecek üyeler */}
          {query && (
            <div className="mb-4">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--theme-secondary-text)]/40 mb-2 px-1">Üyeler</div>
              {candidates.length === 0 ? (
                <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-3 text-center">Eşleşen üye yok</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {candidates.map(m => (
                    <li key={m.userId}>
                      <Row
                        avatar={m.avatar}
                        fallback={m.firstName || m.username || m.userId}
                        name={`${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.username || m.userId.slice(0, 8)}
                        sub={m.username ? `@${m.username}` : ''}
                        action={{
                          label: pending[m.userId] === 'grant' ? 'Ekleniyor' : 'Ekle',
                          busy: pending[m.userId] === 'grant',
                          icon: <Plus size={12} strokeWidth={2.4} />,
                          onClick: () => handleGrant(m.userId),
                          variant: 'primary',
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Erişim verilmiş kullanıcılar */}
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--theme-secondary-text)]/40 mb-2 px-1">
              Erişim verilenler {entries.length > 0 && <span className="text-[var(--theme-accent)]/60 ml-1">({entries.length})</span>}
            </div>
            {loading ? (
              <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-6 text-center">Yükleniyor...</div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: 'rgba(var(--glass-tint), 0.05)' }}
                >
                  <Inbox size={16} className="text-[var(--theme-secondary-text)]/40" />
                </div>
                <div className="text-[11px] text-[var(--theme-secondary-text)]/50">Henüz erişim verilmemiş</div>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                <AnimatePresence initial={false}>
                  {entries.map(e => (
                    <motion.li
                      key={e.userId}
                      layout
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.16 } }}
                      transition={{ duration: 0.12 }}
                    >
                      <Row
                        fallback={e.userName}
                        name={e.userName}
                        sub=""
                        action={{
                          label: pending[e.userId] === 'revoke' ? 'Kaldırılıyor' : 'Kaldır',
                          busy: pending[e.userId] === 'revoke',
                          icon: <UserMinus size={12} strokeWidth={2.2} />,
                          onClick: () => handleRevoke(e.userId),
                          variant: 'secondary',
                        }}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Row({
  avatar, fallback, name, sub, action,
}: {
  avatar?: string | null;
  fallback: string;
  name: string;
  sub: string;
  action: { label: string; busy: boolean; icon: React.ReactNode; onClick: () => void; variant: 'primary' | 'secondary' };
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl"
      style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}
    >
      <Avatar src={avatar ?? undefined} fallback={fallback} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[var(--theme-text)] truncate">{name}</div>
        {sub && <div className="text-[10px] text-[var(--theme-secondary-text)]/45 truncate">{sub}</div>}
      </div>
      <button
        onClick={action.onClick}
        disabled={action.busy}
        className={`h-7 px-2.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-wait transition-all hover:brightness-110 active:scale-[0.97] ${
          action.variant === 'primary' ? '' : 'text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)]'
        }`}
        style={
          action.variant === 'primary'
            ? { background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }
            : { background: 'rgba(var(--glass-tint), 0.06)' }
        }
      >
        {action.busy ? <Spinner /> : action.icon}
        <span>{action.label}</span>
      </button>
    </div>
  );
}

function Spinner() {
  return <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />;
}
