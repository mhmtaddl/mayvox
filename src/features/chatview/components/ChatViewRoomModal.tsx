import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Sparkles, Settings, Infinity as InfinityIcon } from 'lucide-react';
import { ROOM_MODE_LIST } from '../../../lib/roomModeConfig';
import { channelIconComponents, roomModeIcons } from '../constants';
import { CHANNEL_ICON_COLOR_OPTIONS, getDefaultChannelIconColor, normalizeChannelIconColor } from '../../../lib/channelIconColor';
import { CHANNEL_ICON_POOL_OPTIONS, getDefaultChannelIconName, QUICK_CHANNEL_ICON_OPTIONS } from '../../../lib/channelIcon';

interface RoomModalState {
  isOpen: boolean;
  type: 'create' | 'edit';
  channelId?: string;
  name: string;
  maxUsers: number;
  isInviteOnly: boolean;
  isHidden: boolean;
  mode: string;
  iconColor?: string;
  iconName?: string;
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

const CHANNEL_SEMANTIC_PRESETS = [
  { id: 'voice', label: 'Voice Room', iconName: 'coffee', iconColor: '#38bdf8', mode: 'social' },
  { id: 'gaming', label: 'Gaming', iconName: 'gamepad', iconColor: '#34d399', mode: 'gaming' },
  { id: 'work', label: 'Work', iconName: 'monitor', iconColor: '#94a3b8', mode: 'social' },
  { id: 'chill', label: 'Chill', iconName: 'headphones', iconColor: '#a78bfa', mode: 'quiet' },
  { id: 'announcement', label: 'Announcement', iconName: 'radio', iconColor: '#f43f5e', mode: 'broadcast' },
  { id: 'competitive', label: 'Competitive', iconName: 'trophy', iconColor: '#f59e0b', mode: 'gaming' },
] as const;

function getIconTileStyle(selected: boolean, accent: string): React.CSSProperties {
  return selected ? {
    color: accent,
    background: `linear-gradient(135deg, ${accent}24, rgba(var(--theme-accent-rgb), 0.08)), var(--surface-soft)`,
    borderColor: `${accent}80`,
    boxShadow: `0 0 0 1px ${accent}1f, inset 0 1px 0 rgba(var(--glass-tint),0.08)`,
  } : {
    background: 'var(--surface-soft)',
    borderColor: 'rgba(var(--glass-tint),0.10)',
  };
}

export default function ChatViewRoomModal({ roomModal, onUpdate, onClose, onSave, persistentInfo }: Props) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  // Create modunda kota bilgisi olması beklenir; edit'te gösterilmez.
  const showPersistentRow = roomModal.type === 'create' && persistentInfo !== undefined;
  const quotaReached = showPersistentRow && persistentInfo!.remaining <= 0;
  const noQuotaPlan = showPersistentRow && persistentInfo!.quota === 0;
  const selectedIconColor = normalizeChannelIconColor(roomModal.iconColor, roomModal.mode);
  const selectedIconName = roomModal.iconName ?? getDefaultChannelIconName(roomModal.mode);
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
        className="w-full max-w-[560px] max-h-[calc(100vh-48px)] rounded-2xl overflow-hidden flex flex-col"
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
        <div className="shrink-0 px-6 py-4 flex items-center gap-3" style={{ background: 'rgba(var(--glass-tint),0.02)', borderBottom: '1px solid rgba(var(--glass-tint),0.04)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `rgba(var(--theme-accent-rgb), 0.1)`, boxShadow: `0 0 18px rgba(var(--theme-accent-rgb), 0.08)` }}>
            {roomModal.type === 'create'
              ? <Sparkles className="text-[var(--theme-accent)]" size={18} />
              : <Settings className="text-[var(--theme-accent)]" size={18} />
            }
          </div>
          <div className="min-w-0 text-left">
            <h3 className="text-[16px] font-bold text-[var(--theme-text)] leading-tight">
              {roomModal.type === 'create' ? 'Yeni Oda Oluştur' : 'Oda Ayarları'}
            </h3>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/65 mt-0.5 leading-tight">
              {roomModal.type === 'create' ? 'Arkadaşlarınla konuşmak için alan oluştur.' : 'Odanın ayarlarını düzenle.'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-5">
          {/* Room Mode Selection — sadece create modunda */}
          {roomModal.type === 'create' && (
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-2">Oda Modu</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ROOM_MODE_LIST.map(m => {
                  const sel = roomModal.mode === m.id;
                  const ModeIcon = roomModeIcons[m.id];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      title={m.ruleSummary}
                      onClick={() => onUpdate({ mode: m.id })}
                      className={`relative text-left rounded-xl px-3 py-2 transition-all duration-150 border active:scale-[0.97] ${
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
                      <div className="flex items-center gap-2">
                        <ModeIcon size={14} className={`shrink-0 ${sel ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]'}`} />
                        <span className={`text-[11px] font-bold truncate ${sel ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/90'}`}>{m.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-2">Preset</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CHANNEL_SEMANTIC_PRESETS.map(preset => {
                const Icon = channelIconComponents[preset.iconName];
                const selected = selectedIconName === preset.iconName && selectedIconColor === preset.iconColor;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    onClick={() => onUpdate({ iconName: preset.iconName, iconColor: preset.iconColor, mode: preset.mode })}
                    className="relative text-left rounded-xl px-3 py-2 transition-all duration-150 border active:scale-[0.97] text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-border)]/35"
                    style={getIconTileStyle(selected, preset.iconColor)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {Icon && <Icon size={14} className="shrink-0" />}
                      <span className={`text-[11px] font-bold truncate ${selected ? '' : 'text-[var(--theme-text)]/90'}`}>{preset.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-2">Palette</label>
              <div className="flex items-center gap-2 flex-wrap">
                {CHANNEL_ICON_COLOR_OPTIONS.map(option => {
                  const selected = selectedIconColor === option.value;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={option.label}
                      aria-label={option.label}
                      onClick={() => onUpdate({ iconColor: option.value })}
                      className="w-7 h-7 rounded-lg border transition-all duration-150 active:scale-95 hover:scale-105"
                      style={{
                        background: selected
                          ? `linear-gradient(135deg, ${option.value}42, rgba(var(--theme-accent-rgb), 0.10)), var(--surface-soft)`
                          : 'var(--surface-soft)',
                        borderColor: selected ? `${option.value}90` : 'rgba(var(--glass-tint),0.12)',
                        boxShadow: selected ? `0 0 0 1px ${option.value}24, inset 0 1px 0 rgba(var(--glass-tint),0.08)` : undefined,
                      }}
                    >
                      <span
                        className="block w-3 h-3 rounded-full mx-auto"
                        style={{ background: option.value, boxShadow: `0 0 10px ${option.value}55` }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-2">İkonlar</label>
              <div className="flex items-center gap-2 flex-wrap">
                {QUICK_CHANNEL_ICON_OPTIONS.map(option => {
                  const Icon = channelIconComponents[option.id];
                  const selected = selectedIconName === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={option.label}
                      aria-label={option.label}
                      onClick={() => onUpdate({ iconName: option.id })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-150 active:scale-95 text-[var(--theme-secondary-text)] hover:scale-105 hover:text-[var(--theme-accent)]"
                      style={getIconTileStyle(selected, selectedIconColor)}
                    >
                      {Icon && <Icon size={14} />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  title="Tüm ikonlar"
                  aria-label="Tüm ikonlar"
                  onClick={() => setIconPickerOpen(true)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-black border text-[var(--theme-secondary-text)] hover:border-[var(--theme-border)]/35 hover:text-[var(--theme-accent)] transition-all active:scale-95"
                  style={{
                    background: 'var(--surface-soft)',
                    borderColor: 'rgba(var(--glass-tint),0.10)',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {iconPickerOpen && (
            <div
              className="mb-4 rounded-xl border p-3"
              style={{ background: 'var(--surface-soft)', borderColor: 'rgba(var(--glass-tint),0.10)' }}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em]">İkon Havuzu</span>
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(false)}
                  className="w-6 h-6 rounded-md text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-white/5 transition-colors"
                  aria-label="İkon havuzunu kapat"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {CHANNEL_ICON_POOL_OPTIONS.map(option => {
                  const Icon = channelIconComponents[option.id];
                  const selected = selectedIconName === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={option.label}
                      aria-label={option.label}
                      onClick={() => {
                        onUpdate({ iconName: option.id });
                        setIconPickerOpen(false);
                      }}
                      className="h-9 rounded-lg flex items-center justify-center border transition-all duration-150 active:scale-95 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-border)]/35"
                      style={getIconTileStyle(selected, selectedIconColor)}
                    >
                      {Icon && <Icon size={17} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group A: Temel bilgiler */}
          <div className="grid sm:grid-cols-[1fr_132px] gap-3">
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

        </div>

        {/* Actions */}
        <div
          className="shrink-0 flex gap-2.5 px-6 py-4"
          style={{ background: 'rgba(var(--glass-tint),0.02)', borderTop: '1px solid rgba(var(--glass-tint),0.04)' }}
        >
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
      </motion.div>
    </motion.div>,
    document.body,
  );
}
