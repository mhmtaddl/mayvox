import React, { useEffect, useState } from 'react';
import type { OverlaySnapshot, OverlayParticipant, OverlaySize, OverlayVariant } from './types';
import { hasCustomAvatar, getStatusAvatar } from '../lib/statusAvatar';

// ── Overlay renderer ──────────────────────────────────────────────────────
// 3 premium varyant: Capsule (pill), Card (info-dense), Badge (minimal floating).
// Tüm variant'lar cardColorHex (tema accent) + cardOpacity (idle) ile boyanır.
// Konuşan satırda opacity otomatik %100'e çıkar, scale + ring glow vurgu uygulanır.

declare global {
  interface Window {
    electronOverlay?: {
      onSnapshot: (cb: (snap: OverlaySnapshot) => void) => void;
      removeAll: () => void;
    };
  }
}

const MAX_VISIBLE = 6;

interface SizeCfg {
  avatar: number;
  name: number;
  gap: number;
  /** Waveform bar height (speaking indicator). */
  wave: number;
}
const SIZE_CONFIG: Record<OverlaySize, SizeCfg> = {
  small:  { avatar: 26, name: 10,   gap: 6,  wave: 10 },
  medium: { avatar: 34, name: 11.5, gap: 8,  wave: 13 },
  large:  { avatar: 42, name: 13,   gap: 10, wave: 16 },
};

// ══════════════════════════════════════════════════════════════════════════
export default function OverlayApp() {
  const [snap, setSnap] = useState<OverlaySnapshot | null>(null);

  useEffect(() => {
    const api = window.electronOverlay;
    if (!api) return;
    api.onSnapshot(setSnap);
    return () => { try { api.removeAll(); } catch { /* no-op */ } };
  }, []);

  if (!snap || snap.participants.length === 0) {
    return <div style={{ width: '100%', height: '100%' }} />;
  }

  const visible = snap.participants.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, snap.participants.length - visible.length);
  const size: OverlaySize = snap.size || 'medium';
  const cfg = SIZE_CONFIG[size];
  const variant: OverlayVariant = snap.variant || 'capsule';
  // Kart rengi — Apple-grade subtle vertical gradient (mat siyaha yakın).
  // Üstte hafif açık (#171a22), altta mat siyah (#0a0c10) → premium depth, abartısız.
  // buildCardGradient(opacity) içinde tanımlı; her variant aynı arka planı paylaşır.
  const idleOpacityPct = Math.max(0, Math.min(100, snap.cardOpacity ?? 50));

  // Badge variant için satırlar arası gap daha dar (idle'da neredeyse tek kolon)
  const rowGap = variant === 'badge' ? cfg.gap + 2 : cfg.gap + 4;

  return (
    <div
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-start', alignItems: 'flex-start',
        gap: rowGap,
        // Clamp padding — küçük overlay penceresinde sıkışmasın, büyükte abartmasın.
        padding: 'clamp(8px, 1.2vw, 14px) clamp(10px, 1.4vw, 16px)',
        background: 'transparent',
        boxSizing: 'border-box',
        overflow: 'visible',
        // Text rendering — farklı DPI'lerde (100/125/150%) stabil render.
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
        // Transform/opacity tabanlı animasyonları GPU katmanına al.
        contain: 'layout paint',
      } as React.CSSProperties}
    >
      {visible.map((p) => (
        <ParticipantRow
          key={p.id}
          p={p}
          cfg={cfg}
          variant={variant}
          idleOpacityPct={idleOpacityPct}
        />
      ))}

      {overflow > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: cfg.gap,
          fontSize: cfg.name - 0.5,
          color: 'rgba(220, 228, 240, 0.72)',
          fontWeight: 600,
          textShadow: '0 1px 2px rgba(0,0,0,0.55)',
          paddingLeft: cfg.avatar + cfg.gap,
        }}>
          +{overflow} kişi daha
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Apple-grade glassmorphism — macOS Control Center / VisionOS floating panel.
// İki katman: üstte çok subtle beyaz radial glow (ambient highlight) + altta
// koyu mat linear gradient. Backdrop-filter container'da uygulanır.
// Opacity 0 → 'transparent' (kart yok).
const GLASS_TOP_RGB    = '20, 20, 25';  // hafif gri-lacivert, pür siyah değil
const GLASS_BOTTOM_RGB = '10, 10, 15';
// Idle iken glass (translucent 0.65/0.55), speaking iken TAM OPAK (1.0/0.95) —
// konuşan/muted/deafened satırda arka plan kesin görünür, slider değeriyle kesişmez.
function buildCardGradient(opacity: number, solid = false): string {
  if (!opacity) return 'transparent';
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  const topA  = (solid ? 1.0  : 0.65 * a).toFixed(3);
  const botA  = (solid ? 0.95 : 0.55 * a).toFixed(3);
  const glowA = (solid ? 0.12 : 0.08 * a).toFixed(3);
  return (
    `radial-gradient(circle at 30% 20%, rgba(255,255,255,${glowA}), transparent 60%),`
    + ` linear-gradient(180deg, rgba(${GLASS_TOP_RGB}, ${topA}) 0%, rgba(${GLASS_BOTTOM_RGB}, ${botA}) 100%)`
  );
}

// Glass container ortak stili — her variant (capsule/card/badge) kullanır.
// backdrop-filter blur(20) + saturate(140) macOS Control Center hissi verir.
// Border 0.08 white + inset highlight + layered depth shadow ile "floating panel".
const GLASS_BACKDROP = 'blur(20px) saturate(140%)';
const GLASS_BORDER = '1px solid rgba(255, 255, 255, 0.08)';
const GLASS_SHADOW =
  '0 10px 30px rgba(0, 0, 0, 0.35),'
  + ' 0 2px 8px rgba(0, 0, 0, 0.25),'
  + ' inset 0 1px 0 rgba(255, 255, 255, 0.06)';

// ══════════════════════════════════════════════════════════════════════════
// Shared subcomponents
// ══════════════════════════════════════════════════════════════════════════

const Avatar: React.FC<{
  p: OverlayParticipant;
  size: number;
}> = ({ p, size }) => {
  const useCustom = hasCustomAvatar(p.avatarUrl);
  const statusSrc = useCustom ? null : (getStatusAvatar(p.statusText || 'Çevrimdışı') || getStatusAvatar('Çevrimdışı'));
  const imgSrc = useCustom ? p.avatarUrl! : statusSrc;

  // Avatar etrafında speaking/muted çizgisi YOK — vurgu waveform + status metni + scale ile.
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: '26%',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.35)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.45)',
      }}
    >
      {imgSrc ? (
        <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'rgba(40, 50, 70, 0.85)' }} />
      )}
    </div>
  );
};

// 4 barlı ses dalgası — state-driven, ses seviyesine duyarlı simülasyon.
// Speaking iken her ~120ms'de yeni rastgele yükseklikler üretilir → her bar bağımsız
// "amplitude" ile hareket eder, gerçek ses dalgası hissi verir.
const Waveform: React.FC<{ active: boolean; height: number; color: string }> = ({ active, height, color }) => {
  const [heights, setHeights] = useState<number[]>([0.32, 0.32, 0.32, 0.32]);
  useEffect(() => {
    if (!active) {
      setHeights([0.32, 0.32, 0.32, 0.32]);
      return;
    }
    const tick = () => setHeights(Array.from({ length: 4 }, () => 0.30 + Math.random() * 0.70));
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', height, flexShrink: 0 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            width: 2,
            height: '100%',
            borderRadius: 2,
            background: color,
            transformOrigin: 'center',
            transform: `scaleY(${h})`,
            transition: 'transform 130ms cubic-bezier(0.22, 1, 0.36, 1)',
            opacity: active ? 1 : 0.5,
            boxShadow: active ? `0 0 4px ${color}` : 'none',
            willChange: active ? 'transform' : 'auto',
          }}
        />
      ))}
    </div>
  );
};

const HeadphonesOffIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {/* Kulaklık formu */}
    <path d="M3 14a9 9 0 0 1 12.69-8.21" />
    <path d="M21 14v4a2 2 0 0 1-2 2h-1v-7" />
    <path d="M6 21H5a2 2 0 0 1-2-2v-4" />
    <path d="M3 14h2v6" />
    <path d="M21 14h-1" />
    {/* Slash diyagonal */}
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const MicIcon: React.FC<{ size: number; color: string; off?: boolean }> = ({ size, color, off }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {!off ? (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </>
    ) : (
      <>
        <line x1="2" y1="2" x2="22" y2="22" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
        <path d="M15 9.34V5a3 3 0 0 0-5.94-.6" />
        <path d="M5 11v1a7 7 0 0 0 11.61 5.27" />
        <path d="M19 11v1" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </>
    )}
  </svg>
);

// ══════════════════════════════════════════════════════════════════════════
// ParticipantRow — variant dispatcher
// ══════════════════════════════════════════════════════════════════════════

// Memoize: sadece participant state veya render-etkileyen snapshot değerleri değişince re-render.
// Konuşmayan satırlar başka birinin speaking toggling'inde boşuna re-render olmasın.
const ParticipantRow: React.FC<{
  p: OverlayParticipant;
  cfg: SizeCfg;
  variant: OverlayVariant;
  idleOpacityPct: number;
}> = React.memo(function ParticipantRow({ p, cfg, variant, idleOpacityPct }) {
  const speaking = p.isSpeaking && !p.isMuted;
  const muted = p.isMuted;
  const deafened = p.isDeafened;
  // Konuşan / muted / deafened iken şeffaflık tamamen kalkar (bilgi state'i okunmalı).
  const visible = speaking || muted || deafened;
  const effectiveOpacityPct = visible ? 100 : idleOpacityPct;
  // visible (speaking/muted/deafened) iken kart TAM OPAK — kullanıcı istediği "konuşunca
  // görünsün" garantisi. Idle'da slider değerine göre glass translucent kalır.
  const cardBg = buildCardGradient(effectiveOpacityPct, visible);
  const rowOpacity = effectiveOpacityPct / 100;
  const hasCard = cardBg !== 'transparent';

  // Status öncelik: deafened (duymuyor) > muted (dinliyor) > speaking (konuşuyor).
  // Deafened genelde mic'i de kapatır ama kulağın kapalı olduğunu vurgulamak öncelikli.
  const statusText = deafened ? 'Duymuyor' : muted ? 'Dinliyor' : speaking ? 'Konuşuyor' : '';
  const statusColor = deafened ? '#ef4444' : muted ? '#fb923c' : speaking ? '#7bd389' : 'rgba(220,228,240,0.65)';
  const waveColor = deafened ? '#ef4444' : muted ? '#fb923c' : speaking ? '#7bd389' : 'rgba(220,228,240,0.65)';

  if (variant === 'capsule') {
    return (
      <CapsuleRow
        p={p} cfg={cfg} speaking={speaking} muted={muted} deafened={deafened}
        cardBg={cardBg} hasCard={hasCard} rowOpacity={rowOpacity}
        statusText={statusText} statusColor={statusColor} waveColor={waveColor}
      />
    );
  }
  if (variant === 'card') {
    return (
      <CardRow
        p={p} cfg={cfg} speaking={speaking} muted={muted} deafened={deafened}
        cardBg={cardBg} hasCard={hasCard} rowOpacity={rowOpacity}
        statusText={statusText} statusColor={statusColor} waveColor={waveColor}
      />
    );
  }
  if (variant === 'none') {
    return <NoneRow p={p} cfg={cfg} speaking={speaking} rowOpacity={rowOpacity} />;
  }
  // badge
  return (
    <BadgeRow
      p={p} cfg={cfg} speaking={speaking} muted={muted} deafened={deafened}
      cardBg={cardBg} hasCard={hasCard} rowOpacity={rowOpacity}
      statusText={statusText} statusColor={statusColor} waveColor={waveColor}
    />
  );
}, (prev, next) => {
  // Custom shallow compare — sadece render'ı etkileyen alanlar.
  const pp = prev.p, np = next.p;
  return (
    pp.id === np.id
    && pp.displayName === np.displayName
    && pp.avatarUrl === np.avatarUrl
    && pp.statusText === np.statusText
    && pp.isSpeaking === np.isSpeaking
    && pp.isMuted === np.isMuted
    && pp.isDeafened === np.isDeafened
    && prev.variant === next.variant
    && prev.idleOpacityPct === next.idleOpacityPct
    && prev.cfg.avatar === next.cfg.avatar
    && prev.cfg.name === next.cfg.name
    && prev.cfg.gap === next.cfg.gap
    && prev.cfg.wave === next.cfg.wave
  );
});

// ══════════════════════════════════════════════════════════════════════════
// Variant 0 — NONE (kart yok / sade avatar + isim — eski minimal görünüm)
// Kart, waveform, status metni yok. Sadece slider opacity + speaking scale.
// ══════════════════════════════════════════════════════════════════════════

const NoneRow: React.FC<{
  p: OverlayParticipant;
  cfg: SizeCfg;
  speaking: boolean;
  rowOpacity: number;
}> = ({ p, cfg, speaking, rowOpacity }) => (
  <div
    style={{
      display: 'inline-flex', alignItems: 'center', gap: cfg.gap,
      background: 'transparent',
      opacity: rowOpacity,
      transform: speaking ? 'scale(1.04)' : 'scale(1)',
      transformOrigin: 'left center',
      transition: 'opacity 100ms ease-out, transform 120ms ease-out',
    }}
  >
    <Avatar p={p} size={cfg.avatar} />
    <span
      style={{
        fontSize: cfg.name,
        fontWeight: speaking ? 700 : 600,
        color: 'rgba(255, 255, 255, 0.96)',
        textShadow: '0 1px 2px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.5)',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: 'clamp(160px, 26vw, 240px)', lineHeight: 1.15,
      }}
    >
      {p.displayName}
    </span>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════
// Variant 1 — MODERN CAPSULE (default)
// Horizontal pill: avatar (hafif yukarıda durur hissi) + name/status + waveform.
// Idle'da minimal, speaking'de scale(1.04) + subtle glow.
// ══════════════════════════════════════════════════════════════════════════
interface RowVariantProps {
  p: OverlayParticipant;
  cfg: SizeCfg;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  cardBg: string;
  hasCard: boolean;
  rowOpacity: number;
  statusText: string;
  statusColor: string;
  waveColor: string;
}

const CapsuleRow: React.FC<RowVariantProps> = ({
  p, cfg, speaking, cardBg, hasCard, rowOpacity, statusText, statusColor, waveColor,
}) => {
  const padV = Math.max(3, Math.round(cfg.name * 0.22));
  const padR = Math.max(8, Math.round(cfg.name * 0.85));
  const cardRadius = Math.round(cfg.avatar * 0.42);
  // Status sadece speaking DIŞI ve metin varsa göster (Dinliyor / Duymuyor).
  // Konuşurken status text gizli — waveform yeterli vurgu (kullanıcı kuralı).
  const showStatus = !speaking && !!statusText;
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: cfg.gap,
        background: cardBg,
        borderRadius: cardRadius,
        padding: `${padV}px ${padR}px ${padV}px ${padV}px`,
        opacity: rowOpacity,
        transform: speaking ? 'scale(1.04)' : 'scale(1)',
        transformOrigin: 'left center',
        // Spesifik transition'lar max 120ms — Apple-grade snappy his. "background" animasyonu
        // yok (cardBg'deki alpha değişimi anlık uygulansın, paint spam önlenir).
        transition: 'opacity 100ms ease-out, transform 120ms ease-out',
        // macOS Control Center glass — layered depth shadow + inner highlight.
        boxShadow: hasCard ? GLASS_SHADOW : 'none',
        border: hasCard ? GLASS_BORDER : 'none',
        backdropFilter: hasCard ? GLASS_BACKDROP : undefined,
        WebkitBackdropFilter: hasCard ? GLASS_BACKDROP : undefined,
        willChange: 'transform, opacity',
      } as React.CSSProperties}
    >
      <Avatar p={p} size={cfg.avatar} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
        <span
          style={{
            fontSize: cfg.name,
            fontWeight: speaking ? 700 : 600,
            color: 'rgba(255,255,255,0.96)',
            textShadow: hasCard ? 'none' : '0 1px 2px rgba(0,0,0,0.85)',
            letterSpacing: '-0.01em',
          fontFeatureSettings: '"kern" 1, "liga" 1',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 'clamp(140px, 22vw, 220px)',
          }}
        >
          {p.displayName}
        </span>
        {showStatus && (
          <span
            style={{
              fontSize: cfg.name - 2,
              fontWeight: 600,
              color: statusColor,
              textShadow: hasCard ? 'none' : '0 1px 2px rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              marginTop: 1,
              letterSpacing: '0.01em',
            }}
          >
            {statusText}
          </span>
        )}
      </div>
      <Waveform active={speaking} height={cfg.wave} color={waveColor} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Variant 2 — COMPACT CARD
// Dikey kompakt kart: üst satır avatar + name, alt satır mic icon + waveform.
// Daha bilgi yoğun; hafif drop shadow ile depth.
// ══════════════════════════════════════════════════════════════════════════

const CardRow: React.FC<RowVariantProps> = ({
  p, cfg, speaking, muted, deafened, cardBg, hasCard, rowOpacity, statusText, statusColor, waveColor,
}) => {
  const padX = Math.max(10, Math.round(cfg.name * 1.0));
  const padY = Math.max(8, Math.round(cfg.name * 0.7));
  // Avatar squircle ile aynı oranda kart radius — uyumlu görünüm.
  const cardRadius = Math.round(cfg.avatar * 0.42);
  return (
    <div
      style={{
        display: 'inline-flex', flexDirection: 'column',
        gap: Math.max(5, cfg.gap - 2),
        background: cardBg,
        borderRadius: cardRadius,
        padding: `${padY}px ${padX}px`,
        opacity: rowOpacity,
        transform: speaking ? 'scale(1.03)' : 'scale(1)',
        transformOrigin: 'left center',
        transition: 'opacity 100ms ease-out, transform 120ms ease-out',
        boxShadow: hasCard ? GLASS_SHADOW : 'none',
        border: hasCard ? GLASS_BORDER : 'none',
        backdropFilter: hasCard ? GLASS_BACKDROP : undefined,
        WebkitBackdropFilter: hasCard ? GLASS_BACKDROP : undefined,
        maxWidth: 'clamp(170px, 24vw, 250px)',
        alignItems: 'center', // İçerik (avatar+name ve alt mic-row) yatay ortalı.
        willChange: 'transform, opacity',
      }}
    >
      {/* Üst satır: avatar + name — ortalı blok */}
      <div style={{ display: 'flex', alignItems: 'center', gap: cfg.gap, minWidth: 0, justifyContent: 'center' }}>
        <Avatar p={p} size={cfg.avatar} />
        <span
          style={{
            fontSize: cfg.name,
            fontWeight: speaking ? 700 : 600,
            color: 'rgba(255,255,255,0.96)',
            letterSpacing: '-0.01em',
          fontFeatureSettings: '"kern" 1, "liga" 1',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: hasCard ? 'none' : '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          {p.displayName}
        </span>
      </div>

      {/* Alt satır: durum ikonu + status text + waveform — yatay ortalı.
          Deafened → kulaklık-off ikonu (kırmızı), muted → mic-off (turuncu),
          speaking → mic (yeşil), idle → mic (gri). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: cfg.gap - 2, justifyContent: 'center' }}>
        {deafened ? (
          <HeadphonesOffIcon size={cfg.name + 1} color="#ef4444" />
        ) : (
          <MicIcon
            size={cfg.name + 1}
            color={muted ? '#fb923c' : speaking ? '#7bd389' : 'rgba(220,228,240,0.60)'}
            off={muted}
          />
        )}
        <span
          style={{
            fontSize: cfg.name - 2,
            fontWeight: 600,
            color: statusColor,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            letterSpacing: '0.01em',
          }}
        >
          {statusText || 'Bağlı'}
        </span>
        <Waveform active={speaking} height={cfg.wave} color={waveColor} />
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Variant 3 — FLOATING BADGE
// Idle: sadece küçük avatar (isim gizli). Speaking: isim ve waveform açılır.
// En az dikkat dağıtıcı stil — smooth genişleme animasyonu.
// ══════════════════════════════════════════════════════════════════════════

const BadgeRow: React.FC<RowVariantProps> = ({
  p, cfg, speaking, muted, deafened, cardBg, hasCard, rowOpacity, waveColor,
}) => {
  // Speaking, muted veya deafened iken expand kalsın — kullanıcı kim hangi state fark etsin.
  const expanded = speaking || muted || deafened;
  const avSize = Math.round(cfg.avatar * 0.80);
  const padV = 3;
  const padR = expanded ? Math.max(8, Math.round(cfg.name * 0.7)) : 3;
  // Avatar squircle ile aynı oran — diğer variant'larla tutarlı.
  const cardRadius = Math.round(avSize * 0.42);
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center',
        gap: expanded ? Math.max(6, cfg.gap - 2) : 0,
        background: cardBg,
        borderRadius: cardRadius,
        padding: `${padV}px ${padR}px ${padV}px ${padV}px`,
        opacity: expanded ? rowOpacity : Math.max(0.35, rowOpacity * 0.7),
        transform: speaking ? 'scale(1.04)' : 'scale(1)',
        transformOrigin: 'left center',
        // "all" yerine spesifik — layout-shift'e sebep olan max-width için ayrı süre.
        // Max-width 120ms (Apple-ish snappy), opacity/transform 100ms.
        transition: 'max-width 120ms ease-out, opacity 100ms ease-out, transform 100ms ease-out, padding 120ms ease-out, gap 120ms ease-out',
        boxShadow: hasCard ? GLASS_SHADOW : 'none',
        border: hasCard ? GLASS_BORDER : 'none',
        backdropFilter: hasCard ? GLASS_BACKDROP : undefined,
        WebkitBackdropFilter: hasCard ? GLASS_BACKDROP : undefined,
        maxWidth: expanded ? 'clamp(160px, 26vw, 240px)' : avSize + padV * 2,
        overflow: 'hidden',
        willChange: 'transform, max-width, opacity',
      }}
    >
      <Avatar p={p} size={avSize} />

      {/* İsim + waveform — sadece expanded iken görünür (animate width/opacity) */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: cfg.gap - 2,
          width: expanded ? 'auto' : 0,
          opacity: expanded ? 1 : 0,
          transition: 'opacity 220ms ease-out 40ms',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontSize: cfg.name,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.96)',
            letterSpacing: '-0.01em',
          fontFeatureSettings: '"kern" 1, "liga" 1',
            maxWidth: 'clamp(110px, 18vw, 180px)',
            overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: hasCard ? 'none' : '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          {p.displayName}
        </span>
        <Waveform active={speaking} height={cfg.wave - 2} color={waveColor} />
      </div>
    </div>
  );
};
