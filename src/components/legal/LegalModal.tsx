import React from 'react';
import { Database, FileText, ShieldCheck, X } from 'lucide-react';
import Modal from '../Modal';

export type LegalModalKind = 'kvkk' | 'storage' | 'terms';

type LegalSection = {
  group: string;
  title: string;
  body: string;
  highlight?: boolean;
};

const LEGAL_CONTENT: Record<LegalModalKind, {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  sections: LegalSection[];
}> = {
  kvkk: {
    title: 'KVKK Aydınlatma Metni',
    subtitle: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metnidir.',
    icon: <ShieldCheck size={17} strokeWidth={1.9} />,
    sections: [
      {
        group: 'Kimlik ve kapsam',
        title: 'Veri sorumlusu ve iletişim',
        body: 'Mayvox hizmeti kapsamında kişisel verileriniz Mehmet Adil (Mayvox geliştiricisi) tarafından veri sorumlusu sıfatıyla işlenir. KVKK başvuruları ve veri talepleri için support@mayvox.com adresinden bize ulaşabilirsiniz.',
      },
      {
        group: 'İşlenen veriler',
        title: 'Veri kategorileri',
        body: 'E-posta adresi, kullanıcı adı, profil bilgileri, IP adresi, cihaz/işletim sistemi bilgisi, uygulama sürümü, oturum logları, güvenlik logları, sunucu/kanal aktivitesi, bağlantı zamanı ve işlem kayıtları işlenebilir.',
      },
      {
        group: 'İşlenen veriler',
        title: 'Ses verisi',
        body: 'Mayvox sesli iletişimi kayıt altına almaz. Ses yalnızca gerçek zamanlı iletilir; kalıcı kayıt, dinleme veya içerik analizi amacıyla saklanmaz.',
      },
      {
        group: 'Amaç ve hukuki sebep',
        title: 'İşleme amaçları',
        body: 'Verileriniz hesap yönetimi, iletişimin sağlanması, güvenlik, kötüye kullanımın önlenmesi, destek süreçleri, hata analizi ve hizmetin sürdürülebilirliği amaçlarıyla işlenir.',
      },
      {
        group: 'Amaç ve hukuki sebep',
        title: 'Hukuki sebepler',
        body: 'Kişisel verileriniz KVKK madde 5/2 kapsamında sözleşmenin kurulması veya ifası, hukuki yükümlülük, meşru menfaat ve açık rıza gereken hallerde açık rıza hukuki sebeplerine dayanılarak işlenir.',
      },
      {
        group: 'Aktarım ve saklama',
        title: 'Üçüncü taraf hizmet sağlayıcılar',
        body: 'Kimlik doğrulama ve veritabanı için Mayvox altyapısı, gerçek zamanlı ses altyapısı için LiveKit, e-posta bildirimleri için Resend ve barındırma altyapısı için Hetzner kullanılabilir.',
      },
      {
        group: 'Aktarım ve saklama',
        title: 'Yurt dışı aktarım',
        body: 'Veriler Almanya ve Avrupa Birliği veri merkezlerinde bulunan hizmet sağlayıcılar aracılığıyla işlenebilir. Yurt dışı aktarım süreçleri KVKK madde 9 ve ilgili mevzuat dikkate alınarak yürütülür.',
      },
      {
        group: 'Aktarım ve saklama',
        title: 'Saklama süreleri',
        body: 'Hesap verileri hesap silinene kadar saklanır. Log kayıtları maksimum 30 gün tutulur. Erken erişim ve başvuru verileri maksimum 6 ay saklanır. Saklama amacı sona erdiğinde veriler silinir, yok edilir veya anonim hale getirilir.',
      },
      {
        group: 'Haklar ve başvuru',
        title: 'KVKK madde 11 haklarınız',
        body: 'Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, işleme amacını öğrenme, aktarım yapılan kişileri bilme, eksik veya yanlış verilerin düzeltilmesini isteme, silme/yok etme talep etme, bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, otomatik sistemler sonucu aleyhinize çıkan sonuca itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.',
      },
      {
        group: 'Haklar ve başvuru',
        title: 'KVKK başvuru yöntemi',
        body: 'KVKK kapsamındaki taleplerinizi support@mayvox.com adresine "KVKK Başvurusu" konu başlığıyla yazılı olarak iletebilirsiniz. Başvurular en kısa sürede ve en geç 30 gün içinde yanıtlanır.',
        highlight: true,
      },
    ],
  },
  storage: {
    title: 'Yerel Depolama ve Çerez Politikası',
    subtitle: 'Desktop uygulamada kullanılan zorunlu kayıtlar ve tercihler.',
    icon: <Database size={17} strokeWidth={1.9} />,
    sections: [
      {
        group: 'Kapsam',
        title: 'Yerel depolama kullanımı',
        body: 'Mayvox desktop uygulaması; localStorage, Electron depolama alanları, güvenli oturum kayıtları ve uygulama tercihlerini hizmetin doğru çalışması için kullanabilir.',
      },
      {
        group: 'Kayıt türleri',
        title: 'Zorunlu kayıtlar',
        body: 'Oturumun sürdürülebilmesi, kimlik doğrulama, güvenlik, hata önleme, güncelleme kontrolü ve temel uygulama işlevleri için zorunlu kayıtlar tutulabilir.',
      },
      {
        group: 'Kayıt türleri',
        title: 'Tercih kayıtları',
        body: 'Tema, ses, mikrofon, bildirim, overlay, son görülme ve benzeri uygulama tercihleri cihazınızda saklanabilir. Bu kayıtlar deneyimi kişiselleştirmek için kullanılır.',
      },
      {
        group: 'Analitik',
        title: 'Analitik ve takip',
        body: 'Mayvox desktop uygulamasında zorunlu olmayan analitik veya takip mekanizması şu anda aktif değildir. Zorunlu olmayan takip veya analitik kullanılmaya başlanırsa açık rıza alınacaktır.',
        highlight: true,
      },
      {
        group: 'Kontrol',
        title: 'Kullanıcı kontrolü',
        body: 'Uygulama tercihlerini ayarlardan değiştirebilir, oturumu kapatarak veya uygulama verilerini temizleyerek yerel kayıtları sıfırlayabilirsiniz. Bazı zorunlu kayıtlar olmadan uygulama düzgün çalışmayabilir.',
      },
    ],
  },
  terms: {
    title: 'Kullanım Şartları',
    subtitle: 'Mayvox desktop uygulamasının kullanım kuralları.',
    icon: <FileText size={17} strokeWidth={1.9} />,
    sections: [
      {
        group: 'Hizmet',
        title: 'Hizmet kapsamı',
        body: 'Mayvox; topluluklar ve ekipler için sesli iletişim, kanal/sunucu yönetimi, mesajlaşma ve ilgili destek/güncelleme hizmetleri sunan bir yazılım hizmetidir.',
      },
      {
        group: 'Hesap',
        title: 'Hesap ve güvenlik',
        body: 'Hesap bilgilerinizin doğru, güncel ve güvenli tutulması sizin sorumluluğunuzdadır. Hesabınız altında gerçekleşen işlemlerden siz sorumlusunuz.',
      },
      {
        group: 'Hesap',
        title: 'Yaş sınırı',
        body: 'Mayvox hizmeti 13 yaş altı kullanıcılar için uygun değildir. Hizmeti kullanarak bu şartı sağladığınızı beyan etmiş olursunuz.',
      },
      {
        group: 'Kullanım',
        title: 'Kabul edilebilir kullanım',
        body: 'Hizmeti hukuka, topluluk güvenliğine ve bu şartlara uygun kullanmalısınız. Taciz, tehdit, nefret söylemi, spam, sahtecilik, telif hakkı ihlali ve kötü amaçlı teknik müdahaleler yasaktır.',
      },
      {
        group: 'Kullanım',
        title: 'Kullanıcı içerik sorumluluğu',
        body: 'Kullanıcılar tarafından oluşturulan içeriklerden tamamen kullanıcı sorumludur. Sunucu, kanal, profil, mesaj ve paylaşımlarınızın hukuka ve bu şartlara uygun olmasını sağlamak sizin yükümlülüğünüzdür.',
      },
      {
        group: 'Kullanım',
        title: 'Yasaklı davranışlar',
        body: 'Kişisel verilerin izinsiz toplanması, sistemlerin kötüye kullanılması, zararlı yazılım, yetkisiz erişim denemesi ve diğer kullanıcıların deneyimini bozacak davranışlar yasaktır.',
      },
      {
        group: 'Hizmet yönetimi',
        title: 'Askıya alma ve sonlandırma',
        body: 'Mayvox; güvenlik riski, yasal zorunluluk, kötüye kullanım veya bu şartlara aykırılık halinde hesabı askıya alabilir, bazı özellikleri sınırlayabilir veya erişimi sonlandırabilir.',
      },
      {
        group: 'Hizmet yönetimi',
        title: 'Fikri mülkiyet',
        body: 'Mayvox adı, logosu, arayüzü, yazılımı, tasarımı ve içerikleri Mayvox veya ilgili hak sahiplerine aittir. Hizmet size yalnızca sınırlı ve devredilemez kullanım hakkı sağlar.',
      },
      {
        group: 'Sorumluluk',
        title: 'Üçüncü taraf bağımlılıkları',
        body: 'Mayvox; LiveKit, Resend, Hetzner ve benzeri üçüncü taraf sağlayıcılardan yararlanabilir. Bu servislerde yaşanan kesinti veya politika değişiklikleri hizmeti etkileyebilir.',
      },
      {
        group: 'Sorumluluk',
        title: 'Erişilebilirlik ve sorumluluk sınırı',
        body: 'Hizmetin kesintisiz, hatasız veya her zaman erişilebilir olacağı garanti edilmez. Yasaların izin verdiği ölçüde dolaylı zararlar, kar kaybı, veri kaybı veya üçüncü taraf kesintilerinden doğan taleplerden Mayvox sorumlu tutulamaz.',
      },
      {
        group: 'Hukuk',
        title: 'Uygulanacak hukuk',
        body: 'Bu şartlar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda yetkili Türk mahkemeleri ve icra daireleri görevli olabilir.',
      },
    ],
  },
};

export default function LegalModal({
  kind,
  open,
  onClose,
}: {
  kind: LegalModalKind;
  open: boolean;
  onClose: () => void;
}) {
  const content = LEGAL_CONTENT[kind];

  return (
    <Modal open={open} onClose={onClose} width="xl" padded={false}>
      <div className="relative flex max-h-[88vh] min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--surface-floating-bg)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--theme-border)]/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-border)]/70 bg-[var(--surface-soft)] text-[var(--theme-accent)]">
              {content.icon}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--theme-text)]">
                {content.title}
              </h2>
              <p className="mt-1 truncate text-[11px] text-[var(--theme-secondary-text)]/65">
                {content.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-border)]/65 bg-[var(--surface-soft)] text-[var(--theme-secondary-text)] transition-colors hover:text-[var(--theme-text)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 modal-scroll">
          <div className="flex flex-col gap-3">
            {content.sections.map((section, index) => {
              const showGroup = index === 0 || content.sections[index - 1].group !== section.group;
              return (
                <React.Fragment key={section.title}>
                  {showGroup && (
                    <div className={index === 0 ? 'px-1' : 'px-1 pt-2'}>
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]/58">
                        {section.group}
                      </span>
                    </div>
                  )}
                  <section
                    className={`rounded-2xl border p-4 ${
                      section.highlight
                        ? 'border-[rgba(var(--theme-accent-rgb),0.25)] bg-[rgba(var(--theme-accent-rgb),0.07)]'
                        : 'border-[var(--theme-border)]/65 bg-[var(--surface-soft)]/55'
                    }`}
                    style={{
                      boxShadow: section.highlight
                        ? '0 18px 42px -28px rgba(var(--theme-accent-rgb),0.7), inset 0 1px 0 rgba(255,255,255,0.035)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.025)',
                    }}
                  >
                    <h3 className="text-[12.5px] font-bold text-[var(--theme-text)]">
                      {section.title}
                    </h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--theme-secondary-text)]/78">
                      {section.body}
                    </p>
                  </section>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
