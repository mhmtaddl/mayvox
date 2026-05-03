import React, { useState, useEffect } from 'react';
import { Mail, Send, X, Clock, Check, Loader, Copy, AlertTriangle, RefreshCw } from 'lucide-react';
import { InviteRequest } from '../types';

interface Props {
  requests: InviteRequest[];
  onSendCode: (req: InviteRequest) => Promise<{ code?: string; error?: string }>;
  onReject: (req: InviteRequest) => Promise<void>;
  onDelete: (req: InviteRequest) => Promise<void>;
}

function RequestCard({
  req,
  onSendCode,
  onReject,
  onDelete,
}: {
  req: InviteRequest;
  onSendCode: (req: InviteRequest) => Promise<{ code?: string; error?: string }>;
  onReject: (req: InviteRequest) => Promise<void>;
  onDelete: (req: InviteRequest) => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(req.status === 'sent' ? (req.sentCode ?? null) : null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Propagate external status changes (e.g. from Realtime UPDATE)
  useEffect(() => {
    if (req.status === 'sent' && req.sentCode) setSentCode(req.sentCode);
  }, [req.status, req.sentCode]);

  useEffect(() => {
    if (!req.expiresAt) return;
    const tick = () => {
      const s = Math.floor(Math.max(0, req.expiresAt - Date.now()) / 1000);
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
    if (sending) return; // double-click koruması
    setSending(true);
    const result = await onSendCode(req);
    setSending(false);
    if (result.code && !result.error) setSentCode(result.code);
  };

  const handleReject = async () => {
    setRejecting(true);
    await onReject(req);
    setRejecting(false);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    await onDelete(req);
    setDeleting(false);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Başarıyla gönderildi
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
            onClick={() => handleCopy(sentCode)}
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

  // ── Gönderim başarısız (failed) — hata göster + retry butonu
  if (req.status === 'failed') {
    const failedCode = req.sentCode;
    return (
      <div>
        <div className="flex items-start gap-3 p-3">
          <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle size={14} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-red-400 leading-snug">E-posta gönderilemedi</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)] mt-0.5 truncate">{req.email}</p>
            {req.lastSendError && (
              <p className="text-[9px] text-red-400/80 mt-1 leading-snug line-clamp-2">{req.lastSendError}</p>
            )}
            {failedCode && (
              <div className="flex items-center gap-1.5 mt-1.5 bg-[var(--theme-bg)] rounded px-2 py-1 border border-[var(--theme-border)]">
                <span className="font-mono text-[10px] font-bold text-[var(--theme-text)] tracking-wider flex-1 select-all">{failedCode}</span>
                <button
                  onClick={() => handleCopy(failedCode)}
                  className="text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
                  title="Kopyala"
                >
                  {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex border-t border-[var(--theme-border)]">
          <button
            onClick={handleSend}
            disabled={sending || rejecting || deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Yeniden Dene
          </button>
          <div className="w-px bg-[var(--theme-border)]" />
          <button
            onClick={handleReject}
            disabled={sending || rejecting || deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {rejecting ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
            Daveti Reddet
          </button>
          <div className="w-px bg-[var(--theme-border)]" />
          <button
            onClick={handleDelete}
            disabled={sending || rejecting || deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-secondary-text)]/10 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
            Sil
          </button>
        </div>
      </div>
    );
  }

  // ── Gönderiliyor (sending) — takılı kalırsa iptal edilebilir
  if (req.status === 'sending') {
    return (
      <div>
        <div className="p-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 flex items-center justify-center">
              <Loader size={14} className="text-[var(--theme-accent)] animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-[var(--theme-text)]">Gönderiliyor…</p>
              <p className="text-[10px] text-[var(--theme-secondary-text)] truncate mt-0.5">{req.email}</p>
            </div>
          </div>
        </div>
        <div className="flex border-t border-[var(--theme-border)]">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
            Gönderimi İptal Et
          </button>
        </div>
      </div>
    );
  }

  // ── Bekliyor (pending)
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
          disabled={sending || rejecting || deleting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
        >
          {sending ? <Loader size={11} className="animate-spin" /> : <Send size={11} />}
          Kod Gönder
        </button>
        <div className="w-px bg-[var(--theme-border)]" />
        <button
          onClick={handleReject}
          disabled={sending || rejecting || deleting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {rejecting ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
          Daveti Reddet
        </button>
        <div className="w-px bg-[var(--theme-border)]" />
        <button
          onClick={handleDelete}
          disabled={sending || rejecting || deleting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-secondary-text)]/10 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
          Sil
        </button>
      </div>
    </div>
  );
}

export default function InviteRequestPanel({ requests, onSendCode, onReject, onDelete }: Props) {
  if (requests.length === 0) return null;

  return (
    <>
      {requests.map(req => (
        <React.Fragment key={req.id}>
          <RequestCard req={req} onSendCode={onSendCode} onReject={onReject} onDelete={onDelete} />
        </React.Fragment>
      ))}
    </>
  );
}
