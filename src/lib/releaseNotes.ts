export interface ReleaseNote {
  title: string;
  items: string[];
  adminItems?: string[]; // Sadece admin yetkisine sahip kullanıcılara gösterilir
}

// Her versiyon için güncelleme notları buraya eklenir.
// Anahtar: "x.y.z" formatında versiyon numarası.
const RELEASE_NOTES: Record<string, ReleaseNote> = {
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
