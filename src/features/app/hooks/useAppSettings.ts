/**
 * useAppSettings — Tüm kullanıcı ayarlarının localStorage ile persist edilen state yönetimi.
 * Tema CSS efekti dahil. Hiçbir dış state'e bağımlılığı yok (saf settings domain).
 */
import { useState, useEffect } from 'react';
import { AppTheme, ThemeKey, themes, defaultThemeKey, backgroundPresets, defaultBackgroundId } from '../../../themes';
import { getDerivedTokens, applyDerivedTokens } from '../../../lib/adaptiveTheme';
import { type VoiceMode } from '../../../contexts/SettingsCtx';
import { THEME_PACKS, DEFAULT_THEME_PACK_ID, getThemePack, applyThemePack, type ThemePackId } from '../../../lib/themePacks';

function hexToRgb(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : null;
}

export type AppearanceMode = 'themePack' | 'custom';

export function useAppSettings() {
  // ── Appearance Mode (mutual exclusion: themePack ↔ custom) ──
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(() => {
    const saved = localStorage.getItem('appearanceMode');
    return saved === 'custom' ? 'custom' : 'themePack';
  });
  const setAppearanceMode = (m: AppearanceMode) => {
    localStorage.setItem('appearanceMode', m);
    setAppearanceModeState(m);
  };

  // ── Theme Pack (yeni — normal kullanıcı için tek seçim) ──
  const [themePackId, setThemePackIdState] = useState<ThemePackId>(() => {
    const saved = localStorage.getItem('themePack') as ThemePackId | null;
    if (saved && THEME_PACKS.find(p => p.id === saved)) return saved;
    return DEFAULT_THEME_PACK_ID;
  });
  /** Theme pack seçimi → mode otomatik 'themePack'a geçer (mutual exclusion). */
  const setThemePackId = (id: ThemePackId) => {
    localStorage.setItem('themePack', id);
    setThemePackIdState(id);
    setAppearanceMode('themePack');
  };

  // ── Tema (legacy palette) ──
  const [currentTheme, setCurrentThemeState] = useState<AppTheme>(() => {
    const savedKey = localStorage.getItem('themeKey');
    if (savedKey && themes[savedKey as ThemeKey]) return themes[savedKey as ThemeKey];
    return themes[defaultThemeKey];
  });
  /** Legacy palette seçimi → mode 'custom'a geçer. */
  const setCurrentTheme = (t: AppTheme) => {
    setCurrentThemeState(t);
    setAppearanceMode('custom');
  };

  // ── Background preset (legacy) ──
  const [activeBackground, setActiveBackgroundState] = useState(() => {
    const saved = localStorage.getItem('activeBackground');
    if (saved === 'bg-purple-mist') {
      localStorage.setItem('activeBackground', 'bg-slate-mist');
      return 'bg-slate-mist';
    }
    return saved || defaultBackgroundId;
  });
  /** Legacy background seçimi → mode 'custom'a geçer. */
  const setActiveBackground = (id: string) => {
    localStorage.setItem('activeBackground', id);
    setActiveBackgroundState(id);
    setAppearanceMode('custom');
  };

  // ── Apply effect — TEK efekt, mode'a göre dallanır (çakışma yok) ──
  useEffect(() => {
    if (appearanceMode === 'themePack') {
      applyThemePack(getThemePack(themePackId));
      return;
    }
    // Custom mode — legacy palette + background sistemi
    localStorage.setItem('themeKey', currentTheme.key);
    const preset = backgroundPresets.find(b => b.id === activeBackground) || backgroundPresets[1];
    const tokens = getDerivedTokens(currentTheme, preset);
    applyDerivedTokens(tokens);

    const root = document.documentElement;

    // ── SURFACE ISOLATION (Critical) ──
    // Legacy adaptiveTheme background dominant'tan surface tokens türetiyor,
    // bu da kırmızı/turuncu bg seçildiğinde modal/panel/popover'a renk sızmasına
    // neden oluyor. Surface katmanını background'tan tamamen ayır:
    //   body → background (raw, kullanıcı seçimi)
    //   modal/panel/popover/card → nötr glass tone (background'a bağımsız)
    const isLight = !!currentTheme.isLight;
    const surfaceFamily = isLight ? {
      surface: 'rgba(15,23,42,0.04)',
      surfaceHover: 'rgba(15,23,42,0.07)',
      surfaceActive: 'rgba(15,23,42,0.10)',
      border: 'rgba(15,23,42,0.10)',
      popoverBg: 'rgba(255,255,255,0.96)',
      popoverBorder: 'rgba(15,23,42,0.10)',
      popoverText: 'rgba(15,23,42,0.92)',
      popoverTextSec: 'rgba(15,23,42,0.65)',
      popoverShadow: '0 12px 40px rgba(0,0,0,0.18)',
      inputBg: 'rgba(15,23,42,0.04)',
      inputBorder: 'rgba(15,23,42,0.12)',
    } : {
      surface: 'rgba(255,255,255,0.04)',
      surfaceHover: 'rgba(255,255,255,0.07)',
      surfaceActive: 'rgba(255,255,255,0.10)',
      border: 'rgba(255,255,255,0.07)',
      popoverBg: 'rgba(10,14,26,0.96)',
      popoverBorder: 'rgba(255,255,255,0.10)',
      popoverText: 'rgba(232,236,244,0.95)',
      popoverTextSec: 'rgba(232,236,244,0.65)',
      popoverShadow: '0 12px 40px rgba(0,0,0,0.55)',
      inputBg: 'rgba(255,255,255,0.04)',
      inputBorder: 'rgba(255,255,255,0.10)',
    };
    // Kart / panel / surface
    root.style.setProperty('--theme-surface', surfaceFamily.surface);
    root.style.setProperty('--theme-surface-card', surfaceFamily.surface);
    root.style.setProperty('--theme-surface-card-border', surfaceFamily.border);
    root.style.setProperty('--theme-panel', surfaceFamily.surface);
    root.style.setProperty('--theme-panel-hover', surfaceFamily.surfaceHover);
    root.style.setProperty('--theme-panel-active', surfaceFamily.surfaceActive);
    root.style.setProperty('--theme-elevated-panel', surfaceFamily.surface);
    root.style.setProperty('--theme-elevated-panel-hover', surfaceFamily.surfaceHover);
    root.style.setProperty('--theme-bg-elevated', surfaceFamily.surface);
    root.style.setProperty('--theme-border', surfaceFamily.border);
    // Popover (modal, dropdown)
    root.style.setProperty('--popover-bg', surfaceFamily.popoverBg);
    root.style.setProperty('--popover-border', surfaceFamily.popoverBorder);
    root.style.setProperty('--popover-text', surfaceFamily.popoverText);
    root.style.setProperty('--popover-text-secondary', surfaceFamily.popoverTextSec);
    root.style.setProperty('--popover-shadow', surfaceFamily.popoverShadow);
    root.style.setProperty('--theme-popover-bg', surfaceFamily.popoverBg);
    root.style.setProperty('--theme-popover-border', surfaceFamily.popoverBorder);
    // Input
    root.style.setProperty('--theme-input-bg', surfaceFamily.inputBg);
    root.style.setProperty('--theme-input-border', surfaceFamily.inputBorder);
    // glass-tint sabit nötr — surface'lar yine glass-tint kullansa bile background sızmaz
    root.style.setProperty('--glass-tint', isLight ? '15, 23, 42' : '255, 255, 255');

    root.style.setProperty('--theme-accent-secondary', currentTheme.secondary);
    root.style.setProperty('--theme-text-on-primary', currentTheme.textOnPrimary);
    root.style.setProperty('--theme-text-on-accent', currentTheme.textOnAccent);
    root.style.setProperty('--theme-success', currentTheme.success);
    root.style.setProperty('--theme-warning', currentTheme.warning);
    root.style.setProperty('--theme-danger', currentTheme.danger);
    root.style.setProperty('--theme-elevated-panel', currentTheme.elevatedPanel);
    root.style.setProperty('--theme-elevated-panel-hover', currentTheme.elevatedPanelHover);
    root.style.setProperty('--popover-bg', currentTheme.popoverBg);
    root.style.setProperty('--popover-border', currentTheme.popoverBorder);
    root.style.setProperty('--popover-text', currentTheme.popoverText);
    root.style.setProperty('--popover-text-secondary', currentTheme.popoverTextSecondary);
    root.style.setProperty('--popover-shadow', currentTheme.popoverShadow);
    root.style.setProperty('--theme-bg-elevated', currentTheme.backgroundElevated);
    const wRgb = hexToRgb(currentTheme.warning);
    const sRgb = hexToRgb(currentTheme.secondary);
    if (wRgb) root.style.setProperty('--theme-warning-rgb', wRgb);
    if (sRgb) root.style.setProperty('--theme-secondary-rgb', sRgb);
  }, [appearanceMode, themePackId, currentTheme, activeBackground]);

  // ── Audio / Noise ──
  const [isLowDataMode, setIsLowDataModeState] = useState(() => localStorage.getItem('lowDataMode') === 'true');
  const setIsLowDataMode = (v: boolean) => { localStorage.setItem('lowDataMode', String(v)); setIsLowDataModeState(v); };

  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabledState] = useState(() => localStorage.getItem('noiseSuppression') !== 'false');
  const setIsNoiseSuppressionEnabled = (v: boolean) => { localStorage.setItem('noiseSuppression', String(v)); setIsNoiseSuppressionEnabledState(v); };

  // VAD internal threshold — UI yok, default 15.
  const [noiseThreshold, setNoiseThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('noiseThreshold');
    return saved ? parseInt(saved) : 15;
  });
  useEffect(() => { localStorage.setItem('noiseThreshold', noiseThreshold.toString()); }, [noiseThreshold]);

  // RNNoise strength 0..100 — kullanıcı slider'ı.
  // Migration: eski audioProfile preset'leri varsa strength'e map.
  const [noiseSuppressionStrength, setNoiseSuppressionStrengthState] = useState<number>(() => {
    const saved = localStorage.getItem('noiseSuppressionStrength');
    if (saved !== null) {
      const n = parseInt(saved);
      return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50));
    }
    // Backward-compat: eski audioProfile preset'ine göre başlangıç strength
    const oldProfile = localStorage.getItem('audioProfile');
    if (oldProfile === 'natural') return 30;
    if (oldProfile === 'broadcast' || oldProfile === 'noisy') return 90;
    return 50; // ilk kurulum varsayılanı
  });
  const setNoiseSuppressionStrength = (v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    localStorage.setItem('noiseSuppressionStrength', String(clamped));
    setNoiseSuppressionStrengthState(clamped);
  };

  // ── PTT ──
  const [pttKey, setPttKey] = useState(() => localStorage.getItem('pttKey') || 'SPACE');
  useEffect(() => { localStorage.setItem('pttKey', pttKey); }, [pttKey]);
  const [isListeningForKey, setIsListeningForKey] = useState(false);

  const [pttReleaseDelay, setPttReleaseDelayState] = useState<number>(() => {
    const saved = localStorage.getItem('pttReleaseDelay');
    return saved !== null ? parseInt(saved) : 0;
  });
  const setPttReleaseDelay = (v: number) => { localStorage.setItem('pttReleaseDelay', String(v)); setPttReleaseDelayState(v); };

  // ── Voice mode ──
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>(
    () => (localStorage.getItem('voiceMode') as VoiceMode) || 'ptt',
  );
  const setVoiceMode = (v: VoiceMode) => { localStorage.setItem('voiceMode', v); setVoiceModeState(v); };

  // Audio profile preset sistemi kaldırıldı (v2).
  // Eski localStorage key 'audioProfile' varsa dokunmuyoruz — migration sadece
  // strength için yukarıda yapıldı. Kaldırma: `localStorage.removeItem('audioProfile')`.

  // ── Ses bildirimleri ──
  const [soundJoinLeave, setSoundJoinLeaveState] = useState(() => localStorage.getItem('soundJoinLeave') !== 'false');
  const setSoundJoinLeave = (v: boolean) => { localStorage.setItem('soundJoinLeave', String(v)); setSoundJoinLeaveState(v); };
  const [soundJoinLeaveVariant, setSoundJoinLeaveVariantState] = useState<1|2|3>(() => (parseInt(localStorage.getItem('soundJoinLeaveVariant') || '1') || 1) as 1|2|3);
  const setSoundJoinLeaveVariant = (v: 1|2|3) => { localStorage.setItem('soundJoinLeaveVariant', String(v)); setSoundJoinLeaveVariantState(v); };

  const [soundMuteDeafen, setSoundMuteDeafenState] = useState(() => localStorage.getItem('soundMuteDeafen') !== 'false');
  const setSoundMuteDeafen = (v: boolean) => { localStorage.setItem('soundMuteDeafen', String(v)); setSoundMuteDeafenState(v); };
  const [soundMuteDeafenVariant, setSoundMuteDeafenVariantState] = useState<1|2|3>(() => (parseInt(localStorage.getItem('soundMuteDeafenVariant') || '1') || 1) as 1|2|3);
  const setSoundMuteDeafenVariant = (v: 1|2|3) => { localStorage.setItem('soundMuteDeafenVariant', String(v)); setSoundMuteDeafenVariantState(v); };

  const [soundPtt, setSoundPttState] = useState(() => localStorage.getItem('soundPtt') !== 'false');
  const setSoundPtt = (v: boolean) => { localStorage.setItem('soundPtt', String(v)); setSoundPttState(v); };
  const [soundPttVariant, setSoundPttVariantState] = useState<1|2|3>(() => (parseInt(localStorage.getItem('soundPttVariant') || '1') || 1) as 1|2|3);
  const setSoundPttVariant = (v: 1|2|3) => { localStorage.setItem('soundPttVariant', String(v)); setSoundPttVariantState(v); };

  const [soundInvite, setSoundInviteState] = useState(() => localStorage.getItem('soundInvite') !== 'false');
  const setSoundInvite = (v: boolean) => { localStorage.setItem('soundInvite', String(v)); setSoundInviteState(v); };
  const [soundInviteVariant, setSoundInviteVariantState] = useState<1|2>(() => (parseInt(localStorage.getItem('soundInviteVariant') || '1') || 1) as 1|2);
  const setSoundInviteVariant = (v: 1|2) => { localStorage.setItem('soundInviteVariant', String(v)); setSoundInviteVariantState(v); };

  // ── Görsel ──
  const [avatarBorderColor, setAvatarBorderColorState] = useState(() => localStorage.getItem('avatarBorderColor') ?? '');
  const setAvatarBorderColor = (v: string) => {
    localStorage.setItem('avatarBorderColor', v);
    setAvatarBorderColorState(v);
    // Profile DB'ye de kaydet — diğer kullanıcılar görsün
    import('../../../lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) {
          supabase.from('profiles').update({ avatar_border_color: v }).eq('id', session.user.id).then(() => {});
        }
      });
    });
  };

  // ── Auto-leave — ZORUNLU (v4 policy) ──
  // Kullanıcı kaptamaz; yalnızca 5-60 dk aralığında süre seçer. Backward-compat:
  // eski localStorage "false" değeri sessizce true'ya yükseltilir.
  const [autoLeaveEnabled, setAutoLeaveEnabledState] = useState(() => {
    localStorage.setItem('autoLeaveEnabled', 'true');
    return true;
  });
  const setAutoLeaveEnabled = (_v: boolean) => {
    // Hard-lock: disable edilemez.
    localStorage.setItem('autoLeaveEnabled', 'true');
    setAutoLeaveEnabledState(true);
  };
  const [autoLeaveMinutes, setAutoLeaveMinutesState] = useState<number>(() => {
    const saved = localStorage.getItem('autoLeaveMinutes');
    const n = saved ? parseInt(saved) : 10;
    // Range clamp 5-60
    return Math.max(5, Math.min(60, Number.isFinite(n) ? n : 10));
  });
  const setAutoLeaveMinutes = (v: number) => {
    const clamped = Math.max(5, Math.min(60, v));
    localStorage.setItem('autoLeaveMinutes', String(clamped));
    setAutoLeaveMinutesState(clamped);
  };

  // ── Son görülme (sadece localStorage — DB sync App.tsx'te yapılır) ──
  const [showLastSeen, setShowLastSeenState] = useState(() => localStorage.getItem('showLastSeen') !== 'false');
  const setShowLastSeenLocal = (v: boolean) => {
    localStorage.setItem('showLastSeen', String(v));
    setShowLastSeenState(v);
  };

  // ── Otomatik oyun algılama (Electron desktop, default AÇIK) ──
  // Kapalıyken main process polling başlatmaz, presence'a gameActivity gitmez.
  // Default true: ilk açılışta desteklenen oyunlar otomatik algılanır; kullanıcı
  // isterse ayarlardan kapatır (localStorage explicit 'false' set edilirse korunur).
  const [gameActivityEnabled, setGameActivityEnabledState] = useState(() => {
    const v = localStorage.getItem('gameActivityEnabled');
    return v === null ? true : v === 'true';
  });
  const setGameActivityEnabled = (v: boolean) => {
    localStorage.setItem('gameActivityEnabled', String(v));
    setGameActivityEnabledState(v);
  };

  // ── Oyun içi ses overlay (Electron desktop, default AÇIK) ──
  // Default konum: sol kenar üst-orta hizası (left-top-mid).
  // Kullanıcı ilk açılışta hemen görebilsin, overlay sola hizalı üst bölgede.
  const [overlayEnabled, setOverlayEnabledState] = useState(() => {
    const v = localStorage.getItem('overlayEnabled');
    return v === null ? true : v === 'true';
  });
  const setOverlayEnabled = (v: boolean) => {
    localStorage.setItem('overlayEnabled', String(v));
    setOverlayEnabledState(v);
  };
  const VALID_POSITIONS = new Set([
    'top-left', 'top-mid-left', 'top-mid-right', 'top-right',
    'right-top-mid', 'right-bot-mid',
    'bottom-right', 'bottom-mid-right', 'bottom-mid-left', 'bottom-left',
    'left-bot-mid', 'left-top-mid',
  ]);
  const [overlayPosition, setOverlayPositionState] = useState<'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right' | 'right-top-mid' | 'right-bot-mid' | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left' | 'left-bot-mid' | 'left-top-mid'>(() => {
    const v = localStorage.getItem('overlayPosition');
    if (v && VALID_POSITIONS.has(v)) return v as any;
    // Legacy 'top-center' → 'top-mid-left' (eski anchor set'inden migration)
    if (v === 'top-center') return 'top-mid-left';
    return 'left-top-mid'; // yeni default
  });
  const setOverlayPosition = (v: 'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right' | 'right-top-mid' | 'right-bot-mid' | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left' | 'left-bot-mid' | 'left-top-mid') => {
    localStorage.setItem('overlayPosition', v);
    setOverlayPositionState(v);
  };
  const [overlaySize, setOverlaySizeState] = useState<'small' | 'medium' | 'large'>(() => {
    const v = localStorage.getItem('overlaySize');
    return (v === 'small' || v === 'medium' || v === 'large') ? v : 'medium';
  });
  const setOverlaySize = (v: 'small' | 'medium' | 'large') => {
    localStorage.setItem('overlaySize', v);
    setOverlaySizeState(v);
  };
  const [overlayShowOnlySpeaking, setOverlayShowOnlySpeakingState] = useState(() =>
    localStorage.getItem('overlayShowOnlySpeaking') === 'true'
  );
  const setOverlayShowOnlySpeaking = (v: boolean) => {
    localStorage.setItem('overlayShowOnlySpeaking', String(v));
    setOverlayShowOnlySpeakingState(v);
  };
  const [overlayShowSelf, setOverlayShowSelfState] = useState(() =>
    localStorage.getItem('overlayShowSelf') !== 'false'
  );
  const setOverlayShowSelf = (v: boolean) => {
    localStorage.setItem('overlayShowSelf', String(v));
    setOverlayShowSelfState(v);
  };
  const [overlayClickThrough, setOverlayClickThroughState] = useState(() =>
    localStorage.getItem('overlayClickThrough') !== 'false'
  );
  const setOverlayClickThrough = (v: boolean) => {
    localStorage.setItem('overlayClickThrough', String(v));
    setOverlayClickThroughState(v);
  };

  // ── Overlay görünüm stili ──
  // capsule: pill (default), card: info-dense kare, badge: ultra minimal, none: kart yok / sade.
  const [overlayVariant, setOverlayVariantState] = useState<'capsule' | 'card' | 'badge' | 'none'>(() => {
    const v = localStorage.getItem('overlayVariant');
    return (v === 'card' || v === 'badge' || v === 'capsule' || v === 'none') ? v : 'capsule';
  });
  const setOverlayVariant = (v: 'capsule' | 'card' | 'badge' | 'none') => {
    localStorage.setItem('overlayVariant', v);
    setOverlayVariantState(v);
  };

  // ── Overlay kart şeffaflığı ──
  // 0-100 slider. Overlay'deki isim-arkası kartın + avatar+isim görünürlüğünün
  // ortak ayarı. Kart rengi overlay içinde sabit koyu tondur, kullanıcı değiştiremez.
  const [overlayCardOpacity, setOverlayCardOpacityState] = useState<number>(() => {
    const saved = localStorage.getItem('overlayCardOpacity');
    const n = saved ? parseInt(saved) : 50;
    return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50));
  });
  const setOverlayCardOpacity = (v: number) => {
    const c = Math.max(0, Math.min(100, Math.round(v)));
    localStorage.setItem('overlayCardOpacity', String(c));
    setOverlayCardOpacityState(c);
  };

  return {
    appearanceMode, setAppearanceMode,
    themePackId, setThemePackId,
    currentTheme, setCurrentTheme,
    activeBackground, setActiveBackground,
    isLowDataMode, setIsLowDataMode,
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    noiseThreshold, setNoiseThreshold,
    noiseSuppressionStrength, setNoiseSuppressionStrength,
    pttKey, setPttKey,
    isListeningForKey, setIsListeningForKey,
    pttReleaseDelay, setPttReleaseDelay,
    voiceMode, setVoiceMode,
    soundJoinLeave, setSoundJoinLeave,
    soundJoinLeaveVariant, setSoundJoinLeaveVariant,
    soundMuteDeafen, setSoundMuteDeafen,
    soundMuteDeafenVariant, setSoundMuteDeafenVariant,
    soundPtt, setSoundPtt,
    soundPttVariant, setSoundPttVariant,
    soundInvite, setSoundInvite,
    soundInviteVariant, setSoundInviteVariant,
    avatarBorderColor, setAvatarBorderColor,
    autoLeaveEnabled, setAutoLeaveEnabled,
    autoLeaveMinutes, setAutoLeaveMinutes,
    showLastSeen, setShowLastSeenLocal,
    gameActivityEnabled, setGameActivityEnabled,
    overlayEnabled, setOverlayEnabled,
    overlayPosition, setOverlayPosition,
    overlaySize, setOverlaySize,
    overlayShowOnlySpeaking, setOverlayShowOnlySpeaking,
    overlayShowSelf, setOverlayShowSelf,
    overlayClickThrough, setOverlayClickThrough,
    overlayCardOpacity, setOverlayCardOpacity,
    overlayVariant, setOverlayVariant,
  };
}
