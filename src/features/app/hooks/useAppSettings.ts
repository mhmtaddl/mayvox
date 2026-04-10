/**
 * useAppSettings — Tüm kullanıcı ayarlarının localStorage ile persist edilen state yönetimi.
 * Tema CSS efekti dahil. Hiçbir dış state'e bağımlılığı yok (saf settings domain).
 */
import { useState, useEffect } from 'react';
import { AppTheme, ThemeKey, themes, defaultThemeKey, backgroundPresets, defaultBackgroundId } from '../../../themes';
import { getDerivedTokens, applyDerivedTokens } from '../../../lib/adaptiveTheme';
import { AUDIO_PRESETS, type AudioProfile, type VoiceMode } from '../../../contexts/SettingsCtx';

export function useAppSettings() {
  // ── Tema ──
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
    const savedKey = localStorage.getItem('themeKey');
    if (savedKey && themes[savedKey as ThemeKey]) return themes[savedKey as ThemeKey];
    return themes[defaultThemeKey];
  });

  // ── Background preset ──
  const [activeBackground, setActiveBackgroundState] = useState(() => localStorage.getItem('activeBackground') || defaultBackgroundId);
  const setActiveBackground = (id: string) => { localStorage.setItem('activeBackground', id); setActiveBackgroundState(id); };

  // ── Adaptive theme — single effect for theme + background ──
  useEffect(() => {
    localStorage.setItem('themeKey', currentTheme.key);
    const preset = backgroundPresets.find(b => b.id === activeBackground) || backgroundPresets[1];
    const tokens = getDerivedTokens(currentTheme, preset);
    applyDerivedTokens(tokens);

    const root = document.documentElement;
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
  }, [currentTheme, activeBackground]);

  // ── Audio / Noise ──
  const [isLowDataMode, setIsLowDataModeState] = useState(() => localStorage.getItem('lowDataMode') === 'true');
  const setIsLowDataMode = (v: boolean) => { localStorage.setItem('lowDataMode', String(v)); setIsLowDataModeState(v); };

  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabledState] = useState(() => localStorage.getItem('noiseSuppression') !== 'false');
  const setIsNoiseSuppressionEnabled = (v: boolean) => { localStorage.setItem('noiseSuppression', String(v)); setIsNoiseSuppressionEnabledState(v); };

  const [noiseThreshold, setNoiseThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('noiseThreshold');
    return saved ? parseInt(saved) : 15;
  });
  useEffect(() => { localStorage.setItem('noiseThreshold', noiseThreshold.toString()); }, [noiseThreshold]);

  // ── PTT ──
  const [pttKey, setPttKey] = useState(() => localStorage.getItem('pttKey') || 'SPACE');
  useEffect(() => { localStorage.setItem('pttKey', pttKey); }, [pttKey]);
  const [isListeningForKey, setIsListeningForKey] = useState(false);

  const [pttReleaseDelay, setPttReleaseDelayState] = useState<number>(() => {
    const saved = localStorage.getItem('pttReleaseDelay');
    return saved !== null ? parseInt(saved) : 250;
  });
  const setPttReleaseDelay = (v: number) => { localStorage.setItem('pttReleaseDelay', String(v)); setPttReleaseDelayState(v); };

  // ── Voice mode ──
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>(
    () => (localStorage.getItem('voiceMode') as VoiceMode) || 'ptt',
  );
  const setVoiceMode = (v: VoiceMode) => { localStorage.setItem('voiceMode', v); setVoiceModeState(v); };

  // ── Audio profile ──
  const [audioProfile, setAudioProfileState] = useState<AudioProfile>(
    () => (localStorage.getItem('audioProfile') as AudioProfile) || 'clean',
  );
  const setAudioProfile = (profile: AudioProfile) => {
    localStorage.setItem('audioProfile', profile);
    setAudioProfileState(profile);
    if (profile !== 'custom') {
      const p = AUDIO_PRESETS[profile];
      setIsNoiseSuppressionEnabled(p.noiseSuppression);
      setNoiseThreshold(p.noiseThreshold);
      setPttReleaseDelay(p.pttReleaseDelay);
    }
  };

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
  const [avatarBorderColor, setAvatarBorderColorState] = useState(() => localStorage.getItem('avatarBorderColor') || '#3B82F6');
  const setAvatarBorderColor = (v: string) => { localStorage.setItem('avatarBorderColor', v); setAvatarBorderColorState(v); };

  // ── Auto-leave ──
  const [autoLeaveEnabled, setAutoLeaveEnabledState] = useState(() => localStorage.getItem('autoLeaveEnabled') === 'true');
  const setAutoLeaveEnabled = (v: boolean) => { localStorage.setItem('autoLeaveEnabled', String(v)); setAutoLeaveEnabledState(v); };
  const [autoLeaveMinutes, setAutoLeaveMinutesState] = useState<number>(() => {
    const saved = localStorage.getItem('autoLeaveMinutes');
    return saved ? parseInt(saved) : 10;
  });
  const setAutoLeaveMinutes = (v: number) => { localStorage.setItem('autoLeaveMinutes', String(v)); setAutoLeaveMinutesState(v); };

  // ── Son görülme (sadece localStorage — DB sync App.tsx'te yapılır) ──
  const [showLastSeen, setShowLastSeenState] = useState(() => localStorage.getItem('showLastSeen') !== 'false');
  const setShowLastSeenLocal = (v: boolean) => {
    localStorage.setItem('showLastSeen', String(v));
    setShowLastSeenState(v);
  };

  return {
    currentTheme, setCurrentTheme,
    activeBackground, setActiveBackground,
    isLowDataMode, setIsLowDataMode,
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    noiseThreshold, setNoiseThreshold,
    pttKey, setPttKey,
    isListeningForKey, setIsListeningForKey,
    pttReleaseDelay, setPttReleaseDelay,
    voiceMode, setVoiceMode,
    audioProfile, setAudioProfile,
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
  };
}
