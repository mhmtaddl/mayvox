export interface ReleaseNote {
  title: string;
  /** Eski format — tek liste (geriye uyumluluk) */
  items: string[];
  adminItems?: string[];
  /** Yeni format — platform bazlı ayrım */
  desktop?: string[];
  android?: string[];
  common?: string[];
  admin?: string[];
}

// Her versiyon için güncelleme notları buraya eklenir.
// Anahtar: "x.y.z" formatında versiyon numarası.
const RELEASE_NOTES: Record<string, ReleaseNote> = {
  '1.7.14': {
    title: 'v1.7.14',
    items: [],
    desktop: [
      'Güncelleme kurulumu artık sorunsuz çalışıyor — eski sürüm kaldırma hatası giderildi.',
      'İndirme sırasında hazırlık aşaması "Hazırlanıyor", gerçek indirme "İndiriliyor" olarak gösteriliyor.',
    ],
  },
  '1.7.13': {
    title: 'v1.7.13',
    items: [],
    desktop: [
      'Auto-update deneme sürümü.',
    ],
  },
  '1.7.12': {
    title: 'v1.7.12',
    items: [],
    desktop: [
      'Güncelleme sırasında "eski dosyalar kaldırılamadı" hatası giderildi.',
    ],
  },
  '1.7.11': {
    title: 'v1.7.11',
    items: [],
    desktop: [
      'Güncelleme penceresi artık Android ile aynı içerik ve stilde gösteriliyor.',
    ],
  },
  '1.7.10': {
    title: 'v1.7.10',
    items: [],
    desktop: [
      'Güncelleme kurulumu teşhis logları eklendi (sorun giderme amaçlı).',
    ],
  },
  '1.7.9': {
    title: 'v1.7.9',
    items: [],
    common: [
      'Ayarlar\'da "Son Görülme" gizlilik ayarı eklendi — kapatırsanız kimse sizin son görülme bilginizi göremez, siz de başkalarınınkini göremezsiniz.',
    ],
  },
  '1.7.8': {
    title: 'v1.7.8',
    items: [],
    desktop: [
      'Farklı kurulum kapsamlarında (tüm kullanıcılar / tek kullanıcı) oluşan güncelleme hatası giderildi.',
    ],
  },
  '1.7.7': {
    title: 'v1.7.7',
    items: [],
    android: [
      'Profil fotoğrafı değiştirme artık çalışıyor (galeri ve kamera erişim izinleri eklendi).',
    ],
    common: [
      'Çevrimdışı kullanıcıların "son görülme" bilgisi artık her durumda görünüyor.',
    ],
  },
  '1.7.6': {
    title: 'v1.7.6',
    items: [],
    desktop: [
      'Güncelleme kurulumu sırasında "MAYVOX kapatılamaz" hatası giderildi.',
      'Kurulum artık sessiz modda çalışıyor, kesintisiz güncelleme sağlanıyor.',
    ],
    android: [
      'Bu sürümde değişiklik yok.',
    ],
    common: [
      'Bu sürümde değişiklik yok.',
    ],
    admin: [
      'Bu sürümde değişiklik yok.',
    ],
  },
  '1.7.5': {
    title: 'v1.7.5',
    items: [],
    desktop: [
      'Bu sürümde değişiklik yok.',
    ],
    android: [
      'Odada kimse konuşmuyorken gösterilen "tuşa basılı tut" ipucu kaldırıldı.',
    ],
    common: [
      'Çevrimdışı kullanıcıya tıklandığında son çevrimiçi olduğu tarih ve saat gösteriliyor.',
    ],
    admin: [
      'Bu sürümde değişiklik yok.',
    ],
  },
  '1.7.4': {
    title: 'v1.7.4',
    items: [],
    desktop: [
      'Windows kurulumu sırasında eski sürümün kapatılamaması sorunu kesin olarak düzeltildi.',
      'Güncelleme kurulumu artık uygulamayı otomatik kapatıp sorunsuz tamamlanıyor.',
    ],
    android: [
      'Bu sürümde değişiklik yok.',
    ],
    common: [
      'Sürüm notları penceresi versiyon numarası hizasında açılacak şekilde düzeltildi.',
    ],
    admin: [
      'Bu sürümde değişiklik yok.',
    ],
  },
  '1.7.3': {
    title: 'v1.7.3',
    items: [],
    desktop: [
      'Bu sürümde değişiklik yok.',
    ],
    android: [
      'Bu sürümde değişiklik yok.',
    ],
    common: [
      'Aynı hesapla iki farklı cihazdan farklı sohbet odalarına aynı anda bağlanma engellendi.',
      'İkinci cihazdan herhangi bir odaya bağlanıldığında ilk cihazdaki bağlantı otomatik sonlandırılıyor.',
      'Bağlantı kesilme mesajı netleştirildi.',
    ],
    admin: [
      'Bu sürümde değişiklik yok.',
    ],
  },
  '1.7.2': {
    title: 'v1.7.2',
    items: [],
    desktop: [
      'Windows kurulumu sırasında "MAYVOX kapatılamaz" hatası düzeltildi.',
      'Güncelleme kurulumu artık uygulamayı otomatik kapatıp sorunsuz tamamlanıyor.',
    ],
    android: [
      'Bu sürümde değişiklik yok.',
    ],
    common: [
      'Bu sürümde değişiklik yok.',
    ],
    admin: [
      'Bu sürümde değişiklik yok.',
    ],
  },
  '1.7.1': {
    title: 'v1.7.1',
    items: [],
    desktop: [
      'Ayarlar ekranındayken oda seçildiğinde veya yeni oda oluşturulduğunda sohbet ekranına otomatik geçiş düzeltildi.',
    ],
    android: [
      'Bu sürümde değişiklik yok.',
    ],
    common: [
      'Aynı hesapla iki cihazdan aynı odaya bağlanma durumunda doğru uyarı mesajı gösteriliyor.',
      'Güncelleme kontrolü internet bağlantısı olmadığında gereksiz tekrar denemesi yapmıyor.',
      'Bağlantı geri geldiğinde otomatik güncelleme kontrolü yapılıyor.',
    ],
    admin: [
      'Kullanıcı sürüklenip oda dışı boş alana bırakıldığında odadan çıkarma özelliği eklendi.',
      'Sürükleme ile taşıma ve çıkarma işlemlerinin çift tetiklenmesi engellendi.',
      'Android\'de kullanıcı kartına uzun basma ile odadan çıkarma desteklendi.',
      'Moderatör butonunda ikon kullanıldı.',
    ],
  },
  '1.7.0': {
    title: 'v1.7.0 — Yeni Güncelleme Sistemi',
    items: [],
    desktop: [
      'GitHub Releases tabanlı otomatik güncelleme sistemi eklendi.',
      'Güncelleme durumu alt versiyon alanında gösteriliyor.',
    ],
    android: [
      'APK indirme yönlendirmeli güncelleme sistemi eklendi.',
    ],
    common: [
      'Zorunlu güncelleme desteği eklendi.',
      'Ağ bağlantısı olmadığında güncelleme kontrolü atlanıyor.',
    ],
    admin: [
      'Bu sürümde değişiklik yok.',
    ],
  },
  '1.6.0': {
    title: 'v1.6.0 — Android Desteği + Çapraz Platform',
    items: [
      '— Android —',
      'Android mobil uygulama desteği eklendi.',
      'Mobil arayüz: swipe drawer, dokunmatik PTT butonu, kompakt footer.',
      'Ses algılama modu (VAD) — butona basmadan konuş.',
      'Davet geldiğinde native bildirim.',
      'İlk açılışta mikrofon ve bildirim izin onboarding.',
      '',
      '— Masaüstü —',
      'Glass tema regresyonu giderildi.',
      'Platform algılama düzeltmesi (desktop doğru ikon gösteriyor).',
      '',
      '— Ortak —',
      'Cihaz rozeti — avatarda mobil/masaüstü ikonu.',
      'Çıkış onay modalı eklendi.',
      'Kanal üyeliği isim yerine ID tabanlı (isim değişikliğine dayanıklı).',
      'Token server bağlantı dayanıklılığı artırıldı.',
      'Davet modalı arka plandan dönüşte kaybolmaz.',
      'Online süre göstergesi düzeltildi — artık herkes aynı süreyi görüyor.',
      'Tek versiyon kaynağı: desktop ve Android aynı sürümü paylaşıyor.',
    ],
  },
  '1.5.0': {
    title: 'v1.5.0 — Performans, UI/UX ve Yeni Özellikler',
    items: [
      'Boşta kalınca kanaldan otomatik ayrılma özelliği eklendi.',
      'Otomatik ayrılma öncesi 30 saniye uyarı bildirimi eklendi.',
      'Otomatik ayrılma sonrası AFK durumu gösterimi eklendi.',
      'Çevrimdışı kullanıcı listesi açılır/kapanır hale getirildi.',
      'Giriş ekranı yeniden düzenlendi.',
      'İsim gösterimi standardize edildi.',
      'Performans iyileştirmeleri (GPU/CPU yükü azaltıldı).',
      'Premium scrollbar tasarımı.',
    ],
    adminItems: [
      'Ayarlar ekranı yeniden tasarlandı (Ayarlar / Yönetim sekmeli yapı).',
      'Kullanıcı yönetimi paneli geliştirildi (arama, filtre, iç scroll).',
      'Tüm ayar bölümleri açılır/kapanır (accordion) yapıda.',
      'Kod yapısı modülerleştirildi (SettingsView → 5 ayrı section dosyası).',
    ],
  },
  '1.4.5': {
    title: 'v1.4.5 — Çıkış Sırası Düzeltmesi',
    items: [
      'Logout\'ta ses bağlantısı artık presence\'dan önce kesiliyor, kararsız davranış giderildi.',
    ],
  },
  '1.4.4': {
    title: 'v1.4.4 — Çıkış Düzeltmesi',
    items: [
      'Çıkış yapan veya uygulamayı kapatan kullanıcılar artık anında odadan düşüyor.',
    ],
  },
  '1.4.2': {
    title: 'v1.4.2 — Oda Görünürlük Düzeltmesi',
    items: [
      'Sonradan giriş yapan kullanıcılar artık dolu odaları ve içindeki üyeleri sidebar\'da görebiliyor.',
      'Presence tabanlı oda üyelik takibi eklendi — broadcast kaçırılsa bile oda durumu güvenilir şekilde senkron.',
      'Login ve kayıt akışlarında eksik olan kanal yüklemesi düzeltildi.',
    ],
  },
  '1.4.1': {
    title: 'v1.4.1 — Premium Deneyim Güncellemesi',
    items: [
      'Ses ayarı artık tüm kullanıcılara açık — herkes aynı odadaki birinin sesini kendine özel ayarlayabiliyor.',
      'Versiyon takibi genişletildi — eski sürüm kullananlar kırmızı, güncel olanlar yeşil görünüyor.',
      'Kullanıcı kartı sistemi yeniden yapılandırıldı — daha modüler ve bakımı kolay mimari.',
      'En baskın konuşmacı otomatik öne çıkıyor (Dominant Speaker Focus).',
      'Sessiz anlarda kartlarda çok hafif ambient canlılık (Idle Breathing).',
      'Geçiş animasyonları daha yumuşak ve premium hissettiriyor.',
      'Admin, Moderatör ve SEN için daha profesyonel görsel ayrım.',
      'Kart boyutu kontrolü yenilendi — tek tıkla dönen ikon (Kompakt / Dengeli / Geniş).',
      'Bas-konuş ipucu artık seçili tuşu gösteriyor.',
    ],
    adminItems: [
      'Tüm kullanıcıların versiyon bilgisi artık eksik olsa bile görünüyor (eski sürüm = kırmızı "Eski" etiketi).',
    ],
  },
  '1.4.0': {
    title: 'v1.4.0 — Büyük Güncelleme',
    items: [
      'Duyuru ve etkinlik sistemi eklendi.',
      'Moderatör rolü eklendi.',
      'Ses profilleri eklendi (Temiz Ses, Yayıncı, Doğal, Gürültülü Ortam).',
      'Kullanıcı profil kartı eklendi — isme tıklayınca detaylar açılıyor.',
      'Online süre, son görülme ve toplam kullanım bilgisi profil kartında görünüyor.',
      'Konuşan kullanıcı artık sesle senkron parıldıyor.',
      'Oda içi kullanıcı kartları yeniden tasarlandı.',
      'Oda oluşturma ekranı modernleştirildi.',
      'Güncelleme bildirimi artık sol üst marka alanında görünüyor.',
      'Ayarlar ekranı görsel olarak yenilendi.',
      'Bağlantı kalitesi göstergesi düzeltildi.',
      'Mikrofon ve hoparlör durumu artık tüm kullanıcılarda anlık senkron.',
      'Bas-konuş sadece ses bağlantısı kurulduğunda çalışıyor.',
      'Kart boyutu ayarı eklendi — oda içinde kartları küçük, orta veya büyük gösterebilirsiniz.',
      'Ses ayarları hizalaması düzeltildi.',
    ],
    adminItems: [
      'Güncelleme yönetim paneli eklendi (zorunlu güncelleme kontrolü).',
      'Moderatör yetki ver/al butonu eklendi.',
      'Zorunlu güncelleme overlay sistemi eklendi.',
      'Kullanıcı sürüm takibi — her kullanıcının uygulama versiyonu yönetim panelinde görünüyor.',
      'Yönetim paneli butonları sadeleştirildi (ikon bazlı).',
      'Oturum kurtarma hata yönetimi güçlendirildi.',
      'Versiyon karşılaştırma güvenliği artırıldı.',
    ],
  },
  '1.3.0': {
    title: 'Bu sürümde neler değişti?',
    items: [
      'Kayıt ekranından ayrılıp geri döndüğünde e-posta alanı artık temizlenmiş geliyor.',
      'Davet kodunuz onaylandığında kod alanı otomatik olarak odaklanıyor, hemen yazmaya başlayabilirsiniz.',
      'Süre dolan veya reddedilen davet talebinde tek tıkla yeniden istek gönderilebiliyor.',
    ],
    adminItems: [
      'Davet talepleri artık ayrı bir "Davetler" butonu yerine Ayarlar butonunun üzerinde bildirim olarak görünüyor. Yeni talep gelince otomatik açılıyor.',
      'Admin girişinde yalnızca işlem bekleyen talepler gösteriliyor; daha önce işlenmiş talepler bildirim üretmiyor.',
      'Davet kodu e-postası aktif hale getirildi — admin "Kod Gönder" bastığında kod artık kullanıcının e-postasına ulaşıyor.',
      'İki admin aynı anda "Kod Gönder" basarsa yalnızca biri geçerli olur; ikincisi "talep zaten işleme alınmış" uyarısı alır.',
      'Kullanıcı yönetimi ekranında her kullanıcının adının yanında hangi uygulama sürümünü çalıştırdığı görünüyor.',
      'Birden fazla admin aynı anda bağlıyken yaşanabilecek Realtime bildirim çakışması giderildi.',
      'Bağlantı kalitesi ölçümündeki tekrar eden 401 hataları düzeltildi.',
    ],
  },
  '1.1.5': {
    title: 'Bu sürümde neler değişti?',
    items: [
      'Sesli sohbet yasağı: Admin yasakladığında ekranda geri sayımlı bir engel açılır. Süre dolana veya yasak kalkana kadar uygulamaya erişilemez.',
      'Admin susturma düzeltmesi: Susturulan kullanıcının mikrofonu artık gerçekten kapanıyor, susturma kaldırılınca anında açılıyor.',
      'Gürültü eşiği canlı meter: Ayarlar sayfasında eşik slider\'ının üstünde gerçek zamanlı mikrofon seviyesi göstergesi eklendi.',
      'Bas-Konuş bırakma gecikmesi: Tuşu bırakınca mikrofon hemen kapanmıyor. Ayarlardan 0–500 ms arasında ayarlanabilir (varsayılan 250 ms).',
    ],
    adminItems: [
      'Token sunucusu güvenlik iyileştirmesi: Kullanıcı kimliği artık sunucu tarafında JWT\'den doğrulanıyor, istek gövdesindeki değer dikkate alınmıyor.',
    ],
  },
};

export function getReleaseNotes(version: string): ReleaseNote | null {
  return RELEASE_NOTES[version] ?? null;
}
