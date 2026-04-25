import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Sparkles, Settings, Infinity as InfinityIcon } from 'lucide-react';
import { ROOM_MODE_LIST } from '../../../lib/roomModeConfig';
import { roomModeIcons } from '../constants';

interface RoomModalState {
  isOpen: boolean;
  type: 'create' | 'edit';
  channelId?: string;
  name: string;
  maxUsers: number;
  isInviteOnly: boolean;
  isHidden: boolean;
  mode: string;
  /** "Oda Kalıcılığı" seçimi — default true.
   *  Backend non-persistent feature-flag açıldığında false path aktifleşir. */
  isPersistent?: boolean;
}

/** Kalıcı oda kota bilgisi — create modunda gösterilir. */
export interface PersistentRoomsInfo {
  used: number;
  quota: number;
  remaining: number;
}

interface Props {
  roomModal: RoomModalState;
  onUpdate: (updates: Partial<RoomModalState>) => void;
  onClose: () => void;
  onSave: () => void;
  /** Create modunda kalıcı oda kota durumu — sadece 'create' type'da göstersin. */
  persistentInfo?: PersistentRoomsInfo;
}

export default function ChatViewRoomModal({ roomModal, onUpdate, onClose, onSave, persistentInfo }: Props) {
  // Create modunda kota bilgisi olması beklenir; edit'te gösterilmez.
  const showPersistentRow = roomModal.type === 'create' && persistentInfo !== undefined;
  const quotaReached = showPersistentRow && persistentInfo!.remaining <= 0;
  const noQuotaPlan = showPersistentRow && persistentInfo!.quota === 0;
  // Save butonu DISABLE etmiyoruz — backend authoritative. Frontend plan resolve
  // yanlış olursa (cache/stale) user bloklanmasın; backend 403 dönerse toast düşer.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-[420px] rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--glass-tint), 0.035), rgba(var(--glass-tint), 0.015)), rgb(var(--theme-bg-rgb, 6, 10, 20))',
          border: '1px solid rgba(var(--glass-tint), 0.12)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.3), transparent)` }} />

        {/* Header */}
        <div className="px-7 pt-7 pb-4 text-center" style={{ background: 'rgba(var(--glass-tint),0.02)', borderBottom: '1px solid rgba(var(--glass-tint),0.04)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: `rgba(var(--theme-accent-rgb), 0.1)`, boxShadow: `0 0 20px rgba(var(--theme-accent-rgb), 0.08)` }}>
            {roomModal.type === 'create'
              ? <Sparkles className="text-[var(--theme-accent)]" size={22} />
              : <Settings className="text-[var(--theme-accent)]" size={24} />
            }
          </div>
          <h3 className="text-lg font-bold text-[var(--theme-text)]">
            {roomModal.type === 'create' ? 'Yeni Oda Oluştur' : 'Oda Ayarları'}
          </h3>
          <p className="text-[11px] text-[var(--theme-secondary-text)]/70 mt-1.5">
            {roomModal.type === 'create' ? 'Arkadaşlarınla konuşmak için bir alan oluştur.' : 'Bu odanın ayarlarını düzenleyin.'}
          </p>
        </div>

        {/* Form */}
        <div className="px-7 pt-5 pb-7">
          {/* Room Mode Selection — sadece create modunda */}
          {roomModal.type === 'create' && (
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-2">Oda Modu</label>
              <div className="grid grid-cols-2 gap-2">
                {ROOM_MODE_LIST.map(m => {
                  const sel = roomModal.mode === m.id;
                  const ModeIcon = roomModeIcons[m.id];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdate({ mode: m.id })}
                      className={`relative text-left rounded-xl px-3 py-2.5 transition-all duration-150 border active:scale-[0.97] ${
                        sel
                          ? 'border-[var(--theme-accent)]/50'
                          : 'border-[var(--theme-border)]/15 hover:border-[var(--theme-border)]/30 hover:scale-[1.01]'
                      }`}
                      style={sel ? {
                        background: `rgba(var(--theme-accent-rgb), 0.1)`,
                        boxShadow: `0 1px 12px rgba(var(--theme-accent-rgb), 0.15), inset 0 1px 0 rgba(var(--theme-accent-rgb), 0.08)`,
                      } : {
                        background: 'rgba(var(--glass-tint),0.03)',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <ModeIcon size={14} className={sel ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/70'} />
                        <span className={`text-[12px] font-bold ${sel ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/90'}`}>{m.label}</span>
                      </div>
                      <p className={`text-[9px] leading-snug ${sel ? 'text-[var(--theme-accent)]/60' : 'text-[var(--theme-secondary-text)]/50'}`}>{m.ruleSummary}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group A: Temel bilgiler */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1.5">Oda İsmi</label>
              <input
                autoFocus
                type="text"
                placeholder="ör: Genel Sohbet"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm font-semibold text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/40"
                style={{
                  background: 'rgba(var(--shadow-base),0.15)',
                  border: '1px solid rgba(var(--glass-tint),0.06)',
                  boxShadow: 'inset 0 1px 3px rgba(var(--shadow-base),0.1)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.4)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(var(--shadow-base),0.1), 0 0 0 3px rgba(var(--theme-accent-rgb), 0.08)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.2)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = `rgba(var(--glass-tint),0.06)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(var(--shadow-base),0.1)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.15)'; }}
                value={roomModal.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave();
                  if (e.key === 'Escape') onClose();
                }}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1.5">Kişi Limiti</label>
              <input
                type="number"
                min="0"
                placeholder="Sınırsız"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm font-semibold text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{
                  background: 'rgba(var(--shadow-base),0.15)',
                  border: '1px solid rgba(var(--glass-tint),0.06)',
                  boxShadow: 'inset 0 1px 3px rgba(var(--shadow-base),0.1)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.4)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(var(--shadow-base),0.1), 0 0 0 3px rgba(var(--theme-accent-rgb), 0.08)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.2)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = `rgba(var(--glass-tint),0.06)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(var(--shadow-base),0.1)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.15)'; }}
                value={roomModal.maxUsers}
                onChange={(e) => onUpdate({ maxUsers: parseInt(e.target.value) || 0 })}
              />
              <p className="text-[9px] text-[var(--theme-secondary-text)]/50 mt-1.5 ml-0.5">Boş veya 0 bırakırsanız sınır olmaz.</p>
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.08), transparent)` }} />

          {/* Group B: Gizlilik + Kalıcılık ayarları */}
          <div className="space-y-3.5">
            {/* Oda Kalıcılığı — create modunda, opt-in toggle.
                Default OFF: geçici oda (auto-delete countdown).
                ON: kalıcı oda (kota tüketir, silinmedikçe kalır). */}
            {showPersistentRow && (() => {
              const persistActive = roomModal.isPersistent === true;
              const toggleDisabled = noQuotaPlan || (!persistActive && quotaReached);
              const onToggle = () => {
                if (toggleDisabled) return;
                onUpdate({ isPersistent: !persistActive });
              };
              return (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[var(--theme-text)] leading-tight">Oda Kalıcılığı</p>
                      <InfinityIcon size={12} className={`shrink-0 ${persistActive ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/40'}`} />
                      <span
                        className="shrink-0 inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums"
                        style={{
                          background: noQuotaPlan ? 'rgba(239,68,68,0.10)' : quotaReached && !persistActive ? 'rgba(239,68,68,0.10)' : 'rgba(var(--glass-tint),0.08)',
                          color: noQuotaPlan ? 'rgb(239,68,68)' : quotaReached && !persistActive ? 'rgb(239,68,68)' : 'var(--theme-secondary-text)',
                          border: `1px solid ${noQuotaPlan || (quotaReached && !persistActive) ? 'rgba(239,68,68,0.25)' : 'rgba(var(--glass-tint),0.12)'}`,
                        }}
                      >
                        {noQuotaPlan ? 'Plan desteklemiyor' : `${persistentInfo!.remaining} / ${persistentInfo!.quota}`}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
                      {noQuotaPlan
                        ? 'Bu planda kalıcı oda hakkın yok. Oda geçici, boşalınca silinir.'
                        : persistActive
                          ? 'Oda silinmedikçe kalır. Silince hak iade edilir.'
                          : quotaReached
                            ? 'Kalıcı oda hakkın doldu. Oda geçici oluşur.'
                            : 'Kapalı: oda geçicidir, boşalınca otomatik silinir. Açarsan kalıcı olur.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={persistActive}
                    disabled={toggleDisabled}
                    onClick={onToggle}
                    className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ${toggleDisabled ? 'opacity-40 cursor-not-allowed' : ''} ${persistActive && !toggleDisabled ? '' : 'bg-[var(--theme-border)]'}`}
                    style={persistActive && !toggleDisabled ? { backgroundColor: 'var(--theme-accent)', boxShadow: `0 0 8px rgba(var(--theme-accent-rgb), 0.25)` } : undefined}
                    title={toggleDisabled ? (noQuotaPlan ? 'Bu planda kalıcı oda hakkı yok' : 'Hakkın doldu') : undefined}
                  >
                    <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all duration-200 ${persistActive && !toggleDisabled ? 'left-[22px] shadow-md' : 'left-[3px] shadow-sm'}`} />
                  </button>
                </div>
              );
            })()}

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[var(--theme-text)] leading-tight">Gizli Oda</p>
                <p className="text-[10px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">Kanal listesinde görünmez, sadece davet ile ulaşılır.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={roomModal.isHidden}
                onClick={() => {
                  const newIsHidden = !roomModal.isHidden;
                  onUpdate({ isHidden: newIsHidden, isInviteOnly: newIsHidden ? true : roomModal.isInviteOnly });
                }}
                className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ${
                  roomModal.isHidden ? '' : 'bg-[var(--theme-border)]'
                }`}
                style={roomModal.isHidden ? { backgroundColor: 'var(--theme-accent)', boxShadow: `0 0 8px rgba(var(--theme-accent-rgb), 0.25)` } : undefined}
              >
                <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all duration-200 ${roomModal.isHidden ? 'left-[22px] shadow-md' : 'left-[3px] shadow-sm'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className={`text-[13px] font-semibold leading-tight ${roomModal.isHidden ? 'text-[var(--theme-secondary-text)]/40' : 'text-[var(--theme-text)]'}`}>Davetle Giriş</p>
                <p className="text-[10px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">Sadece davet edilen kullanıcılar katılabilir.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={roomModal.isInviteOnly}
                disabled={roomModal.isHidden}
                onClick={() => { if (!roomModal.isHidden) onUpdate({ isInviteOnly: !roomModal.isInviteOnly }); }}
                className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ${
                  roomModal.isHidden ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  roomModal.isInviteOnly && !roomModal.isHidden ? '' : 'bg-[var(--theme-border)]'
                }`}
                style={roomModal.isInviteOnly ? { backgroundColor: 'var(--theme-accent)', boxShadow: roomModal.isHidden ? 'none' : `0 0 8px rgba(var(--theme-accent-rgb), 0.25)` } : undefined}
              >
                <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all duration-200 ${roomModal.isInviteOnly ? 'left-[22px] shadow-md' : 'left-[3px] shadow-sm'}`} />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 mt-7">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-[13px] btn-cancel active:scale-[0.97]"
            >
              İptal
            </button>
            <button
              onClick={onSave}
              className="flex-[1.5] px-4 py-2.5 rounded-xl text-[13px] font-bold btn-primary active:scale-[0.97]"
            >
              {roomModal.type === 'create' ? 'Oda Oluştur' : 'Kaydet'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
