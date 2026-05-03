/**
 * useAppSettings — Tüm kullanıcı ayarlarının localStorage ile persist edilen state yönetimi.
 * Tema CSS efekti dahil. Hiçbir dış state'e bağımlılığı yok (saf settings domain).
 */
import { useState, useEffect, useRef } from 'react';
import { type VoiceMode } from '../../../contexts/SettingsCtx';
import {
  THEME_PACKS,
  DEFAULT_THEME_PACK_ID,
  THEME_OVERRIDES_STORAGE_KEY,
  EMPTY_THEME_CUSTOMIZATION_OVERRIDES,
  getThemePack,
  applyThemePack,
  applyThemeOverrides,
  sanitizeThemeCustomizationOverrides,
  type ThemeCustomizationOverrides,
  type ThemePackId,
} from '../../../lib/themePacks';

export function useAppSettings() {
  // ── Theme Pack — single source of truth for appearance ──
  const [themePackId, setThemePackIdState] = useState<ThemePackId>(() => {
    const saved = localStorage.getItem('themePack') as ThemePackId | null;
    if (saved && THEME_PACKS.find(p => p.id === saved)) return saved;
    return DEFAULT_THEME_PACK_ID;
  });
  const setThemePackId = (id: ThemePackId) => {
    if (id === themePackId) return;
    localStorage.setItem('themePack', id);
    setThemePackIdState(id);
  };

  const [customThemeOverrides, setCustomThemeOverridesState] = useState<ThemeCustomizationOverrides>(() => {
    try {
      const saved = localStorage.getItem(THEME_OVERRIDES_STORAGE_KEY);
      return sanitizeThemeCustomizationOverrides(saved ? JSON.parse(saved) : EMPTY_THEME_CUSTOMIZATION_OVERRIDES);
    } catch {
      return EMPTY_THEME_CUSTOMIZATION_OVERRIDES;
    }
  });
  const customThemeOverridesRef = useRef(customThemeOverrides);
  const lastAppliedOverrideKeyRef = useRef('');
  const overrideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overrideFrameRef = useRef<number | null>(null);

  const setCustomThemeOverrides = (value: ThemeCustomizationOverrides) => {
    const sanitized = sanitizeThemeCustomizationOverrides(value);
    const nextKey = JSON.stringify(sanitized);
    if (nextKey === JSON.stringify(customThemeOverridesRef.current)) return;
    customThemeOverridesRef.current = sanitized;
    setCustomThemeOverridesState(sanitized);
  };

  const commitCustomThemeOverrides = (value?: ThemeCustomizationOverrides) => {
    const sanitized = sanitizeThemeCustomizationOverrides(value ?? customThemeOverridesRef.current);
    localStorage.setItem(THEME_OVERRIDES_STORAGE_KEY, JSON.stringify(sanitized));
  };

  const resetCustomThemeOverrides = (tier?: 'pro' | 'elite') => {
    const next = sanitizeThemeCustomizationOverrides(customThemeOverrides);
    if (!tier || tier === 'pro') next.pro = {};
    if (!tier || tier === 'elite') next.elite = {};
    localStorage.setItem(THEME_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
    customThemeOverridesRef.current = next;
    applyThemePack(getThemePack(themePackId));
    applyThemeOverrides(next);
    lastAppliedOverrideKeyRef.current = JSON.stringify(next);
    setCustomThemeOverridesState(next);
  };

  useEffect(() => {
    customThemeOverridesRef.current = customThemeOverrides;
  }, [customThemeOverrides]);

  // ── Apply pack only when the selected pack changes ──
  useEffect(() => {
    localStorage.removeItem('appearanceMode');
    localStorage.removeItem('themeKey');
    localStorage.removeItem('activeBackground');
    applyThemePack(getThemePack(themePackId));
    const overrideKey = JSON.stringify(sanitizeThemeCustomizationOverrides(customThemeOverridesRef.current));
    applyThemeOverrides(customThemeOverridesRef.current);
    lastAppliedOverrideKeyRef.current = overrideKey;
  }, [themePackId]);

  // ── Debounced live preview — color picker drag updates CSS variables, not storage ──
  useEffect(() => {
    const overrideKey = JSON.stringify(sanitizeThemeCustomizationOverrides(customThemeOverrides));
    if (overrideKey === lastAppliedOverrideKeyRef.current) return;

    if (overrideTimerRef.current) clearTimeout(overrideTimerRef.current);
    if (overrideFrameRef.current !== null) cancelAnimationFrame(overrideFrameRef.current);

    overrideTimerRef.current = setTimeout(() => {
      overrideFrameRef.current = requestAnimationFrame(() => {
        const currentKey = JSON.stringify(sanitizeThemeCustomizationOverrides(customThemeOverridesRef.current));
        if (currentKey === lastAppliedOverrideKeyRef.current) return;
        applyThemeOverrides(customThemeOverridesRef.current);
        lastAppliedOverrideKeyRef.current = currentKey;
      });
    }, 125);

    return () => {
      if (overrideTimerRef.current) clearTimeout(overrideTimerRef.current);
      if (overrideFrameRef.current !== null) cancelAnimationFrame(overrideFrameRef.current);
      overrideTimerRef.current = null;
      overrideFrameRef.current = null;
    };
  }, [customThemeOverrides]);

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
  const [pttKey, setPttKeyState] = useState(() => {
    const saved = localStorage.getItem('pttKey');
    const userSelected = localStorage.getItem('pttKeyUserSet') === 'true';
    if (saved === 'SPACE' && !userSelected) {
      localStorage.removeItem('pttKey');
      localStorage.removeItem('pttRawCode');
      return '';
    }
    return saved || '';
  });
  const setPttKey = (v: string) => {
    if (v) {
      localStorage.setItem('pttKeyUserSet', 'true');
      localStorage.setItem('pttKey', v);
    } else {
      localStorage.removeItem('pttKeyUserSet');
      localStorage.removeItem('pttKey');
      localStorage.removeItem('pttRawCode');
    }
    setPttKeyState(v);
  };
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
    import('../../../lib/backendClient')
      .then(({ updateProfileFields }) => updateProfileFields({ avatar_border_color: v }))
      .catch(() => {});
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
    themePackId, setThemePackId,
    customThemeOverrides, setCustomThemeOverrides, commitCustomThemeOverrides, resetCustomThemeOverrides,
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
