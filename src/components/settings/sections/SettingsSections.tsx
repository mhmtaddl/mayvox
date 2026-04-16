import React, { useState, useEffect, useRef } from 'react';
import { Check, Recycle, Volume2, Zap, Mic, AudioLines, Eye, Sparkles, ChevronDown } from 'lucide-react';
import { CardSection, Toggle, cardCls } from '../shared';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useUser } from '../../../contexts/UserContext';
import { useUI } from '../../../contexts/UIContext';
import { previewSound, previewInviteRingtone, type SoundVariant } from '../../../lib/sounds';
import { themes, themeOrder, backgroundPresets } from '../../../themes';
import { THEME_PACKS, getThemePack } from '../../../lib/themePacks';
import { isMobile } from '../../../lib/platform';

// ── Görünüm ──
export function AppearanceSection() {
  const { appearanceMode, themePackId, setThemePackId, currentTheme, setCurrentTheme, activeBackground, setActiveBackground } = useSettings();
  const { currentUser } = useUser();
  const isAdvanced = !!(currentUser.isAdmin || currentUser.isPrimaryAdmin || currentUser.isModerator);
  const [advancedOpen, setAdvancedOpen] = useState(appearanceMode === 'custom');
  const activePack = getThemePack(themePackId);
  const isThemePackMode = appearanceMode === 'themePack';
  const isCustomMode = appearanceMode === 'custom';

  return (
    <CardSection icon={<Recycle size={12} />} title="">

      {/* ═══ THEME PACKS ═══ */}
      <div className="mb-1">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.14em]">Tema Paketleri</p>
          {isThemePackMode ? (
            <span className="text-[10px] font-medium text-[var(--theme-accent)] opacity-70 shrink-0">{activePack.name}</span>
          ) : (
            <span className="text-[10px] font-medium text-[var(--theme-secondary-text)]/55 shrink-0">Özel mod aktif</span>
          )}
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${isCustomMode ? 'opacity-55' : ''}`}>
          {THEME_PACKS.map(pack => {
            // Mutual exclusion — sadece themePack modundayken seçili görünür
            const isSelected = isThemePackMode && themePackId === pack.id;
            return (
              <button
                key={pack.id}
                onClick={() => setThemePackId(pack.id)}
                className="group relative flex flex-col gap-2 p-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: isSelected
                    ? '2px solid var(--accent, #6366F1)'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--accent, #6366F1), 0 4px 16px rgba(0,0,0,0.25)'
                    : '0 1px 4px rgba(0,0,0,0.18)',
                }}
              >
                {/* Preview gradient */}
                <div
                  className="relative w-full h-9 rounded-lg overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${pack.previewFrom} 0%, ${pack.previewTo} 100%)` }}
                >
                  <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 30%, rgba(255,255,255,0.06), transparent 60%)` }} />
                  <div className="absolute bottom-1 right-1.5 flex gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: pack.accent, boxShadow: `0 0 6px ${pack.accent}66` }} />
                    <span className="w-2 h-2 rounded-full" style={{ background: pack.success, opacity: 0.7 }} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className={`text-[10.5px] font-semibold truncate ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary,rgba(255,255,255,0.78))]'}`}>{pack.name}</span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: pack.accentSoft }}>
                      <Check size={9} style={{ color: pack.accent }} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ ADVANCED CUSTOMIZATION (admin/mod only) ═══ */}
      {isAdvanced && (
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.06)' }}>
          <button
            onClick={() => setAdvancedOpen(v => !v)}
            className="w-full flex items-center justify-between text-left mb-2"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={11} className="text-[var(--theme-accent)]/70" />
              <span className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.14em]">Gelişmiş Özelleştirme</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--theme-accent)]/70 px-1.5 py-0.5 rounded bg-[var(--theme-accent)]/10">admin</span>
            </div>
            <ChevronDown size={13} className={`text-[var(--theme-secondary-text)]/60 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {advancedOpen && (
            <div className="space-y-5">
              {/* Mod uyarısı — themePack modundayken custom selections highlight YOK */}
              <div className={`text-[10.5px] px-3 py-2 rounded-lg ${isCustomMode
                ? 'bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/25 text-[var(--theme-accent)]'
                : 'bg-[rgba(var(--glass-tint),0.04)] border border-[rgba(var(--glass-tint),0.08)] text-[var(--theme-secondary-text)]/75'}`}>
                {isCustomMode
                  ? 'Özel mod aktif — yukarıdaki tema paketleri devre dışı.'
                  : 'Tema paketi aktif — özel ayarlar pasif. Aşağıdan herhangi birine tıklayarak özel moda geç.'}
              </div>

              {/* Renk Paletleri (legacy) */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-[10px] font-bold text-[var(--theme-secondary-text)]/75 uppercase tracking-[0.14em]">Renk Paleti</p>
                  {isCustomMode && (
                    <span className="text-[10px] font-medium text-[var(--theme-accent)] opacity-60 shrink-0">{currentTheme.name}</span>
                  )}
                </div>
                <div className={`grid grid-cols-3 gap-2 ${isThemePackMode ? 'opacity-55' : ''}`}>
                  {themeOrder.map(key => {
                    const theme = themes[key];
                    // Mutual exclusion — sadece custom modundayken seçili görünür
                    const isSelected = isCustomMode && currentTheme.key === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setCurrentTheme(theme)}
                        className="flex flex-col gap-1.5 p-2 rounded-lg text-left transition-all duration-150"
                        style={{
                          background: 'var(--theme-surface-card)',
                          border: isSelected ? '2px solid var(--theme-accent)' : '1px solid rgba(var(--glass-tint), 0.06)',
                          boxShadow: isSelected ? '0 0 0 1px var(--theme-accent), 0 0 8px rgba(var(--theme-accent-rgb), 0.12)' : '0 1px 4px rgba(0,0,0,0.15)',
                        }}
                      >
                        <div className="relative w-full h-6 rounded overflow-hidden" style={{ background: theme.background }}>
                          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.1)' }} />
                          <div className="absolute bottom-0.5 right-1 flex gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.7 }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between min-w-0">
                          <span className="text-[9px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.78)' }}>{theme.name}</span>
                          {isSelected && <Check size={8} className="shrink-0" style={{ color: theme.primary }} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Arka Plan (legacy) */}
              <div>
                <p className="text-[10px] font-bold text-[var(--theme-secondary-text)]/75 uppercase tracking-[0.14em] mb-2">Arka Plan</p>
                <div className={`grid grid-cols-8 gap-2 ${isThemePackMode ? 'opacity-55' : ''}`}>
                  {backgroundPresets.map(bg => {
                    // Mutual exclusion — sadece custom modundayken seçili görünür
                    const isActive = isCustomMode && activeBackground === bg.id;
                    return (
                      <button
                        key={bg.id}
                        onClick={() => setActiveBackground(bg.id)}
                        title={bg.name}
                        className="relative overflow-hidden transition-all duration-150 aspect-square rounded-lg"
                        style={{
                          background: bg.surface,
                          border: isActive ? '2px solid var(--theme-accent)' : '1px solid rgba(var(--glass-tint), 0.08)',
                          boxShadow: isActive ? '0 0 0 1px var(--theme-accent), 0 0 8px rgba(var(--theme-accent-rgb), 0.15)' : '0 1px 4px rgba(0,0,0,0.18)',
                        }}
                      >
                        {isActive && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Check size={12} style={{ color: '#fff' }} strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </CardSection>
  );
}

// ── Sesler ──
export function SoundsSection() {
  const {
    soundJoinLeave, setSoundJoinLeave,
    soundJoinLeaveVariant, setSoundJoinLeaveVariant,
    soundMuteDeafen, setSoundMuteDeafen,
    soundMuteDeafenVariant, setSoundMuteDeafenVariant,
    soundPtt, setSoundPtt,
    soundPttVariant, setSoundPttVariant,
    soundInvite, setSoundInvite,
    soundInviteVariant, setSoundInviteVariant,
  } = useSettings();

  const soundRows = [
    { label: 'Giriş / Çıkış', tooltip: 'Odaya giriş/çıkışta ses çalar', category: 'JoinLeave' as const, variant: soundJoinLeaveVariant, setVariant: setSoundJoinLeaveVariant, enabled: soundJoinLeave, setEnabled: setSoundJoinLeave, variants: ['Ses A', 'Ses B'] },
    { label: 'Mikrofon / Hoparlör', tooltip: 'Mikrofon veya hoparlör kapandığında', category: 'MuteDeafen' as const, variant: soundMuteDeafenVariant, setVariant: setSoundMuteDeafenVariant, enabled: soundMuteDeafen, setEnabled: setSoundMuteDeafen, variants: ['Ses A', 'Ses B'] },
    { label: 'Bas-Konuş', tooltip: 'Bas-konuş tuşuna basıldığında', category: 'Ptt' as const, variant: soundPttVariant, setVariant: setSoundPttVariant, enabled: soundPtt, setEnabled: setSoundPtt, variants: ['Ses A', 'Ses B'] },
  ];

  return (
    <CardSection icon={<Volume2 size={12} />} title="">
      <p className="text-[10px] text-[var(--theme-secondary-text)]/55 mb-3">Bildirim ve UI sesleri</p>
      <div className="divide-y divide-[var(--theme-border)]/50">
        {soundRows.map(({ label, tooltip, category, variant, setVariant, enabled, setEnabled, variants }) => (
          <div key={category} className="flex flex-col xl:flex-row xl:items-center gap-1.5 xl:gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">{label}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              {(variants.map((_, i) => (i + 1) as SoundVariant)).map((v, i) => (
                <button
                  key={v}
                  disabled={!enabled}
                  onClick={() => { setVariant(v); previewSound(category, v); }}
                  className={`w-[44px] md:w-[48px] py-1 rounded-full text-[9px] md:text-[10px] font-semibold border text-center transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
                    variant === v && enabled
                      ? 'bg-[var(--theme-accent)] text-[var(--theme-btn-primary-text)] border-[var(--theme-accent)] shadow-sm'
                      : 'bg-transparent text-[var(--theme-secondary-text)] border-[var(--theme-border)] hover:border-[var(--theme-accent)]/60 hover:text-[var(--theme-accent)]'
                  }`}
                >
                  {variants[i]}
                </button>
              ))}
              <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} tooltip={tooltip} />
            </div>
          </div>
        ))}

        {/* Davet Çağrısı */}
        <div className="flex flex-col xl:flex-row xl:items-center gap-1.5 xl:gap-3 py-3 last:pb-0">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Davet Çağrısı</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            {([1, 2] as const).map(v => (
              <button
                key={v}
                disabled={!soundInvite}
                onClick={() => { setSoundInviteVariant(v); previewInviteRingtone(v); }}
                className={`w-[44px] md:w-[48px] py-1 rounded-full text-[9px] md:text-[10px] font-semibold border text-center transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
                  soundInviteVariant === v && soundInvite
                    ? 'bg-[var(--theme-accent)] text-[var(--theme-btn-primary-text)] border-[var(--theme-accent)] shadow-sm'
                    : 'bg-transparent text-[var(--theme-secondary-text)] border-[var(--theme-border)] hover:border-[var(--theme-accent)]/60 hover:text-[var(--theme-accent)]'
                }`}
              >
                {v === 1 ? 'Klasik' : 'Yumuşak'}
              </button>
            ))}
            <Toggle checked={soundInvite} onChange={() => setSoundInvite(!soundInvite)} tooltip="Oda davetinde çalacak zil sesi" />
          </div>
        </div>
      </div>
    </CardSection>
  );
}

// ── Ses Profili (kaldırıldı — preset sistemi bitti) ──
// Backward-compat: SettingsView'deki <AudioProfileSection /> kullanımını
// kırmamak için null döndüren boş component export edildi.
export function AudioProfileSection() {
  return null;
}

// ── Performans & Ses Motoru (VoiceChannel merged here) ──
const IDLE_MINUTES_OPTIONS = [5, 10, 15, 30, 60] as const;

export function PerformanceSection() {
  const {
    isLowDataMode, setIsLowDataMode,
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    noiseSuppressionStrength, setNoiseSuppressionStrength,
    pttReleaseDelay, setPttReleaseDelay,
    autoLeaveEnabled, setAutoLeaveEnabled,
    autoLeaveMinutes, setAutoLeaveMinutes,
  } = useSettings();

  const [micAverage, setMicAverage] = useState(0);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterAnimRef = useRef<number | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isNoiseSuppressionEnabled) {
      setMicAverage(0);
      return;
    }
    let stopped = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        meterStreamRef.current = stream;
        const ctx = new AudioContext();
        meterCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (stopped) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicAverage(avg);
          meterAnimRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* mikrofon izni yok */ }
    };
    start();
    return () => {
      stopped = true;
      if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
      meterStreamRef.current?.getTracks().forEach(t => t.stop());
      meterCtxRef.current?.close();
      setMicAverage(0);
    };
  }, [isNoiseSuppressionEnabled]);

  return (
    <CardSection icon={<Zap size={12} />} title="">
      <div className="space-y-3 md:space-y-0 md:divide-y md:divide-[var(--theme-border)]/50">

        {/* Düşük Veri Modu */}
        <div className="flex items-center gap-3 md:pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Düşük Veri Modu</p>
          </div>
          <Toggle checked={isLowDataMode} onChange={() => setIsLowDataMode(!isLowDataMode)} tooltip="Görsel güncellemeleri kısıtlar, ses kalitesine dokunmaz" />
        </div>

        {/* Gürültü Susturma */}
        <div className="flex items-center gap-3 md:py-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Gürültü Susturma</p>
          </div>
          <Toggle checked={isNoiseSuppressionEnabled} onChange={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)} tooltip="Arka plan gürültüsünü filtreler" />
        </div>

        {/* Boşta Ayrılma — zorunlu, sadece süre seçilir (5-60 dk) */}
        <div className="md:py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Boşta Ayrılma</p>
              <p className="text-[9px] text-[var(--theme-secondary-text)]/50 mt-0.5">Kaynak yönetimi için zorunlu. 5–60 dakika arası seç.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {IDLE_MINUTES_OPTIONS.map(m => (
              <button
                key={m}
                onClick={() => { setAutoLeaveMinutes(m); if (!autoLeaveEnabled) setAutoLeaveEnabled(true); }}
                className={`flex-1 min-w-[40px] py-1.5 rounded-lg text-[10px] font-bold transition-all border active:scale-95 ${
                  autoLeaveMinutes === m
                    ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border-[var(--theme-accent)]/30'
                    : 'bg-transparent text-[var(--theme-secondary-text)]/50 border-[var(--theme-border)] hover:text-[var(--theme-secondary-text)]'
                }`}
              >
                {m} dk
              </button>
            ))}
          </div>
        </div>

        {/* Gürültü Temizleme Gücü — RNNoise strength 0-100 */}
        <div className={`md:py-3 transition-opacity ${isNoiseSuppressionEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between mb-2">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Gürültü Temizleme Gücü</p>
            <span className="text-[11px] font-bold text-[var(--theme-accent)] tabular-nums">%{noiseSuppressionStrength}</span>
          </div>
          <input
            type="range" min={0} max={100} value={noiseSuppressionStrength}
            onChange={e => setNoiseSuppressionStrength(Number(e.target.value))}
            disabled={!isNoiseSuppressionEnabled}
            className="w-full accent-[var(--theme-accent)]"
          />
          <div className="flex justify-between text-[9px] md:text-[10px] text-[var(--theme-secondary-text)] mt-0.5">
            <span>Hafif</span><span>Agresif</span>
          </div>
        </div>

        {/* PTT Bırakma Gecikmesi */}
        <div className="md:pt-3">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between mb-2">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">PTT Bırakma Gecikmesi</p>
            <span className="text-[11px] font-bold text-[var(--theme-accent)] tabular-nums">
              {pttReleaseDelay === 0 ? 'Kapalı' : `${pttReleaseDelay} ms`}
            </span>
          </div>
          <input type="range" min={0} max={500} step={50} value={pttReleaseDelay} onChange={e => setPttReleaseDelay(Number(e.target.value))} className="w-full accent-[var(--theme-accent)]" />
          <div className="flex justify-between text-[9px] md:text-[10px] text-[var(--theme-secondary-text)] mt-0.5">
            <span>Kapalı</span><span>500 ms</span>
          </div>
        </div>

      </div>
    </CardSection>
  );
}

// ── Mikrofon Modu (sadece mobil) ──
export function VoiceModeSection() {
  if (!isMobile()) return null;
  const { voiceMode, setVoiceMode } = useSettings();

  const modes = [
    { id: 'ptt' as const, icon: <Mic size={18} />, label: 'Bas-Konuş', desc: 'Butona basılı tutarak konuş.' },
    { id: 'vad' as const, icon: <AudioLines size={18} />, label: 'Ses Algılama', desc: 'Konuşmayı otomatik algılar.' },
  ];

  return (
    <CardSection icon={<Mic size={12} />} title="Mikrofon Modu">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2.5">
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => setVoiceMode(m.id)}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center ${
              voiceMode === m.id
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/8'
                : 'border-[var(--theme-border)] bg-transparent hover:border-[var(--theme-border)]/80'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              voiceMode === m.id ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]' : 'bg-[var(--theme-border)]/50 text-[var(--theme-secondary-text)]'
            }`}>
              {m.icon}
            </div>
            <span className={`text-[12px] font-bold ${voiceMode === m.id ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>
              {m.label}
            </span>
            <span className="text-[9px] text-[var(--theme-secondary-text)] leading-snug">{m.desc}</span>
            {voiceMode === m.id && (
              <div className="w-4 h-4 rounded-full bg-[var(--theme-accent)] flex items-center justify-center">
                <Check size={10} className="text-[var(--theme-btn-primary-text)]" strokeWidth={3} />
              </div>
            )}
          </button>
        ))}
      </div>
    </CardSection>
  );
}

// ── VoiceChannelSection no longer needed (merged into PerformanceSection) ──
export function VoiceChannelSection() {
  return null;
}
