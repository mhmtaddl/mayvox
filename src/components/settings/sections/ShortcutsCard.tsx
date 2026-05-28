import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useUser } from '../../../contexts/UserContext';
import {
  formatCommandShortcut,
  isReservedShortcut,
  readAppShortcuts,
  resetAppShortcut,
  saveAppShortcut,
  shortcutFromEvent,
  type AppShortcuts,
  type CommandShortcut,
  type OptionalCommandShortcut,
  type ShortcutActionId,
} from '../../../lib/commandShortcut';

const SHORTCUT_ROWS: Array<{ id: ShortcutActionId; title: string; description: string; group: 'Genel' | 'Sesli Sohbet' | 'Navigasyon' | 'Mesajlaşma' }> = [
  { id: 'command-palette', title: 'Komut Paleti', description: 'Kullanıcı, oda, mesaj, sunucu ve ayarları hızlıca bul.', group: 'Genel' },
  { id: 'toggle-mute', title: 'Mikrofon Aç-Kapat', description: 'Mikrofonu hızlıca kapat veya geri aç.', group: 'Sesli Sohbet' },
  { id: 'toggle-deafen', title: 'Hoparlör / Kulaklık Aç-Kapat', description: 'Uygulama sesini hızlıca kapat veya geri aç.', group: 'Sesli Sohbet' },
  { id: 'user-search', title: 'Kullanıcı Ara', description: 'Sağ üstteki kullanıcı aramasına odaklan.', group: 'Genel' },
  { id: 'open-settings', title: 'Ayarları Aç', description: 'Uygulama ayarlarını aç.', group: 'Genel' },
  { id: 'open-shortcuts', title: 'Kısayolları Aç', description: 'Kısayollar sekmesine hızlıca git.', group: 'Genel' },
  { id: 'open-server-settings', title: 'Sunucu Ayarları', description: 'Yetkin varsa aktif sunucunun ayarlarını aç.', group: 'Navigasyon' },
  { id: 'toggle-room', title: 'Son Odaya Katıl / Odadan Ayrıl', description: 'Odadaysan ayrıl, değilsen son odaya geri dön.', group: 'Sesli Sohbet' },
  { id: 'toggle-room-chat-muted', title: 'Aktif Odayı Sessize Al', description: 'Aktif odanın yazılı sohbet sesini kapat veya aç.', group: 'Sesli Sohbet' },
  { id: 'toggle-room-members', title: 'Odadaki Kullanıcıları Göster/Gizle', description: 'Oda içi kullanıcı görünümünü aç veya kapat.', group: 'Sesli Sohbet' },
  { id: 'open-discover', title: 'Topluluk Keşfet Aç', description: 'Topluluk keşfet sayfasına git.', group: 'Navigasyon' },
  { id: 'open-server-home', title: 'Aktif Sunucu Ana Sayfasına Git', description: 'Aktif sunucunun ana sayfasını aç.', group: 'Navigasyon' },
  { id: 'open-admin', title: 'Yönetim Panelini Aç', description: 'Sadece adminlerde yönetim paneline gider.', group: 'Navigasyon' },
  { id: 'previous-server', title: 'Önceki Sunucuya Geç', description: 'Sunucu listesindeki önceki sunucuya geç.', group: 'Navigasyon' },
  { id: 'next-server', title: 'Sonraki Sunucuya Geç', description: 'Sunucu listesindeki sonraki sunucuya geç.', group: 'Navigasyon' },
  { id: 'previous-room', title: 'Önceki Odaya Geç', description: 'Aktif sunucudaki önceki ses odasına geç.', group: 'Navigasyon' },
  { id: 'next-room', title: 'Sonraki Odaya Geç', description: 'Aktif sunucudaki sonraki ses odasına geç.', group: 'Navigasyon' },
  { id: 'open-unread-dm', title: 'Okunmamış İlk DM’ye Git', description: 'Mesaj panelini okunmamış konuşmaya odaklanacak şekilde aç.', group: 'Mesajlaşma' },
  { id: 'close-dm', title: 'Aktif DM’yi Kapat', description: 'Açık mesaj panelini kapat.', group: 'Mesajlaşma' },
];

function shortcutEquals(a: OptionalCommandShortcut, b: CommandShortcut) {
  if (!a) return false;
  return a.ctrl === b.ctrl
    && a.alt === b.alt
    && a.shift === b.shift
    && a.meta === b.meta
    && a.key.toLocaleLowerCase('tr') === b.key.toLocaleLowerCase('tr');
}

export default function ShortcutsCard() {
  const { currentUser } = useUser();
  const [shortcuts, setShortcuts] = useState<AppShortcuts>(() => readAppShortcuts());
  const [recording, setRecording] = useState<ShortcutActionId | null>(null);
  const [error, setError] = useState('');
  const [errorTarget, setErrorTarget] = useState<ShortcutActionId | null>(null);
  const canUseAdminShortcuts = !!currentUser.isAdmin || !!currentUser.isPrimaryAdmin;
  const visibleRows = SHORTCUT_ROWS.filter(row => row.id !== 'open-admin' || canUseAdminShortcuts);
  const shortcutGroups: Array<typeof SHORTCUT_ROWS[number]['group']> = ['Genel', 'Sesli Sohbet', 'Navigasyon', 'Mesajlaşma'];
  const groupStyles: Record<typeof SHORTCUT_ROWS[number]['group'], { border: string; background: string; text: string }> = {
    Genel: { border: 'rgba(96, 165, 250, 0.22)', background: 'rgba(96, 165, 250, 0.045)', text: 'rgb(147, 197, 253)' },
    'Sesli Sohbet': { border: 'rgba(52, 211, 153, 0.22)', background: 'rgba(52, 211, 153, 0.045)', text: 'rgb(110, 231, 183)' },
    Navigasyon: { border: 'rgba(251, 191, 36, 0.22)', background: 'rgba(251, 191, 36, 0.045)', text: 'rgb(252, 211, 77)' },
    'Mesajlaşma': { border: 'rgba(244, 114, 182, 0.22)', background: 'rgba(244, 114, 182, 0.045)', text: 'rgb(249, 168, 212)' },
  };

  const shortcutWarning = (shortcut: AppShortcuts[ShortcutActionId]) => {
    if (!shortcut) return '';
    const key = shortcut.key.toLocaleLowerCase('tr');
    const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
    if (ctrlOrMeta && ['a', 'c', 'f', 'n', 'p', 's', 'v', 'x', 'y', 'z'].includes(key)) {
      return 'Windows/tarayıcı kısayoluyla çakışabilir.';
    }
    if (shortcut.alt && key === 'f4') return 'Windows kapatma kısayoluyla çakışabilir.';
    return '';
  };

  useEffect(() => {
    const onChanged = () => setShortcuts(readAppShortcuts());
    window.addEventListener('mayvox:app-shortcuts-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      window.removeEventListener('mayvox:app-shortcuts-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        setError('');
        setErrorTarget(null);
        return;
      }
      const next = shortcutFromEvent(event);
      if (!next) {
        setError('Ctrl, Alt, Cmd veya Shift ile birlikte bir tuşa bas.');
        setErrorTarget(recording);
        return;
      }
      if (isReservedShortcut(next)) {
        setError('Bu kısayol sistem/tarayıcı işlemiyle çakışıyor.');
        setErrorTarget(recording);
        return;
      }
      const duplicate = SHORTCUT_ROWS.find(row => row.id !== recording && shortcutEquals(shortcuts[row.id], next));
      if (duplicate) {
        setError(`Bu kombinasyon "${duplicate.title}" için kullanılıyor.`);
        setErrorTarget(recording);
        return;
      }
      saveAppShortcut(recording, next);
      setShortcuts(prev => ({ ...prev, [recording]: next }));
      setRecording(null);
      setError('');
      setErrorTarget(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, shortcuts]);

  return (
    <div data-command-target="shortcuts" className="settings-shortcuts-card settings-account-card surface-card rounded-xl px-4 py-3">
      <div className="space-y-4">
        {shortcutGroups.map(group => {
          const rows = visibleRows.filter(row => row.group === group);
          if (!rows.length) return null;
          const style = groupStyles[group];
          return (
            <div key={group} className="settings-shortcut-group-card rounded-xl border px-3 py-2.5" style={{ borderColor: style.border, background: style.background }}>
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: style.text }}>{group}</p>
              <div className="divide-y divide-[var(--theme-border)]/35">
                {rows.map(row => {
                  const isRecording = recording === row.id;
                  const hasShortcut = !!shortcuts[row.id];
                  const warning = shortcutWarning(shortcuts[row.id]);
                  return (
                    <div key={row.id} className="relative flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-[var(--theme-text)] leading-tight">{row.title}</p>
                        <p className="text-[10px] text-[var(--theme-secondary-text)]/70 mt-0.5 leading-snug">{row.description}</p>
                        {warning && <p className="mt-1 text-[9.5px] font-semibold text-amber-300/85">{warning}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = resetAppShortcut(row.id);
                          setShortcuts(prev => ({ ...prev, [row.id]: next }));
                          setRecording(null);
                          setError('');
                          setErrorTarget(null);
                        }}
                        className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/68 bg-transparent"
                        title="Varsayılana dön"
                        aria-label={`${row.title} varsayılana dön`}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRecording(row.id); setError(''); setErrorTarget(null); }}
                        className={`min-w-[92px] h-8 shrink-0 rounded-lg border px-2.5 text-[10.5px] font-bold transition-colors ${
                          isRecording
                            ? 'border-[rgba(var(--theme-accent-rgb),0.42)] bg-[rgba(var(--theme-accent-rgb),0.12)] text-[var(--theme-accent)]'
                            : hasShortcut
                              ? 'border-[rgba(var(--theme-accent-rgb),0.32)] bg-[rgba(var(--theme-accent-rgb),0.075)] text-[var(--theme-text)]/90'
                              : 'border-dashed border-[var(--theme-border)]/55 bg-transparent text-[var(--theme-secondary-text)]/62'
                        }`}
                        title="Kısayolu değiştirmek için tıkla"
                      >
                        {isRecording ? 'Tuşa bas...' : formatCommandShortcut(shortcuts[row.id])}
                      </button>
                      {error && errorTarget === row.id && (
                        <div className="absolute right-0 top-[-18px] z-20 rounded-lg border border-red-400/25 bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-200 shadow-[0_10px_22px_rgba(0,0,0,0.20)] backdrop-blur-md">
                          {error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
