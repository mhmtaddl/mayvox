import React, { useState, useEffect, useRef } from 'react';
import { Check, Recycle, Volume2, Zap, Headphones, Mic, AudioLines } from 'lucide-react';
import { AccordionSection, Toggle, cardCls } from '../shared';
import { useSettings, AUDIO_PROFILE_META } from '../../../contexts/SettingsCtx';
import { useUI } from '../../../contexts/UIContext';
import { previewSound, previewInviteRingtone, type SoundVariant } from '../../../lib/sounds';
import { THEMES } from '../../../constants';
import { isMobile } from '../../../lib/platform';

// ── Görünüm ──
export function AppearanceSection() {
  const { currentTheme, setCurrentTheme, adminBorderEffect, setAdminBorderEffect } = useSettings();

  return (
    <AccordionSection icon={<Recycle size={12} />} title="Görünüm">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {THEMES.map(theme => (
          <button
            key={theme.id}
            onClick={() => setCurrentTheme(theme)}
            className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-200 text-left ${
              currentTheme.id === theme.id
                ? 'border-[var(--theme-accent)]/30 bg-[var(--theme-accent)]/8 ring-1 ring-[var(--theme-accent)]/15 shadow-[0_0_0_3px_rgba(var(--theme-accent-rgb),0.06)]'
                : 'border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--theme-sidebar-rgb),0.3)] hover:border-[rgba(var(--glass-tint),0.1)] hover:bg-[rgba(var(--theme-sidebar-rgb),0.5)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--theme-text)]">{theme.name}</span>
              {currentTheme.id === theme.id
                ? <div className="w-5 h-5 rounded-full bg-[var(--theme-accent)]/20 border border-[var(--theme-accent)]/40 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.3)]"><Check size={10} className="text-[var(--theme-accent)]" /></div>
                : <div className="w-5 h-5 rounded-full border border-[rgba(var(--glass-tint),0.1)] shrink-0" />
              }
            </div>
            <div className="flex rounded-lg overflow-hidden h-6 border border-[rgba(var(--glass-tint),0.06)]">
              <div className="flex-1" style={{ backgroundColor: theme.bg }} />
              <div className="w-6 border-l border-[rgba(var(--glass-tint),0.06)]" style={{ backgroundColor: theme.sidebar }} />
              <div className="w-6 border-l border-[rgba(var(--glass-tint),0.06)]" style={{ backgroundColor: theme.accent }} />
            </div>
          </button>
        ))}
      </div>

      {/* Admin border effect */}
      <div className={`${cardCls} mt-4`}>
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--theme-text)]">Yönetici Çerçeve Efekti</p>
            <p className="text-xs text-[var(--theme-secondary-text)]/60 mt-0.5">Yönetici avatarlarında hafif parıltı göster.</p>
          </div>
          <Toggle checked={adminBorderEffect} onChange={() => setAdminBorderEffect(!adminBorderEffect)} />
        </div>
      </div>
    </AccordionSection>
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

  return (
    <AccordionSection icon={<Volume2 size={12} />} title="Sesler">
      <div className={`${cardCls} divide-y divide-[var(--theme-border)]`}>
        {([
          { label: 'Giriş / Çıkış', desc: 'Birisi odaya girip ayrıldığında.', category: 'JoinLeave' as const, variant: soundJoinLeaveVariant, setVariant: setSoundJoinLeaveVariant, enabled: soundJoinLeave, setEnabled: setSoundJoinLeave },
          { label: 'Mikrofon / Hoparlör', desc: 'Mikrofon veya hoparlör açılıp kapandığında.', category: 'MuteDeafen' as const, variant: soundMuteDeafenVariant, setVariant: setSoundMuteDeafenVariant, enabled: soundMuteDeafen, setEnabled: setSoundMuteDeafen },
          { label: 'Bas-Konuş', desc: 'Bas-Konuş tuşuna basılıp bırakıldığında.', category: 'Ptt' as const, variant: soundPttVariant, setVariant: setSoundPttVariant, enabled: soundPtt, setEnabled: setSoundPtt },
        ] as const).map(({ label, desc, category, variant, setVariant, enabled, setEnabled }) => (
          <div key={category} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-6 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--theme-text)]">{label}</p>
              <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">{desc}</p>
            </div>
            <div className="flex items-center gap-2">
              {([1, 2] as SoundVariant[]).map(v => (
                <button
                  key={v}
                  disabled={!enabled}
                  onClick={() => { setVariant(v); previewSound(category, v); }}
                  className={`w-[52px] py-1 rounded-full text-xs font-semibold border text-center transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                    variant === v && enabled
                      ? 'bg-[var(--theme-accent)] text-white border-[var(--theme-accent)] shadow-sm'
                      : 'bg-transparent text-[var(--theme-secondary-text)] border-[var(--theme-border)] hover:border-[var(--theme-accent)]/60 hover:text-[var(--theme-accent)]'
                  }`}
                >
                  {v === 1 ? 'Ses A' : 'Ses B'}
                </button>
              ))}
            </div>
            <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} />
          </div>
        ))}

        {/* Davet Çağrısı */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-6 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--theme-text)]">Davet Çağrısı</p>
            <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Birisi sizi odaya davet ettiğinde çalan zil sesi.</p>
          </div>
          <div className="flex items-center gap-2">
            {([1, 2] as const).map(v => (
              <button
                key={v}
                disabled={!soundInvite}
                onClick={() => { setSoundInviteVariant(v); previewInviteRingtone(v); }}
                className={`w-[52px] py-1 rounded-full text-xs font-semibold border text-center transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                  soundInviteVariant === v && soundInvite
                    ? 'bg-[var(--theme-accent)] text-white border-[var(--theme-accent)] shadow-sm'
                    : 'bg-transparent text-[var(--theme-secondary-text)] border-[var(--theme-border)] hover:border-[var(--theme-accent)]/60 hover:text-[var(--theme-accent)]'
                }`}
              >
                {v === 1 ? 'Klasik' : 'Yumuşak'}
              </button>
            ))}
          </div>
          <Toggle checked={soundInvite} onChange={() => setSoundInvite(!soundInvite)} />
        </div>
      </div>
    </AccordionSection>
  );
}

// ── Ses Profili ──
export function AudioProfileSection() {
  const { audioProfile, setAudioProfile } = useSettings();
  const { setToastMsg } = useUI();

  return (
    <AccordionSection icon={<Volume2 size={12} />} title="Ses Profili">
      <div className="grid grid-cols-2 gap-3">
        {AUDIO_PROFILE_META.map(profile => {
          const isActive = audioProfile === profile.id;
          return (
            <button
              type="button"
              key={profile.id}
              onClick={() => {
                setAudioProfile(profile.id);
                setToastMsg(`${profile.icon} ${profile.label} aktif`);
                setTimeout(() => setToastMsg(null), 2500);
              }}
              className={`flex flex-col gap-2 p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                isActive
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 shadow-sm shadow-[var(--theme-accent)]/20'
                  : 'border-[var(--theme-border)] bg-[var(--theme-sidebar)]/30 hover:border-[var(--theme-accent)]/40 hover:bg-[var(--theme-sidebar)]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">{profile.icon}</span>
                {isActive && (
                  <div className="w-4 h-4 rounded-full bg-[var(--theme-accent)] flex items-center justify-center shrink-0">
                    <Check size={9} className="text-white" />
                  </div>
                )}
              </div>
              <p className={`text-sm font-bold leading-tight ${isActive ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>
                {profile.label}
              </p>
              <p className="text-[10px] text-[var(--theme-secondary-text)]/80 leading-snug">
                {profile.desc}
              </p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {profile.tags.map(tag => (
                  <span
                    key={tag}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border leading-none ${
                      isActive
                        ? 'border-[var(--theme-accent)]/30 text-[var(--theme-accent)] bg-[var(--theme-accent)]/10'
                        : 'border-[var(--theme-border)] text-[var(--theme-secondary-text)] bg-[var(--theme-bg)]/50'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      {audioProfile === 'custom' && (
        <div className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-sidebar)]/20">
          <div className="w-7 h-7 rounded-lg bg-[var(--theme-border)]/40 flex items-center justify-center shrink-0 text-sm">⚙️</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--theme-text)]">Özel Ayarlar</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/70 mt-0.5">Manuel ayar değişikliği yapıldı.</p>
          </div>
        </div>
      )}
    </AccordionSection>
  );
}

// ── Performans ve Veri ──
export function PerformanceSection() {
  const {
    isLowDataMode, setIsLowDataMode,
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    noiseThreshold, setNoiseThreshold,
    pttReleaseDelay, setPttReleaseDelay,
    setAudioProfile,
  } = useSettings();

  // Gürültü eşiği canlı meter
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
      } catch { /* mikrofon izni yok, sessizce geç */ }
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
    <AccordionSection icon={<Zap size={12} />} title="Performans ve Veri">
      <div className={`${cardCls} divide-y divide-[var(--theme-border)]`}>

        {/* Düşük Veri Modu */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--theme-text)]">Düşük Veri Kullanım Modu</p>
            <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Görsel güncellemeleri kısıtlar, ses kalitesini korur.</p>
          </div>
          <Toggle checked={isLowDataMode} onChange={() => setIsLowDataMode(!isLowDataMode)} />
        </div>

        {/* Gürültü Susturma toggle */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--theme-text)]">Gürültü Susturma</p>
            <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Arka plan sesini filtreler, konuşmayı netleştirir.</p>
          </div>
          <Toggle checked={isNoiseSuppressionEnabled} onChange={() => { setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled); setAudioProfile('custom'); }} />
        </div>

        {/* Gürültü Eşiği — sadece aktifken göster */}
        {isNoiseSuppressionEnabled && (
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--theme-text)]">Gürültü Eşiği</p>
                <p className="text-xs text-[var(--theme-secondary-text)] mt-0.5">Yüksek değer daha agresif filtreler.</p>
              </div>
              <span className="text-sm font-bold text-[var(--theme-accent)] min-w-[2rem] text-right tabular-nums">{noiseThreshold}</span>
            </div>
            {(() => {
              const thresholdPct = ((noiseThreshold - 2) / (50 - 2)) * 100;
              const micPct = Math.min(100, (micAverage / 50) * 100);
              const belowWidth = Math.min(micPct, thresholdPct);
              const aboveLeft = thresholdPct;
              const aboveWidth = Math.max(0, micPct - thresholdPct);
              return (
                <div className="relative h-2 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-border)] overflow-hidden mb-3">
                  <div className="absolute left-0 top-0 h-full transition-none" style={{ width: `${belowWidth}%`, backgroundColor: 'var(--theme-secondary-text)', opacity: 0.5 }} />
                  <div className="absolute top-0 h-full transition-none" style={{ left: `${aboveLeft}%`, width: `${aboveWidth}%`, backgroundColor: 'var(--theme-accent)', opacity: 0.85 }} />
                  <div className="absolute top-0 h-full w-px bg-red-400" style={{ left: `${thresholdPct}%` }} />
                </div>
              );
            })()}
            <input type="range" min={2} max={50} value={noiseThreshold} onChange={e => { setNoiseThreshold(Number(e.target.value)); setAudioProfile('custom'); }} className="w-full accent-[var(--theme-accent)]" />
            <div className="flex justify-between text-[10px] text-[var(--theme-secondary-text)] mt-1">
              <span>Hafif</span><span>Agresif</span>
            </div>
          </div>
        )}

        {/* PTT Bırakma Gecikmesi */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">Bas-Konuş Bırakma Gecikmesi</p>
              <p className="text-xs text-[var(--theme-secondary-text)] mt-0.5">Kelime sonlarının kesilmesini önler.</p>
            </div>
            <span className="text-sm font-bold text-[var(--theme-accent)] min-w-[3.5rem] text-right tabular-nums">
              {pttReleaseDelay === 0 ? 'Kapalı' : `${pttReleaseDelay} ms`}
            </span>
          </div>
          <input type="range" min={0} max={500} step={50} value={pttReleaseDelay} onChange={e => { setPttReleaseDelay(Number(e.target.value)); setAudioProfile('custom'); }} className="w-full accent-[var(--theme-accent)]" />
          <div className="flex justify-between text-[10px] text-[var(--theme-secondary-text)] mt-1">
            <span>Kapalı</span><span>500 ms</span>
          </div>
        </div>

      </div>
    </AccordionSection>
  );
}

// ── Ses Kanalları ──
const IDLE_MINUTES_OPTIONS = [5, 10, 15, 30, 60] as const;

export function VoiceChannelSection() {
  const { autoLeaveEnabled, setAutoLeaveEnabled, autoLeaveMinutes, setAutoLeaveMinutes } = useSettings();
  return (
    <AccordionSection icon={<Headphones size={12} />} title="Ses Kanalları">
      <div className={`${cardCls} divide-y divide-[var(--theme-border)]`}>

        {/* Toggle */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--theme-text)]">Boşta kalınca kanaldan ayrıl</p>
            <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Belirlediğiniz süre boyunca konuşmadan kalırsanız aktif ses kanalından otomatik ayrılırsınız.</p>
          </div>
          <Toggle checked={autoLeaveEnabled} onChange={() => setAutoLeaveEnabled(!autoLeaveEnabled)} />
        </div>

        {/* Süre seçimi */}
        {autoLeaveEnabled && (
          <div className="px-6 py-4">
            <p className="text-sm font-semibold text-[var(--theme-text)] mb-3">Bekleme Süresi</p>
            <div className="flex gap-2">
              {IDLE_MINUTES_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => setAutoLeaveMinutes(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                    autoLeaveMinutes === m
                      ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border-[var(--theme-accent)]/30 shadow-sm shadow-[var(--theme-accent)]/10'
                      : 'bg-transparent text-[var(--theme-secondary-text)]/60 border-[var(--theme-border)] hover:text-[var(--theme-secondary-text)] hover:border-[var(--theme-border)]/80'
                  }`}
                >
                  {m} dk
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </AccordionSection>
  );
}

// ── Mikrofon Modu (sadece mobil) ──
export function VoiceModeSection() {
  if (!isMobile()) return null;
  const { voiceMode, setVoiceMode } = useSettings();

  const modes = [
    {
      id: 'ptt' as const,
      icon: <Mic size={18} />,
      label: 'Bas-Konuş',
      desc: 'Butona basılı tutarak konuş, bırakınca mikrofon kapanır.',
    },
    {
      id: 'vad' as const,
      icon: <AudioLines size={18} />,
      label: 'Ses Algılama',
      desc: 'Konuşmaya başlayınca mikrofon otomatik açılır, susunca kapanır.',
    },
  ];

  return (
    <AccordionSection icon={<Mic size={12} />} title="Mikrofon Modu">
      <div className="grid grid-cols-2 gap-3">
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => setVoiceMode(m.id)}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${
              voiceMode === m.id
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/8 shadow-sm shadow-[var(--theme-accent)]/10'
                : 'border-[var(--theme-border)] bg-transparent hover:border-[var(--theme-border)]/80'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              voiceMode === m.id ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]' : 'bg-[var(--theme-border)]/50 text-[var(--theme-secondary-text)]'
            }`}>
              {m.icon}
            </div>
            <span className={`text-sm font-bold ${voiceMode === m.id ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>
              {m.label}
            </span>
            <span className="text-[10px] text-[var(--theme-secondary-text)] leading-snug">{m.desc}</span>
            {voiceMode === m.id && (
              <div className="w-5 h-5 rounded-full bg-[var(--theme-accent)] flex items-center justify-center">
                <Check size={12} className="text-white" strokeWidth={3} />
              </div>
            )}
          </button>
        ))}
      </div>
    </AccordionSection>
  );
}
