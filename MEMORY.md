# Mayvox Teknik Hafıza

## 1. Son commit özeti

- Commit: 478d683
- Konu: voice member identity resolution + overlay performance
- Phase 1 tamamlandı.

## 2. Phase 1’de yapılanlar

- members mixed id/name/LiveKit identity resolve edildi
- src/lib/memberIdentity.ts eklendi
- overlay/PTT performans iyileştirildi
- yeşil waveform/pulse animasyonları kaldırıldı

## 3. Phase 2’de yapılacaklar

- channels.members için canonical format kesin olarak userId[] olacak
- LiveKit participant.identity → userId mapping ayrı tutulacak
- user.name / participant.identity doğrudan members içine yazılmayacak
- reconnect sonrası presence + LiveKit + allUsers reconciliation yapılacak
- channel-update payload normalize edilmeden state’e yazılmayacak
- synthetic user davranışı azaltılacak veya kontrollü hale getirilecek
- self-healing member sync eklenecek

## 4. Dikkat edilmesi gerekenler

- Voice/LiveKit token/audio akışı bozulmayacak
- PTT/VAD/RNNoise tarafına gereksiz dokunulmayacak
- Büyük refactor yerine aşamalı migration yapılacak

## 5. Manuel test checklist

- soğuk açılış
- ID yerine ad-soyad
- odaya giren kullanıcı görünür mü
- ghost member var mı
- reconnect sonrası liste toparlıyor mu
- PTT/mouse PTT
- overlay açık/kapalı FPS

## 6. v2.1.9 release notu

- Commit: 5de062b
- Release: https://github.com/mhmtaddl/mayvox/releases/tag/v2.1.9
- Sürüm: package.json / package-lock.json 2.1.9
- Lint: npm run lint geçti
- Release build: npm run release geçti
- Windows installer + Android APK GitHub release'e yüklendi

## 7. v2.1.9'da yapılan ana işler

- Auth/login/register frameless rounded pencere, tema uyumu ve input/button polish.
- Main app rounded frameless pencere, titlebar glass capsule, çift tık maximize/restore.
- Light theme okunurluk/gölge temizliği, server settings sekmeleri okunurluk iyileştirmeleri.
- Midnight, Ocean, Amber, Emerald, Crimson tema yüzey/token iyileştirmeleri.
- Alt dock/voice bar light theme polish ve durum göstergesi düzenleri.
- Overlay ses göstergesi tema renkleri, opacity, kart/kapsül/badge boyut ve hizalama düzeltmeleri.
- Server settings responsive düzeltmeleri ve oto-mod küçük pencere düzenleri.
- Search input tema-aware hale getirildi.
- Genel ses seviyesi oscillator tabanlı giriş/çıkış, mute/deafen ve PTT seslerine bağlandı.
- Oda oluştur modalı opak/okunur tema yüzeyine alındı.

## 8. Dönünce kontrol edilecekler

- v2.1.9 kurulum sonrası auth penceresi ve ana pencere köşeleri.
- Tema geçişleri, özellikle açık/koyu ve Ocean/Amber/Emerald/Crimson.
- Oyun overlay opacity %100 iken arkayı göstermeme durumu.
- Oda oluştur modalında okunurluk.
- Genel ses seviyesi slider'ının tüm ses kategorilerine etkisi.
