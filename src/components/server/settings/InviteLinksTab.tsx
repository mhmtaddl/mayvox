import React, { useCallback, useEffect, useState } from 'react';
import { Link2, Trash2, Copy, Check, AlertCircle, Hash, Lock, Plus } from 'lucide-react';
import {
  listInviteLinks,
  createInviteLink,
  revokeInviteLink,
  type InviteLinkResponse,
  type InviteLinkCreateResponse,
} from '../../../lib/serverService';

interface Props {
  serverId: string;
  canCreate: boolean;
  canRevoke: boolean;
}

const STATE_LABEL: Record<string, string> = {
  active: 'Aktif',
  expired: 'Süresi doldu',
  revoked: 'İptal edildi',
  exhausted: 'Kullanım limiti doldu',
};

const STATE_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
  expired: 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]/50 border-[rgba(var(--glass-tint),0.08)]',
  revoked: 'bg-red-500/10 text-red-400/80 border-red-500/15',
  exhausted: 'bg-amber-500/10 text-amber-400/85 border-amber-500/20',
};

function formatRelativeTr(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffSec = Math.floor((ts - Date.now()) / 1000);
  if (diffSec <= 0) return 'doldu';
  if (diffSec < 3600) return `${Math.ceil(diffSec / 60)} dk`;
  if (diffSec < 86400) return `${Math.ceil(diffSec / 3600)} sa`;
  return `${Math.ceil(diffSec / 86400)} gün`;
}

export default function InviteLinksTab({ serverId, canCreate, canRevoke }: Props) {
  const [rows, setRows] = useState<InviteLinkResponse[] | null>(null);
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<InviteLinkCreateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await listInviteLinks(serverId, { includeInactive });
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Davet listesi yüklenemedi');
    }
  }, [serverId, includeInactive]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const r = await createInviteLink(serverId, { scope: 'server', expiresInHours: 24 * 7, maxUses: 25 });
      setJustCreated(r);
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Davet oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard perms */ }
  };

  const handleRevoke = async (id: string) => {
    if (revoking[id]) return;
    setRevoking(p => ({ ...p, [id]: true }));
    try {
      await revokeInviteLink(serverId, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Davet iptal edilemedi');
    } finally {
      setRevoking(p => ({ ...p, [id]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] text-red-400/85"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
        >
          <AlertCircle size={12} />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Create action */}
      {canCreate && (
        <div className="p-2.5 rounded-xl"
          style={{ background: 'rgba(var(--theme-accent-rgb), 0.05)', border: '1px solid rgba(var(--theme-accent-rgb), 0.12)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={12} className="text-[var(--theme-accent)]/70" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-accent)]/70">Yeni Sunucu Davet Linki</span>
            <span className="text-[9px] text-[var(--theme-secondary-text)]/40 ml-auto">7 gün · 25 kullanım</span>
          </div>
          {!justCreated ? (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full h-8 rounded-lg text-[11px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}
            >
              {creating ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus size={12} strokeWidth={2.2} />}
              <span>{creating ? 'Oluşturuluyor' : 'Davet Linki Oluştur'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-2.5 h-8 rounded-lg flex items-center"
                style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}
              >
                <span className="text-[10px] font-mono text-[var(--theme-text)]/80 truncate select-all">{justCreated.token}</span>
              </div>
              <button
                onClick={handleCopy}
                className="h-8 px-2.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1.5 transition-all hover:brightness-110 active:scale-[0.97]"
                style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}
              >
                {copied ? <><Check size={11} strokeWidth={2.5} /><span>Kopyalandı</span></> : <><Copy size={11} strokeWidth={2.2} /><span>Kopyala</span></>}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-secondary-text)]/40">
          Mevcut Davetler {rows && <span className="text-[var(--theme-accent)]/50 ml-1">({rows.length})</span>}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[10px] text-[var(--theme-secondary-text)]/50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
            className="w-3 h-3"
          />
          Geçmişi göster
        </label>
      </div>

      {!rows ? (
        <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Davet linki yok</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map(r => (
            <li key={r.id}
              className="flex items-center gap-2 p-2.5 rounded-xl"
              style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: r.scope === 'channel' ? 'rgba(var(--theme-accent-rgb), 0.1)' : 'rgba(var(--glass-tint), 0.08)' }}
              >
                {r.scope === 'channel' ? <Lock size={12} className="text-[var(--theme-accent)]/70" /> : <Hash size={12} className="text-[var(--theme-secondary-text)]/55" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${STATE_BADGE[r.state] ?? STATE_BADGE.active}`}>
                    {STATE_LABEL[r.state] ?? r.state}
                  </span>
                  <span className="text-[10px] text-[var(--theme-secondary-text)]/55">
                    {r.scope === 'channel' ? 'Kanal daveti' : 'Sunucu daveti'}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--theme-secondary-text)]/45 mt-0.5">
                  Kullanım: <span className="text-[var(--theme-text)]/70">{r.usedCount}{r.maxUses ? ` / ${r.maxUses}` : ''}</span>
                  {r.expiresAt && <span className="mx-1.5">·</span>}
                  {r.expiresAt && <span>Kalan: <span className="text-[var(--theme-text)]/70">{formatRelativeTr(r.expiresAt)}</span></span>}
                </div>
              </div>
              {canRevoke && r.state === 'active' && (
                <button
                  onClick={() => handleRevoke(r.id)}
                  disabled={!!revoking[r.id]}
                  className="h-7 px-2 rounded-lg text-[10px] font-semibold text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {revoking[r.id] ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Trash2 size={11} />}
                  <span>İptal</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
