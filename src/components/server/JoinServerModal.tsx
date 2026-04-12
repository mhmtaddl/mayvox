import React, { useState } from 'react';
import { Hash } from 'lucide-react';
import { joinServer, acceptInviteLink, type Server } from '../../lib/serverService';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type CodeState = 'idle' | 'checking' | 'valid' | 'invalid' | 'submitting';

// V2 token: base64url 24 byte → ~32 karakter (28-40 arası tolere).
// Legacy kod: nanoid(8) alphanumeric uppercase.
function looksLikeV2Token(raw: string): boolean {
  // URL gelirse son segmenti al
  const last = raw.includes('/') ? raw.split('/').filter(Boolean).pop() ?? raw : raw;
  return last.length >= 28 && /^[A-Za-z0-9_-]+$/.test(last);
}

export default function JoinServerModal({ onClose, onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<CodeState>('idle');
  const [error, setError] = useState('');
  const [joinedName, setJoinedName] = useState('');

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || state === 'checking' || state === 'submitting') return;

    setState('checking');
    setError('');

    try {
      setState('submitting');
      if (looksLikeV2Token(trimmed)) {
        // V2 link invite akışı
        const result = await acceptInviteLink(trimmed);
        setJoinedName(result.alreadyApplied ? 'Zaten erişim var' : 'Davet kabul edildi');
        setState('valid');
        setTimeout(() => { onSuccess(); onClose(); }, 800);
      } else {
        const server = await joinServer(trimmed);
        setJoinedName(server.name);
        setState('valid');
        setTimeout(() => { onSuccess(); onClose(); }, 800);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bir hata oluştu';
      setError(msg);
      setState('invalid');
    }
  };

  const isDisabled = !code.trim() || state === 'checking' || state === 'submitting' || state === 'valid';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[400px] max-w-[92vw] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(var(--glass-tint), 0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform hover:scale-[1.03]"
            style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.18), rgba(var(--theme-accent-rgb), 0.08))', boxShadow: '0 0 16px rgba(var(--theme-accent-rgb), 0.08) inset' }}>
            <Hash size={20} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] font-bold text-[var(--theme-text)]">Davet Kodu ile Katıl</h3>
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-50 mt-0.5">Sana gönderilen davet kodunu girerek sunucuya katıl.</p>
          </div>
        </div>

        {/* Input */}
        <div className="px-6 pt-2">
          <div className={`flex items-center gap-2.5 h-12 rounded-xl px-4 transition-all duration-150 ${
            state === 'invalid' ? 'ring-1 ring-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.06)]' :
            state === 'valid' ? 'ring-1 ring-emerald-500/30' :
            'focus-within:ring-1 focus-within:ring-[var(--theme-accent)]/25'
          }`} style={{ background: 'rgba(var(--glass-tint), 0.05)', border: state === 'invalid' ? '1px solid rgba(239,68,68,0.15)' : state === 'valid' ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(var(--glass-tint), 0.1)' }}>
            <Hash size={15} className="text-[var(--theme-secondary-text)] opacity-40 shrink-0" />
            <input value={code}
              onChange={e => {
                // V2 token case-sensitive; legacy 8-char kod uppercase — length'e göre normalize.
                const v = e.target.value;
                setCode(v.length <= 10 ? v.toUpperCase() : v);
                if (state === 'invalid') { setState('idle'); setError(''); }
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
              placeholder="Davet kodu veya linkini yapıştır"
              className="flex-1 bg-transparent text-[14px] font-mono tracking-widest text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/22 placeholder:tracking-normal placeholder:font-sans outline-none" autoFocus />
            {(state === 'checking' || state === 'submitting') && <div className="w-4 h-4 border-2 border-[var(--theme-accent)]/25 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />}
          </div>
        </div>

        {/* Status area */}
        <div className="px-6 mt-2" style={{ minHeight: '56px' }}>
          {state === 'valid' && joinedName ? (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/12 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-emerald-400">Katılım başarılı</div>
                <div className="text-[10px] text-[var(--theme-secondary-text)] opacity-40 mt-0.5">{joinedName} sunucusuna katıldın</div>
              </div>
            </div>
          ) : state === 'invalid' && error ? (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.08)' }}>
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400/70"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-red-400/80">{error}</div>
              </div>
            </div>
          ) : (state === 'checking' || state === 'submitting') ? (
            <div className="flex items-center justify-center gap-2.5 py-4">
              <div className="w-4 h-4 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin" />
              <span className="text-[11px] text-[var(--theme-accent)] opacity-50">Davet kodu doğrulanıyor...</span>
            </div>
          ) : (
            <div className="py-3 px-1">
              <span className="text-[10px] text-[var(--theme-secondary-text)] opacity-30">Örn: ABCD1234 — Büyük/küçük harf duyarlı olabilir.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-1 flex items-center justify-end gap-2.5">
          <button onClick={onClose}
            className="h-10 px-5 rounded-xl text-[12px] font-semibold text-[var(--theme-secondary-text)] opacity-50 hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(var(--glass-tint), 0.05)' }}>
            İptal
          </button>
          <button onClick={handleSubmit} disabled={isDisabled}
            className="h-10 px-6 rounded-xl text-[13px] font-bold disabled:opacity-25 flex items-center gap-2 transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)', boxShadow: '0 4px 16px rgba(var(--theme-accent-rgb), 0.2)' }}>
            {state === 'submitting' ? 'Katılıyor...' : 'Doğrula ve Katıl'}
          </button>
        </div>
      </div>
    </div>
  );
}
