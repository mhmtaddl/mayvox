import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Check, Edit2, ExternalLink, Info, Link2, Plus, Radio, Trash2, Twitch, X, Youtube } from 'lucide-react';
import {
  createServerStreamLink,
  deleteServerStreamLink,
  getTwitchStreamIntegration,
  getYoutubeStreamIntegration,
  listServerStreamLinks,
  updateServerStreamLink,
  updateTwitchStreamIntegration,
  updateYoutubeStreamIntegration,
  type ServerStreamLink,
  type StreamPlatform,
  type TwitchStreamIntegration,
  type YoutubeStreamIntegration,
} from '../../../lib/serverService';

const platformLabel: Record<StreamPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
};

interface Props {
  serverId: string;
  showToast?: (message: string) => void;
}

export default function StreamsTab({ serverId, showToast }: Props) {
  const [twitchChannelUrl, setTwitchChannelUrl] = useState('');
  const [twitchChannelName, setTwitchChannelName] = useState('');
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState('');
  const [youtubeChannelName, setYoutubeChannelName] = useState('');
  const [items, setItems] = useState<ServerStreamLink[]>([]);
  const [twitchIntegration, setTwitchIntegration] = useState<TwitchStreamIntegration | null>(null);
  const [youtubeIntegration, setYoutubeIntegration] = useState<YoutubeStreamIntegration | null>(null);
  const [twitchClientId, setTwitchClientId] = useState('');
  const [twitchClientSecret, setTwitchClientSecret] = useState('');
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [youtubeGuideOpen, setYoutubeGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTwitch, setSavingTwitch] = useState(false);
  const [savingYoutube, setSavingYoutube] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTwitchIntegration, setEditingTwitchIntegration] = useState(false);
  const [editingYoutubeIntegration, setEditingYoutubeIntegration] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState<'twitch' | 'youtube' | null>(null);
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);
  const [editingStreamName, setEditingStreamName] = useState('');
  const [editingStreamUrl, setEditingStreamUrl] = useState('');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  const canSaveTwitchChannel = useMemo(() => twitchChannelUrl.trim().length > 0 && !saving, [twitchChannelUrl, saving]);
  const canSaveYoutubeChannel = useMemo(() => youtubeChannelUrl.trim().length > 0 && !saving, [youtubeChannelUrl, saving]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listServerStreamLinks(serverId)
      .then(next => {
        if (!cancelled) setItems(next);
      })
      .catch(err => {
        if (!cancelled) {
          setItems([]);
          showToast?.(err instanceof Error ? err.message : 'Yayın bağlantıları alınamadı');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [serverId, showToast]);

  useEffect(() => {
    let cancelled = false;
    getTwitchStreamIntegration(serverId)
      .then(integration => {
        if (cancelled) return;
        setTwitchIntegration(integration);
        setTwitchClientId(integration.clientId || '');
        setTwitchClientSecret('');
        setEditingTwitchIntegration(false);
      })
      .catch(() => {
        if (!cancelled) setTwitchIntegration(null);
      });
    return () => { cancelled = true; };
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    getYoutubeStreamIntegration(serverId)
      .then(integration => {
        if (cancelled) return;
        setYoutubeIntegration(integration);
        setYoutubeApiKey(integration.apiKey || '');
        setEditingYoutubeIntegration(false);
      })
      .catch(() => {
        if (!cancelled) setYoutubeIntegration(null);
      });
    return () => { cancelled = true; };
  }, [serverId]);

  const confirmReplaceIntegration = () => {
    if (replaceConfirm === 'twitch') {
      setEditingTwitchIntegration(true);
      setTwitchClientSecret('');
    }
    if (replaceConfirm === 'youtube') {
      setEditingYoutubeIntegration(true);
      setYoutubeApiKey('');
    }
    setReplaceConfirm(null);
  };

  const handleAdd = async (platform: StreamPlatform, channelUrl: string, channelName: string) => {
    if (!channelUrl.trim() || saving) return;
    try {
      setSaving(true);
      const created = await createServerStreamLink(serverId, {
        platform,
        channelUrl: channelUrl.trim(),
        channelName: channelName.trim() || undefined,
      });
      setItems(prev => [created, ...prev.filter(item => !(item.userId === created.userId && item.platform === created.platform))]);
      if (platform === 'youtube') {
        setYoutubeChannelUrl('');
        setYoutubeChannelName('');
      } else {
        setTwitchChannelUrl('');
        setTwitchChannelName('');
      }
      showToast?.('Yayın bağlantısı kaydedildi');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Yayın bağlantısı kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ServerStreamLink) => {
    try {
      setDeletingId(item.id);
      await deleteServerStreamLink(serverId, item.id);
      setItems(prev => prev.filter(row => row.id !== item.id));
      showToast?.('Yayın bağlantısı silindi');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Yayın bağlantısı silinemedi');
    } finally {
      setDeletingId(null);
    }
  };

  const beginEditStream = (item: ServerStreamLink) => {
    setEditingStreamId(item.id);
    setEditingStreamName(item.channelName || '');
    setEditingStreamUrl(item.channelUrl || '');
  };

  const cancelEditStream = () => {
    setEditingStreamId(null);
    setEditingStreamName('');
    setEditingStreamUrl('');
  };

  const handleSaveStreamEdit = async (item: ServerStreamLink) => {
    if (!editingStreamUrl.trim() || savingEditId) return;
    try {
      setSavingEditId(item.id);
      const updated = await updateServerStreamLink(serverId, item.id, {
        channelName: editingStreamName.trim() || undefined,
        channelUrl: editingStreamUrl.trim(),
      });
      setItems(prev => prev.map(row => row.id === updated.id ? { ...row, ...updated } : row));
      cancelEditStream();
      showToast?.('Yayın bağlantısı güncellendi');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Yayın bağlantısı güncellenemedi');
    } finally {
      setSavingEditId(null);
    }
  };

  const handleSaveTwitch = async () => {
    if (savingTwitch) return;
    try {
      setSavingTwitch(true);
      const saved = await updateTwitchStreamIntegration(serverId, {
        clientId: twitchClientId.trim(),
        clientSecret: twitchClientSecret.trim(),
        enabled: true,
      });
      setTwitchIntegration(saved);
      setTwitchClientSecret('');
      setEditingTwitchIntegration(false);
      showToast?.('Twitch API bağlantısı kaydedildi');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Twitch API bağlantısı kaydedilemedi');
    } finally {
      setSavingTwitch(false);
    }
  };

  const handleSaveYoutube = async () => {
    if (savingYoutube) return;
    try {
      setSavingYoutube(true);
      const saved = await updateYoutubeStreamIntegration(serverId, {
        apiKey: youtubeApiKey.trim(),
        enabled: true,
      });
      setYoutubeIntegration(saved);
      setEditingYoutubeIntegration(false);
      showToast?.('YouTube API bağlantısı kaydedildi');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'YouTube API bağlantısı kaydedilemedi');
    } finally {
      setSavingYoutube(false);
    }
  };

  return (
    <div className="mx-auto max-w-[820px] space-y-3">
      {replaceConfirm && (
        <div
          className="fixed inset-0 z-[720] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[3px]"
          onClick={() => setReplaceConfirm(null)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[rgba(var(--glass-tint),0.12)] shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
            style={{
              background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.035), rgba(var(--glass-tint),0.012)), rgb(var(--theme-bg-rgb))',
            }}
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-[rgba(var(--glass-tint),0.06)] px-4 py-3.5">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--theme-text)]">
                {replaceConfirm === 'twitch' ? (
                  <Twitch size={15} className="text-[#9146ff]" />
                ) : (
                  <Youtube size={15} className="text-[#ff0033]" />
                )}
                Bağlantıyı değiştir
              </h3>
              <p className="mt-1.5 text-[11px] leading-5 text-[var(--theme-secondary-text)]/62">
                {replaceConfirm === 'twitch' ? 'Twitch' : 'YouTube'} bağlantısı zaten aktif. Yeni API bilgileri kaydedilirse mevcut bağlantı değiştirilecek.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setReplaceConfirm(null)}
                className="h-8 rounded-xl px-3 text-[11px] font-semibold text-[var(--theme-secondary-text)]/66 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmReplaceIntegration}
                className="h-8 rounded-xl border border-red-400/35 bg-red-500/12 px-3 text-[11px] font-semibold text-red-200 transition-colors hover:border-red-300/50 hover:bg-red-500/18 hover:text-red-100"
              >
                Devam et
              </button>
            </div>
          </div>
        </div>
      )}

      {guideOpen && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[4px]"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-2xl border border-[rgba(var(--glass-tint),0.14)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
            style={{ background: 'rgb(var(--theme-bg-rgb))' }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--theme-text)]">Twitch API ve kanal adresi nasıl bağlanır?</h3>
                <p className="mt-1 text-[11px] leading-5 text-[var(--theme-secondary-text)]/58">
                  Canlı durumu için Twitch API bilgileri, yayın kartı için de normal Twitch kanal adresi gerekir.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
                aria-label="Kapat"
              >
                <X size={15} />
              </button>
            </div>

            <ol className="mt-4 space-y-2 text-[12px] leading-5 text-[var(--theme-secondary-text)]/76">
              <li><span className="font-semibold text-[var(--theme-text)]">1.</span> <a className="text-[var(--theme-accent)] hover:underline" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">dev.twitch.tv/console/apps</a> adresine gir.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">2.</span> <span className="text-[var(--theme-text)]">Uygulamanızı Kaydettirin</span> butonuna bas.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">3.</span> Ad alanına örn. <span className="text-[var(--theme-text)]">MAYVox CYLK</span> yaz.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">4.</span> OAuth URL alanına <span className="text-[var(--theme-text)]">https://mayvox.com</span> yaz ve <span className="text-[var(--theme-text)]">Ekle</span> de.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">5.</span> Kategori olarak <span className="text-[var(--theme-text)]">Application Integration</span> seç.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">6.</span> İstemci türü <span className="text-[var(--theme-text)]">Gizli</span> olmalı. Oluşturunca İstemci Kimliği görünür.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">7.</span> Uygulama detayında <span className="text-[var(--theme-text)]">New Secret / Yeni Gizli Anahtar</span> ile İstemci Parolası oluştur.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">8.</span> MAYVox'a İstemci Kimliği ve İstemci Parolası'nı yapıştırıp <span className="text-[var(--theme-text)]">Kaydet</span> de.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">9.</span> Twitch kanal sayfanı aç ve adresi kopyala. Örnek: <span className="text-[var(--theme-text)]">https://www.twitch.tv/kullaniciadi</span></li>
              <li><span className="font-semibold text-[var(--theme-text)]">10.</span> Bu adresi <span className="text-[var(--theme-text)]">Kanal adresi</span> alanına yapıştırıp <span className="text-[var(--theme-text)]">Ekle</span> de.</li>
            </ol>

            <div className="mt-4 rounded-xl border border-amber-300/12 bg-amber-300/7 px-3 py-2 text-[11px] leading-5 text-amber-100/78">
              Yayın anahtarını buraya girme. Yayın anahtarı sadece OBS/Streamlabs için kullanılır; MAYVox'a normal kanal linki eklenir.
            </div>
          </div>
        </div>
      )}

      {youtubeGuideOpen && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[4px]"
          onClick={() => setYoutubeGuideOpen(false)}
        >
          <div
            className="w-full max-w-[500px] rounded-2xl border border-[rgba(var(--glass-tint),0.14)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
            style={{ background: 'rgb(var(--theme-bg-rgb))' }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--theme-text)]">YouTube kanal adresi nasıl eklenir?</h3>
                <p className="mt-1 text-[11px] leading-5 text-[var(--theme-secondary-text)]/58">
                  Canlı durumu için YouTube API anahtarı, yayın kartı için de normal YouTube kanal adresi gerekir.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setYoutubeGuideOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
                aria-label="Kapat"
              >
                <X size={15} />
              </button>
            </div>

            <ol className="mt-4 space-y-2 text-[12px] leading-5 text-[var(--theme-secondary-text)]/76">
              <li><span className="font-semibold text-[var(--theme-text)]">1.</span> <a className="text-[var(--theme-accent)] hover:underline" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a> üzerinden <span className="text-[var(--theme-text)]">YouTube Data API v3</span> servisini etkinleştir.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">2.</span> <span className="text-[var(--theme-text)]">Kimlik bilgileri</span> bölümünden bir <span className="text-[var(--theme-text)]">API anahtarı</span> oluştur.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">3.</span> API anahtarını MAYVox'taki <span className="text-[var(--theme-text)]">YouTube API Anahtarı</span> alanına yapıştırıp <span className="text-[var(--theme-text)]">Kaydet</span> de.</li>
              <li><span className="font-semibold text-[var(--theme-text)]">4.</span> YouTube'da kanal sayfanı aç ve adresi kopyala. Örnek: <span className="text-[var(--theme-text)]">https://www.youtube.com/@kanaladi</span></li>
              <li><span className="font-semibold text-[var(--theme-text)]">5.</span> Bu adresi <span className="text-[var(--theme-text)]">Kanal adresi</span> alanına yapıştırıp <span className="text-[var(--theme-text)]">Ekle</span> de.</li>
            </ol>

            <div className="mt-4 rounded-xl border border-amber-300/12 bg-amber-300/7 px-3 py-2 text-[11px] leading-5 text-amber-100/78">
              Video, YouTube Studio veya yayın yönetimi linki yerine kanal linki eklemen daha doğru olur. Örnek: youtube.com/@kanaladi
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.012)] p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--theme-text)]">
              <Twitch size={14} className="text-[#9146ff]" />
              Twitch API
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.07)] hover:text-[var(--theme-accent)]"
                title="Twitch API rehberi"
                aria-label="Twitch API rehberi"
              >
                <Info size={13} />
              </button>
            </h3>
            <p className="mt-1 text-[10px] leading-4 text-[var(--theme-secondary-text)]/50">
              Canlı durumunu otomatik almak için Twitch uygulama bilgilerini buraya kaydet.
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${
            twitchIntegration?.hasClientSecret
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-[rgba(var(--glass-tint),0.04)] text-[var(--theme-secondary-text)]/48'
          }`}>
            {twitchIntegration?.hasClientSecret ? 'Bağlı' : 'Bağlı değil'}
          </span>
        </div>

        {twitchIntegration?.hasClientSecret && !editingTwitchIntegration ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.035] px-3 py-2.5">
            <span className="min-w-0 text-[11px] leading-5 text-[var(--theme-secondary-text)]/62">
              Twitch API bağlantısı aktif. Kanal eklemek için aşağıdaki kanal alanlarını kullanabilirsin.
            </span>
            <button
              type="button"
              onClick={() => {
                setReplaceConfirm('twitch');
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.07)]"
            >
              Yeni API bağla
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block min-w-0">
              <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">İstemci Kimliği</span>
              <input
                value={twitchClientId}
                onChange={event => setTwitchClientId(event.target.value)}
                placeholder="Twitch İstemci Kimliği"
                className="mt-1.5 h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
              />
            </label>
            <label className="block min-w-0">
              <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">İstemci Parolası</span>
              <input
                value={twitchClientSecret}
                onChange={event => setTwitchClientSecret(event.target.value)}
                placeholder={twitchIntegration?.hasClientSecret ? 'Yeni İstemci Parolası' : 'Twitch İstemci Parolası'}
                type="password"
                className="mt-1.5 h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
              />
            </label>
            <div className="relative min-w-0">
              <span className="block text-[10px] font-medium text-transparent">Kaydet</span>
              <button
                type="button"
                onClick={() => void handleSaveTwitch()}
                disabled={savingTwitch || !twitchClientId.trim() || !twitchClientSecret.trim()}
                className="mt-1.5 inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--theme-accent-rgb),0.18)] bg-[rgba(var(--theme-accent-rgb),0.075)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.12)] disabled:cursor-default disabled:opacity-45"
              >
                {savingTwitch ? 'Kaydediliyor' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-[rgba(var(--glass-tint),0.055)] pt-3">
          <div className="mb-3">
            <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[var(--theme-text)]">
              <Twitch size={13} className="text-[#9146ff]" />
              Twitch kanalı
            </h4>
            <p className="mt-1 text-[10px] leading-4 text-[var(--theme-secondary-text)]/50">
              Twitch uygulaması zaten sunucuya bağlıysa sadece kendi kanal adını ve adresini ekle.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[0.85fr_1.35fr_auto]">
            <label className="block min-w-0">
              <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">Kanal adı</span>
              <input
                value={twitchChannelName}
                onChange={event => setTwitchChannelName(event.target.value)}
                placeholder="örn. CYLK TV"
                maxLength={120}
                className="mt-1.5 h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                onKeyDown={event => {
                  if (event.key === 'Enter') void handleAdd('twitch', twitchChannelUrl, twitchChannelName);
                }}
              />
            </label>

            <label className="block min-w-0">
              <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">Kanal adresi</span>
              <span className="relative mt-1.5 block">
                <Link2 size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/38" />
                <input
                  value={twitchChannelUrl}
                  onChange={event => setTwitchChannelUrl(event.target.value)}
                  placeholder="https://www.twitch.tv/kullaniciadi"
                  className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] pl-8 pr-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                  onKeyDown={event => {
                    if (event.key === 'Enter') void handleAdd('twitch', twitchChannelUrl, twitchChannelName);
                  }}
                />
              </span>
            </label>

            <div className="relative min-w-0 flex-1">
              <span className="block text-[10px] font-medium text-transparent">Ekle</span>
              <button
                type="button"
                onClick={() => void handleAdd('twitch', twitchChannelUrl, twitchChannelName)}
                disabled={!canSaveTwitchChannel}
                className="mt-1.5 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[rgba(var(--theme-accent-rgb),0.18)] bg-[rgba(var(--theme-accent-rgb),0.075)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.12)] disabled:cursor-default disabled:opacity-45"
              >
                <Plus size={13} />
                {saving ? 'Ekleniyor' : 'Ekle'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.012)] p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--theme-text)]">
              <Youtube size={14} className="text-[#ff0033]" />
              YouTube kanalı
              <button
                type="button"
                onClick={() => setYoutubeGuideOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.07)] hover:text-[var(--theme-accent)]"
                title="YouTube kanal adresi rehberi"
                aria-label="YouTube kanal adresi rehberi"
              >
                <Info size={13} />
              </button>
            </h3>
            <p className="mt-1 text-[10px] leading-4 text-[var(--theme-secondary-text)]/50">
              Canlı durumunu otomatik almak için YouTube API anahtarını kaydet, sonra kanal linkini ekle.
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${
            youtubeIntegration?.hasApiKey
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-[rgba(var(--glass-tint),0.04)] text-[var(--theme-secondary-text)]/48'
          }`}>
            {youtubeIntegration?.hasApiKey ? 'Bağlı' : 'Bağlı değil'}
          </span>
        </div>

        {youtubeIntegration?.hasApiKey && !editingYoutubeIntegration ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.035] px-3 py-2.5">
            <span className="min-w-0 text-[11px] leading-5 text-[var(--theme-secondary-text)]/62">
              YouTube API bağlantısı aktif. Kanal eklemek için aşağıdaki kanal alanlarını kullanabilirsin.
            </span>
            <button
              type="button"
              onClick={() => {
                setReplaceConfirm('youtube');
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.07)]"
            >
              Yeni API bağla
            </button>
          </div>
        ) : (
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="block min-w-0">
              <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">YouTube API Anahtarı</span>
              <input
                value={youtubeApiKey}
                onChange={event => setYoutubeApiKey(event.target.value)}
                placeholder="YouTube Data API v3 anahtarı"
                type="password"
                className="mt-1.5 h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
              />
            </label>
            <div className="relative min-w-0">
              <span className="block text-[10px] font-medium text-transparent">Kaydet</span>
              <button
                type="button"
                onClick={() => void handleSaveYoutube()}
                disabled={savingYoutube || !youtubeApiKey.trim()}
                className="mt-1.5 inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--theme-accent-rgb),0.18)] bg-[rgba(var(--theme-accent-rgb),0.075)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.12)] disabled:cursor-default disabled:opacity-45"
              >
                {savingYoutube ? 'Kaydediliyor' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[0.85fr_1.35fr_auto]">
          <label className="block min-w-0">
            <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">Kanal adı</span>
            <input
              value={youtubeChannelName}
              onChange={event => setYoutubeChannelName(event.target.value)}
              placeholder="örn. CYLK YouTube"
              maxLength={120}
              className="mt-1.5 h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
              onKeyDown={event => {
                if (event.key === 'Enter') void handleAdd('youtube', youtubeChannelUrl, youtubeChannelName);
              }}
            />
          </label>

          <label className="block min-w-0">
            <span className="block text-[10px] font-medium text-[var(--theme-secondary-text)]/60">Kanal adresi</span>
            <span className="relative mt-1.5 block">
              <Link2 size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/38" />
              <input
                value={youtubeChannelUrl}
                onChange={event => setYoutubeChannelUrl(event.target.value)}
                placeholder="https://www.youtube.com/@kanaladi"
                className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] pl-8 pr-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                onKeyDown={event => {
                  if (event.key === 'Enter') void handleAdd('youtube', youtubeChannelUrl, youtubeChannelName);
                }}
              />
            </span>
          </label>

          <div className="relative min-w-0 flex-1">
            <span className="block text-[10px] font-medium text-transparent">Ekle</span>
            <button
              type="button"
              onClick={() => void handleAdd('youtube', youtubeChannelUrl, youtubeChannelName)}
              disabled={!canSaveYoutubeChannel}
              className="mt-1.5 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[rgba(var(--theme-accent-rgb),0.18)] bg-[rgba(var(--theme-accent-rgb),0.075)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.12)] disabled:cursor-default disabled:opacity-45"
            >
              <Plus size={13} />
              {saving ? 'Ekleniyor' : 'Ekle'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.045)] bg-transparent p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--theme-text)]">Eklenen yayın önizlemesi</h4>
            <p className="mt-0.5 text-[10px] text-[var(--theme-secondary-text)]/45">Sunucu ana sayfasında gösterilecek yayıncılar.</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="text-[11px] font-medium text-[var(--theme-secondary-text)]/42">Yayın bağlantıları yükleniyor...</div>
          ) : items.length === 0 ? (
            <div className="text-[11px] font-medium text-[var(--theme-secondary-text)]/42">Henüz yayın bağlantısı yok.</div>
          ) : (
            items.map(item => {
              const editing = editingStreamId === item.id;
              return (
              <div
                key={item.id}
                className="rounded-xl border border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] px-3 py-2"
              >
                {editing ? (
                  <div className="grid gap-2 sm:grid-cols-[0.85fr_1.35fr_auto]">
                    <input
                      value={editingStreamName}
                      onChange={event => setEditingStreamName(event.target.value)}
                      placeholder="Kanal adı"
                      className="h-9 min-w-0 rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                    />
                    <input
                      value={editingStreamUrl}
                      onChange={event => setEditingStreamUrl(event.target.value)}
                      placeholder="Kanal adresi"
                      className="h-9 min-w-0 rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                      onKeyDown={event => {
                        if (event.key === 'Enter') void handleSaveStreamEdit(item);
                        if (event.key === 'Escape') cancelEditStream();
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleSaveStreamEdit(item)}
                        disabled={savingEditId === item.id || !editingStreamUrl.trim()}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:cursor-default disabled:opacity-45"
                        title="Kaydet"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditStream}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/52 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
                        title="Vazgeç"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-8 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${
                      item.platform === 'youtube'
                        ? 'text-[#ff0033]'
                        : item.platform === 'twitch'
                          ? 'text-[#9146ff]'
                          : 'text-[var(--theme-accent)]/85'
                    }`}>
                      {item.platform === 'twitch' ? <Twitch size={18} /> : item.platform === 'youtube' ? <Youtube size={18} /> : <Radio size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-[var(--theme-text)]">
                        {item.channelName || platformLabel[item.platform]}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--theme-secondary-text)]/45">
                        {item.liveStatus
                          ? `Canlı${typeof item.viewerCount === 'number' ? ` · ${item.viewerCount.toLocaleString('tr-TR')} izleyici` : ''}`
                          : item.lastLiveEndedAt
                            ? 'Son yayın sona erdi'
                            : 'Canlı yayın yok'}
                      </span>
                      {item.liveTitle && (
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--theme-secondary-text)]/36">
                          {item.liveTitle}
                        </span>
                      )}
                      {!item.liveTitle && item.lastLiveTitle && (
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--theme-secondary-text)]/36">
                          {item.lastLiveTitle}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => beginEditStream(item)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/45 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-accent)]"
                      title="Düzenle"
                    >
                      <Edit2 size={13} />
                    </button>
                    <a
                      href={item.channelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/52 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
                      title="Yayını aç"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/45 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-default disabled:opacity-45"
                      title="Sil"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
