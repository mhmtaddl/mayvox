import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Hash, Loader2, X } from 'lucide-react';
import { joinServer, acceptInviteLink } from '../../lib/serverService';
import { MV_PRESS } from '../../lib/signature';
import Modal from '../Modal';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type CodeState = 'idle' | 'checking' | 'valid' | 'invalid' | 'submitting';

// V2 token: base64url 24 byte → ~32 karakter (28-40 arası tolere).
// Legacy kod: nanoid(8) alphanumeric uppercase.
function looksLikeV2Token(raw: string): boolean {
  // URL gelirse son segmenti al
  const lastSegment = raw.includes('/') ? raw.split('/').filter(Boolean).pop() ?? raw : raw;
  const last = lastSegment.split(/[?#]/, 1)[0] || lastSegment;
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
    <Modal open onClose={onClose} width={390} padded={false}>
      <div className="flex items-start gap-3 px-[18px] pb-3 pt-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: 'rgba(var(--theme-accent-rgb),0.10)',
            border: '1px solid rgba(var(--theme-accent-rgb),0.14)',
          }}
        >
          <Hash size={17} className="text-[var(--theme-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-5 text-[var(--theme-text)]">Davet Kodu ile Katıl</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--theme-secondary-text)]/52">
            Kod veya davet linkini yapıştır.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/48 transition-colors hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)]"
          title="Kapat"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-[18px] pb-4">
        <div
          className={[
            'flex h-10 items-center gap-2 rounded-xl px-3 transition-[border-color,background-color] duration-150',
            state === 'invalid'
              ? ''
              : state === 'valid'
                ? ''
                : '',
          ].join(' ')}
          style={{
            background: 'rgba(var(--glass-tint),0.035)',
            border: state === 'invalid'
              ? '1px solid rgba(239,68,68,0.22)'
              : state === 'valid'
                ? '1px solid rgba(16,185,129,0.20)'
                : '1px solid rgba(var(--glass-tint),0.10)',
          }}
        >
          <Hash size={13} className="shrink-0 text-[var(--theme-secondary-text)]/42" />
          <input
            value={code}
            onChange={e => {
              // V2 token case-sensitive; legacy 8-char kod uppercase — length'e göre normalize.
              const v = e.target.value;
              setCode(v.length <= 10 ? v.toUpperCase() : v);
              if (state === 'invalid') { setState('idle'); setError(''); }
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
            placeholder="ABCD1234 veya https://..."
            className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-mono text-[12.5px] font-semibold tracking-[0.08em] text-[var(--theme-text)] shadow-none outline-none ring-0 placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-[var(--theme-secondary-text)]/28 focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0"
            style={{ background: 'transparent', boxShadow: 'none' }}
            autoFocus
          />
          {(state === 'checking' || state === 'submitting') && (
            <Loader2 size={14} className="shrink-0 animate-spin text-[var(--theme-accent)]/75" />
          )}
        </div>

        <div className="min-h-[42px] pt-2">
          {state === 'valid' && joinedName ? (
            <StatusLine
              tone="success"
              icon={<CheckCircle2 size={14} />}
              title="Katılım başarılı"
              text={joinedName === 'Zaten erişim var' ? joinedName : `${joinedName} sunucusuna katıldın`}
            />
          ) : state === 'invalid' && error ? (
            <StatusLine tone="error" icon={<AlertCircle size={14} />} title={error} />
          ) : (state === 'checking' || state === 'submitting') ? (
            <div className="flex items-center gap-2 px-1 py-2 text-[11px] font-semibold text-[var(--theme-accent)]/68">
              <Loader2 size={13} className="animate-spin" />
              Davet doğrulanıyor
            </div>
          ) : (
            <div className="px-1 py-2 text-[10.5px] font-medium text-[var(--theme-secondary-text)]/38">
              Davet linkleri ve klasik kodlar desteklenir.
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-[11.5px] font-semibold text-[var(--theme-secondary-text)]/62 transition-colors hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)]"
          >
            İptal
          </button>
          <motion.button
            type="button"
            {...(isDisabled ? {} : MV_PRESS)}
            onClick={handleSubmit}
            disabled={isDisabled}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[11.5px] font-bold transition-[filter,opacity] hover:brightness-110 disabled:opacity-35"
            style={{
              background: 'var(--theme-accent)',
              color: 'var(--theme-text-on-accent, #000)',
              boxShadow: '0 8px 22px rgba(var(--theme-accent-rgb),0.18)',
            }}
          >
            {state === 'submitting' && <Loader2 size={12} className="animate-spin" />}
            {state === 'submitting' ? 'Katılıyor' : 'Katıl'}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}

function StatusLine({
  tone,
  icon,
  title,
  text,
}: {
  tone: 'success' | 'error';
  icon: React.ReactNode;
  title: string;
  text?: string;
}) {
  const success = tone === 'success';
  return (
    <div
      className="flex items-start gap-2 rounded-xl px-2.5 py-2"
      style={{
        background: success ? 'rgba(16,185,129,0.055)' : 'rgba(239,68,68,0.05)',
        border: success ? '1px solid rgba(16,185,129,0.12)' : '1px solid rgba(239,68,68,0.12)',
      }}
    >
      <span className={success ? 'mt-0.5 text-emerald-400/85' : 'mt-0.5 text-red-400/85'}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={success ? 'block text-[11.5px] font-bold text-emerald-300/90' : 'block text-[11.5px] font-bold text-red-300/90'}>
          {title}
        </span>
        {text && (
          <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/48">
            {text}
          </span>
        )}
      </span>
    </div>
  );
}
