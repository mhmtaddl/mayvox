import React, { useRef, useState } from 'react';
import { User as UserIcon, Eye, EyeOff, Camera, Shield, ClipboardList } from 'lucide-react';
import { CardSection, inputCls, labelCls } from '../shared';
import { toTitleCaseTr, normalizeNameInput, NAME_INPUT_MAX_LENGTH } from '../../../lib/formatName';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../../../lib/avatarFrame';
import { saveProfile, updateUserEmail, updateUserPassword, uploadAvatar } from '../../../lib/supabase';
import { useUser } from '../../../contexts/UserContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useAppState } from '../../../contexts/AppStateContext';
import AvatarCropModal from '../../AvatarCropModal';
import type { User } from '../../../types';

// ── Shared state hook ──
function useAccountState() {
  const { currentUser, setCurrentUser, allUsers, setAllUsers } = useUser();
  const { avatarBorderColor, setAvatarBorderColor } = useSettings();
  const { appVersion: currentAppVersion, broadcastModeration } = useAppState();

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
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(
    currentUser.avatar?.startsWith('http') ? currentUser.avatar : null
  );
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pressingProfile, setPressingProfile] = useState(false);

  React.useEffect(() => {
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

  const hasProfileChanges =
    settingsDisplayName !== (currentUser.name || '') ||
    settingsUsername !== (currentUser.email || currentUser.name || '') ||
    settingsFirstName !== (currentUser.firstName || '') ||
    settingsLastName !== (currentUser.lastName || '') ||
    settingsAge !== (currentUser.age?.toString() || '');

  const getAvatarText = (user: Partial<User> & { firstName?: string; lastName?: string; age?: number }) => {
    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
    return `${initials}${user.age || ''}`;
  };

  const toTitleCase = toTitleCaseTr;

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

  const triggerSaveProfile = () => {
    setPressingProfile(true);
    setTimeout(() => setPressingProfile(false), 150);
    handleUpdateProfile();
  };

  return {
    currentUser, avatarBorderColor, setAvatarBorderColor, currentAppVersion,
    settingsUsername, setSettingsUsername, settingsDisplayName, setSettingsDisplayName,
    settingsFirstName, setSettingsFirstName, settingsLastName, setSettingsLastName,
    settingsAge, setSettingsAge, settingsPassword, setSettingsPassword,
    settingsPasswordRepeat, setSettingsPasswordRepeat, settingsPasswordError,
    updateSuccessMessage, showSettingsPassword, setShowSettingsPassword,
    avatarUploading, customAvatarUrl, cropSrc, setCropSrc, fileInputRef,
    pressingProfile, isPasswordValid, hasProfileChanges, getAvatarText, toTitleCase,
    handleUpdateProfile, handleAvatarFileChange, handleCropConfirm, triggerSaveProfile,
  };
}

// ── Context to share state between cards ──
const AccountCtx = React.createContext<ReturnType<typeof useAccountState> | null>(null);
const useAccount = () => {
  const ctx = React.useContext(AccountCtx);
  if (!ctx) throw new Error('useAccount must be inside AccountProvider');
  return ctx;
};

// ── PROFILE CARD ──
function ProfileCard() {
  const ctx = useAccount();
  const {
    settingsFirstName, setSettingsFirstName, settingsLastName, setSettingsLastName,
    settingsAge, avatarBorderColor, setAvatarBorderColor,
    customAvatarUrl, avatarUploading, fileInputRef, getAvatarText, toTitleCase,
    handleAvatarFileChange, currentUser,
  } = ctx;
  const frameTier = getFrameTier(currentUser.userLevel, { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin });
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState(avatarBorderColor.startsWith('#') ? avatarBorderColor : '');
  const activeColor = previewColor ?? avatarBorderColor;

  const TIER_LABEL: Record<string, string> = { standard: 'Standart', vip: 'VIP', elite: 'Elit' };
  const PALETTE_BASIC = [
    { hex: '#6B7280', name: 'Gri' },
    { hex: '#9CA3AF', name: 'Gümüş' },
    { hex: '#3B82F6', name: 'Mavi' },
    { hex: '#06B6D4', name: 'Cyan' },
    { hex: '#10B981', name: 'Yeşil' },
    { hex: '#84CC16', name: 'Lime' },
  ];
  const PALETTE_VIVID = [
    { hex: '#EF4444', name: 'Kırmızı' },
    { hex: '#F97316', name: 'Turuncu' },
    { hex: '#F59E0B', name: 'Sarı' },
    { hex: '#EC4899', name: 'Pembe' },
    { hex: '#8B5CF6', name: 'Mor' },
    { hex: '#A855F7', name: 'Lavanta' },
  ];

  const FrameDot = ({ hex, name }: { hex: string; name: string }) => {
    const isSel = avatarBorderColor === hex;
    return (
      <button
        onClick={() => { setAvatarBorderColor(hex); setPreviewColor(null); setCustomHex(hex); }}
        onMouseEnter={() => setPreviewColor(hex)}
        onMouseLeave={() => setPreviewColor(null)}
        title={name}
        style={{
          width: 28, height: 28, borderRadius: '22%', backgroundColor: hex, border: 'none',
          boxShadow: isSel ? `0 0 0 2px #0E0F12, 0 0 0 3.5px ${hex}, 0 0 16px ${hex}60` : `0 0 0 1px ${hex}40`,
          transform: isSel ? 'scale(1.22)' : 'scale(1)',
          transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          cursor: 'pointer', outline: 'none', flexShrink: 0,
        }}
      />
    );
  };

  const NoneIcon = () => (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="4" x2="20" y2="20" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  return (
    <CardSection icon={<UserIcon size={12} />} title="">
      {/* ── Avatar + Ad Soyad + Çerçeve — tek akış ── */}
      <div className="flex items-center gap-3 mb-2">
        {/* Avatar — sol */}
        <div className="flex flex-col items-center shrink-0">
          <div
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              className={activeColor ? getFrameClassName(frameTier) : ''}
              style={activeColor ? { ...getFrameStyle(activeColor, frameTier), borderRadius: '22%' } : undefined}
            >
              <div className="avatar-squircle bg-[var(--theme-accent)]/20 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-base" style={{ width: 56, height: 56 }}>
                {customAvatarUrl ? (
                  <img src={customAvatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  getAvatarText({ firstName: settingsFirstName, lastName: settingsLastName, age: parseInt(settingsAge) || 0 })
                )}
              </div>
            </div>
            <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {avatarUploading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={16} className="text-white" />
              }
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
          </div>
          <span className="mt-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--theme-accent)]/60">
            {TIER_LABEL[frameTier]}
          </span>
        </div>

        {/* Ad + Soyad + Çerçeve — sağ taraf, genişler */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="space-y-1.5">
            <div className="space-y-1">
              <label className={labelCls}>Ad</label>
              <input type="text" maxLength={NAME_INPUT_MAX_LENGTH} value={settingsFirstName} onChange={e => setSettingsFirstName(normalizeNameInput(e.target.value))} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Soyad</label>
              <input type="text" maxLength={NAME_INPUT_MAX_LENGTH} value={settingsLastName} onChange={e => setSettingsLastName(normalizeNameInput(e.target.value))} className={inputCls} />
            </div>
          </div>

          {/* Çerçeve rengi — input'ların altında, aynı genişlikte */}
          <div>
            <p className="text-[9px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-wider mb-2">Çerçeve</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Yok kutucuğu — çapraz çizgili */}
          <button
            onClick={() => { setAvatarBorderColor(''); setPreviewColor(null); setCustomHex(''); }}
            onMouseEnter={() => setPreviewColor('')}
            onMouseLeave={() => setPreviewColor(null)}
            title="Yok"
            style={{
              width: 28, height: 28, borderRadius: '22%',
              background: 'transparent',
              border: '2px dashed rgba(255,255,255,0.12)',
              boxShadow: !avatarBorderColor ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
              transform: !avatarBorderColor ? 'scale(1.18)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
              cursor: 'pointer', outline: 'none', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <NoneIcon />
          </button>
          {/* Renk paletleri */}
          {[...PALETTE_BASIC, ...PALETTE_VIVID].map(c => <FrameDot key={c.hex} {...c} />)}
          {/* Özel renk seçici */}
          <input
            type="color"
            value={customHex || '#6B7280'}
            onChange={e => { setCustomHex(e.target.value); setAvatarBorderColor(e.target.value); }}
            className="w-7 h-7 rounded-[22%] cursor-pointer border-0 bg-transparent p-0 shrink-0"
            title="Özel renk"
            style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }}
          />
        </div>
          </div>
        </div>
      </div>
    </CardSection>
  );
}

// ── ACCOUNT INFO CARD ──
function AccountInfoCard() {
  const ctx = useAccount();
  const {
    settingsUsername, setSettingsUsername, settingsDisplayName, setSettingsDisplayName,
    settingsAge, setSettingsAge, currentAppVersion,
    updateSuccessMessage, settingsPasswordError, handleUpdateProfile, pressingProfile, hasProfileChanges,
  } = ctx;

  return (
    <CardSection icon={<ClipboardList size={12} />} title="" subtitle={currentAppVersion ? `v${currentAppVersion}` : undefined} className="xl:h-full xl:flex xl:flex-col">
      <div className="space-y-2">
        <div className="space-y-1">
          <label className={labelCls}>Kullanıcı Adı</label>
          <input type="text" value={settingsDisplayName} onChange={e => setSettingsDisplayName(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>E-Posta</label>
          <input type="text" value={settingsUsername} onChange={e => setSettingsUsername(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Yaş</label>
          <input type="number" value={settingsAge} onChange={e => setSettingsAge(e.target.value)} className={`${inputCls} w-24`} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-3 mt-3 md:mt-4 pt-3 border-t border-[var(--theme-border)]">
        <p className={`text-[10px] md:text-[11px] flex-1 leading-relaxed min-w-0 ${
          updateSuccessMessage ? 'text-emerald-500 font-semibold' : settingsPasswordError ? 'text-red-400' : 'text-[var(--theme-secondary-text)]/50'
        }`}>
          {updateSuccessMessage || settingsPasswordError || ''}
        </p>
        <button
          onClick={handleUpdateProfile}
          disabled={!hasProfileChanges}
          className={`shrink-0 w-full md:w-auto px-5 py-2 btn-primary font-bold text-xs active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${pressingProfile ? 'opacity-90 scale-[0.97]' : ''}`}
        >
          Güncelle
        </button>
      </div>
    </CardSection>
  );
}

// ── SECURITY CARD ──
function SecurityCard() {
  const ctx = useAccount();
  const {
    settingsPassword, setSettingsPassword, settingsPasswordRepeat, setSettingsPasswordRepeat,
    showSettingsPassword, setShowSettingsPassword, isPasswordValid, triggerSaveProfile,
  } = ctx;

  return (
    <CardSection icon={<Shield size={12} />} title="" className="xl:h-full xl:flex xl:flex-col">
      <div className="space-y-2">
        <div className="space-y-1">
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
        <div className="space-y-1">
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
      <p className={`text-[10px] mt-3 leading-relaxed ${!isPasswordValid ? 'text-red-400' : 'text-[var(--theme-secondary-text)]/40'}`}>
        En az 6 karakter, büyük+küçük harf ve rakam
      </p>
      <div className="flex justify-end mt-3">
        <button
          onClick={triggerSaveProfile}
          disabled={settingsPassword.length === 0}
          className="px-5 py-2 btn-primary font-bold text-xs active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Şifreyi Değiştir
        </button>
      </div>
    </CardSection>
  );
}

// ── MAIN EXPORT — wraps all 3 cards with shared state ──
export default function AccountSection() {
  const state = useAccountState();

  return (
    <AccountCtx.Provider value={state}>
      {state.cropSrc && (
        <AvatarCropModal
          imageSrc={state.cropSrc}
          onConfirm={state.handleCropConfirm}
          onCancel={() => state.setCropSrc(null)}
        />
      )}
      <div className="flex flex-col gap-3 md:gap-4">
        <ProfileCard />

        {/* Hesap Bilgileri ve Güvenlik — XL'de yan yana, grid stretch ile aynı yükseklik.
            Daha küçük ekranlarda alt alta tek sütun. */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
          <section className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-[var(--theme-accent)]/70"><ClipboardList size={11} strokeWidth={2.2} /></span>
              <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-text)]/85">Hesap Bilgileri</h3>
            </div>
            <div className="flex-1 flex flex-col">
              <AccountInfoCard />
            </div>
          </section>

          <section className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-[var(--theme-accent)]/70"><Shield size={11} strokeWidth={2.2} /></span>
              <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-text)]/85">Güvenlik</h3>
            </div>
            <div className="flex-1 flex flex-col">
              <SecurityCard />
            </div>
          </section>
        </div>
      </div>
    </AccountCtx.Provider>
  );
}
