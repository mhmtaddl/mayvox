import React, { useEffect, useState } from 'react';
import type { OverlaySnapshot, OverlayParticipant, OverlaySize } from './types';
// Mayvox varsayılan durum avatar fallback'i — ana app ile AYNI mantık
import { hasCustomAvatar, getStatusAvatar } from '../lib/statusAvatar';

// ── Overlay renderer ──────────────────────────────────────────────────────
// Minimal: arka kart YOK. Sadece her satır floating pill (avatar + isim).
// Profil yoksa MayVox status PNG fallback (cevrimdisi.png varsayılan).

declare global {
  interface Window {
    electronOverlay?: {
      onSnapshot: (cb: (snap: OverlaySnapshot) => void) => void;
      removeAll: () => void;
    };
  }
}

const MAX_VISIBLE = 6;

const SIZE_CONFIG: Record<OverlaySize, { avatar: number; name: number; gap: number }> = {
  small:  { avatar: 26, name: 10,   gap: 6 },
  medium: { avatar: 34, name: 11.5, gap: 8 },
  large:  { avatar: 42, name: 13,   gap: 10 },
};

export default function OverlayApp() {
  const [snap, setSnap] = useState<OverlaySnapshot | null>(null);

  useEffect(() => {
    const api = window.electronOverlay;
    if (!api) return;
    api.onSnapshot(setSnap);
    return () => { try { api.removeAll(); } catch {} };
  }, []);

  if (!snap || snap.participants.length === 0) {
    return <div style={{ width: '100%', height: '100%' }} />;
  }

  const visible = snap.participants.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, snap.participants.length - visible.length);
  const size: OverlaySize = snap.size || 'medium';
  const cfg = SIZE_CONFIG[size];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        gap: cfg.gap + 4, // speaking scale (+glow) için komşulara daha fazla pay
        padding: '10px 12px', // speaking scale/glow pencere kenarına yapışmasın
        background: 'transparent', // arka kart YOK — floating hissi
        boxSizing: 'border-box',
        overflow: 'visible', // scale + shadow dış taşıyabilir; pencere bounds'u padding ile absorbe eder
      }}
    >
      {visible.map((p) => (
        <ParticipantRow key={p.id} p={p} cfg={cfg} />
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

const ParticipantRow: React.FC<{ p: OverlayParticipant; cfg: typeof SIZE_CONFIG['medium'] }> = ({ p, cfg }) => {
  const speaking = p.isSpeaking && !p.isMuted;
  // Avatar fallback akışı — ana app AvatarContent pattern'i ile AYNI:
  //   1) hasCustomAvatar → img
  //   2) getStatusAvatar(statusText) → PNG (varsayılan Çevrimdışı)
  //   3) (son çare harf yok — overlay asla initial letter göstermez)
  const useCustom = hasCustomAvatar(p.avatarUrl);
  const statusSrc = useCustom ? null : (getStatusAvatar(p.statusText || 'Çevrimdışı') || getStatusAvatar('Çevrimdışı'));
  const imgSrc = useCustom ? p.avatarUrl! : statusSrc;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: cfg.gap,
        background: 'transparent',
        opacity: speaking ? 1 : 0.62,
        transform: speaking ? 'scale(1.04)' : 'scale(1)',
        transformOrigin: 'left center', // sol-hizalı büyüsün → sağa doğru taşsa bile pencere padding'i absorbe eder
        transition: 'opacity 180ms ease-out, transform 180ms ease-out',
        willChange: 'transform',
      }}
    >
      <div
        style={{
          width: cfg.avatar,
          height: cfg.avatar,
          borderRadius: '22%',
          overflow: 'hidden',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.35)',
          boxShadow: speaking
            ? '0 0 0 2px rgba(120, 200, 255, 0.92), 0 0 12px rgba(120, 200, 255, 0.45), 0 2px 6px rgba(0,0,0,0.55)'
            : '0 0 0 1px rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.5)',
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'rgba(40, 50, 70, 0.85)',
          }} />
        )}
      </div>

      <div
        style={{
          fontSize: cfg.name,
          fontWeight: speaking ? 700 : 600,
          color: speaking ? 'rgba(255, 255, 255, 1)' : 'rgba(228, 235, 245, 0.88)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          // Arka plan yok — text shadow ile her zaman okunur
          textShadow: '0 1px 2px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.5)',
          letterSpacing: '-0.01em',
          maxWidth: 160,
        }}
      >
        {p.displayName}
      </div>
    </div>
  );
};
