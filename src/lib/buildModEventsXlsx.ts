import { type ModerationEvent } from './serverService';
import { downloadXlsx } from './exportXlsx';
import { type ExportMode, type DateRange } from '../components/server/settings/ExportDialog';

/**
 * Oto-Mod ve Denetim>Analiz için ortak XLSX export.
 * moderation_events listesini alır, range/all filtrele + Oto-Mod mirror formatta indir.
 */

const KIND_TR: Record<string, string> = {
  flood: 'Flood',
  profanity: 'Küfür',
  spam: 'Spam',
  auto_punish: 'Auto Ceza',
};
const KIND_TINT: Record<string, { bg: string; fg: string }> = {
  Flood:      { bg: 'FFE0F7FA', fg: 'FF0E7490' },
  Küfür:      { bg: 'FFFFE4E6', fg: 'FFBE123C' },
  Spam:       { bg: 'FFF3E8FF', fg: 'FF7C3AED' },
  'Auto Ceza': { bg: 'FFFEF3C7', fg: 'FFB45309' },
};

export function countModEventsInRange(events: ModerationEvent[], range: DateRange): number {
  const s = Date.parse(range[0] + 'T00:00:00');
  const e = Date.parse(range[1] + 'T23:59:59');
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  const lo = Math.min(s, e), hi = Math.max(s, e);
  return events.filter(ev => {
    const t = Date.parse(ev.createdAt);
    return t >= lo && t <= hi;
  }).length;
}

export async function buildModEventsXlsx(params: {
  mode: ExportMode;
  range: DateRange;
  events: ModerationEvent[];
  serverName: string;
  /** Ekstra filter label (örn: aktif kind) — meta'da ek bilgi gösterilsin diye. */
  kindFilterLabel?: string;
}): Promise<void> {
  const { mode, range, events, serverName, kindFilterLabel } = params;
  let filtered: ModerationEvent[];
  let datePart: string;
  let suffix: string;
  if (mode === 'all') {
    filtered = events;
    datePart = 'Tüm log kaydı';
    suffix = 'tum-kayitlar';
  } else {
    const s = Date.parse(range[0] + 'T00:00:00');
    const e = Date.parse(range[1] + 'T23:59:59');
    const lo = Math.min(s, e), hi = Math.max(s, e);
    filtered = events.filter(ev => {
      const t = Date.parse(ev.createdAt);
      return t >= lo && t <= hi;
    });
    datePart = range[0] === range[1]
      ? `Tek tarih: ${range[0]}`
      : `Aralık: ${range[0]} → ${range[1]}`;
    suffix = range[0] === range[1] ? range[0] : `${range[0]}_${range[1]}`;
  }
  const filterLabel = kindFilterLabel ? `${datePart} · ${kindFilterLabel}` : datePart;

  const rows = filtered.map((ev, i) => ({
    no: i + 1,
    tur: KIND_TR[ev.kind] || ev.kind,
    kullanici: ev.userName || 'Bilinmiyor',
    kullaniciId: ev.userId || '',
    kanal: ev.channelName || '',
    kanalId: ev.channelId || '',
    tarih: new Date(ev.createdAt),
  }));

  await downloadXlsx({
    title: 'Moderasyon Kayıtları Raporu',
    sheetName: 'Moderasyon Kayıtları',
    tableName: 'ModerasyonKayitlari',
    serverName,
    filterLabel,
    columns: [
      { key: 'no',          header: 'Kayıt No',     width: 14, align: 'center' },
      { key: 'tur',         header: 'Olay Türü',    width: 16, align: 'center', tintMap: KIND_TINT },
      { key: 'kullanici',   header: 'Kullanıcı',    width: 26 },
      { key: 'kullaniciId', header: 'Kullanıcı ID', width: 40, muted: true },
      { key: 'kanal',       header: 'Kanal',        width: 22 },
      { key: 'kanalId',     header: 'Kanal ID',     width: 40, muted: true },
      { key: 'tarih',       header: 'Tarih / Saat', width: 22, align: 'center', dateFormat: 'dd.mm.yyyy hh:mm' },
    ],
    rows,
    filename: `moderasyon-kayitlari_${suffix}.xlsx`,
  });
}
