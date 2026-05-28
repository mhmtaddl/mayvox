import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import {
  isToastEnabled,
  isGroupingEnabled,
  isRoomMessageSoundEnabled,
  setGroupingEnabled,
  setRoomMessageSoundEnabled,
  setToastEnabled,
} from '../../features/notifications/notificationSound';
import { SoundManager, stopAllSamples, type MessageVariant } from '../../lib/audio/SoundManager';
import { rangeVisualStyle } from '../../lib/rangeStyle';
import { updateProfileFields } from '../../lib/backendClient';
import { sendRealtimeBroadcast } from '../../lib/chatService';
import type { DmPrivacyMode } from '../../types';

export default function MessageSettingsPanel({
  onClose,
  currentUser,
  allUsers,
  setCurrentUser,
  setAllUsers,
  setToastMsg,
  solidSurface = false,
}: {
  onClose: () => void;
  currentUser: any;
  allUsers: any[];
  setCurrentUser: React.Dispatch<React.SetStateAction<any>>;
  setAllUsers: React.Dispatch<React.SetStateAction<any[]>>;
  setToastMsg: (message: string) => void;
  solidSurface?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(() => SoundManager.isMessageEnabled());
  const [sendOn, setSendOn] = useState(() => SoundManager.isMessageSendEnabled());
  const [variant, setVariant] = useState<MessageVariant>(() => SoundManager.getMessageVariant());
  const [vol, setVol] = useState<number>(() => SoundManager.getMessageVolume());
  const [toastOn, setToastOn] = useState(() => isToastEnabled());
  const [groupOn, setGroupOn] = useState(() => isGroupingEnabled());
  const [roomSoundOn, setRoomSoundOn] = useState(() => isRoomMessageSoundEnabled());
  const dmMode: DmPrivacyMode = currentUser.dmPrivacyMode || (currentUser.allowNonFriendDms === false ? 'friends_only' : 'everyone');
  const readReceiptsOn = currentUser.showDmReadReceipts !== false;
  const dmModeOptions: Array<{ value: DmPrivacyMode; label: string }> = [
    { value: 'everyone', label: 'Herkes' },
    { value: 'mutual_servers', label: 'Ortak' },
    { value: 'friends_only', label: 'Arkadaş' },
    { value: 'closed', label: 'Kapalı' },
  ];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-[7px] min-h-[28px]">
      <span className="text-[11px] text-[var(--theme-text)]/85 tracking-[-0.005em]">{label}</span>
      {children}
    </div>
  );

  const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!on)}
      className="relative w-8 h-[18px] rounded-full transition-colors duration-150"
      style={{ background: on ? 'var(--theme-accent)' : 'rgba(var(--glass-tint),0.18)' }}
    >
      <span
        className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150"
        style={{ transform: on ? 'translateX(14px)' : 'translateX(0)' }}
      />
    </button>
  );

  const RadioDot = ({ active }: { active: boolean }) => (
    <span
      className="relative block w-[15px] h-[15px] rounded-full transition-all duration-150"
      style={{
        background: active ? 'var(--theme-accent)' : 'transparent',
        boxShadow: active
          ? 'inset 0 0 0 1.5px var(--theme-accent), 0 0 0 3px rgba(var(--theme-accent-rgb),0.22), 0 1px 2px rgba(0,0,0,0.12)'
          : 'inset 0 0 0 1.5px rgba(var(--glass-tint),0.55), inset 0 0 0 2.5px rgba(var(--glass-tint),0.04)',
      }}
    >
      {active && (
        <span
          className="absolute rounded-full"
          style={{
            top: 4, left: 4, right: 4, bottom: 4,
            background: 'rgba(255,255,255,0.96)',
            boxShadow: '0 0 2px rgba(0,0,0,0.15)',
          }}
        />
      )}
    </span>
  );

  const variantOptions: ReadonlyArray<MessageVariant> = ['1', '2', '3'];

  const setDmModeLocal = (value: DmPrivacyMode) => {
    const allowNonFriendDms = value === 'everyone' || value === 'mutual_servers';
    setCurrentUser((prev: any) => ({ ...prev, dmPrivacyMode: value, allowNonFriendDms }));
    setAllUsers((prev: any[]) => prev.map(u => u.id === currentUser.id ? { ...u, dmPrivacyMode: value, allowNonFriendDms } : u));
  };

  const updateDmMode = async (next: DmPrivacyMode) => {
    if (next === dmMode) return;
    setDmModeLocal(next);
    try {
      const allowNonFriendDms = next === 'everyone' || next === 'mutual_servers';
      await updateProfileFields({ dm_privacy_mode: next, allow_non_friend_dms: allowNonFriendDms });
      sendRealtimeBroadcast('moderation-event', {
        userId: currentUser.id,
        userIds: allUsers.map(u => u.id),
        updates: { dmPrivacyMode: next, allowNonFriendDms },
      });
      setToastMsg('DM gizlilik ayarı güncellendi');
    } catch {
      setDmModeLocal(dmMode);
      setToastMsg('Mesajlaşma ayarı güncellenemedi');
    }
  };

  const updateReadReceipts = async (next: boolean) => {
    setCurrentUser((prev: any) => ({ ...prev, showDmReadReceipts: next }));
    setAllUsers((prev: any[]) => prev.map(u => u.id === currentUser.id ? { ...u, showDmReadReceipts: next } : u));
    try {
      await updateProfileFields({ show_dm_read_receipts: next });
      sendRealtimeBroadcast('moderation-event', {
        userId: currentUser.id,
        userIds: allUsers.map(u => u.id),
        updates: { showDmReadReceipts: next },
      });
      setToastMsg(next ? 'Okundu bilgisi açıldı' : 'Okundu bilgisi gizlendi');
    } catch {
      setCurrentUser((prev: any) => ({ ...prev, showDmReadReceipts: readReceiptsOn }));
      setAllUsers((prev: any[]) => prev.map(u => u.id === currentUser.id ? { ...u, showDmReadReceipts: readReceiptsOn } : u));
      setToastMsg('Okundu bilgisi güncellenemedi');
    }
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 18 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      onClick={e => e.stopPropagation()}
      className={`absolute inset-y-0 right-0 z-30 flex w-[286px] max-w-[86%] flex-col overflow-hidden border-l border-[rgba(var(--glass-tint),0.10)] ${solidSurface ? 'dm-mobile-solid-panel dm-mobile-side-panel' : ''}`}
      style={{
        background:
          'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.024)), rgba(var(--theme-bg-rgb),0.995)',
        boxShadow: '-18px 0 34px -24px rgba(var(--shadow-base),0.72), inset 1px 0 0 rgba(255,255,255,0.035)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-2 px-3.5" style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.08)' }}>
        <div className="min-w-0">
          <div className="mv-font-title truncate text-[13px] font-bold text-[var(--theme-text)]">Mesaj ayarları</div>
          <div className="mv-font-caption truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/55">Gizlilik ve bildirimler</div>
        </div>
        <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/60 transition-colors hover:text-[var(--theme-text)]" title="Ayarları kapat" aria-label="Ayarları kapat">
          <X size={14} />
        </button>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-3.5 py-1 divide-y divide-[rgba(var(--glass-tint),0.05)]">
        <div className="py-[7px]">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--theme-text)]/85 tracking-[-0.005em]">DM gizliliği</span>
            <span className="text-[10px] text-[var(--theme-secondary-text)]/50">{dmModeOptions.find(o => o.value === dmMode)?.label}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {dmModeOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateDmMode(opt.value)}
                className={`h-6 rounded-[7px] px-1 text-[9.5px] font-semibold transition-colors ${
                  dmMode === opt.value
                    ? 'bg-[rgba(var(--theme-accent-rgb),0.16)] text-[var(--theme-accent)]'
                    : 'bg-[rgba(var(--glass-tint),0.045)] text-[var(--theme-secondary-text)]/65 hover:text-[var(--theme-text)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Row label="Okundu bilgisini göster">
          <Toggle on={readReceiptsOn} onChange={updateReadReceipts} />
        </Row>
        <div className="py-[8px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--theme-text)]/85 tracking-[-0.005em]">Mesaj sesi</span>
            <Toggle on={soundOn} onChange={v => { setSoundOn(v); SoundManager.setMessageEnabled(v); }} />
          </div>
          <div className={`rounded-[10px] bg-[rgba(var(--glass-tint),0.035)] px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(var(--glass-tint),0.045)] transition-opacity ${soundOn ? 'opacity-100' : 'opacity-40'}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[10.5px] text-[var(--theme-secondary-text)]/65">Ton</span>
              <div className="flex items-center gap-0.5 -mr-1">
                {variantOptions.map(opt => {
                  const active = variant === opt;
                  return (
                    <button
                      key={opt}
                      disabled={!soundOn}
                      onClick={() => {
                        stopAllSamples();
                        setVariant(opt);
                        SoundManager.setMessageVariant(opt);
                        SoundManager.preview.message(opt);
                      }}
                      className="p-1 rounded-full transition-transform active:scale-90 disabled:cursor-not-allowed disabled:active:scale-100"
                      aria-label={`Ses ${opt}`}
                    >
                      <RadioDot active={active} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-[var(--theme-secondary-text)]/65">Ses seviyesi</span>
                <span className="w-9 text-right text-[10px] tabular-nums text-[var(--theme-secondary-text)]/70">{Math.round(vol * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vol}
                disabled={!soundOn}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVol(v);
                  SoundManager.setMessageVolume(v);
                }}
                className="premium-range w-full disabled:cursor-not-allowed"
                style={rangeVisualStyle(vol, 0, 1)}
              />
            </div>
          </div>
        </div>
        <Row label="Sohbet odasında mesaj sesi">
          <Toggle on={roomSoundOn} onChange={v => { setRoomSoundOn(v); setRoomMessageSoundEnabled(v); }} />
        </Row>
        <Row label="Mesaj gönderim sesi">
          <Toggle on={sendOn} onChange={v => {
            setSendOn(v);
            SoundManager.setMessageSendEnabled(v);
            if (v) { stopAllSamples(); SoundManager.preview.messageSend(); }
          }} />
        </Row>
        <Row label="Masaüstü bildirimi">
          <Toggle on={toastOn} onChange={v => { setToastOn(v); setToastEnabled(v); }} />
        </Row>
        <Row label="Ardışık mesajları grupla">
          <Toggle on={groupOn} onChange={v => { setGroupOn(v); setGroupingEnabled(v); }} />
        </Row>
      </div>
    </motion.div>
  );
}
