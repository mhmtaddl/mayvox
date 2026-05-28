import React from 'react';
import { PlusCircle, Radio, Twitch, X, Youtube } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServerStreamLink, StreamPlatform } from '../../lib/serverService';

export function RulesModal({
  open,
  serverName,
  rules,
  onClose,
}: {
  open: boolean;
  serverName: string;
  rules: string[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[520] flex items-center justify-center px-3 py-4 backdrop-blur-[3px]"
      style={{ background: 'rgba(var(--theme-bg-rgb),0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[rgba(var(--glass-tint),0.09)] shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.035), rgba(var(--glass-tint),0.012)), var(--theme-bg)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.018)] px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[var(--theme-text)]">Sunucu Kuralları</h3>
            <p className="mt-0.5 truncate text-[11px] text-[var(--theme-secondary-text)]/52">{serverName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div
                key={`${index}-${rule}`}
                className="rounded-xl border border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--glass-tint),0.025)] px-3 py-2.5 text-[12px] leading-5 text-[var(--theme-text)]/88"
              >
                <span className="whitespace-normal break-words">{rule}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function StreamAddModal({
  saving,
  streamPreviewItems,
  quickTwitchName,
  quickTwitchUrl,
  quickYoutubeName,
  quickYoutubeUrl,
  onClose,
  onQuickTwitchNameChange,
  onQuickTwitchUrlChange,
  onQuickYoutubeNameChange,
  onQuickYoutubeUrlChange,
  onAdd,
}: {
  saving: boolean;
  streamPreviewItems: ServerStreamLink[];
  quickTwitchName: string;
  quickTwitchUrl: string;
  quickYoutubeName: string;
  quickYoutubeUrl: string;
  onClose: () => void;
  onQuickTwitchNameChange: (value: string) => void;
  onQuickTwitchUrlChange: (value: string) => void;
  onQuickYoutubeNameChange: (value: string) => void;
  onQuickYoutubeUrlChange: (value: string) => void;
  onAdd: (platform: StreamPlatform, channelUrl: string, channelName: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[520] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-[720px] overflow-hidden rounded-[24px] border border-[rgba(var(--glass-tint),0.08)] shadow-[0_24px_70px_rgba(0,0,0,0.38)]"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.026), rgba(var(--glass-tint),0.008)), var(--theme-bg)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.014)] px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[var(--theme-text)]">Yayın ekle</h3>
            <p className="mt-0.5 text-[11px] leading-5 text-[var(--theme-secondary-text)]/54">
              API bağlantıları hazır. Sadece kanal adını ve adresini ekle.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid max-h-[72vh] gap-3 overflow-y-auto p-4 md:grid-cols-2">
          <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.012)] p-3.5">
            <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[var(--theme-text)]">
              <Twitch size={15} className="text-[#9146ff]" />
              Twitch kanalı
            </h4>
            <div className="mt-3 space-y-2">
              <input
                value={quickTwitchName}
                onChange={event => onQuickTwitchNameChange(event.target.value)}
                placeholder="Kanal adı"
                maxLength={120}
                className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
              />
              <input
                value={quickTwitchUrl}
                onChange={event => onQuickTwitchUrlChange(event.target.value)}
                placeholder="https://www.twitch.tv/kullaniciadi"
                className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                onKeyDown={event => {
                  if (event.key === 'Enter') onAdd('twitch', quickTwitchUrl, quickTwitchName);
                }}
              />
              <button
                type="button"
                onClick={() => onAdd('twitch', quickTwitchUrl, quickTwitchName)}
                disabled={saving || !quickTwitchUrl.trim()}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[rgba(var(--theme-accent-rgb),0.16)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.11)] disabled:cursor-default disabled:opacity-45"
              >
                <PlusCircle size={13} />
                {saving ? 'Ekleniyor' : 'Ekle'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.012)] p-3.5">
            <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[var(--theme-text)]">
              <Youtube size={15} className="text-[#ff0033]" />
              YouTube kanalı
            </h4>
            <div className="mt-3 space-y-2">
              <input
                value={quickYoutubeName}
                onChange={event => onQuickYoutubeNameChange(event.target.value)}
                placeholder="Kanal adı"
                maxLength={120}
                className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
              />
              <input
                value={quickYoutubeUrl}
                onChange={event => onQuickYoutubeUrlChange(event.target.value)}
                placeholder="https://www.youtube.com/@kanaladi"
                className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                onKeyDown={event => {
                  if (event.key === 'Enter') onAdd('youtube', quickYoutubeUrl, quickYoutubeName);
                }}
              />
              <button
                type="button"
                onClick={() => onAdd('youtube', quickYoutubeUrl, quickYoutubeName)}
                disabled={saving || !quickYoutubeUrl.trim()}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[rgba(var(--theme-accent-rgb),0.16)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.11)] disabled:cursor-default disabled:opacity-45"
              >
                <PlusCircle size={13} />
                {saving ? 'Ekleniyor' : 'Ekle'}
              </button>
            </div>
          </section>

          <section className="md:col-span-2 rounded-2xl border border-[rgba(var(--glass-tint),0.05)] bg-[rgba(var(--glass-tint),0.01)] p-3.5">
            <h4 className="text-[12px] font-semibold text-[var(--theme-text)]">Eklenen yayın önizlemesi</h4>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {streamPreviewItems.length > 0 ? streamPreviewItems.map(item => (
                <div key={item.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.014)] px-3 py-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${item.platform === 'youtube' ? 'text-[#ff0033]' : item.platform === 'twitch' ? 'text-[#9146ff]' : 'text-[var(--theme-accent)]/85'}`}>
                    {item.platform === 'youtube' ? <Youtube size={18} /> : item.platform === 'twitch' ? <Twitch size={18} /> : <Radio size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-[var(--theme-text)]">{item.channelName || item.displayName || 'Yayıncı'}</span>
                    <span className="block truncate text-[10px] text-[var(--theme-secondary-text)]/46">
                      {item.liveStatus ? 'Canlı' : item.lastLiveEndedAt ? 'Son yayın sona erdi' : 'Canlı yayın yok'}
                    </span>
                  </span>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-[rgba(var(--glass-tint),0.05)] px-3 py-4 text-center text-[11px] text-[var(--theme-secondary-text)]/45 md:col-span-2">
                  Henüz yayın bağlantısı yok.
                </div>
              )}
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
