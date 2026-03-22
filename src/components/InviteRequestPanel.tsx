import React, { useState, useEffect } from 'react';
import { Mail, Send, X, Clock, Check, Loader, Copy } from 'lucide-react';
import { InviteRequest } from '../types';

interface Props {
  requests: InviteRequest[];
  onSendCode: (req: InviteRequest) => Promise<{ code?: string; error?: string }>;
  onReject: (req: InviteRequest) => Promise<void>;
}

function RequestCard({
  req,
  onSendCode,
  onReject,
}: {
  req: InviteRequest;
  onSendCode: (req: InviteRequest) => Promise<{ code?: string; error?: string }>;
  onReject: (req: InviteRequest) => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!req.expiresAt) return;
    const tick = () => {
      const s = Math.max(0, Math.floor((req.expiresAt - Date.now()) / 1000));
      setSecondsLeft(s);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [req.expiresAt]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSend = async () => {
    setSending(true);
    const result = await onSendCode(req);
    setSending(false);
    if (result.code) setSentCode(result.code);
  };

  const handleReject = async () => {
    setRejecting(true);
    await onReject(req);
    setRejecting(false);
  };

  const handleCopy = () => {
    if (!sentCode) return;
    navigator.clipboard.writeText(sentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (sentCode) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Check size={12} className="text-emerald-500" />
          <span className="text-[11px] font-bold text-emerald-500">Kod gönderildi</span>
          <span className="text-[10px] text-[var(--theme-secondary-text)] ml-auto truncate max-w-[110px]">{req.email}</span>
        </div>
        <div className="flex items-center gap-2 bg-[var(--theme-bg)] rounded-lg px-3 py-2 border border-[var(--theme-border)]">
          <span className="font-mono font-black text-[var(--theme-text)] tracking-wider text-sm flex-1 select-all">
            {sentCode}
          </span>
          <button
            onClick={handleCopy}
            className="text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
            title="Kopyala"
          >
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
        </div>
        <p className="text-[9px] text-[var(--theme-secondary-text)] mt-1.5 text-center leading-tight">
          E-posta gönderildi. Yedek olarak kodu kopyalayabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3 p-3">
        <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 flex items-center justify-center">
          <Mail size={14} className="text-[var(--theme-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-[var(--theme-text)] leading-snug">
            Davet kodu talep ediliyor
          </p>
          <p className="text-[10px] text-[var(--theme-secondary-text)] mt-0.5 truncate">{req.email}</p>
          {secondsLeft > 0 && (
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] font-bold ${
                secondsLeft < 60 ? 'text-red-500 animate-pulse' : 'text-[var(--theme-secondary-text)]'
              }`}
            >
              <Clock size={10} />
              <span>{formatTime(secondsLeft)} kaldı</span>
            </div>
          )}
          {req.rejectionCount > 0 && (
            <p className="text-[9px] text-amber-500 mt-0.5">{req.rejectionCount}. talep</p>
          )}
        </div>
      </div>
      <div className="flex border-t border-[var(--theme-border)]">
        <button
          onClick={handleSend}
          disabled={sending || rejecting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
        >
          {sending ? <Loader size={11} className="animate-spin" /> : <Send size={11} />}
          Kod Gönder
        </button>
        <div className="w-px bg-[var(--theme-border)]" />
        <button
          onClick={handleReject}
          disabled={sending || rejecting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {rejecting ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
          Daveti Reddet
        </button>
      </div>
    </div>
  );
}

export default function InviteRequestPanel({ requests, onSendCode, onReject }: Props) {
  if (requests.length === 0) return null;

  return (
    <>
      {requests.map(req => (
        <React.Fragment key={req.id}>
          <RequestCard req={req} onSendCode={onSendCode} onReject={onReject} />
        </React.Fragment>
      ))}
    </>
  );
}
