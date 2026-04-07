import React, { useRef, useState } from 'react';
import { User as UserIcon, Eye, EyeOff, Camera } from 'lucide-react';
import { AccordionSection, inputCls, labelCls, cardCls } from '../shared';
import { toTitleCaseTr } from '../../../lib/formatName';
import { saveProfile, updateUserEmail, updateUserPassword, uploadAvatar } from '../../../lib/supabase';
import { useUser } from '../../../contexts/UserContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useAppState } from '../../../contexts/AppStateContext';
import AvatarCropModal from '../../AvatarCropModal';
import type { User } from '../../../types';

export default function AccountSection() {
  const { currentUser, setCurrentUser, allUsers, setAllUsers } = useUser();
  const { avatarBorderColor, setAvatarBorderColor } = useSettings();
  const { appVersion: currentAppVersion, broadcastModeration } = useAppState();

  // Local state
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

  // Initialize form from currentUser
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

  // Helpers
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

  const toTitleCase = toTitleCaseTr;

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

  return (
    <>
      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
      <AccordionSection icon={<UserIcon size={12} />} title="Hesap">
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
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
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
              onClick={handleUpdateProfile}
              className={`shrink-0 px-6 py-2.5 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-[var(--theme-accent)]/20 hover:opacity-90 hover:shadow-lg active:scale-[0.97] ${pressingProfile ? 'opacity-90 scale-[0.97]' : ''}`}
            >
              Kaydet
            </button>
          </div>
        </div>
      </AccordionSection>
    </>
  );
}
