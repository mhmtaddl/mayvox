import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings, Lock, Trash2, ShieldCheck } from 'lucide-react';
import { verifyChannelPassword } from '../../../lib/supabase';
import { useConfirm } from '../../../contexts/ConfirmContext';

interface Channel {
  id: string;
  name: string;
  maxUsers?: number;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  isSystemChannel?: boolean;
  mode?: string;
  password?: string;
  ownerId?: string;
}

interface Props {
  contextMenu: { x: number; y: number; channelId: string };
  channels: Channel[];
  onEditRoom: (channel: Channel) => void;
  onSetPassword: (channelId: string) => void;
  onRemovePassword: (channelId: string) => void;
  onDeleteRoom: (channelId: string) => void;
  onClose: () => void;
}

export default function ChatViewContextMenu({
  contextMenu,
  channels,
  onEditRoom,
  onSetPassword,
  onRemovePassword,
  onDeleteRoom,
  onClose,
}: Props) {
  const channel = channels.find(c => c.id === contextMenu.channelId);
  const isSystem = !!channel?.isSystemChannel;
  const isPasswordProtected = !!channel?.password;
  const { openConfirm } = useConfirm();

  // Re-auth state: şifreli oda yönetim işlemleri için şifre doğrulama
  const [reAuthAction, setReAuthAction] = useState<'edit' | 'removePassword' | 'delete' | null>(null);
  const [reAuthInput, setReAuthInput] = useState('');
  const [reAuthError, setReAuthError] = useState(false);
  const [reAuthLoading, setReAuthLoading] = useState(false);

  const executeAction = (action: 'edit' | 'removePassword' | 'delete') => {
    if (action === 'edit') {
      if (channel) onEditRoom(channel);
      onClose();
    } else if (action === 'removePassword') {
      onRemovePassword(contextMenu.channelId);
    } else if (action === 'delete') {
      onClose();
      openConfirm({
        title: 'Odayı sil',
        description: `"${channel?.name}" odası kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
        confirmText: 'Sil',
        cancelText: 'İptal',
        danger: true,
        onConfirm: () => onDeleteRoom(contextMenu.channelId),
      });
    }
  };

  const handleProtectedAction = (action: 'edit' | 'removePassword' | 'delete') => {
    if (!isPasswordProtected) {
      if (action === 'delete') {
        onClose();
        openConfirm({
          title: 'Odayı sil',
          description: `"${channel?.name}" odası kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
          confirmText: 'Sil',
          cancelText: 'İptal',
          danger: true,
          onConfirm: () => onDeleteRoom(contextMenu.channelId),
        });
      } else {
        executeAction(action);
      }
      return;
    }
    setReAuthAction(action);
    setReAuthInput('');
    setReAuthError(false);
  };

  const handleReAuthSubmit = async () => {
    if (!reAuthAction || reAuthInput.length !== 4) { setReAuthError(true); return; }
    const actionToExecute = reAuthAction; // closure'da kaybolmaması için
    setReAuthLoading(true);
    try {
      const { data, error } = await verifyChannelPassword(contextMenu.channelId, reAuthInput);
      if (error) { setReAuthError(true); return; }
      if (data === true) {
        setReAuthAction(null);
        setReAuthInput('');
        executeAction(actionToExecute);
      } else {
        setReAuthError(true);
      }
    } catch (err) {
      setReAuthError(true);
    } finally {
      setReAuthLoading(false);
    }
  };

  // Re-auth UI: şifre doğrulama ekranı
  if (reAuthAction) {
    const actionLabels = { edit: 'Oda Ayarları', removePassword: 'Şifre Kaldır', delete: 'Odayı Sil' };
    // stopNative: window.addEventListener('click') global handler'ını engeller
    const stopNative = (e: React.MouseEvent | React.FocusEvent) => { e.nativeEvent.stopImmediatePropagation(); e.stopPropagation(); };
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ top: contextMenu.y, left: contextMenu.x }}
        className="fixed z-[100] w-56 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-3 backdrop-blur-xl"
        onClick={stopNative}
        onMouseDown={stopNative}
      >
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={14} className="text-[var(--theme-accent)] shrink-0" />
          <span className="text-[11px] font-bold text-[var(--theme-text)]">Oda Şifresi Doğrula</span>
        </div>
        <p className="text-[9px] text-[var(--theme-secondary-text)] mb-2.5 leading-relaxed">
          {actionLabels[reAuthAction]} işlemi için mevcut oda şifresini girin.
        </p>
        <input
          autoFocus
          type="password"
          maxLength={4}
          placeholder="• • • •"
          className={`w-full bg-[var(--theme-sidebar)] border ${
            reAuthError ? 'border-red-500' : 'border-[var(--theme-border)]'
          } rounded-lg px-3 py-2 text-center text-base tracking-[0.5em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all mb-2`}
          value={reAuthInput}
          onChange={(e) => { setReAuthInput(e.target.value.replace(/\D/g, '')); setReAuthError(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleReAuthSubmit();
            if (e.key === 'Escape') { setReAuthAction(null); setReAuthInput(''); }
          }}
        />
        {reAuthError && <p className="text-[9px] text-red-400 font-medium mb-2">Hatalı şifre!</p>}
        <div className="flex gap-1.5">
          <button
            onClick={() => { setReAuthAction(null); setReAuthInput(''); }}
            className="flex-1 px-2 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleReAuthSubmit}
            disabled={reAuthLoading || reAuthInput.length !== 4}
            className="flex-1 px-2 py-1.5 text-[10px] font-bold text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {reAuthLoading ? '...' : 'Doğrula'}
          </button>
        </div>
      </motion.div>
    );
  }

  // Normal context menu
  const stopNativeMenu = (e: React.MouseEvent) => { e.nativeEvent.stopImmediatePropagation(); e.stopPropagation(); };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{ top: contextMenu.y, left: contextMenu.x }}
      className="fixed z-[100] w-48 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-1.5 backdrop-blur-xl"
      onClick={stopNativeMenu}
      onMouseDown={stopNativeMenu}
    >
      <button
        onClick={() => handleProtectedAction('edit')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-badge-text)] rounded-lg transition-colors"
      >
        <Settings size={14} />
        Oda Ayarları
        {isPasswordProtected && <Lock size={10} className="ml-auto opacity-40" />}
      </button>
      {!isSystem && (
        <>
          {channel?.password ? (
            <button
              onClick={() => handleProtectedAction('removePassword')}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-badge-text)] rounded-lg transition-colors"
            >
              <Lock size={14} />
              Oda Şifresini Kaldır
            </button>
          ) : (
            <button
              onClick={() => {
                onSetPassword(contextMenu.channelId);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-badge-text)] rounded-lg transition-colors"
            >
              <Lock size={14} />
              Odayı Şifrele
            </button>
          )}
          <button
            onClick={() => handleProtectedAction('delete')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            Odayı Sil
            {isPasswordProtected && <Lock size={10} className="ml-auto opacity-40" />}
          </button>
        </>
      )}
    </motion.div>
  );
}
