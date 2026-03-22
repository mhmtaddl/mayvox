export interface ReleaseNote {
  title: string;
  items: string[];
  adminItems?: string[]; // Sadece admin yetkisine sahip kullanıcılara gösterilir
}

// Her versiyon için güncelleme notları buraya eklenir.
// Anahtar: "x.y.z" formatında versiyon numarası.
const RELEASE_NOTES: Record<string, ReleaseNote> = {
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
