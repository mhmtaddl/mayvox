import React from 'react';
import { KeyRound, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ResetRequest {
  userId: string;
  userName: string;
  userEmail: string;
}

interface Props {
  requests: ResetRequest[];
  onApprove: (req: ResetRequest) => void;
  onDismiss: (userId: string) => void;
}

export default function PasswordResetPanel({ requests, onApprove, onDismiss }: Props) {
  if (requests.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[500] flex flex-col gap-2 max-w-xs w-full">
      <AnimatePresence>
        {requests.map(req => (
          <motion.div
            key={req.userId}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-start gap-3 p-3">
              <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <KeyRound size={14} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[var(--theme-text)] leading-snug">
                  <span className="text-[var(--theme-accent)]">{req.userName}</span> kullanıcısı parolasını sıfırlamak istiyor.
                </p>
                <p className="text-[10px] text-[var(--theme-secondary-text)] mt-0.5 truncate">{req.userEmail}</p>
              </div>
            </div>
            <div className="flex border-t border-[var(--theme-border)]">
              <button
                onClick={() => onApprove(req)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              >
                <Check size={13} />
                Onayla
              </button>
              <div className="w-px bg-[var(--theme-border)]" />
              <button
                onClick={() => onDismiss(req.userId)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <X size={13} />
                Reddet
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
