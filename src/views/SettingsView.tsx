import React, { useState, useEffect, useMemo } from 'react';
import {
  Mic,
  Settings,
  Trash2,
  LogOut,
  Headphones,
  PlusCircle,
  Check,
  Clock,
  User as UserIcon,
  X,
  Shield,
  ShieldOff,
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';
import { THEMES, CHANNELS } from '../constants';
import { saveProfile, updateUserEmail, updateUserPassword } from '../lib/supabase';
import { useAppState } from '../contexts/AppStateContext';
import { useAudio } from '../contexts/AudioContext';
import { useUser } from '../contexts/UserContext';
import { useChannel } from '../contexts/ChannelContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';

export default function SettingsView() {
  const {
    currentUser,
    setCurrentUser,
    allUsers,
    setAllUsers,
    getStatusColor,
    getEffectiveStatus,
  } = useUser();

  const {
    channels,
    setActiveChannel,
  } = useChannel();

  const {
    isStatusMenuOpen,
    setIsStatusMenuOpen,
    statusTimerInput,
    setStatusTimerInput,
  } = useUI();

  const {
    currentTheme,
    setCurrentTheme,
    isLowDataMode,
    setIsLowDataMode,
    isNoiseSuppressionEnabled,
    setIsNoiseSuppressionEnabled,
    noiseThreshold,
    setNoiseThreshold,
    pttKey,
  } = useSettings();

  const {
    handleSetStatus,
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
    handleGenerateCode,
    handleLogout,
    handleCopyCode,
    generatedCode,
    timeLeft,
    formatTime,
    setView,
  } = useAppState();

  const {
    connectionLevel,
    showOutputSettings,
    setShowOutputSettings,
    showInputSettings,
    setShowInputSettings,
  } = useAudio();

  // Memoized admin user list (admin panelinde her render'da filter çalışmasın)
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
    const updatedUser = {
      ...currentUser,
      name: settingsDisplayName,
      email: settingsUsername,
      firstName: settingsFirstName,
      lastName: settingsLastName,
      age: ageNum,
      avatar: avatarText,
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
        setSettingsPasswordError('E-posta güncellenemedi: ' + error.message);
        return;
      }
    }

    if (settingsPassword.length > 0) {
      const { error } = await updateUserPassword(settingsPassword);
      if (error) {
        setSettingsPasswordError('Şifre güncellenemedi: ' + error.message);
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

  // renderConnectionQuality (inline copy)
  const renderConnectionQuality = () => {
    const getColor = (level: number) => {
      if (level >= 4) return 'bg-emerald-500';
      if (level === 3) return 'bg-yellow-500';
      if (level === 2) return 'bg-orange-500';
      if (level === 1) return 'bg-red-500';
      return 'text-red-500';
    };

    if (connectionLevel === 0) {
      return (
        <div className="flex items-center justify-center">
          <X size={14} className="text-red-500" />
        </div>
      );
    }

    return (
      <motion.div
        animate={connectionLevel <= 2 ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
        className="flex items-center justify-center"
      >
        <div className="flex items-end gap-0.5 h-3">
          {[1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              animate={connectionLevel <= 1 ? { height: [`${i * 25}%`, `${i * 15}%`, `${i * 25}%`] } : {}}
              transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
              className={`w-1 rounded-full transition-all ${i <= connectionLevel ? getColor(connectionLevel) : 'bg-[var(--theme-border)]'}`}
              style={{ height: `${i * 25}%` }}
            />
          ))}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between pl-6 pr-4 lg:pr-0 h-16 bg-[var(--theme-bg)] z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[var(--theme-accent)] p-1.5 rounded-lg flex items-center justify-center">
            <Mic className="text-white" size={20} />
          </div>
          <h1 className="text-lg font-bold tracking-tight">CAYLAKLAR İLE SOHBET</h1>
        </div>

        <div className="flex items-center h-full">
          <div className="h-full flex items-center lg:w-64 lg:px-4 gap-3 group relative cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsStatusMenuOpen(!isStatusMenuOpen); }}>
            <div className="text-right hidden sm:flex flex-col items-end flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none truncate w-full">{currentUser.firstName} {currentUser.lastName} ({currentUser.age})</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${getStatusColor(getEffectiveStatus())}`}>{getEffectiveStatus()}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-500/20 border-2 border-blue-600 overflow-hidden relative flex items-center justify-center text-white font-bold text-xs shrink-0">
              {currentUser.avatar}
            </div>

            {/* Status Menu */}
            <AnimatePresence>
              {isStatusMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-64 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-2 z-[100] backdrop-blur-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleSetStatus('Aktif')}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                  >
                    Aktif
                  </button>
                  <button
                    onClick={() => handleSetStatus('Telefonda')}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                  >
                    Telefonda
                  </button>
                  <button
                    onClick={() => handleSetStatus('Hemen Geleceğim')}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                  >
                    Hemen Geleceğim
                  </button>
                  <div className="border-t border-[var(--theme-border)] my-1"></div>
                  <div className="px-3 py-2">
                    <label className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest block mb-2">Süre Sonra Geleceğim (Dk)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={2}
                        placeholder="99"
                        className="flex-1 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all"
                        value={statusTimerInput}
                        onChange={(e) => setStatusTimerInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && statusTimerInput) {
                            handleSetStatus(`${statusTimerInput}:00 Sonra Geleceğim`, parseInt(statusTimerInput));
                            setStatusTimerInput('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (statusTimerInput) {
                            handleSetStatus(`${statusTimerInput}:00 Sonra Geleceğim`, parseInt(statusTimerInput));
                            setStatusTimerInput('');
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-500 transition-all"
                      >
                        Kur
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Same as chat for consistency) */}
        <aside className="w-72 bg-[var(--theme-sidebar)]/30 flex flex-col">
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 text-[var(--theme-secondary-text)] font-bold mb-6">
              <Volume2 size={16} />
              <span className="uppercase text-xs tracking-widest">Ses Kanalları</span>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
              {CHANNELS.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => {
                    setActiveChannel(channel.id);
                    setView('chat');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-all"
                >
                  <Volume2 size={18} />
                  <span className="text-sm font-medium">{channel.name}</span>
                </button>
              ))}
            </nav>

            <div className="mt-auto pt-6">
              <button className="w-full flex items-center justify-center gap-2 bg-[var(--theme-sidebar)] text-[var(--theme-text)] hover:bg-[var(--theme-accent)] transition-all py-3 rounded-xl font-bold text-sm">
                <PlusCircle size={18} />
                Oda Oluştur
              </button>
            </div>
          </div>
        </aside>

        {/* Settings Content */}
        <main className="flex-1 flex flex-col bg-[var(--theme-surface)] overflow-y-auto custom-scrollbar">
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
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateProfile(); }}
                        className="w-full bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--theme-accent)] outline-none transition-all text-[var(--theme-text)]"
                      />
                      <button
                        type="button"
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
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateProfile(); }}
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
                    onClick={handleUpdateProfile}
                    className="px-6 py-2.5 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-black/20"
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
                                  <div className="h-8 w-8 rounded-full bg-[var(--theme-accent)]/20 flex items-center justify-center text-[var(--theme-text)] font-bold text-xs">
                                    {user.avatar}
                                  </div>
                                  <div>
                                    <div className="text-sm font-bold text-[var(--theme-text)]">{user.firstName} {user.lastName}</div>
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
        </main>

        {/* Right Sidebar */}
        <aside className="w-64 bg-[var(--theme-sidebar)]/30 flex flex-col hidden lg:flex">
          <div className="p-6 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text)]">Kullanıcılar</h3>
            <span className="text-[10px] bg-[var(--theme-sidebar)] px-2 py-0.5 rounded-full text-[var(--theme-text)] font-bold">{allUsers.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {allUsers.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg opacity-80">
                <div className="h-8 w-8 rounded-full bg-[var(--theme-accent)]/20 flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]">
                  {user.avatar}
                </div>
                <span className="text-sm font-medium text-[var(--theme-text)]">{user.firstName} {user.lastName} ({user.age})</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="h-16 bg-[var(--theme-bg)] flex items-center relative">
        <div className="w-72 px-4 flex gap-2 h-full items-center">
          <button className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg text-white font-bold text-[11px] shadow-lg" style={{ backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 14px rgba(var(--theme-accent-rgb),0.35)' }}>
            <Headphones size={14} />
            Hoparlör
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg text-white font-bold text-[11px] shadow-lg" style={{ backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 14px rgba(var(--theme-accent-rgb),0.35)' }}>
            <Mic size={14} />
            Mikrofon
          </button>
        </div>

        {/* Middle Section - PTT Indicator */}
        <div className="flex-1 h-full flex items-center justify-center px-4">
          <div className="flex items-center gap-4 bg-[var(--theme-surface)]/80 px-4 py-2 rounded-xl border border-[var(--theme-border)] shadow-sm">
            <div className="flex items-center gap-2 text-[var(--theme-text)] font-bold text-[10px] uppercase tracking-widest shrink-0">
              <button
                onClick={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)}
                className={`p-1 rounded-md transition-all ${
                  isNoiseSuppressionEnabled
                    ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
                    : 'bg-[var(--theme-border)] text-[var(--theme-secondary-text)]'
                }`}
                title={isNoiseSuppressionEnabled ? 'Gürültü Susturma: Açık' : 'Gürültü Susturma: Kapalı'}
              >
                {isNoiseSuppressionEnabled ? <Shield size={12} /> : <ShieldOff size={12} />}
              </button>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 h-2.5">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: ['30%', '100%', '30%'] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                      className="w-0.5 bg-[var(--theme-accent)] rounded-full"
                    />
                  ))}
                </div>
                Bas-Konuş
              </div>
            </div>
            <div className="flex items-end gap-0.5 h-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 bg-[var(--theme-border)] rounded-full"
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="px-2 py-0.5 rounded text-[10px] font-black bg-[var(--theme-border)] text-[var(--theme-secondary-text)]">
                {pttKey}
              </button>
            </div>
          </div>
        </div>

        <div className="w-64 px-4 flex items-center justify-evenly h-full">
          {renderConnectionQuality()}
          <button
            onClick={() => setView('chat')}
            className="flex items-center gap-1.5 text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-all font-bold text-[10px] uppercase tracking-widest group"
          >
            <Settings size={14} className="group-hover:rotate-90 transition-transform duration-300" />
            Ayarlar
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-[var(--theme-secondary-text)] hover:text-red-500 transition-all font-bold text-[10px] uppercase tracking-widest group"
          >
            <LogOut size={14} className="group-hover:scale-110 transition-transform" />
            Çıkış
          </button>
        </div>
      </footer>
    </div>
  );
}
