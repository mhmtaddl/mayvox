import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Sparkles, Settings, Infinity as InfinityIcon } from 'lucide-react';
import { ROOM_MODE_LIST } from '../../../lib/roomModeConfig';
import { channelIconComponents, roomModeIcons } from '../constants';
import { CHANNEL_ICON_COLOR_OPTIONS, normalizeChannelIconColor } from '../../../lib/channelIconColor';
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
  const [primaryHover, setPrimaryHover] = useState(false);
  // Create modunda kota bilgisi olması beklenir; edit'te gösterilmez.
  const showPersistentRow = roomModal.type === 'create' && persistentInfo !== undefined;
  const quotaReached = showPersistentRow && persistentInfo!.remaining <= 0;
  const noQuotaPlan = showPersistentRow && persistentInfo!.quota === 0;
  const selectedIconColor = normalizeChannelIconColor(roomModal.iconColor, roomModal.mode);
  const selectedIconName = roomModal.iconName ?? getDefaultChannelIconName(roomModal.mode);
  const isRoomNameValid = roomModal.name.trim().length > 0;
  const primaryActionEnabled = isRoomNameValid;
  const primaryActionStyle: React.CSSProperties = primaryActionEnabled ? {
    background: primaryHover ? 'rgba(var(--theme-accent-rgb), 0.30)' : 'rgba(var(--theme-accent-rgb), 0.22)',
    border: primaryHover ? '1px solid rgba(var(--theme-accent-rgb), 0.42)' : '1px solid rgba(var(--theme-accent-rgb), 0.32)',
    color: 'var(--theme-text)',
    boxShadow: primaryHover
      ? '0 6px 18px rgba(var(--theme-accent-rgb), 0.14), inset 0 1px 0 rgba(var(--glass-tint), 0.10)'
      : 'inset 0 1px 0 rgba(var(--glass-tint), 0.08)',
  } : {
    background: 'rgba(var(--glass-tint), 0.045)',
    border: '1px solid rgba(var(--glass-tint), 0.08)',
    color: 'var(--theme-secondary-text)',
    boxShadow: 'none',
    opacity: 0.78,
  };
  const handlePrimaryAction = () => {
    if (!primaryActionEnabled) return;
    onSave();
  };
  // Quota/backend rules remain authoritative; the primary action only mirrors the
  // local required-name validation so the modal does not look actionable too early.
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
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-3.5 pb-4">
          {/* Room Mode Selection — sadece create modunda */}
          {roomModal.type === 'create' && (
            <div className="mb-3.5">
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1.5">Oda Modu</label>
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

          <div className="mb-3.5">
            <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1.5">Preset</label>
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

          <div className="mb-3.5 grid sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1.5">Palette</label>
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
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1.5">İkonlar</label>
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
              className="mb-3.5 rounded-xl border p-2.5"
              style={{ background: 'var(--surface-soft)', borderColor: 'rgba(var(--glass-tint),0.10)' }}
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
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
              <div className="grid grid-cols-7 gap-1.5 max-h-[168px] overflow-y-auto pr-1">
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
                      className="h-7 rounded-lg flex items-center justify-center border transition-[color,border-color,background,transform] duration-150 active:scale-95 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-border)]/30"
                      style={getIconTileStyle(selected, selectedIconColor)}
                    >
                      {Icon && <Icon size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group A: Temel bilgiler */}
          <div className="grid sm:grid-cols-[1fr_124px] gap-3">
            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1">Oda İsmi</label>
              <input
                autoFocus
                type="text"
                placeholder="ör: Genel Sohbet"
                className="h-10 w-full rounded-lg px-3 text-[13px] font-semibold text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/40 placeholder:font-medium"
                style={{
                  background: 'rgba(var(--shadow-base),0.13)',
                  border: '1px solid rgba(var(--glass-tint),0.08)',
                  boxShadow: 'inset 0 1px 2px rgba(var(--shadow-base),0.08)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.34)`; e.currentTarget.style.boxShadow = `inset 0 1px 2px rgba(var(--shadow-base),0.08), 0 0 0 2px rgba(var(--theme-accent-rgb), 0.08)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.17)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = `rgba(var(--glass-tint),0.08)`; e.currentTarget.style.boxShadow = `inset 0 1px 2px rgba(var(--shadow-base),0.08)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.13)'; }}
                value={roomModal.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePrimaryAction();
                  if (e.key === 'Escape') onClose();
                }}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em] mb-1">Kişi Limiti</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Sınırsız"
                className="h-10 w-full rounded-lg px-3 text-[13px] font-semibold text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/40 placeholder:font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{
                  background: 'rgba(var(--shadow-base),0.13)',
                  border: '1px solid rgba(var(--glass-tint),0.08)',
                  boxShadow: 'inset 0 1px 2px rgba(var(--shadow-base),0.08)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.34)`;
                  e.currentTarget.style.boxShadow = `inset 0 1px 2px rgba(var(--shadow-base),0.08), 0 0 0 2px rgba(var(--theme-accent-rgb), 0.08)`;
                  e.currentTarget.style.background = 'rgba(var(--shadow-base),0.17)';
                  if (e.currentTarget.value === '0') {
                    const input = e.currentTarget;
                    requestAnimationFrame(() => input.select());
                  }
                }}
                onBlur={(e) => { e.currentTarget.style.borderColor = `rgba(var(--glass-tint),0.08)`; e.currentTarget.style.boxShadow = `inset 0 1px 2px rgba(var(--shadow-base),0.08)`; e.currentTarget.style.background = 'rgba(var(--shadow-base),0.13)'; }}
                value={roomModal.maxUsers}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  onUpdate({ maxUsers: digits === '' ? 0 : Number(digits) });
                }}
              />
              <p className="text-[9px] text-[var(--theme-secondary-text)]/50 mt-1 ml-0.5">Boş veya 0 bırakırsanız sınır olmaz.</p>
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.08), transparent)` }} />

          {/* Group B: Gizlilik + Kalıcılık ayarları */}
          <div className="space-y-2.5">
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12.5px] font-semibold text-[var(--theme-text)] leading-tight">Oda Kalıcılığı</p>
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
                    <p className="text-[9.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
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
                    className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${toggleDisabled ? 'opacity-40 cursor-default' : ''} ${persistActive && !toggleDisabled ? '' : 'bg-[var(--theme-border)]'}`}
                    style={persistActive && !toggleDisabled ? { backgroundColor: 'var(--theme-accent)', boxShadow: `0 0 6px rgba(var(--theme-accent-rgb), 0.20)` } : undefined}
                    title={toggleDisabled ? (noQuotaPlan ? 'Bu planda kalıcı oda hakkı yok' : 'Hakkın doldu') : undefined}
                  >
                    <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-all duration-200 ${persistActive && !toggleDisabled ? 'left-[19px] shadow-md' : 'left-[3px] shadow-sm'}`} />
                  </button>
                </div>
              );
            })()}

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-[12.5px] font-semibold text-[var(--theme-text)] leading-tight">Gizli Oda</p>
                <p className="text-[9.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">Kanal listesinde görünmez, sadece davet ile ulaşılır.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={roomModal.isHidden}
                onClick={() => {
                  const newIsHidden = !roomModal.isHidden;
                  onUpdate({ isHidden: newIsHidden, isInviteOnly: newIsHidden ? true : roomModal.isInviteOnly });
                }}
                className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${
                  roomModal.isHidden ? '' : 'bg-[var(--theme-border)]'
                }`}
                style={roomModal.isHidden ? { backgroundColor: 'var(--theme-accent)', boxShadow: `0 0 6px rgba(var(--theme-accent-rgb), 0.20)` } : undefined}
              >
                <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-all duration-200 ${roomModal.isHidden ? 'left-[19px] shadow-md' : 'left-[3px] shadow-sm'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className={`text-[12.5px] font-semibold leading-tight ${roomModal.isHidden ? 'text-[var(--theme-secondary-text)]/40' : 'text-[var(--theme-text)]'}`}>Davetle Giriş</p>
                <p className="text-[9.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">Sadece davet edilen kullanıcılar katılabilir.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={roomModal.isInviteOnly}
                disabled={roomModal.isHidden}
                onClick={() => { if (!roomModal.isHidden) onUpdate({ isInviteOnly: !roomModal.isInviteOnly }); }}
                className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${
                  roomModal.isHidden ? 'opacity-40 cursor-default' : ''
                } ${
                  roomModal.isInviteOnly && !roomModal.isHidden ? '' : 'bg-[var(--theme-border)]'
                }`}
                style={roomModal.isInviteOnly ? { backgroundColor: 'var(--theme-accent)', boxShadow: roomModal.isHidden ? 'none' : `0 0 6px rgba(var(--theme-accent-rgb), 0.20)` } : undefined}
              >
                <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-all duration-200 ${roomModal.isInviteOnly ? 'left-[19px]' : 'left-[3px]'} shadow-sm`} />
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
            type="button"
            disabled={!primaryActionEnabled}
            aria-disabled={!primaryActionEnabled}
            onClick={handlePrimaryAction}
            onMouseEnter={() => { if (primaryActionEnabled) setPrimaryHover(true); }}
            onMouseLeave={() => setPrimaryHover(false)}
            onFocus={() => { if (primaryActionEnabled) setPrimaryHover(true); }}
            onBlur={() => setPrimaryHover(false)}
            className={`flex-[1.5] px-4 py-2.5 rounded-xl text-[13px] font-bold transition-[background,border-color,box-shadow,color,opacity,transform] duration-150 ${
              primaryActionEnabled ? 'active:scale-[0.97]' : 'cursor-default'
            }`}
            style={primaryActionStyle}
          >
            {roomModal.type === 'create' ? 'Oda Oluştur' : 'Kaydet'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
