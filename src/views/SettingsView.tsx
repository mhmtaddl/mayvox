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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';
import { THEMES } from '../constants';
import { saveProfile, updateUserEmail, updateUserPassword, uploadAvatar } from '../lib/supabase';
import AvatarCropModal from '../components/AvatarCropModal';
import { previewSound, type SoundVariant } from '../lib/sounds';
import { useAppState } from '../contexts/AppStateContext';
import { useUser } from '../contexts/UserContext';
import { useSettings } from '../contexts/SettingsCtx';

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
    avatarBorderColor,
    setAvatarBorderColor,
    pttReleaseDelay,
    setPttReleaseDelay,
  } = useSettings();

  const {
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
    handleGenerateCode,
    handleCopyCode,
    generatedCode,
    timeLeft,
    formatTime,
    passwordResetRequests,
    handleAdminManualReset,
  } = useAppState();

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
  const [keyResetConfirm, setKeyResetConfirm] = useState<string | null>(null); // userId
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

  const triggerSaveProfile = () => {
    setPressingProfile(true);
    setTimeout(() => setPressingProfile(false), 150);
    handleUpdateProfile();
  };

  const handleUpdateProfile = async () => {
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

    const ageNum = parseInt(settingsAge) || 0;
    const avatarText = getAvatarText({ firstName: settingsFirstName, lastName: settingsLastName, age: ageNum });
    // Profil fotoğrafı varsa koru; yoksa baş harf + yaş kullan
    const finalAvatar = customAvatarUrl ?? avatarText;
    const updatedUser = {
      ...currentUser,
      name: settingsDisplayName,
      email: settingsUsername,
      firstName: settingsFirstName,
      lastName: settingsLastName,
      age: ageNum,
      avatar: finalAvatar,
    };

    await saveProfile({
      id: currentUser.id,
      name: updatedUser.name,
      email: settingsUsername,
      first_name: updatedUser.firstName || '',
      last_name: updatedUser.lastName || '',
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
      setUpdateSuccessMessage('Profil fotoğrafı güncellendi!');
      setTimeout(() => setUpdateSuccessMessage(''), 3000);
    } catch {
      setSettingsPasswordError('Fotoğraf yüklenemedi. Bucket ayarlarını kontrol edin.');
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <>
    {cropSrc && (
      <AvatarCropModal
        imageSrc={cropSrc}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropSrc(null)}
      />
    )}
    <div className="w-full max-w-3xl mx-auto">
      <div className="p-8 border-b border-[var(--theme-border)]">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="text-[var(--theme-accent)]" size={32} />
          <h2 className="text-4xl font-black tracking-tight text-[var(--theme-text)]">Ayarlar</h2>
        </div>
        <p className="text-[var(--theme-secondary-text)] font-medium ml-11">Kullanıcı profilini ve uygulama tercihlerini yönet.</p>
      </div>

      <div className="p-8 space-y-12">
        {/* User Info */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <UserIcon className="text-[var(--theme-accent)]" size={20} />
            <h3 className="text-lg font-bold text-[var(--theme-text)]">Kullanıcı Bilgileri</h3>
          </div>

          {/* Avatar Upload */}
          <div className="flex flex-col items-center mb-6 gap-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div
                className="h-20 w-20 rounded-full bg-[var(--theme-accent)]/20 border-2 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-lg"
                style={{ borderColor: avatarBorderColor }}
              >
                {customAvatarUrl ? (
                  <img src={customAvatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  getAvatarText({ firstName: settingsFirstName, lastName: settingsLastName, age: parseInt(settingsAge) || 0 })
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {avatarUploading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={18} className="text-white" />
                }
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarFileChange} />
            </div>

            {/* Border Color Swatches */}
            <div className="flex items-center gap-2">
              {[
                '#3B82F6', // Mavi
                '#8B5CF6', // Mor
                '#10B981', // Yeşil
                '#EF4444', // Kırmızı
                '#F59E0B', // Altın
                '#EC4899', // Pembe
                '#06B6D4', // Cyan
                '#F97316', // Turuncu
                '#6B7280', // Gri
              ].map(color => (
                <button
                  key={color}
                  onClick={() => setAvatarBorderColor(color)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: avatarBorderColor === color ? 'white' : 'transparent',
                    boxShadow: avatarBorderColor === color ? `0 0 0 1px ${color}` : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--theme-secondary-text)] text-center">
              JPG veya PNG · En fazla 5 MB · 512×512 önerilir
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Kullanıcı Adı</label>
              <div className="relative">
                <input
                  type="text"
                  value={settingsDisplayName}
                  onChange={(e) => setSettingsDisplayName(e.target.value)}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                />
                <UserIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={14} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">E-Posta</label>
              <div className="relative">
                <input
                  type="text"
                  value={settingsUsername}
                  onChange={(e) => setSettingsUsername(e.target.value)}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                />
                <Edit2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={14} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Adınız</label>
              <div className="relative">
                <input
                  type="text"
                  value={settingsFirstName}
                  onChange={(e) => setSettingsFirstName(e.target.value)}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                />
                <Edit2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={14} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Soyadınız</label>
              <div className="relative">
                <input
                  type="text"
                  value={settingsLastName}
                  onChange={(e) => setSettingsLastName(e.target.value)}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                />
                <Edit2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={14} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Yaşınız</label>
              <div className="relative">
                <input
                  type="number"
                  value={settingsAge}
                  onChange={(e) => setSettingsAge(e.target.value)}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                />
                <Clock className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={14} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Yeni Parola</label>
              <div className="relative">
                <input
                  type={showSettingsPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={settingsPassword}
                  onChange={(e) => setSettingsPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') triggerSaveProfile(); }}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
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
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Yeni Parola Tekrar</label>
              <div className="relative">
                <input
                  type={showSettingsPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={settingsPasswordRepeat}
                  onChange={(e) => setSettingsPasswordRepeat(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') triggerSaveProfile(); }}
                  className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              {updateSuccessMessage ? (
                <p className="text-xs text-green-500 text-center font-bold">{updateSuccessMessage}</p>
              ) : (
                <p className={`text-xs ${!settingsPasswordError && isPasswordValid ? 'text-[var(--theme-secondary-text)]' : 'text-red-500'} text-center`}>
                  {settingsPasswordError || 'Şifre en az 6 karakter, bir büyük harf, bir küçük harf ve bir rakam içermelidir.'}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              ref={saveProfileBtnRef}
              onClick={handleUpdateProfile}
              className={`px-6 py-2.5 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-black/20 active:scale-[0.97] ${pressingProfile ? 'opacity-90 scale-[0.97]' : 'hover:opacity-90'}`}
            >
              Bilgileri Güncelle
            </button>
          </div>
        </section>

        {/* Theme Selection */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Recycle className="text-[var(--theme-accent)]" size={20} />
            <h3 className="text-lg font-bold text-[var(--theme-text)]">Tema Ayarları</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => setCurrentTheme(theme)}
                className={`flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                  currentTheme.id === theme.id
                    ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10'
                    : 'border-[var(--theme-border)] bg-[var(--theme-sidebar)]/30 hover:border-[var(--theme-secondary-text)]/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[var(--theme-text)]">{theme.name}</span>
                  {currentTheme.id === theme.id && <Check size={16} className="text-[var(--theme-accent)]" />}
                </div>
                <div className="flex gap-1">
                  <div className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: theme.bg }}></div>
                  <div className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: theme.accent }}></div>
                  <div className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: theme.text }}></div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Performance & Data */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Zap className="text-[var(--theme-accent)]" size={20} />
            <h3 className="text-lg font-bold text-[var(--theme-text)]">Performans ve Veri</h3>
          </div>

          <div className="bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-bold text-[var(--theme-text)]">Düşük Veri Kullanım Modu</h4>
                <p className="text-xs text-[var(--theme-secondary-text)] mt-1">
                  Oyunlarda ping yaratmamak için veri alışverişini minimize eder.
                  Ses kalitesini korurken görsel güncellemeleri ve arka plan işlemlerini yavaşlatır.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={isLowDataMode}
                aria-label="Düşük veri kullanım modunu aç/kapat"
                onClick={() => setIsLowDataMode(!isLowDataMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  isLowDataMode ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isLowDataMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* PTT Bırakma Gecikmesi */}
          <div className="bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl p-6 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-bold text-[var(--theme-text)]">Bas-Konuş Bırakma Gecikmesi</h4>
                <p className="text-xs text-[var(--theme-secondary-text)] mt-1">
                  Tuşu bıraktıktan sonra mikrofonun kapanmadan önce beklediği süre. Kelime sonlarının kesilmesini önler.
                </p>
              </div>
              <span className="text-sm font-bold text-[var(--theme-accent)] min-w-[3rem] text-right">
                {pttReleaseDelay === 0 ? 'Kapalı' : `${pttReleaseDelay} ms`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={500}
              step={50}
              value={pttReleaseDelay}
              onChange={e => setPttReleaseDelay(Number(e.target.value))}
              className="w-full accent-[var(--theme-accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--theme-secondary-text)] mt-1">
              <span>Kapalı</span>
              <span>500 ms</span>
            </div>
          </div>

          {isNoiseSuppressionEnabled && (
            <div className="bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl p-6 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-bold text-[var(--theme-text)]">Gürültü Eşiği</h4>
                  <p className="text-xs text-[var(--theme-secondary-text)] mt-1">
                    Mikrofonun arka plan sesini ne kadar filtreleceğini belirler. Yüksek değer daha agresif filtreler.
                  </p>
                </div>
                <span className="text-sm font-bold text-[var(--theme-accent)] min-w-[2rem] text-right">{noiseThreshold}</span>
              </div>
              {/* Canlı mikrofon seviyesi */}
              {(() => {
                const thresholdPct = ((noiseThreshold - 2) / (50 - 2)) * 100;
                const micPct = Math.min(100, (micAverage / 50) * 100);
                const belowWidth = Math.min(micPct, thresholdPct);
                const aboveLeft = thresholdPct;
                const aboveWidth = Math.max(0, micPct - thresholdPct);
                return (
                  <div className="relative h-2 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-border)] overflow-hidden mb-3">
                    {/* Eşiğin altındaki kısım — gri */}
                    <div
                      className="absolute left-0 top-0 h-full transition-none"
                      style={{ width: `${belowWidth}%`, backgroundColor: 'var(--theme-secondary-text)', opacity: 0.5 }}
                    />
                    {/* Eşiği geçen kısım — accent */}
                    <div
                      className="absolute top-0 h-full transition-none"
                      style={{ left: `${aboveLeft}%`, width: `${aboveWidth}%`, backgroundColor: 'var(--theme-accent)', opacity: 0.85 }}
                    />
                    {/* Eşik çizgisi */}
                    <div
                      className="absolute top-0 h-full w-px bg-red-400"
                      style={{ left: `${thresholdPct}%` }}
                    />
                  </div>
                );
              })()}
              <input
                type="range"
                min={2}
                max={50}
                value={noiseThreshold}
                onChange={e => setNoiseThreshold(Number(e.target.value))}
                className="w-full accent-[var(--theme-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--theme-secondary-text)] mt-1">
                <span>Hafif</span>
                <span>Agresif</span>
              </div>
            </div>
          )}
        </section>

        <div className="border-t border-[var(--theme-border)]"></div>

        {/* Sesler */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Volume2 className="text-[var(--theme-accent)]" size={20} />
            <h3 className="text-lg font-bold text-[var(--theme-text)]">Sesler</h3>
          </div>
          <div className="bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl p-6 space-y-6">
            {([
              {
                label: 'Giriş / Çıkış Sesleri',
                desc: 'Birisi odaya girdiğinde veya ayrıldığında ses çalar.',
                category: 'JoinLeave' as const,
                variant: soundJoinLeaveVariant,
                setVariant: setSoundJoinLeaveVariant,
                enabled: soundJoinLeave,
                setEnabled: setSoundJoinLeave,
              },
              {
                label: 'Mikrofon / Hoparlör Sesleri',
                desc: 'Mikrofon veya hoparlör açılıp kapatıldığında ses çalar.',
                category: 'MuteDeafen' as const,
                variant: soundMuteDeafenVariant,
                setVariant: setSoundMuteDeafenVariant,
                enabled: soundMuteDeafen,
                setEnabled: setSoundMuteDeafen,
              },
              {
                label: 'Bas-Konuş Sesi',
                desc: 'Bas-Konuş tuşuna basılıp bırakıldığında ses çalar.',
                category: 'Ptt' as const,
                variant: soundPttVariant,
                setVariant: setSoundPttVariant,
                enabled: soundPtt,
                setEnabled: setSoundPtt,
              },
            ]).map(({ label, desc, category, variant, setVariant, enabled, setEnabled }) => (
              <div key={category} className="space-y-3">
                <div>
                  <h4 className="font-bold text-[var(--theme-text)]">{label}</h4>
                  <p className="text-xs text-[var(--theme-secondary-text)] mt-1">{desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  {([1, 2] as SoundVariant[]).map(v => (
                    <button
                      key={v}
                      onClick={() => { setVariant(v); previewSound(category, v); }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        variant === v
                          ? 'bg-[var(--theme-accent)] text-white border-[var(--theme-accent)] shadow-lg'
                          : 'bg-[var(--theme-sidebar)] text-[var(--theme-secondary-text)] border-[var(--theme-border)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]'
                      }`}
                    >
                      Ses {v}
                    </button>
                  ))}
                  <button
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled(!enabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-emerald-500' : 'bg-red-500'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {currentUser.isAdmin && (
          <>
            <div className="border-t border-[var(--theme-border)]"></div>

            {/* Admin Panel */}
            <section>
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck className="text-[var(--theme-accent)]" size={20} />
                <h3 className="text-lg font-bold text-[var(--theme-text)] flex items-center gap-2">
                  Yönetici Paneli
                  <span className="text-[10px] bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] px-2 py-0.5 rounded border border-[var(--theme-accent)]/20 uppercase">Admin Only</span>
                </h3>
              </div>

              <div className="bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl p-6">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-[var(--theme-text)]">Davet Kodu Oluştur</h4>
                      <p className="text-xs text-[var(--theme-secondary-text)] mt-1">Yeni kullanıcıların platforma katılması için süreli davet kodu oluşturun.</p>
                    </div>
                    <button
                      onClick={handleGenerateCode}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-xl"
                    >
                      <LinkIcon size={18} />
                      Kod Oluştur
                    </button>
                  </div>

                  {/* Generated Code Result */}
                  <AnimatePresence>
                    {generatedCode && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-5 bg-[var(--theme-accent)]/5 border border-[var(--theme-accent)]/20 rounded-xl overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-widest mb-1 block">Aktif Davet Kodu</label>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl font-mono font-black tracking-[0.2em] text-[var(--theme-text)]">{generatedCode}</span>
                              <button
                                onClick={handleCopyCode}
                                className="p-2 rounded-lg bg-[var(--theme-sidebar)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
                              >
                                <Copy size={18} />
                              </button>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center justify-end gap-1.5 text-orange-500 font-bold mb-1">
                              <Timer size={14} className="animate-pulse" />
                              <span className="text-xs uppercase tracking-tighter">Süre Azalıyor</span>
                            </div>
                            <div className="text-2xl font-black text-[var(--theme-text)] tabular-nums">{formatTime(timeLeft)}</div>
                          </div>
                        </div>

                        <div className="mt-4 w-full h-1 bg-[var(--theme-sidebar)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: '100%' }}
                            animate={{ width: `${(timeLeft / 180) * 100}%` }}
                            transition={{ duration: 1, ease: 'linear' }}
                            className="h-full bg-[var(--theme-accent)]"
                          />
                        </div>
                        <p className="text-[10px] text-[var(--theme-secondary-text)] mt-2 italic">* Bu kod süre dolduğunda otomatik olarak geçersiz kılınacaktır.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-8 pt-8 border-t border-[var(--theme-border)]">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="text-[var(--theme-accent)]" size={18} />
                      <h4 className="font-bold text-[var(--theme-text)]">Kullanıcı Yönetimi</h4>
                    </div>
                    <div className="space-y-3">
                      {otherUsers.map(user => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-[var(--theme-bg)] rounded-xl border border-[var(--theme-border)]">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-[var(--theme-accent)]/20 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-xs">
                              {user.avatar?.startsWith('http')
                                ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                : user.avatar}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-[var(--theme-text)]">{user.firstName} {user.lastName}</div>
                                {user.appVersion && (
                                  <span className="text-[9px] font-medium text-[var(--theme-secondary-text)]/60">v{user.appVersion}</span>
                                )}
                              </div>
                              <div className="flex gap-2 mt-1">
                                {user.isMuted && <span className="text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded border border-orange-500/20">Susturuldu</span>}
                                {user.isVoiceBanned && <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20">Konuşma Yasaklı</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-4 items-center">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <input
                                    type="number"
                                    placeholder="dk"
                                    value={muteInputs[user.id] || ''}
                                    onChange={(e) => setMuteInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                                    className="w-16 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-2 py-1 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--theme-secondary-text)] pointer-events-none">dk</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const mins = parseInt(muteInputs[user.id]);
                                    if (mins > 0) handleMuteUser(user.id, mins);
                                  }}
                                  className="text-[10px] font-bold px-3 py-1 bg-[var(--theme-accent)] text-white rounded hover:opacity-90 transition-all"
                                >
                                  Sustur
                                </button>
                                {user.isMuted && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-orange-500 font-bold">
                                      {Math.ceil((user.muteExpires! - Date.now()) / 60000)}dk kaldı
                                    </span>
                                    <button
                                      onClick={() => handleUnmuteUser(user.id)}
                                      className="text-[10px] font-bold px-3 py-1 bg-orange-500 text-white rounded hover:opacity-90 transition-all"
                                    >
                                      Kaldır
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <input
                                    type="number"
                                    placeholder="gün"
                                    value={banInputs[user.id] || ''}
                                    onChange={(e) => setBanInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                                    className="w-16 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded px-2 py-1 text-[10px] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--theme-secondary-text)] pointer-events-none">gün</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const days = parseInt(banInputs[user.id]);
                                    if (days > 0) handleBanUser(user.id, days * 1440);
                                  }}
                                  className="text-[10px] font-bold px-3 py-1 bg-red-500 text-white rounded hover:opacity-90 transition-all"
                                >
                                  Yasakla
                                </button>
                                {user.isVoiceBanned && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-red-500 font-bold">
                                      {Math.ceil((user.banExpires! - Date.now()) / (1000 * 60 * 60 * 24))}g kaldı
                                    </span>
                                    <button
                                      onClick={() => handleUnbanUser(user.id)}
                                      className="text-[10px] font-bold px-3 py-1 bg-red-500 text-white rounded hover:opacity-90 transition-all"
                                    >
                                      Kaldır
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 border-l border-[var(--theme-border)] pl-4">
                              {currentUser.isPrimaryAdmin && (
                                <button
                                  onClick={() => handleToggleAdmin(user.id)}
                                  className={`flex items-center justify-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded transition-all ${
                                    user.isAdmin
                                      ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500 hover:text-white'
                                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                                  }`}
                                >
                                  <ShieldCheck size={12} />
                                  {user.isAdmin ? 'Admin Yetkisi Al' : 'Admin Yetkisi Ver'}
                                </button>
                              )}
                              {/* Şifre sıfırlama butonu */}
                              {keyResetConfirm === user.id ? (
                                <div className="flex flex-col gap-1.5 p-2 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-lg">
                                  <p className="text-[9px] text-[var(--theme-secondary-text)] leading-tight">
                                    <span className="font-bold text-[var(--theme-text)]">{user.firstName}</span> kullanıcının şifresini sıfırlamak istediğinizden emin misiniz?
                                  </p>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={async () => {
                                        await handleAdminManualReset(user.id, user.name, user.email || '');
                                        setKeyResetConfirm(null);
                                      }}
                                      className="flex-1 flex items-center justify-center gap-1 py-1 text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded hover:bg-emerald-500 hover:text-white transition-all"
                                    >
                                      <Check size={10} />
                                      Evet
                                    </button>
                                    <button
                                      onClick={() => setKeyResetConfirm(null)}
                                      className="flex-1 flex items-center justify-center gap-1 py-1 text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 rounded hover:bg-red-500 hover:text-white transition-all"
                                    >
                                      <X size={10} />
                                      İptal
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setKeyResetConfirm(user.id)}
                                  className={`flex items-center justify-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded transition-all ${
                                    passwordResetRequests.some(r => r.userId === user.id)
                                      ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white'
                                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                                  }`}
                                  title={passwordResetRequests.some(r => r.userId === user.id) ? 'Şifre sıfırlama isteği var' : 'Şifre sıfırla'}
                                >
                                  <KeyRound size={12} />
                                  Şifre Sıfırla
                                </button>
                              )}
                              {(!user.isPrimaryAdmin && (currentUser.isPrimaryAdmin || !user.isAdmin)) && (
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="flex items-center justify-center gap-1.5 text-[10px] font-bold px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded hover:bg-red-500 hover:text-white transition-all"
                                >
                                  <Trash2 size={12} />
                                  Kullanıcıyı Sil
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
    </>
  );
}
