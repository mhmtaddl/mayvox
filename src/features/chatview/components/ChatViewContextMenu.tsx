import React from 'react';
import { motion } from 'motion/react';
import { Settings, Lock, Trash2 } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  maxUsers?: number;
  isInviteOnly?: boolean;
  isHidden?: boolean;
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{ top: contextMenu.y, left: contextMenu.x }}
      className="fixed z-[100] w-48 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-1.5 backdrop-blur-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          if (channel) onEditRoom(channel);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-badge-text)] rounded-lg transition-colors"
      >
        <Settings size={14} />
        Oda Ayarları
      </button>
      {channel?.password ? (
        <button
          onClick={() => onRemovePassword(contextMenu.channelId)}
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
        onClick={() => onDeleteRoom(contextMenu.channelId)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
      >
        <Trash2 size={14} />
        Odayı Sil
      </button>
    </motion.div>
  );
}
