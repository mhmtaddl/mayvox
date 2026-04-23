/**
 * Insights Narrative Service — rule-based insight engine.
 *
 * Amaç: ham veriyi tekrar etmek değil, **yorum** üretmek.
 *   - "En aktif X" (ham veri) ← SummaryStrip zaten gösteriyor
 *   - "Aktivitenin büyük kısmı X etrafında" (yorum) ← bu service'in işi
 *
 * LLM YOK. Pure function, stateless. Max 3 insight.
 */
import type { InsightsUser, InsightsGroup, InsightsHourCell } from './voiceActivityService';

export type NarrativeType = 'highlight' | 'insight' | 'warning';

export interface InsightNarrative {
  id: string;
  type: NarrativeType;
  title: string;
  text: string;
}

export interface NarrativeInputData {
  topActiveUsers: InsightsUser[];
  topSocialGroups: InsightsGroup[];
  peakHours: InsightsHourCell[];
  rangeDays: number;
}

// ── Guards & helpers ────────────────────────────────────────────────────────

const MIN_TOTAL_ACTIVITY_SEC = 10 * 60; // 10 dk altı → hiç insight üretme
const MIN_GROUP_SEC = 300;
const DOMINANCE_STRONG = 0.70;
const DOMINANCE_NOTABLE = 0.50;
const BALANCE_CONCENTRATED = 0.80;
const BALANCE_DISTRIBUTED = 0.50;
const PEAK_DOMINANT_FACTOR = 1.5;     // en yoğun bucket, ikincisinin 1.5x'i
const WEEK_BIAS_FACTOR = 1.8;         // hafta içi/sonu vurgu eşiği

function hasValidName(n: string | null | undefined): boolean {
  if (!n) return false;
  const t = n.trim();
  return t.length > 0 && t.toLowerCase() !== 'bilinmeyen';
}

const DOW_FULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function joinDayNames(dayIndices: number[]): string {
  const sorted = [...dayIndices].sort((a, b) => a - b);
  const names = sorted.map(i => DOW_FULL[i]);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ve ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ve ${names[names.length - 1]}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ── Ana fonksiyon ───────────────────────────────────────────────────────────
export function buildNarratives(data: NarrativeInputData): InsightNarrative[] {
  const out: InsightNarrative[] = [];
  const totalActivity = data.peakHours.reduce((s, c) => s + c.totalSec, 0);

  // Hard guard: çok düşük veri → hiç insight yok (çöp önleme)
  if (totalActivity < MIN_TOTAL_ACTIVITY_SEC) return [];

  // ── 1. Dominance ──────────────────────────────────────────────────────────
  const tu = data.topActiveUsers[0];
  if (tu && hasValidName(tu.displayName) && tu.totalSec > 0) {
    const share = tu.totalSec / totalActivity;
    if (share >= DOMINANCE_STRONG) {
      out.push({
        id: 'dominance',
        type: 'highlight',
        title: 'Aktivite tek kişide yoğunlaşıyor',
        text: `Bu dönemde sunucunun ana motoru ${tu.displayName} olmuş görünüyor.`,
      });
    } else if (share >= DOMINANCE_NOTABLE) {
      out.push({
        id: 'dominance',
        type: 'highlight',
        title: 'Dikkat çeken baskın kullanıcı',
        text: `Aktivitenin büyük kısmı ${tu.displayName} etrafında dönüyor.`,
      });
    }
  }

  // ── 2. Social core ────────────────────────────────────────────────────────
  const tg = data.topSocialGroups[0];
  if (tg && tg.members.length >= 2 && tg.totalSec >= MIN_GROUP_SEC) {
    const validNames = tg.members.map(m => m.name).filter(hasValidName) as string[];
    // Yarısından fazlası tanınıyorsa üret; değilse skip
    if (validNames.length > tg.members.length / 2 && validNames.length >= 2) {
      let text: string | null = null;
      if (tg.members.length === 2) {
        text = `Sunucunun sosyal çekirdeği ${validNames[0]} ve ${validNames[1]} etrafında oluşuyor.`;
      } else if (tg.members.length >= 3) {
        text = `Sosyal çekirdek küçük bir grupta toplanıyor — başta ${validNames[0]} ve ${validNames[1]}.`;
      }
      if (text) {
        out.push({
          id: 'social-core',
          type: 'highlight',
          title: 'Sosyal çekirdek',
          text,
        });
      }
    }
  }

  // ── 3. Peak pattern (karakter yorumu + somut en yoğun saat) ──────────────
  // 2 satır:
  //   1) "Aktivite hafta ortasında yoğunlaşıyor."
  //   2) "En yoğun saat: Perşembe 16:00-17:00."
  if (data.peakHours.length > 0) {
    const dailyTotals = new Array(7).fill(0) as number[];
    const hourlyTotals = new Array(24).fill(0) as number[];
    let weekdaySec = 0, weekendSec = 0;
    for (const c of data.peakHours) {
      dailyTotals[c.dow] += c.totalSec;
      hourlyTotals[c.hour] += c.totalSec;
      if (c.dow === 0 || c.dow === 6) weekendSec += c.totalSec;
      else weekdaySec += c.totalSec;
    }

    const maxDaily = Math.max(...dailyTotals);
    const maxHourly = Math.max(...hourlyTotals);

    if (maxDaily > 0 && maxHourly > 0) {
      // Baskın günler listesi (max'ın %60'ı üstü)
      const activeDays = dailyTotals
        .map((s, i) => ({ dow: i, sec: s }))
        .filter(d => d.sec >= maxDaily * 0.6 && d.sec > 0)
        .map(d => d.dow);

      // Peak day + peak hour (en yoğun tek gün, tek saat)
      const peakDow = dailyTotals.indexOf(maxDaily);
      const peakHour = hourlyTotals.indexOf(maxHourly);
      const hourRange = `${pad2(peakHour)}:00-${pad2((peakHour + 1) % 24)}:00`;

      // Guard: pattern net değilse (tüm günler eşit) skip
      const patternIsClear = activeDays.length >= 1 && activeDays.length <= 5;

      if (patternIsClear) {
        // Satır 1: haftanın karakteri
        let characterLine = '';
        if (weekdaySec > weekendSec * 1.4) {
          // Hafta içi baskın — hafta ortası mı, başı mı, sonu mu?
          const midweek = activeDays.filter(d => d >= 2 && d <= 4).length; // Salı-Perşembe
          const earlyWeek = activeDays.filter(d => d === 1 || d === 2).length; // Pzt-Salı
          const lateWeek = activeDays.filter(d => d === 4 || d === 5).length;  // Per-Cum
          if (midweek >= 2 || (midweek === 1 && activeDays.length === 1)) {
            characterLine = 'Aktivite hafta ortasında yoğunlaşıyor.';
          } else if (earlyWeek >= 1 && earlyWeek >= lateWeek) {
            characterLine = 'Aktivite hafta başında canlanıyor.';
          } else if (lateWeek >= 1) {
            characterLine = 'Aktivite hafta sonuna doğru hareketleniyor.';
          } else {
            characterLine = 'Aktivite hafta içine yayılıyor.';
          }
        } else if (weekendSec > weekdaySec * 1.4) {
          characterLine = 'Aktivite hafta sonuna kayıyor.';
        } else {
          characterLine = 'Aktivite haftaya dengeli yayılıyor.';
        }

        // Satır 2: somut peak
        const specificLine = `En yoğun saat: ${DOW_FULL[peakDow]} ${hourRange}.`;

        out.push({
          id: 'peak-pattern',
          type: 'insight',
          title: 'Aktivite paterni',
          text: `${characterLine}\n${specificLine}`,
        });
      }
    }
  }

  // ── 4. Balance / Spread ──────────────────────────────────────────────────
  // Dominance zaten push edildiyse balance-concentrated anlamsız tekrar olur
  const dominanceAlready = out.some(o => o.id === 'dominance');
  if (data.topActiveUsers.length >= 3) {
    const top3Share = data.topActiveUsers.slice(0, 3)
      .reduce((s, u) => s + u.totalSec, 0) / totalActivity;

    if (!dominanceAlready && top3Share > BALANCE_CONCENTRATED) {
      out.push({
        id: 'balance-concentrated',
        type: 'insight',
        title: 'Katılım dağılımı',
        text: `Aktivite birkaç kullanıcı arasında yoğunlaşıyor.`,
      });
    } else if (top3Share < BALANCE_DISTRIBUTED) {
      out.push({
        id: 'balance-distributed',
        type: 'insight',
        title: 'Aktivite dengesi',
        text: `Ses odaları tek bir çekirdeğe değil, daha geniş bir gruba yayılıyor.`,
      });
    }
  }

  // Sabit sıra + max 3 (kalite > kantite)
  return out.slice(0, 3);
}
