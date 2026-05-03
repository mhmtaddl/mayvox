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

## 9. Supabase -> Hetzner migration çalışma kuralı

- Hedef: Supabase'de çalışan her şeyi bire bir Hetzner üstündeki Mayvox backend/Postgres ortamına taşımak.
- Is bitti sayılmaz: Supabase tarafındaki auth/data/runtime bağımlılıkları tamamen Hetzner'de çalışmadıkça migration devam eder.
- Kullanıcı SSH veya PowerShell komutlarını manuel çalıştıracak.
- Asistan her adımda sadece tek çalıştırılacak kod/komut bloğu verecek.
- Kullanıcı çıktıyı atacak; asistan sonraki komutu sadece o çıktıya göre verecek.
- SCP, SSH, PM2, grep, sed, psql vb. işlemlerde de aynı kural geçerli: komutu kullanıcı çalıştırır, çıktı geldikten sonra ilerlenir.
- Büyük toplu plan yerine küçük doğrulanan adımlar uygulanacak.
- Secret/key görüldüyse ifşa olmuş kabul edilecek ve rotate listesine alınacak.

## 10. Supabase migration kaldigimiz yer

- Tarih: 2026-05-03.
- Sunucuda aktif token process: `mayvox-token`.
- Aktif token script: `/opt/cylk-token-server/server.cjs`.
- Aktif token server auth akışı Supabase kullanmıyor; `JWT_SECRET` ile `jsonwebtoken.verify(...)` yapıyor.
- `/livekit-token` JWT ister, `profileId` payload'ı bekler, `serverId + channelId` zorunlu tutar ve `roomName === channelId` kontrol eder.
- Token server kanal erişim kararını kendisi vermiyor; `SERVER_BACKEND_URL` üzerinden backend `checkChannelAccess` sonucuna göre LiveKit token üretiyor.
- Aktif backend grep sonucunda Supabase kullanımı görünmedi; Supabase izleri backup/eski build/env dosyalarında kaldı.
- Dikkat: `/opt/cylk-token-server/.env` içinde `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET` gibi secret'lar konuşmada göründü; rotate edilmeli.
- Yakalanan bug: `/opt/mayvox-server-backend/dist/services/channelAccessService.js` public kanal dönüşünde `canJoi: true` yazıyor; `canJoin: true` olmalı. Bu public kanal LiveKit token reddine sebep olabilir.
- Sonraki adım: source ve dist içinde `canJoi` kontrol edilecek; source'ta varsa kalıcı fix + build + PM2 restart, sadece dist'te varsa acil prod patch uygulanacak.

## 11. Supabase migration 2026-05-03 son durum

- `canJoi/canJon` typo'ları `src` ve `dist` tarafında temizlendi; backend build alındı ve `mayvox-backend` restart edildi.
- `/opt/cylk-token-server/.env` içindeki `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` kaldırıldı.
- `/opt/cylk-token-server/package.json` ve lock dosyasından `@supabase/supabase-js` uninstall edildi.
- Token/backend `.env` backup dosyaları root-only `/root/mayvox-secret-env-backups/...` altına taşındı.
- Backend DB'deki 19 boş placeholder `app_users` kaydı dump alındıktan sonra silindi.
- Son auth sayımı: `profiles=18`, `app_users=18`, `profiles_without_login=0`, `incomplete_app_users=0`.
- Son canlı Supabase scan temiz döndü: `/opt/cylk-token-server` ve `/opt/mayvox-server-backend` içinde aktif kod/env/dependency Supabase izi yok.
- Health kontrolü başarılı: backend `/health` 200, token `/health` 200; yetkisiz `/auth/me` ve `/livekit-token` 401 dönüyor.
- PM2 son durum: `mayvox-backend`, `mayvox-chat`, `mayvox-token` online.
- Kalan güvenlik işi: konuşmada görünen `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET`, `RESEND_API_KEY`, `JWT_SECRET` rotate edilmeli. Supabase artık aktif kullanılmıyor olsa da ifşa olmuş secret kabul edilecek.

## 12. Voice/server migration fixleri

- Eski Supabase auth id/app user id karışıklığı nedeniyle `server_members.user_id` değerlerinin bir kısmı `app_users.id` tutuyordu; backend yeni akışta `profiles.id` bekliyor.
- `server_members.user_id` app user id olan kayıtlar `app_users.profile_id` değerine çevrildi; 1 duplicate conflict silindi, 17 kayıt güncellendi.
- Son kontrol: `server_members` tüm kayıtları `profiles.id` ile eşleşiyor, `app_users.id` referansı kalmadı.
- `Genel Sunucu` default kanalları orphan kalmıştı; `Sohbet Muhabbet`, `Oyun Takımı`, `Yayın Sahnesi`, `Sessiz Alan` kanalları `Genel Sunucu` server id'sine bağlandı.
- Kullanıcı eski `CYLK WOT` server'ını aramaktan vazgeçti, yeni `CYLK` server'ı oluşturdu.
- Yeni `CYLK` server'ında default odalar otomatik oluştu.
- Backend access-check ve token server manuel test edildi: `/servers/:id/channels/:channelId/access/check` `canJoin=true`, `https://api.mayvox.com/livekit-token` 200 token dönüyor.
- Windows `Test-NetConnection 46.225.99.185 -Port 7880` başarılı; LiveKit TCP erişimi açık.
- Kullanıcı manuel doğruladı: login/logout sonrası, uygulama kapat/aç sonrası, default odalara ve yeni oluşturduğu odalara giriş çalışıyor.
