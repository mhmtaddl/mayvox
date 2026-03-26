export interface ReleaseNote {
  title: string;
  items: string[];
  adminItems?: string[]; // Sadece admin yetkisine sahip kullanıcılara gösterilir
}

// Her versiyon için güncelleme notları buraya eklenir.
// Anahtar: "x.y.z" formatında versiyon numarası.
const RELEASE_NOTES: Record<string, ReleaseNote> = {
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
