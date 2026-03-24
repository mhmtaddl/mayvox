import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings,
  Trash2,
  Check,
  Clock,
  User as UserIcon,
  Users,
  Edit2,
  Copy,
  Timer,
  ShieldCheck,
  Link as LinkIcon,
  Recycle,
  Zap,
  Eye,
  EyeOff,
  Volume2,
  Camera,
  KeyRound,
  X,
  Mail,
  VolumeX,
  Ban,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';
import { THEMES } from '../constants';
import { saveProfile, updateUserEmail, updateUserPassword, uploadAvatar } from '../lib/supabase';
import AvatarCropModal from '../components/AvatarCropModal';
import InviteRequestPanel from '../components/InviteRequestPanel';
import { previewSound, previewInviteRingtone, type SoundVariant } from '../lib/sounds';
import { useAppState } from '../contexts/AppStateContext';
import { useUser } from '../contexts/UserContext';
import { useSettings, AUDIO_PROFILE_META } from '../contexts/SettingsCtx';
import { useUI } from '../contexts/UIContext';

// ── Module-level helpers (stable references, no unmount/remount on re-render) ──

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(); }}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
      checked ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'
    }`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const SLabel = ({ icon, children, badge }: { icon: React.ReactNode; children: React.ReactNode; badge?: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-5">
    <span className="text-[var(--theme-accent)]/70">{icon}</span>
    <span className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">{children}</span>
    {badge}
    <div className="flex-1 h-px bg-[var(--theme-border)]/60 ml-1" />
  </div>
);

export default function SettingsView() {
  const {
    currentUser,
    setCurrentUser,
    allUsers,
    setAllUsers,
  } = useUser();

  const {
    currentTheme,
    setCurrentTheme,
    isLowDataMode,
    setIsLowDataMode,
    isNoiseSuppressionEnabled,
    setIsNoiseSuppressionEnabled,
    noiseThreshold,
    setNoiseThreshold,
    soundJoinLeave,
    setSoundJoinLeave,
    soundJoinLeaveVariant,
    setSoundJoinLeaveVariant,
    soundMuteDeafen,
    setSoundMuteDeafen,
    soundMuteDeafenVariant,
    setSoundMuteDeafenVariant,
    soundPtt,
    setSoundPtt,
    soundPttVariant,
    setSoundPttVariant,
    soundInvite,
    setSoundInvite,
    soundInviteVariant,
    setSoundInviteVariant,
    avatarBorderColor,
    setAvatarBorderColor,
    pttReleaseDelay,
    setPttReleaseDelay,
    adminBorderEffect,
    setAdminBorderEffect,
    audioProfile,
    setAudioProfile,
  } = useSettings();

  const { setToastMsg } = useUI();

  const {
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
    handleToggleModerator,
    handleGenerateCode,
    handleCopyCode,
    generatedCode,
    timeLeft,
    formatTime,
    passwordResetRequests,
    handleAdminManualReset,
    inviteRequests,
    handleSendInviteCode,
    handleRejectInvite,
    appVersion: currentAppVersion,
    broadcastModeration,
  } = useAppState();

  const isOutdated = (userVersion: string, appVer: string): boolean => {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
    const [uMaj, uMin, uPat] = parse(userVersion);
    const [aMaj, aMin, aPat] = parse(appVer);
    if (uMaj !== aMaj) return uMaj < aMaj;
    if (uMin !== aMin) return uMin < aMin;
    return uPat < aPat;
  };

  // Memoized admin user list
  const otherUsers = useMemo(
    () => allUsers.filter(u => u.id !== currentUser.id),
    [allUsers, currentUser.id]
  );

  // Local settings form state
  const [settingsUsername, setSettingsUsername] = useState('');
  const [settingsDisplayName, setSettingsDisplayName] = useState('');
  const [settingsFirstName, setSettingsFirstName] = useState('');
  const [settingsLastName, setSettingsLastName] = useState('');
  const [settingsAge, setSettingsAge] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsPasswordRepeat, setSettingsPasswordRepeat] = useState('');
  const [settingsPasswordError, setSettingsPasswordError] = useState('');
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState('');
  const [showSettingsPassword, setShowSettingsPassword] = useState(false);
  const [muteInputs, setMuteInputs] = useState<Record<string, string>>({});
  const [banInputs, setBanInputs] = useState<Record<string, string>>({});
  const [keyResetConfirm, setKeyResetConfirm] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(
    currentUser.avatar?.startsWith('http') ? currentUser.avatar : null
  );
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveProfileBtnRef = useRef<HTMLButtonElement>(null);
  const [pressingProfile, setPressingProfile] = useState(false);

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

  // Initialize form from currentUser on mount
  useEffect(() => {
    setSettingsUsername(currentUser.email || currentUser.name || '');
    setSettingsDisplayName(currentUser.name || '');
    setSettingsFirstName(currentUser.firstName || '');
    setSettingsLastName(currentUser.lastName || '');
    setSettingsAge(currentUser.age?.toString() || '');
    setSettingsPassword('');
    setSettingsPasswordRepeat('');
    setSettingsPasswordError('');
    setUpdateSuccessMessage('');
    setCustomAvatarUrl(currentUser.avatar?.startsWith('http') ? currentUser.avatar : null);
  }, [currentUser.id]);

  const validatePassword = (password: string) => {
    const hasMinLength = password.length >= 6;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    return hasMinLength && hasUpperCase && hasLowerCase && hasDigit;
  };

  const isPasswordValid = settingsPassword.length === 0 || validatePassword(settingsPassword);

  const getAvatarText = (user: Partial<User> & { firstName?: string; lastName?: string; age?: number }) => {
    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
    return `${initials}${user.age || ''}`;
  };

  // Her kelimenin ilk harfini büyük, kalanı küçük yap (Türkçe i/İ korumalı)
  const toTitleCase = (str: string) =>
    str.replace(/\S+/g, w =>
      w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR')
    );

  const triggerSaveProfile = () => {
    setPressingProfile(true);
    setTimeout(() => setPressingProfile(false), 150);
    handleUpdateProfile();
  };

  const handleUpdateProfile = async () => {
    if (!settingsFirstName.trim()) {
      setSettingsPasswordError('Ad alanı boş bırakılamaz.');
      return;
    }
    if (!settingsLastName.trim()) {
      setSettingsPasswordError('Soyad alanı boş bırakılamaz.');
      return;
    }
    if (settingsPassword.length > 0) {
      if (!validatePassword(settingsPassword)) {
        setSettingsPasswordError('Şifre en az 6 karakter, bir büyük harf, bir küçük harf ve bir rakam içermelidir.');
        return;
      }
      if (settingsPassword !== settingsPasswordRepeat) {
        setSettingsPasswordError('Şifreler eşleşmiyor!');
        return;
      }
    }
    setSettingsPasswordError('');

    const normalizedFirst = toTitleCase(settingsFirstName.trim());
    const normalizedLast = toTitleCase(settingsLastName.trim());
    setSettingsFirstName(normalizedFirst);
    setSettingsLastName(normalizedLast);

    const ageNum = parseInt(settingsAge) || 0;
    const avatarText = getAvatarText({ firstName: normalizedFirst, lastName: normalizedLast, age: ageNum });
    const finalAvatar = customAvatarUrl ?? avatarText;
    const updatedUser = {
      ...currentUser,
      name: settingsDisplayName,
      email: settingsUsername,
      firstName: normalizedFirst,
      lastName: normalizedLast,
      age: ageNum,
      avatar: finalAvatar,
    };

    await saveProfile({
      id: currentUser.id,
      name: updatedUser.name,
      email: settingsUsername,
      first_name: normalizedFirst,
      last_name: normalizedLast,
      age: updatedUser.age || 18,
      avatar: updatedUser.avatar,
    });

    if (settingsUsername !== (currentUser.email || currentUser.name)) {
      const { error } = await updateUserEmail(settingsUsername);
      if (error) {
        setSettingsPasswordError('E-posta güncellenemedi. Lütfen tekrar deneyin.');
        return;
      }
    }

    if (settingsPassword.length > 0) {
      const { error } = await updateUserPassword(settingsPassword);
      if (error) {
        setSettingsPasswordError('Şifre güncellenemedi. Lütfen tekrar deneyin.');
        return;
      }
    }

    setCurrentUser(updatedUser);
    setAllUsers(allUsers.map(u => u.id === currentUser.id ? updatedUser : u));
    setSettingsPassword('');
    setSettingsPasswordRepeat('');
    setUpdateSuccessMessage('Bilgiler Güncellendi!');
    setTimeout(() => setUpdateSuccessMessage(''), 3000);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) {
      setSettingsPasswordError('Dosya boyutu 5 MB\'ı geçemez.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async (blob: Blob) => {
    setCropSrc(null);
    setAvatarUploading(true);
    setSettingsPasswordError('');
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const url = await uploadAvatar(currentUser.id, file);
      setCustomAvatarUrl(url);
      await saveProfile({
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        first_name: currentUser.firstName || '',
        last_name: currentUser.lastName || '',
        age: currentUser.age || 18,
        avatar: url,
      });
      const updated = { ...currentUser, avatar: url };
      setCurrentUser(updated);
      setAllUsers(allUsers.map(u => u.id === currentUser.id ? updated : u));
      broadcastModeration(currentUser.id, { avatar: url });
      setUpdateSuccessMessage('Profil fotoğrafı güncellendi!');
      setTimeout(() => setUpdateSuccessMessage(''), 3000);
    } catch {
      setSettingsPasswordError('Fotoğraf yüklenemedi. Bucket ayarlarını kontrol edin.');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── UI helpers ────────────────────────────────────────────────────────────

  // Shared input class
  const inputCls = 'w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl px-3.5 py-2.5 text-sm focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/10 outline-none transition-all text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40';

  // Shared label class
  const labelCls = 'text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em]';

  // Shared card class
  const cardCls = 'bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl overflow-hidden shadow-sm';

  return (
    <>
      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
      <div className="w-full max-w-2xl mx-auto pb-14">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pt-10 pb-9">
          <div className="w-11 h-11 rounded-2xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Settings size={20} className="text-[var(--theme-accent)]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[var(--theme-text)] tracking-tight">Ayarlar</h2>
            <p className="text-xs text-[var(--theme-secondary-text)] mt-0.5">Profil ve uygulama tercihleri</p>
          </div>
        </div>

        <div className="space-y-10">

          {/* ════════════════════════════════════════════════════════════
              HESAP
          ════════════════════════════════════════════════════════════ */}
          <section>
            <SLabel icon={<UserIcon size={12} />}>Hesap</SLabel>
            <div className={cardCls}>

              {/* Gradient şerit */}
              <div className="h-1.5 bg-gradient-to-r from-[var(--theme-accent)]/50 via-[var(--theme-accent)]/20 to-transparent" />

              {/* Avatar + kimlik satırı */}
              <div className="flex items-center gap-5 px-6 py-5 border-b border-[var(--theme-border)]">
                <div
                  className="relative group cursor-pointer shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div
                    className="h-16 w-16 rounded-full bg-[var(--theme-accent)]/20 border-[3px] overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-base shadow-sm"
                    style={{ borderColor: avatarBorderColor }}
                  >
                    {customAvatarUrl ? (
                      <img src={customAvatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      getAvatarText({ firstName: settingsFirstName, lastName: settingsLastName, age: parseInt(settingsAge) || 0 })
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {avatarUploading
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Camera size={16} className="text-white" />
                    }
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarFileChange} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-bold text-base text-[var(--theme-text)] leading-tight truncate">
                      {(settingsFirstName || settingsLastName)
                        ? `${settingsFirstName} ${settingsLastName}`.trim()
                        : settingsDisplayName || '—'}
                    </p>
                    {currentAppVersion && (
                      <span className="text-[9px] font-semibold text-[var(--theme-secondary-text)]/50 tabular-nums shrink-0">
                        v{currentAppVersion}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--theme-secondary-text)] truncate mt-0.5">{settingsUsername}</p>
                  {/* Avatar border renk paleti */}
                  <div className="mt-3">
                    <p className="text-[9px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-wider mb-2">Çerçeve Rengi</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { hex: '#3B82F6', name: 'Mavi' },
                        { hex: '#8B5CF6', name: 'Mor' },
                        { hex: '#10B981', name: 'Yeşil' },
                        { hex: '#EF4444', name: 'Kırmızı' },
                        { hex: '#F59E0B', name: 'Sarı' },
                        { hex: '#EC4899', name: 'Pembe' },
                        { hex: '#06B6D4', name: 'Cyan' },
                        { hex: '#F97316', name: 'Turuncu' },
                        { hex: '#6B7280', name: 'Gri' },
                      ].map(({ hex, name }) => {
                        const isSelected = avatarBorderColor === hex;
                        return (
                          <button
                            key={hex}
                            onClick={() => setAvatarBorderColor(hex)}
                            title={name}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              backgroundColor: hex,
                              border: isSelected ? '2.5px solid white' : '2px solid transparent',
                              boxShadow: isSelected ? `0 0 0 2px ${hex}` : `0 0 0 1px ${hex}55`,
                              transform: isSelected ? 'scale(1.22)' : 'scale(1)',
                              transition: 'all 0.15s ease',
                              cursor: 'pointer',
                              outline: 'none',
                              flexShrink: 0,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Profil alanları */}
              <div className="px-6 pt-5 pb-4">
                <p className={`${labelCls} mb-3`}>Profil Bilgileri</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Kullanıcı Adı</label>
                    <input type="text" value={settingsDisplayName} onChange={e => setSettingsDisplayName(e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>E-Posta</label>
                    <input type="text" value={settingsUsername} onChange={e => setSettingsUsername(e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Ad</label>
                    <input type="text" value={settingsFirstName} onChange={e => setSettingsFirstName(toTitleCase(e.target.value))} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Soyad</label>
                    <input type="text" value={settingsLastName} onChange={e => setSettingsLastName(toTitleCase(e.target.value))} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Yaş</label>
                    <input type="number" value={settingsAge} onChange={e => setSettingsAge(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Güvenlik alanları */}
              <div className="border-t border-[var(--theme-border)] mx-6" />
              <div className="px-6 pt-4 pb-5">
                <p className={`${labelCls} mb-3`}>Güvenlik</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Yeni Şifre</label>
                    <div className="relative">
                      <input
                        type={showSettingsPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={settingsPassword}
                        onChange={e => setSettingsPassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') triggerSaveProfile(); }}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSettingsPassword(!showSettingsPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
                      >
                        {showSettingsPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Şifre Tekrar</label>
                    <input
                      type={showSettingsPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={settingsPasswordRepeat}
                      onChange={e => setSettingsPasswordRepeat(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') triggerSaveProfile(); }}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              {/* Footer: mesaj + kaydet */}
              <div className="border-t border-[var(--theme-border)] px-6 py-4 flex items-center justify-between gap-4 bg-[var(--theme-bg)]/30">
                <p className={`text-xs flex-1 leading-relaxed ${
                  updateSuccessMessage
                    ? 'text-emerald-500 font-semibold'
                    : settingsPasswordError
                      ? 'text-red-400'
                      : !isPasswordValid
                        ? 'text-red-400'
                        : 'text-[var(--theme-secondary-text)]'
                }`}>
                  {updateSuccessMessage || settingsPasswordError || 'Şifre: en az 6 karakter, büyük+küçük harf ve rakam'}
                </p>
                <button
                  ref={saveProfileBtnRef}
                  onClick={handleUpdateProfile}
                  className={`shrink-0 px-6 py-2.5 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-[var(--theme-accent)]/20 hover:opacity-90 hover:shadow-lg active:scale-[0.97] ${pressingProfile ? 'opacity-90 scale-[0.97]' : ''}`}
                >
                  Kaydet
                </button>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════
              GÖRÜNÜM
          ════════════════════════════════════════════════════════════ */}
          <section>
            <SLabel icon={<Recycle size={12} />}>Görünüm</SLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => setCurrentTheme(theme)}
                  className={`flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                    currentTheme.id === theme.id
                      ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 shadow-sm'
                      : 'border-[var(--theme-border)] bg-[var(--theme-sidebar)]/30 hover:border-[var(--theme-secondary-text)]/30 hover:bg-[var(--theme-sidebar)]/60 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--theme-text)]">{theme.name}</span>
                    {currentTheme.id === theme.id
                      ? <div className="w-5 h-5 rounded-full bg-[var(--theme-accent)] flex items-center justify-center shrink-0"><Check size={10} className="text-white" /></div>
                      : <div className="w-5 h-5 rounded-full border-2 border-[var(--theme-border)] shrink-0" />
                    }
                  </div>
                  <div className="flex rounded-lg overflow-hidden h-5 border border-white/10">
                    <div className="flex-1" style={{ backgroundColor: theme.bg }} />
                    <div className="w-5 border-l border-white/10" style={{ backgroundColor: theme.sidebar }} />
                    <div className="w-5 border-l border-white/10" style={{ backgroundColor: theme.accent }} />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Admin border effect */}
          <div className={`${cardCls} -mt-6`}>
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--theme-text)]">Yönetici Çerçeve Efekti</p>
                <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Yönetici avatarlarında hafif parıltı göster.</p>
              </div>
              <Toggle checked={adminBorderEffect} onChange={() => setAdminBorderEffect(!adminBorderEffect)} />
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              SESLER
          ════════════════════════════════════════════════════════════ */}
          <section>
            <SLabel icon={<Volume2 size={12} />}>Sesler</SLabel>
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
          </section>

          {/* ════════════════════════════════════════════════════════════
              SES PROFİLİ
          ════════════════════════════════════════════════════════════ */}
          <section>
            <SLabel icon={<Volume2 size={12} />}>Ses Profili</SLabel>
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
          </section>

          {/* ════════════════════════════════════════════════════════════
              PERFORMANS
          ════════════════════════════════════════════════════════════ */}
          <section>
            <SLabel icon={<Zap size={12} />}>Performans ve Veri</SLabel>
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
          </section>

          {/* ════════════════════════════════════════════════════════════
              YÖNETİCİ PANELİ (sadece admin)
          ════════════════════════════════════════════════════════════ */}
          {currentUser.isAdmin && (
            <section>
              <SLabel
                icon={<ShieldCheck size={12} />}
                badge={
                  <span className="text-[9px] bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] px-2 py-0.5 rounded-full border border-[var(--theme-accent)]/20 uppercase font-bold tracking-wider">
                    Admin
                  </span>
                }
              >
                Yönetici Paneli
              </SLabel>
              <div className={`${cardCls} divide-y divide-[var(--theme-border)]`}>

                {/* Davet Kodu */}
                <div className="flex items-center gap-4 px-6 py-5">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--theme-text)]">Davet Kodu Oluştur</p>
                    <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Yeni kullanıcılar için süreli giriş kodu.</p>
                  </div>
                  <button
                    onClick={handleGenerateCode}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-accent)] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md shadow-[var(--theme-accent)]/20 shrink-0"
                  >
                    <LinkIcon size={14} />
                    Oluştur
                  </button>
                </div>

                {/* Generated Code */}
                <AnimatePresence>
                  {generatedCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 py-5 bg-[var(--theme-accent)]/5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-widest mb-1 block">Aktif Davet Kodu</label>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl font-mono font-black tracking-[0.2em] text-[var(--theme-text)]">{generatedCode}</span>
                              <button
                                onClick={handleCopyCode}
                                className="p-1.5 rounded-lg bg-[var(--theme-sidebar)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
                              >
                                <Copy size={15} />
                              </button>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="flex items-center justify-end gap-1 text-orange-500 font-bold mb-1">
                              <Timer size={12} className="animate-pulse" />
                              <span className="text-[10px] uppercase">Süre Azalıyor</span>
                            </div>
                            <div className="text-xl font-black text-[var(--theme-text)] tabular-nums">{formatTime(timeLeft)}</div>
                          </div>
                        </div>
                        <div className="mt-3 w-full h-1 bg-[var(--theme-sidebar)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: '100%' }}
                            animate={{ width: `${(timeLeft / 180) * 100}%` }}
                            transition={{ duration: 1, ease: 'linear' }}
                            className="h-full bg-[var(--theme-accent)]"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Davet Talepleri */}
                <div className="px-6 py-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Mail className="text-amber-500 shrink-0" size={14} />
                    <p className="text-sm font-semibold text-[var(--theme-text)]">Davet Talepleri</p>
                    {inviteRequests.length > 0 && (
                      <span className="ml-auto text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                        {inviteRequests.length}
                      </span>
                    )}
                  </div>
                  {inviteRequests.length > 0 ? (
                    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] divide-y divide-[var(--theme-border)] overflow-hidden">
                      <InviteRequestPanel requests={inviteRequests} onSendCode={handleSendInviteCode} onReject={handleRejectInvite} />
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--theme-secondary-text)] italic">Bekleyen davet talebi yok.</p>
                  )}
                </div>

                {/* Kullanıcı Yönetimi */}
                <div className="px-6 py-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="text-[var(--theme-accent)] shrink-0" size={14} />
                    <p className="text-sm font-semibold text-[var(--theme-text)]">Kullanıcı Yönetimi</p>
                  </div>
                  <div className="space-y-2.5">
                    {otherUsers.map(user => (
                      <div key={user.id} className="flex items-center justify-between p-3.5 bg-[var(--theme-bg)] rounded-xl border border-[var(--theme-border)] hover:border-[var(--theme-border)]/80 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-[var(--theme-accent)]/20 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-xs shrink-0 ring-1 ring-[var(--theme-border)]">
                            {user.avatar?.startsWith('http')
                              ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              : user.avatar}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--theme-text)] truncate">{user.firstName} {user.lastName}</span>
                              {user.isAdmin && (
                                <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] rounded-full border border-[var(--theme-accent)]/20 leading-none" title="Admin">A</span>
                              )}
                              {user.isModerator && (
                                <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 bg-violet-500/12 text-violet-400 rounded-full border border-violet-500/20 leading-none" title="Moderatör">M</span>
                              )}
                              {user.appVersion && (() => {
                                const outdated = currentAppVersion ? isOutdated(user.appVersion, currentAppVersion) : false;
                                return (
                                  <span className={`text-[9px] font-semibold shrink-0 px-1.5 py-0.5 rounded-full border ${outdated ? 'text-red-400 border-red-500/20 bg-red-500/8 animate-pulse' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/8'}`}>
                                    v{user.appVersion}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {user.isMuted && <span className="text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded-full border border-orange-500/20 font-medium">Susturuldu</span>}
                              {user.isVoiceBanned && <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20 font-medium">Konuşma Yasaklı</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 items-center shrink-0 ml-3">
                          <div className="flex flex-col gap-1.5">
                            {/* Susturma */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                <input
                                  type="number"
                                  placeholder="dk"
                                  value={muteInputs[user.id] || ''}
                                  onChange={e => setMuteInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                                  className="w-14 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-2 py-1 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--theme-secondary-text)] pointer-events-none">dk</span>
                              </div>
                              <button
                                onClick={() => { const m = parseInt(muteInputs[user.id]); if (m > 0) handleMuteUser(user.id, m); }}
                                title="Sustur"
                                className="flex items-center justify-center w-7 h-7 bg-[var(--theme-accent)] text-white rounded hover:opacity-90 transition-all"
                              >
                                <VolumeX size={13} />
                              </button>
                              {user.isMuted && (
                                <>
                                  <span className="text-[10px] font-mono text-orange-500 font-bold">{Math.ceil((user.muteExpires! - Date.now()) / 60000)}dk</span>
                                  <button onClick={() => handleUnmuteUser(user.id)} title="Susturmayı Kaldır" className="flex items-center justify-center w-7 h-7 bg-orange-500 text-white rounded hover:opacity-90 transition-all">
                                    <Recycle size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                            {/* Yasaklama */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                <input
                                  type="number"
                                  placeholder="gün"
                                  value={banInputs[user.id] || ''}
                                  onChange={e => setBanInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                                  className="w-14 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-2 py-1 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--theme-secondary-text)] pointer-events-none">gün</span>
                              </div>
                              <button
                                onClick={() => { const d = parseInt(banInputs[user.id]); if (d > 0) handleBanUser(user.id, d * 1440); }}
                                title="Yasakla"
                                className="flex items-center justify-center w-7 h-7 bg-red-500 text-white rounded hover:opacity-90 transition-all"
                              >
                                <Ban size={13} />
                              </button>
                              {user.isVoiceBanned && (
                                <>
                                  <span className="text-[10px] font-mono text-red-500 font-bold">{Math.ceil((user.banExpires! - Date.now()) / (1000 * 60 * 60 * 24))}g</span>
                                  <button onClick={() => handleUnbanUser(user.id)} title="Yasağı Kaldır" className="flex items-center justify-center w-7 h-7 bg-red-500 text-white rounded hover:opacity-90 transition-all">
                                    <Recycle size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 border-l border-[var(--theme-border)] pl-3">
                            {currentUser.isPrimaryAdmin && (
                              <button
                                onClick={() => handleToggleAdmin(user.id)}
                                title={user.isAdmin ? 'Admin Yetkisini Kaldır' : 'Admin Yap'}
                                className={`flex items-center justify-center w-7 h-7 rounded transition-all ${
                                  user.isAdmin
                                    ? 'bg-orange-500 text-white border border-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.3)] hover:bg-orange-600'
                                    : 'bg-emerald-500/8 text-emerald-500/60 border border-emerald-500/15 hover:bg-emerald-500/20 hover:text-emerald-500'
                                }`}
                              >
                                <ShieldCheck size={13} />
                              </button>
                            )}
                            {currentUser.isPrimaryAdmin && (
                              <button
                                onClick={() => handleToggleModerator(user.id)}
                                title={user.isModerator ? 'Moderatör Yetkisini Kaldır' : 'Moderatör Yap'}
                                className={`flex items-center justify-center w-7 h-7 rounded transition-all ${
                                  user.isModerator
                                    ? 'bg-violet-500 text-white border border-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.35)] hover:bg-violet-600'
                                    : 'bg-violet-500/8 text-violet-400/60 border border-violet-500/15 hover:bg-violet-500/20 hover:text-violet-400'
                                }`}
                              >
                                <span className="text-[11px] font-black leading-none">M</span>
                              </button>
                            )}
                            {keyResetConfirm === user.id ? (
                              <div className="flex items-center gap-1 p-1 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-lg">
                                <span className="text-[9px] text-[var(--theme-secondary-text)] px-1">Sıfırla?</span>
                                <button
                                  onClick={async () => { await handleAdminManualReset(user.id, user.name, user.email || ''); setKeyResetConfirm(null); }}
                                  className="flex items-center justify-center w-6 h-6 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all"
                                  title="Onayla"
                                >
                                  <Check size={11} />
                                </button>
                                <button
                                  onClick={() => setKeyResetConfirm(null)}
                                  className="flex items-center justify-center w-6 h-6 rounded bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                                  title="İptal"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setKeyResetConfirm(user.id)}
                                title={passwordResetRequests.some(r => r.userId === user.id) ? 'Şifre sıfırlama isteği var!' : 'Şifre Sıfırla'}
                                className={`flex items-center justify-center w-7 h-7 rounded transition-all ${
                                  passwordResetRequests.some(r => r.userId === user.id)
                                    ? 'bg-red-500/15 text-red-500 border border-red-500/25 hover:bg-red-500 hover:text-white'
                                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                                }`}
                              >
                                <KeyRound size={13} />
                              </button>
                            )}
                            {(!user.isPrimaryAdmin && (currentUser.isPrimaryAdmin || !user.isAdmin)) && (
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                title="Kullanıcıyı Sil"
                                className="flex items-center justify-center w-7 h-7 bg-red-500/10 text-red-500 border border-red-500/20 rounded hover:bg-red-500 hover:text-white transition-all"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </section>
          )}

        </div>
      </div>
    </>
  );
}
