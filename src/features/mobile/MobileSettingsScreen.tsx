import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  Gauge,
  Link2,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Volume2,
} from 'lucide-react';
import MobileSettingsRow, { MobileSettingsGroup } from './MobileSettingsRow';

type MobileSettingsSection = 'overview' | 'general' | 'members' | 'roles' | 'invites' | 'automod' | 'audit' | 'insights';

interface MobileSettingsScreenProps {
  activeSection?: MobileSettingsSection;
  onOpenSetting?: (settingId: string) => void;
  onBack?: () => void;
}

const SECTIONS: Array<{ key: MobileSettingsSection; label: string }> = [
  { key: 'overview', label: 'Ozet' },
  { key: 'general', label: 'Genel' },
  { key: 'members', label: 'Uyeler' },
  { key: 'roles', label: 'Roller' },
  { key: 'invites', label: 'Davetler' },
  { key: 'automod', label: 'Oto-Mod' },
  { key: 'audit', label: 'Denetim' },
  { key: 'insights', label: 'Icgoruler' },
];

export default function MobileSettingsScreen({ activeSection, onOpenSetting }: MobileSettingsScreenProps) {
  const [localSection, setLocalSection] = useState<MobileSettingsSection>(activeSection ?? 'overview');
  const selected = activeSection ?? localSection;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar">
      <div className="w-full">
      <section className="mb-1.5 px-1 py-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/45">Sunucu ayarlari</p>
        <h2 className="mt-0.5 text-[17px] font-black text-[var(--theme-text)]">Yonetim merkezi</h2>
      </section>

      <div className="mb-1.5 overflow-x-auto custom-scrollbar">
        <div className="flex min-w-max gap-1">
          {SECTIONS.map(section => (
            <button
              key={section.key}
              type="button"
              onClick={() => setLocalSection(section.key)}
              className={`relative h-9 px-2.5 text-[11.5px] font-bold active:scale-[0.98] ${
                selected === section.key ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/68'
              }`}
              aria-pressed={selected === section.key}
            >
              {section.label}
              {selected === section.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--theme-accent)]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-x-2">
        <MobileSettingsGroup title="Sunucu">
          <MobileSettingsRow title="Ozet" subtitle="Kapasite, plan ve genel durum" icon={<Gauge size={16} />} onClick={() => onOpenSetting?.('server.overview')} />
          <MobileSettingsRow title="Genel" subtitle="Ad, motto, gorunum ve temel bilgiler" icon={<Settings size={16} />} onClick={() => onOpenSetting?.('server.general')} />
          <MobileSettingsRow title="Icgoruler" subtitle="Aktivite, buyume ve kullanim sinyalleri" icon={<BarChart3 size={16} />} onClick={() => onOpenSetting?.('server.insights')} />
        </MobileSettingsGroup>

        <MobileSettingsGroup title="Uyeler ve roller">
          <MobileSettingsRow title="Uyeler" subtitle="Kullanici yonetimi, yasaklar ve durumlar" icon={<Users size={16} />} onClick={() => onOpenSetting?.('server.members')} />
          <MobileSettingsRow title="Roller" subtitle="Yetkiler, rol hiyerarsisi ve erisimler" icon={<Shield size={16} />} onClick={() => onOpenSetting?.('server.roles')} />
          <MobileSettingsRow title="Davetler" subtitle="Davet linkleri ve basvurular" icon={<Link2 size={16} />} onClick={() => onOpenSetting?.('server.invites')} />
        </MobileSettingsGroup>

        <MobileSettingsGroup title="Moderasyon">
          <MobileSettingsRow title="Oto-Mod" subtitle="Kural ve otomatik aksiyonlar" icon={<ShieldCheck size={16} />} onClick={() => onOpenSetting?.('server.automod')} />
          <MobileSettingsRow title="Denetim" subtitle="Kayitlar, gecmis ve islem izleri" icon={<ScrollText size={16} />} onClick={() => onOpenSetting?.('server.audit')} />
          <MobileSettingsRow title="Ses ve bildirim" subtitle="Sunucu sesleri ve uyarilar" icon={<Volume2 size={16} />} onClick={() => onOpenSetting?.('server.notifications')} />
        </MobileSettingsGroup>

        <MobileSettingsGroup title="Mobil kisa yollar">
          <MobileSettingsRow title="Sunucu panelini ac" subtitle="Desktop ayarlarina baglanacak alan" icon={<SlidersHorizontal size={16} />} badge="Preview" onClick={() => onOpenSetting?.(`server.${selected}`)} />
          <MobileSettingsRow title="Bildirimler" subtitle="Davet, basvuru ve sistem uyarilari" icon={<Bell size={16} />} onClick={() => onOpenSetting?.('server.alerts')} />
        </MobileSettingsGroup>
      </div>
      </div>
    </div>
  );
}
