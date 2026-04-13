# CYLKSOHBET (PigeVox) — Tam Teknik Denetim Raporu

**Tarih:** 2026-04-09
**Versiyon:** v1.7.14
**Denetleyen:** Otonom Teknik Audit (Staff-level)
**Kapsam:** Frontend, Backend, Electron, Supabase, Altyapi, UI/UX, Guvenlik, Performans, Stabilite

---

## ICINDEKILER

1. [Executive Summary](#1-executive-summary)
2. [Architecture Review](#2-architecture-review)
3. [Security Review](#3-security-review)
4. [Performance Review](#4-performance-review)
5. [Stability / Race Condition Review](#5-stability--race-condition-review)
6. [UI/UX Technical Review](#6-uiux-technical-review)
7. [Data Flow / Backend Integration Review](#7-data-flow--backend-integration-review)
8. [Electron-specific Review](#8-electron-specific-review)
9. [Supabase / Realtime / Backend Review](#9-supabase--realtime--backend-review)
10. [File Structure / Maintainability Review](#10-file-structure--maintainability-review)
11. [Developer Velocity Constraints](#11-developer-velocity-constraints)
12. [Technical Debt Inventory](#12-technical-debt-inventory)
13. [Completed vs Missing Capabilities](#13-completed-vs-missing-capabilities)
14. [Highest-Risk Regression Areas](#14-highest-risk-regression-areas)
15. [Prioritized Action Plan](#15-prioritized-action-plan)
16. [Ek Analizler](#16-ek-analizler)

---

## 1. EXECUTIVE SUMMARY

### Genel Saglik Durumu

PigeVox, React 19 + Electron 41 + Supabase + LiveKit + Express/WebSocket uzerine kurulmus, uretim seviyesinde cok platformlu (Windows, Android, Web) bir sesli sohbet uygulamasi. Mimari temelde dogru; auth akisi, ses odasi yonetimi, DM sistemi ve admin paneli calisir durumda. Ancak kod tabani onemli teknik borc biriktirmis durumda: iki dev dosya (App.tsx: 2572 satir, ChatView.tsx: 3066 satir) uygulamanin omurgasini olusturuyor ve bu dosyalarda ciddi bakimlanabilirlik, performans ve stabilite riskleri mevcut.

### En Kritik 10 Bulgu

| # | Bulgu | Seviye | Alan |
|---|-------|--------|------|
| 1 | `.env` dosyasi repo'da commit'li — SUPABASE_SERVICE_ROLE_KEY ve RESEND_API_KEY ifsa | **KRITIK** | Guvenlik |
| 2 | App.tsx 2572 satir, 54 useState, 27 useEffect, 49 handler — monolitik | **KRITIK** | Mimari |
| 3 | ChatView.tsx 3066 satir, 11+ inline component, 26 useState — monolitik | **KRITIK** | Mimari |
| 4 | usePresence broadcast handler stacking — startPresence iki kez cagirilirsa listener'lar ciftlenir | **KRITIK** | Stabilite |
| 5 | WebSocket reconnect race condition — iki connectChat() ayni anda calisabilir | **KRITIK** | Stabilite |
| 6 | DM:CONVERSATIONS arkadaslik kontrolu yapmiyor — unfriend sonrasi sohbet hala gorunur | **KRITIK** | Guvenlik |
| 7 | SQLite graceful shutdown yok — ani kapanmada veri kaybi/bozulma riski | **KRITIK** | Operasyon |
| 8 | LiveKit room event handler'lari unmount sonrasi setState cagirabiliyor | **KRITIK** | Stabilite |
| 9 | CORS yapilandirmasi `null` origin'e izin veriyor | **YUKSEK** | Guvenlik |
| 10 | 40+ hardcoded renk degeri tema sistemi disinda kullaniliyor | **YUKSEK** | UI/UX |

### En Guclu 10 Alan

| # | Alan | Aciklama |
|---|------|----------|
| 1 | Electron guvenlik temeli | contextIsolation: true, nodeIntegration: false, minimal preload API |
| 2 | Supabase RLS | Tum tablolarda Row Level Security aktif |
| 3 | Auth akisi | JWT dogrulama server-side, Supabase SDK entegrasyonu dogru |
| 4 | Tema sistemi | 6 tema, 50+ semantik token, adaptiveTheme renk hesaplamalari |
| 5 | Update state machine | Acik durum gecisleri, platform adapterleri, urgency degerlendirmesi |
| 6 | LiveKit entegrasyonu | Token retry, exponential backoff, baglanti kalitesi izleme |
| 7 | Rate limiting | Token, user-check, password-reset endpoint'lerinde mevcut |
| 8 | DM persistence | SQLite WAL mode, prepared statements, foreign key enforcement |
| 9 | Presence sistemi | Supabase Realtime ile coklu kullanici durumu, oda uyeligi senkronizasyonu |
| 10 | Room mode config | 4 oda modu, tek kaynak (roomModeConfig.ts), ducking/voice/chat ayarlari |

---

## 2. ARCHITECTURE REVIEW

### 2.1 Genel Mimari

```
Istemci (React 19 + Tailwind v4)
  |-- Electron (Windows masaustu)
  |-- Capacitor (Android)
  |-- Web (tarayici)
  |
  +-- Supabase (Auth, DB, Realtime Presence)
  +-- LiveKit (WebRTC ses odalari)
  +-- Express server.cjs (Token, Admin API)
  +-- WebSocket chat-server.cjs (Room Chat + DM)
```

### 2.2 Context Katmani (7 Provider)

Provider siralama (App.tsx:2415-2421):
```
ConfirmProvider
  > SettingsCtx.Provider (18 deger)
    > UserContext.Provider (kullanici + arkadaslik)
      > ChannelContext.Provider (kanallar)
        > UIContext.Provider (modal/menu/toast)
          > AppStateContext.Provider (40+ handler)
            > AudioCtx.Provider (cihaz + seviyeler)
```

**Bulgu ARC-01: AppStateContext asiri buyuk**
- Seviye: KRITIK
- Alan: Mimari
- Dosya: `src/contexts/AppStateContext.tsx` (107 satir interface) + `src/App.tsx` (2572 satir provider)
- Kanit: 40+ handler fonksiyonu, auth/channel/admin/network islemleri tek context'te
- Neden sorun: Herhangi bir handler degistiginde tum consumer'lar re-render olur. Test yazmak imkansiza yakin.
- Onerilen yon: `useAuthFlow`, `useChannelManagement`, `useAdminPanel`, `useNetworkQuality` hook'larina bol
- Aciliyet: Yakin vade

**Bulgu ARC-02: Monolitik App.tsx**
- Seviye: KRITIK
- Alan: Mimari
- Dosya: `src/App.tsx`
- Kanit: 2572 satir, 54 useState, 27 useEffect, 49 handler, 21+ ref
- Neden sorun: Tek dosyada auth, kanal yonetimi, admin islemleri, network izleme, presence, ses kontrolu, moderasyon, davet sistemi, kayit akisi hepsi bir arada
- Olasi etkisi: Her degisiklik regresyon riski tasir; code review zorlasir; merge conflict garantili
- Onerilen yon: Domain bazli hook'lara ayir (en az 6 hook cikarilabilir)
- Aciliyet: Hemen planla, yakin vadede coz

**Bulgu ARC-03: Monolitik ChatView.tsx**
- Seviye: KRITIK
- Alan: Mimari
- Dosya: `src/views/ChatView.tsx`
- Kanit: 3066 satir, 26 useState, 10 useEffect, 11+ inline component tanimi
- Neden sorun: Inline component'ler memoization kaybidir; her render'da yeniden olusturulur
- Onerilen yon: VoiceParticipants, ChatPanel, MobileFooter, DesktopControls, RoomModal, PasswordModal gibi alt component'lere bol
- Aciliyet: Hemen planla

**Bulgu ARC-04: supabase.ts tek dosyada 40+ fonksiyon**
- Seviye: ORTA
- Alan: Mimari
- Dosya: `src/lib/supabase.ts` (~490 satir)
- Kanit: Auth, profile, channel, moderation, invite, password, heartbeat, activity fonksiyonlari tek dosyada
- Onerilen yon: `supabase/auth.ts`, `supabase/profiles.ts`, `supabase/channels.ts`, `supabase/moderation.ts` seklinde bol

**Bulgu ARC-05: chatService ve dmService paylasimli WebSocket**
- Seviye: ORTA
- Alan: Mimari
- Dosya: `src/lib/chatService.ts`, `src/lib/dmService.ts`
- Kanit: Iki servis ayni `ws` global degiskenini kullaniyor. chatService reconnect ederse dmService handler'lari eski socket'a bagli kalabilir.
- Onerilen yon: Tek WebSocket manager sinifi olustur, her iki servisi consumer olarak bagla

### 2.3 Hook Katmani

| Hook | Satir | Karmasiklik | Not |
|------|-------|-------------|-----|
| usePresence | 463 | Cok yuksek | Presence sync, broadcast, membership — bol |
| useLiveKitConnection | 362 | Yuksek | 10+ event handler, timeout yonetimi |
| useFriends | 303 | Orta | Realtime subscription, iliskisel veri |
| usePttAudio | 295 | Yuksek | PTT/VAD ikili mantik ic ice |
| useFriendGroups | 230 | Orta | CRUD + realtime |
| useAutoPresence | 195 | Orta | DOM event throttle, idle tespit |
| useModeration | 187 | Orta | RPC + broadcast |
| useDucking | 169 | Orta | Ses seviyesi algoritmasi |
| usePermissions | 146 | Dusuk | Platform abstraction |
| usePermissionStatus | 109 | Dusuk | Durum izleme |
| useDevices | 93 | Dusuk | Cihaz listeleme |
| useFavoriteFriends | 87 | Dusuk | Basit toggle |
| useWindowActivity | 42 | Dusuk | Focus/visibility |

### 2.4 Veri Akisi

```
Kullanici eylemi (ornek: kanala katil)
  --> handleJoinChannel (App.tsx)
    --> connectToLiveKit (useLiveKitConnection)
      --> getLiveKitToken (livekit.ts) --> token server
      --> room.connect() --> LiveKit server
      --> TrackSubscribed --> audio element olustur
      --> ParticipantConnected --> member listesi guncelle
    --> presenceChannel.track({ currentRoom }) (usePresence)
      --> Diger istemciler presence sync ile gorur
    --> useDucking enable/disable
```

---

## 3. SECURITY REVIEW

### 3.1 KRITIK: .env Dosyasi Repo'da

**Bulgu SEC-01: Sunucu sirlari Git'te ifsa**
- Seviye: KRITIK
- Alan: Guvenlik
- Dosya: `.env` (kok dizin)
- Kanit:
  - `SUPABASE_SERVICE_ROLE_KEY=REMOVED` — veritabani admin erisimi
  - `RESEND_API_KEY=REMOVED` — email servis API anahtari
- Neden sorun: Repo'ya erisimi olan herkes veritabanina admin olarak erisebilir, RLS bypass edebilir, kullanici verileri okuyabilir/degistirebilir, email gonderebilir
- Olasi etkisi: Tam veritabani ihlali, kullanici verisi sizintisi, hesap ele gecirme
- Onerilen yon:
  1. `.env` dosyasini `.gitignore`'a ekle
  2. Git history'den temizle (`git filter-branch` veya BFG)
  3. Supabase service role key'i hemen rotate et
  4. Resend API key'i hemen rotate et
  5. `.env.example` ile sablonu koru
- Aciliyet: HEMEN

### 3.2 CORS Yapilandirmasi

**Bulgu SEC-02: `null` origin izni**
- Seviye: YUKSEK
- Alan: Guvenlik
- Dosya: `server.cjs` satir 21
- Kanit: `DEFAULT_ORIGINS` dizisinde `'null'` degeri var
- Neden sorun: `null` origin'li istekler (sandbox iframe, file:// protocol) kabul edilir
- Onerilen yon: `'null'` degerini listeden cikar; origin yoksa reddet

**Bulgu SEC-03: Origin olmadan wildcard**
- Seviye: ORTA
- Alan: Guvenlik
- Dosya: `server.cjs` satir 31
- Kanit: `res.setHeader('Access-Control-Allow-Origin', origin || '*')`
- Neden sorun: Origin header'i olmayan isteklere `*` donuyor
- Onerilen yon: Origin yoksa 403 don veya belirli bir default origin kullan

### 3.3 DM Sistemi Guvenlik

**Bulgu SEC-04: DM:CONVERSATIONS arkadaslik kontrolu yok**
- Seviye: KRITIK
- Alan: Guvenlik
- Dosya: `chat-server.cjs` satir 605-627
- Kanit: `dm:conversations` mesaj tipi geldiginde SQLite'tan tum sohbetler dogrudan dondurulur, arkadaslik durumu kontrol edilmez
- Neden sorun: Unfriend yapilsa bile eski DM sohbetleri gorunur kalir
- Onerilen yon: Conversation listesini friendship tablosuyla filtrele

**Bulgu SEC-05: DM gonderiminde arkadaslik kontrolu race condition**
- Seviye: ORTA
- Alan: Guvenlik
- Dosya: `chat-server.cjs` satir 697-711
- Kanit: Arkadaslik satir 697'de kontrol edilir, mesaj satir 711'de eklenir. Aradaki zaman diliminde arkadaslik iptal edilirse mesaj yine de eklenir.
- Etki: Dusuk (cok kisa zaman penceresi) ama savunma derinligi icin duzeltilmeli

### 3.4 Kullanici Numaralandirma

**Bulgu SEC-06: /api/check-user public endpoint**
- Seviye: ORTA
- Alan: Guvenlik
- Dosya: `server.cjs` satir 145-156
- Kanit: Auth gerektirmiyor; email/username ile kullanici var mi yok mu sorgulanabilir
- Neden sorun: Otomasyon ile kullanici listesi cikarilabilir
- Onerilen yon: Rate limit (mevcut: 30/dk) yeterli olabilir, ama auth da eklenmeli veya CAPTCHA

### 3.5 WebSocket Auth Hata Detay Sizintisi

**Bulgu SEC-07: Auth hata mesaji istemciye gonderiliyor**
- Seviye: DUSUK
- Alan: Guvenlik
- Dosya: `chat-server.cjs` satir 373, 407
- Kanit: `authError.message` dogrudan istemciye dondurulur
- Onerilen yon: Jenerik "Kimlik dogrulanamadi" mesaji gonder

### 3.6 CSP Eksikligi

**Bulgu SEC-08: Content-Security-Policy header'i yok**
- Seviye: ORTA
- Alan: Guvenlik
- Dosya: `index.html`, `server.cjs`, `vite.config.ts`
- Kanit: Hicbir yerde CSP tanimli degil
- Neden sorun: XSS savunma katmani eksik (mevcut durumda XSS vektoru yok ama savunma derinligi acisindan gerekli)

### 3.7 Pozitif Guvenlik Bulgulari

- contextIsolation: true, nodeIntegration: false (Electron)
- Preload'da tehlikeli API yok (shell, fs, child_process acilmamis)
- Tum Supabase sorgulan parameterize/SDK uzerinden
- Tum SQLite sorgulari prepared statement
- dangerouslySetInnerHTML, innerHTML, eval() kullanimi YOK
- API key'ler frontend bundle'ina girmemis (sadece anon key, ki bu publishable)
- Rate limiting mevcut (token, user-check, password-reset)
- Admin endpoint'leri server-side admin dogrulamasi yapiyor

---

## 4. PERFORMANCE REVIEW

### 4.1 Render Performansi

**Bulgu PERF-01: ChatView inline component'ler**
- Seviye: KRITIK
- Alan: Performans
- Dosya: `src/views/ChatView.tsx`
- Kanit: 11+ inline IIFE component tanimi (satir 776-842, 985-1060, 1161-1226, 1488-1523, 1862-2113, 2310-2353, 2455-2601)
- Neden sorun: Her parent render'da tum inline component'ler yeniden olusturulur. React bunlari yeni component olarak gorur ve DOM'u tamamen yeniden cizdirchat yazip mesaj gonderirken bile katilimci kartlari re-render olur.
- Olasi etkisi: 20+ katilimci + chat yazimi = stuttering
- Onerilen yon: Her inline component'i ayri dosyada React.memo ile sar

**Bulgu PERF-02: React.memo eksikligi**
- Seviye: YUKSEK
- Alan: Performans
- Dosya: `src/components/chat/UserCard.tsx`, `VoiceAvatar.tsx`, `OwnVoiceEqualizer.tsx`, `MiniEqualizer.tsx`
- Kanit: Hicbiri React.memo ile sarilmamis. VoiceNetwork 10+ kart render eder; speaking level degisince hepsi re-render.
- Onerilen yon: UserCard ve VoiceAvatar'i React.memo ile sar

**Bulgu PERF-03: dominantSpeakerId hesaplamasi her render'da**
- Seviye: ORTA
- Alan: Performans
- Dosya: `src/views/ChatView.tsx` satir 601-642
- Kanit: useMemo icerisinde ama dependency'ler (volumeLevel, speakingLevels) her ~33ms'de degisiyor
- Onerilen yon: Hesaplamayi throttle et veya debounce et

**Bulgu PERF-04: Chat mesaj dizisi O(n) kopyalama**
- Seviye: ORTA
- Alan: Performans
- Dosya: `src/views/ChatView.tsx` satir 328-329
- Kanit: `setChatMessages(prev => [...prev, msg])` — her mesajda tum dizi kopyalaniyor
- Neden sorun: 1000 mesajda her ekleme O(1000) bellek ayirma
- Onerilen yon: useReducer ile append veya limit ile eski mesajlari at

**Bulgu PERF-05: Sanal liste (virtualization) eksik**
- Seviye: YUKSEK
- Alan: Performans
- Dosya: `src/views/ChatView.tsx`, `src/components/FriendsSidebarContent.tsx`
- Kanit: Kanal listesi, kullanici listesi, arkadas listesi hepsi tam DOM render
- Neden sorun: 100+ kanal veya 500+ arkadas oldugunda DOM sisiyor
- Onerilen yon: `@tanstack/react-virtual` veya benzeri virtualization ekle

**Bulgu PERF-06: Sonsuz animasyon performansi**
- Seviye: ORTA
- Alan: Performans
- Dosya: `src/components/chat/VoiceNetwork.tsx` satir 89-96, `src/views/ChatView.tsx` satir 1262
- Kanit: `transition={{ duration: 2, repeat: Infinity }}` — CSS keyframes yerine JS animasyonu
- Onerilen yon: Sonsuz animasyonlari CSS @keyframes'e tasi

### 4.2 Bellek ve Kaynak

**Bulgu PERF-07: Timer/interval leak riskleri**
- Seviye: YUKSEK
- Alan: Performans
- Dosya: `src/App.tsx` satir 873, 937, 1073
- Kanit: setInterval ile mute/ban kontrol (5s), kod sayaci (1s), auto-leave timer. Effect dependency'leri degisirse onceki interval temizlenmeden yenisi baslar.
- Onerilen yon: Her effect'in basinda onceki interval'i temizle (ref kullan)

**Bulgu PERF-08: usePttAudio animasyonFrame temizleme**
- Seviye: ORTA
- Alan: Performans
- Dosya: `src/hooks/usePttAudio.ts`
- Kanit: requestAnimationFrame dongusu ses analizi icin calisiyor; component unmount sirasinda race condition ile calismaya devam edebilir

**Bulgu PERF-09: Presence harita hesaplamasi sik tekrarlaniyor**
- Seviye: ORTA
- Alan: Performans
- Dosya: `src/hooks/usePresence.ts` satir 126-208
- Kanit: Her presence sync/join/leave event'inde `new Map()` ve `flatMap()` calisiyor. 20 kullanici, saniyede 1-2 presence event = saniyede 2 harita yeniden olusturma
- Onerilen yon: Diff-based guncelleme veya throttle

---

## 5. STABILITY / RACE CONDITION REVIEW

**Bulgu STAB-01: Presence broadcast handler stacking**
- Seviye: KRITIK
- Alan: Stabilite
- Dosya: `src/hooks/usePresence.ts` satir 214-297
- Kanit: `startPresence` iki kez cagirilirsa (ornegin hizli login/logout/login), `channel.on('broadcast', ...)` handler'lari yigilir. Her presence sync'inde setAllUsers 2+ kez cagirilir.
- Olasi etkisi: State tutarsizligi, performans dususu
- Onerilen yon: startPresence oncesi mevcut listener'lari kaldir veya idempotent yap

**Bulgu STAB-02: WebSocket reconnect race**
- Seviye: KRITIK
- Alan: Stabilite
- Dosya: `src/lib/chatService.ts` satir 70-106
- Kanit: `scheduleReconnect()` icinde `void connectChat()` fire-and-forget. Iki connectChat() cagirisi yarisabilir; her ikisi de readyState kontrolunu gecer ve iki socket acilir.
- Onerilen yon: Connection state machine ekle; connecting durumunda ikinci cagiriyi engelle

**Bulgu STAB-03: LiveKit room event handler'lari unmount sonrasi**
- Seviye: KRITIK
- Alan: Stabilite
- Dosya: `src/hooks/useLiveKitConnection.ts` satir 181-237
- Kanit: `room.on(RoomEvent.TrackSubscribed, ...)` handler'lari component unmount oldugunda da aktif kalabilir. setState (setAllUsers, setChannels, setSpeakingLevels) dead component uzerinde cagirilir.
- Onerilen yon: AbortController veya mounted ref ile koruma ekle

**Bulgu STAB-04: Presence state sync race condition**
- Seviye: YUKSEK
- Alan: Stabilite
- Dosya: `src/hooks/usePresence.ts` satir 366-391
- Kanit: `track()` cagirildiktan sonra `presenceState()` hemen sorgulanir ama sunucu henuz senkronize olmamis olabilir. `setTimeout(300ms)` fallback band-aid cozum.
- Onerilen yon: Promise-based hydration veya event-driven bildirim

**Bulgu STAB-05: Kanal katilma/ayrilma yarisi**
- Seviye: YUKSEK
- Alan: Stabilite
- Dosya: `src/App.tsx` (handleJoinChannel) + `src/hooks/useLiveKitConnection.ts`
- Kanit: Kullanici hizla katil/ayril yaparsa, connectToLiveKit henuz tamamlanmadan handleLeaveChannel cagirilir. Eski room'un callback'leri yeni state'i bozar.
- Onerilen yon: Join islemini kuyruklama veya onceki islemi iptal etme mekanizmasi

**Bulgu STAB-06: Reconnect timer orphan**
- Seviye: YUKSEK
- Alan: Stabilite
- Dosya: `src/hooks/useLiveKitConnection.ts` satir 252-272
- Kanit: Reconnecting event'inde 15s timeout baslatiyor. Ag hizla dondugunde Reconnecting tetiklenmez, dogrudan Disconnected > Connecting > Connected gecisi olur. Onceki timer temizlenmez.
- Onerilen yon: Tum reconnect timer'larini tek bir ref ile yonet

**Bulgu STAB-07: Supabase Realtime subscription ciftlenme**
- Seviye: ORTA
- Alan: Stabilite
- Dosya: `src/App.tsx` satir 1882-1933
- Kanit: Admin invite request icin Supabase Realtime channel olusturuluyor. Effect dependency'leri degisirse eski subscription temizlenmeden yenisi baslar.
- Onerilen yon: Cleanup fonksiyonunda `supabase.removeChannel(channel)` cagirildigini dogrula

**Bulgu STAB-08: localStorage coklu sekme yarisi**
- Seviye: DUSUK
- Alan: Stabilite
- Dosya: `src/App.tsx` satir 133, 168, 171
- Kanit: `localStorage.setItem` coklu sekmede koordinasyon olmadan. Iki sekme ayni anda farkli tema secerse son yazan kazanir.
- Onerilen yon: Electron'da tek pencere zorunlulugu zaten var; web icin BroadcastChannel API

**Bulgu STAB-09: Fetch islemleri AbortController olmadan**
- Seviye: ORTA
- Alan: Stabilite
- Dosya: `src/App.tsx` satir 686-705 (ping), 722-850 (session restore)
- Kanit: Fetch istekleri baslatilir ama component unmount olursa sonuc dead state'e yazilir
- Onerilen yon: AbortController ekle; cleanup'ta abort() cagir

---

## 6. UI/UX TECHNICAL REVIEW

### 6.1 Z-Index Yonetimi

**Bulgu UI-01: Merkezi z-index sistemi yok**
- Seviye: ORTA
- Alan: UI/UX
- Kanit:
  - `z-[300]`, `z-[301]` — ConfirmContext.tsx
  - `z-50` — AnnouncementsPanel toast
  - `z-[200]` — ChatView overlay'ler
  - `z-30` — ChatView floating controls
  - `z-100` — ChatView popover'lar
- Onerilen yon: CSS custom property'leri ile katmanli z-index sistemi olustur:
  ```css
  --z-dropdown: 10; --z-popover: 20; --z-modal-backdrop: 100;
  --z-modal: 101; --z-toast: 200; --z-confirm: 300;
  ```

### 6.2 Hardcoded Renkler

**Bulgu UI-02: Tema sistemi disinda 40+ renk kullanimi**
- Seviye: YUKSEK
- Alan: UI/UX
- Kanit:
  - `text-red-400/500` — 20+ yerde (hata, tehlike, ban)
  - `text-emerald-400/500` — 15+ yerde (basari, onay)
  - `text-violet-400` — 6 yerde (AFK durumu, etkinlik)
  - `text-amber-400` — 3 yerde (uyari, onemli)
  - `text-blue-400/500` — 8 yerde (bilgi, secim)
  - Etkilenen dosyalar: ChatView.tsx, AnnouncementsPanel.tsx, ConfirmContext.tsx, ConfirmModal.tsx, BanScreen.tsx, LoginPasswordView.tsx, RegisterDetailsView.tsx, App.tsx
- Neden sorun: Tema degistiginde bu renkler degismez; gorsel tutarsizlik olusur
- Onerilen yon: `--theme-danger`, `--theme-success`, `--theme-warning`, `--theme-info` tokenlari ekle

### 6.3 Inline Style Kullanimi

**Bulgu UI-03: 201 inline style kullanimi**
- Seviye: ORTA
- Alan: UI/UX
- Dosya: ChatView.tsx (48), component'ler (134), view'lar (19)
- Kanit: `style={{ background: '...', transform: '...', boxShadow: '...' }}` her render'da yeni obje olusturur
- Onerilen yon: Tekrar eden style'lari CSS class veya Tailwind arbitrary value'ya tasi; dinamik degerler icin CSS custom property kullan

### 6.4 Erisilebilik (Accessibility)

**Bulgu UI-04: ARIA altyapisi eksik**
- Seviye: YUKSEK
- Alan: UI/UX
- Kanit:
  - `aria-label` yok (cogu interaktif element)
  - `aria-live` yok (toast, durum mesajlari)
  - Focus trap yok (modal'larda)
  - `alt=""` bos (avatar resimleri)
  - Klavye navigasyonu eksik (sidebar, kanal listesi)
  - Skip link yok
  - Semantik HTML eksik (`<div>` yerine `<article>`, `<nav>` kullanilmali)
- Onerilen yon: En azindan modal'lara focus trap, interaktif elemanlara aria-label, toast'lara aria-live ekle

### 6.5 Bos Durum Yonetimi

**Bulgu UI-05: Tutarsiz bos durum gosterimi**
- Seviye: DUSUK
- Alan: UI/UX
- Kanit: Bazi component'ler bos durum mesaji gosteriyor (DMPanel, FriendsSidebarContent), bazilari gostermiyor (VoiceNetwork, UserSearch)
- Onerilen yon: Reusable EmptyState component'i olustur

### 6.6 Hardcoded String'ler

**Bulgu UI-06: Turkce metinler component'lere dagitilmis**
- Seviye: DUSUK (tek dil destegi amaciyla)
- Alan: UI/UX
- Kanit: 50+ dosyada toplam 200+ hardcoded Turkce string
- Onerilen yon: Simdilik sorun degil ama gelecekte i18n gerekirse buyuk refactor gerekecek. En azindan ortak metinleri constants dosyasina tasi.

---

## 7. DATA FLOW / BACKEND INTEGRATION REVIEW

### 7.1 Cift Veri Kaynagi Sorunu

**Bulgu DATA-01: Presence ve Chat farkli kanallardan**
- Seviye: ORTA
- Alan: Veri Akisi
- Kanit:
  - Kullanici durumu: Supabase Realtime Presence
  - Oda mesajlari: Ozel WebSocket (chat-server.cjs)
  - DM: Ayni WebSocket, farkli handler'lar
  - Arkadaslik: Supabase postgres_changes
- Neden sorun: Farkli kaynaklardaki veri tutarsizliklari reconciliation gerektirir. Cevrimdisi/cevrimici gecislerde senkronizasyon kaybi olabilir.
- Onerilen yon: Belgelendirilmis veri akis diyagrami; her veri tipi icin "source of truth" net tanimlanmali

### 7.2 Kullanici/Kanal Yukleme Tekrari

**Bulgu DATA-02: Ayni veri yukleme kodu 3-4 kez tekrarlaniyor**
- Seviye: YUKSEK
- Alan: Veri Akisi
- Dosya: `src/App.tsx`
- Kanit:
  - Kullanici yukleme (DbProfile -> User[]): satir 735-768, 809-835, 1682-1705, 2167-2190 (4 kez)
  - Kanal yukleme (DbChannel -> VoiceChannel[]): satir 782-798, 1662-1677, 2148-2162 (3 kez)
  - Presence baslama sekansı (startPresence, resyncPresence, setTimeout): satir 841-842, 1719-1720, 2204-2205 (3 kez)
- Onerilen yon: `loadUsers()`, `loadChannels()`, `initPresence()` gibi ortak fonksiyonlar cikar

### 7.3 Offline/Error State Eksikligi

**Bulgu DATA-03: Hata siniri (Error Boundary) yok**
- Seviye: YUKSEK
- Alan: Veri Akisi
- Kanit: Hicbir yerde React Error Boundary kullanilmiyor. Herhangi bir component'te hata olursa tum uygulama coker.
- Onerilen yon: En azindan ChatView, SettingsView ve modal'lar icin Error Boundary ekle

**Bulgu DATA-04: Yukleme/hata durumlari tutarsiz**
- Seviye: ORTA
- Alan: Veri Akisi
- Kanit: Bazi yerler `isLoading` boolean, bazi yerler toast mesaji, bazi yerler sessizce basarisiz oluyor
- Onerilen yon: Standart loading/error/success pattern'i belirle

---

## 8. ELECTRON-SPECIFIC REVIEW

### 8.1 Pozitif Bulgular

- `contextIsolation: true` (main.cjs satir 301)
- `nodeIntegration: false` (main.cjs satir 302)
- `enableWebSQL: false` (main.cjs satir 305)
- Preload script minimal API (logger, update, app, ptt)
- `shell.openExternal` kullanimi yok
- `eval()`, `exec()`, `spawn()` kullanimi yok
- Tek ornek kilidi (single instance lock, satir 70-73)
- Log dosyalari 7 gun sonra temizleniyor (satir 176-181)

### 8.2 Riskler

**Bulgu ELEC-01: Auto-update kontrol akisi**
- Seviye: BILGI
- Alan: Electron
- Dosya: `electron/main.cjs`
- Kanit: `autoDownload: false`, `autoInstallOnAppQuit: false` — kullanici onaysiz guncelleme yapilmiyor
- Durum: Dogru yapilandirilmis

**Bulgu ELEC-02: Preload window API tiplendirmesi**
- Seviye: DUSUK
- Alan: Electron
- Kanit: `window.electronPtt`, `window.electronLogger`, `window.electronApp` global'leri TypeScript'te duzgun tiplendirilmemis; `as any` veya optional chaining ile erisiliyor
- Onerilen yon: `global.d.ts` ile window augmentation tanimla

**Bulgu ELEC-03: uiohook-napi global hotkey**
- Seviye: BILGI
- Alan: Electron
- Dosya: `electron/main.cjs`
- Kanit: PTT icin global klavye/fare dinleyicisi. Duzgun IPC uzerinden iletiliyor, guvenli.

---

## 9. SUPABASE / REALTIME / BACKEND REVIEW

### 9.1 Server Dosyalari

**Bulgu SRV-01: Graceful shutdown yok**
- Seviye: KRITIK
- Alan: Backend
- Dosya: `server.cjs`, `chat-server.cjs`
- Kanit: Hicbir dosyada `SIGTERM`/`SIGINT` handler'i yok. SQLite veritabani `dmDb.close()` hic cagirilmiyor.
- Olasi etkisi: Ani kapatmada SQLite WAL dosyasinda bozulma; in-flight istekler kayip
- Onerilen yon: Process signal handler ekle; SQLite'i kapat; HTTP server'i graceful shutdown et

**Bulgu SRV-02: Sessiz catch bloklari**
- Seviye: YUKSEK
- Alan: Backend
- Dosya: `chat-server.cjs` satir 540, 562, 582, 621
- Kanit: `catch {}` — hata yutulur, log yok
- Neden sorun: Debugging imkansiz; uretimde sessiz veri kaybi
- Onerilen yon: En azindan `console.error` ile logla

**Bulgu SRV-03: Health check bagimliliklari kontrol etmiyor**
- Seviye: ORTA
- Alan: Backend
- Dosya: `server.cjs` satir 68-70, `chat-server.cjs` satir 213-217
- Kanit: `/health` sadece `{ status: 'ok' }` donuyor; Supabase, LiveKit, SQLite baglantilarini kontrol etmiyor
- Onerilen yon: Her bagimliligi kontrol eden deep health check endpoint'i ekle

**Bulgu SRV-04: DM conversation key string karsilastirmasi**
- Seviye: ORTA
- Alan: Backend
- Dosya: `chat-server.cjs` satir 153-155
- Kanit: `function makeDmKey(a, b) { return a < b ? ... }` — UUID'lerde string karsilastirmasi deterministik ama sezgisel degil
- Durum: Supabase UUID'leri her zaman ayni formatta oldugu icin pratikte sorun cikarmaz ama belgelenmeli

### 9.2 Supabase Migration'lar

**Bulgu DB-01: Migration dosyalari daginik adlandirma**
- Seviye: DUSUK
- Alan: Supabase
- Kanit: Bazi dosyalar tarih ile basliyor (`20260322_...`), biri tarihsiz (`fix_admin_send_invite_atomic.sql`)
- Onerilen yon: Tutarli adlandirma kurali uygula

**Bulgu DB-02: Friendship modeli dogru**
- Seviye: BILGI (pozitif)
- Alan: Supabase
- Kanit: `user_low_id < user_high_id` constraint ile symmetric pair — duplicate onleniyor

### 9.3 Rate Limiting

**Bulgu SRV-05: WebSocket rate limit zayif**
- Seviye: ORTA
- Alan: Backend
- Dosya: `chat-server.cjs` satir 355
- Kanit: Saniyede 20 mesaj; kullanici birden fazla baglanti acarsa per-connection limit per-user degil
- Onerilen yon: Per-user global rate limit ekle; DM icin ayri rate limit

---

## 10. FILE STRUCTURE / MAINTAINABILITY REVIEW

### 10.1 Buyuk Dosyalar

| Dosya | Satir | Durum |
|-------|-------|-------|
| ChatView.tsx | 3066 | KRITIK — bol |
| App.tsx | 2572 | KRITIK — bol |
| chat-server.cjs | 822 | YUKSEK — domain'lere ayir |
| AnnouncementsPanel.tsx | 869 | YUKSEK — alt component'lere ayir |
| FriendsSidebarContent.tsx | 714 | YUKSEK — alt component'lere ayir |
| LoginCodeView.tsx | 539 | ORTA |
| adaptiveTheme.ts | 535 | KABUL — utility |
| supabase.ts | 490 | ORTA — domain'lere bol |
| usePresence.ts | 463 | YUKSEK — subscription logic cikar |
| SettingsSections.tsx | 461 | ORTA |
| AccountSection.tsx | 426 | ORTA |
| AdminUserManagement.tsx | 392 | ORTA |
| useLiveKitConnection.ts | 362 | ORTA |
| UserProfilePopup.tsx | 359 | ORTA |
| VoiceNetwork.tsx | 356 | ORTA |
| DMPanel.tsx | 346 | ORTA |
| SocialSearchHub.tsx | 331 | ORTA |
| useUpdateController.ts | 308 | ORTA |

### 10.2 Klasor Yapisi

```
src/
  assets/          -- statik dosyalar (OK)
  components/      -- 70+ dosya, duz yapi (sorunlu)
    chat/          -- 8 ses gorsellestime component'i (OK)
    settings/      -- ayar bolum component'leri (OK)
  contexts/        -- 7 context (OK)
  features/
    update/        -- guncelleme sistemi (iyi ayristirilmis)
  hooks/           -- 17 hook (OK)
  lib/             -- 9 servis/utility (OK)
  views/           -- 6 sayfa (OK)
```

**Bulgu FILE-01: components/ duz yapida 70+ dosya**
- Seviye: ORTA
- Alan: Yapi
- Kanit: AnnouncementsPanel, AdminUserManagement, BanScreen, DMPanel, FriendsSidebarContent hepsi ayni dizinde
- Onerilen yon: Domain bazli alt klasorler: `components/friends/`, `components/admin/`, `components/dm/`, `components/modals/`

### 10.3 Duplicate Logic

| Pattern | Tekrar | Dosyalar |
|---------|--------|----------|
| ESC handler (window keydown) | 5+ | ConfirmContext, ChatView (3 yer), UserProfilePopup, DMPanel |
| Avatar gosterim (http check + fallback) | 4+ | DMPanel, UserCard, VoiceNetwork, UserProfilePopup |
| Tarih formatlama | 3+ | DMPanel, AnnouncementsPanel, LoginCodeView |
| Kullanici yukleme (DB -> User[]) | 4 | App.tsx (4 farkli yer) |
| Kanal yukleme (DB -> Channel[]) | 3 | App.tsx (3 farkli yer) |
| Input clear + focus | 4+ | ChannelQuickSearch, UserSearch, SocialSearchHub |
| Onay modal yapisi | 3 | ConfirmContext, ConfirmModal, MiniConfirm |

---

## 11. DEVELOPER VELOCITY CONSTRAINTS

**Bulgu VEL-01: App.tsx'e dokunmadan yeni ozellik eklemek neredeyse imkansiz**
- Seviye: YUKSEK
- Kanit: Auth, kanal, moderasyon, davet, kayit, ayarlar — her sey App.tsx'ten geciyor. Yeni bir handler eklemek 54 useState + 27 useEffect arasinda navigasyon gerektirir.
- Etki: Gelistirme hizi duser; yeni gelistirici onboarding zorlasin

**Bulgu VEL-02: ChatView'da bir degisiklik tum UI'i etkiler**
- Seviye: YUKSEK
- Kanit: 3066 satirlik dosyada mobile footer, desktop controls, chat panel, participant cards, modal'lar hep ayni component. Birindeki degisiklik hepsini etkiler.

**Bulgu VEL-03: Tekrar eden veri yukleme kodu refactor direnci**
- Seviye: ORTA
- Kanit: Kullanici/kanal yukleme 3-4 kez tekrarlaniyor. Birinde degisiklik yapildiginda diger 3'u de guncellenmeli — unutma riski yuksek.

**Bulgu VEL-04: Test yazimi zor**
- Seviye: ORTA
- Kanit: 40+ handler, 54 useState — App.tsx icin unit test yazmak pratikte imkansiz. ChatView icin de benzer durum.
- Onerilen yon: Hook'lara ayirma sonrasi her hook bagimsiz test edilebilir

**Bulgu VEL-05: Merge conflict garantisi**
- Seviye: YUKSEK
- Kanit: Iki gelistirici ayni anda App.tsx veya ChatView.tsx'e dokunursa conflict kacinilamaz. Dosyalar cok buyuk, degisiklikler cogu zaman ayni bolgede.

---

## 12. TECHNICAL DEBT INVENTORY

| # | Borcm | Seviye | Tahmini Is |
|---|-------|--------|-----------|
| TD-01 | App.tsx bolme | Kritik | Buyuk |
| TD-02 | ChatView.tsx bolme | Kritik | Buyuk |
| TD-03 | Inline component'leri cikarma | Yuksek | Orta |
| TD-04 | supabase.ts bolme | Orta | Kucuk |
| TD-05 | Hardcoded renkleri token'a cevir | Yuksek | Orta |
| TD-06 | Duplicate logic birlestir | Orta | Orta |
| TD-07 | Error Boundary ekle | Yuksek | Kucuk |
| TD-08 | z-index sistemi | Orta | Kucuk |
| TD-09 | ESC handler hook'u | Dusuk | Kucuk |
| TD-10 | Avatar component birlestir | Dusuk | Kucuk |
| TD-11 | Tarih formatlama birlestir | Dusuk | Kucuk |
| TD-12 | components/ alt klasorler | Orta | Kucuk |
| TD-13 | WebSocket manager sinifi | Orta | Orta |
| TD-14 | window API tiplendirmesi | Dusuk | Kucuk |
| TD-15 | Dead code temizligi (ChatView hidden footer, test butonu) | Dusuk | Kucuk |
| TD-16 | console.log debug satirlari | Dusuk | Kucuk |

---

## 13. COMPLETED VS MISSING CAPABILITIES

### Yapilmislar (Guclu)

| Ozellik | Durum | Not |
|---------|-------|-----|
| Supabase Auth | Tamamlandi | JWT, refresh token, session persistence |
| Ses odalari (LiveKit) | Tamamlandi | Baglanti, yeniden baglanti, kalite izleme |
| PTT / VAD | Tamamlandi | Electron global hotkey destegi |
| Arkadaslik sistemi v2 | Tamamlandi | Istek, kabul, reddet, engelle |
| DM sistemi | Tamamlandi | SQLite persistence, read receipt |
| Moderasyon | Tamamlandi | Mute, ban, kick, admin toggle |
| Tema sistemi | Tamamlandi | 6 tema, 50+ token, adaptif renkler |
| Update sistemi | Tamamlandi | State machine, platform adapterleri |
| Oda modlari | Tamamlandi | Social, Gaming, Broadcast, Quiet |
| Ses ducking | Tamamlandi | Dominant speaker tespiti |
| Presence sistemi | Tamamlandi | Supabase Realtime |
| Davet kodu sistemi | Tamamlandi | Atomik, email ile |
| Admin paneli | Tamamlandi | Kullanici yonetimi, sifre sifirlama |
| Duyuru sistemi | Tamamlandi | Admin/moderator paneli |

### Yarim Kalmislar

| Ozellik | Durum | Not |
|---------|-------|-----|
| Bildirim paneli | Eksik | ChatView.tsx:2193 TODO yorumu |
| Error Boundary | Eksik | Hicbir yerde yok |
| i18n altyapisi | Eksik | Tum metinler hardcoded Turkce |
| Offline mode | Eksik | Ag kesintisinde DM kayip |
| Test altyapisi | Eksik | 0 unit/integration test |
| CSP header | Eksik | Guvenlik katmani |
| Graceful shutdown | Eksik | Server dosyalarinda |

### Yapilmamis ama Gerekli

| Ozellik | Aciliyet | Not |
|---------|----------|-----|
| Message queue (offline) | Orta | Ag kesintisinde mesaj kaybi |
| Structured logging | Orta | Debugging zorlugu |
| Health check (deep) | Orta | Bagimliliklari kontrol etmiyor |
| Virtualized listeler | Yuksek | Olceklendirme icin sart |
| Focus trap (modal) | Orta | Erisilebilik standardi |

---

## 14. HIGHEST-RISK REGRESSION AREAS

| # | Alan | Neden Riskli | Tetikleyici |
|---|------|-------------|-------------|
| 1 | Presence sistemi | 463 satirlik hook, broadcast stacking, race condition'lar | Herhangi bir presence/room degisikligi |
| 2 | App.tsx handler'lar | 49 handler ic ice bagimli; birini degistirmek diger akislari kirar | Yeni ozellik ekleme |
| 3 | ChatView inline component'ler | 11+ inline tanim; birini cikarma sirasinda state referanslari kirilik | UI refactor |
| 4 | WebSocket reconnect | chatService/dmService paylasimli socket; reconnect mantigi kirilgan | Ag degisiklikleri |
| 5 | Kullanici/kanal yukleme | 3-4 kez tekrarlanan kod; birinde fix yapilip digerinde unutulma | Profil/kanal sema degisikligi |
| 6 | Mute/ban zamanlayicilari | Birden fazla setInterval ayni veriyi kontrol eder | Moderasyon degisiklikleri |
| 7 | LiveKit event handler'lari | 10+ event, closure capture, stale ref riski | Ses altyapisi degisiklikleri |
| 8 | DM sistemi | SQLite + WebSocket + friendship kontrolu uc farkli kaynakta | Arkadaslik sistemi degisiklikleri |
| 9 | Login/register akisi | 3 farkli giris yolu (code, password, register) hepsi App.tsx'te | Auth degisiklikleri |
| 10 | Electron PTT | uiohook-napi + IPC + usePttAudio ic ice bagimliligi | Ses/input degisiklikleri |

---

## 15. PRIORITIZED ACTION PLAN

### A. Hemen Cozulmeli

| # | Eylem | Etki | Risk |
|---|-------|------|------|
| A1 | `.env` dosyasini `.gitignore`'a ekle, key'leri rotate et | Guvenlik ihlali kapanir | Cok dusuk |
| A2 | CORS'tan `null` origin'i cikar | Bypass riski kapanir | Cok dusuk |
| A3 | DM:CONVERSATIONS'a arkadaslik filtresi ekle | Veri sizintisi kapanir | Dusuk |
| A4 | chat-server.cjs'e graceful shutdown ekle | SQLite bozulma riski kapanir | Dusuk |
| A5 | Sessiz catch bloklarini loglama ile degistir | Debug imkani artar | Cok dusuk |

### B. Yakin Vadede Cozulmeli (1-3 sprint)

| # | Eylem | Etki | Risk |
|---|-------|------|------|
| B1 | App.tsx'ten domain hook'lari cikar (useAuthFlow, useChannelManagement, useAdminPanel) | Bakimlanabilirlik buyuk olcude artar | Orta |
| B2 | ChatView'dan inline component'leri cikar + React.memo | Performans 30-50% artar | Orta |
| B3 | Error Boundary ekle (en az root + view seviyesi) | Uygulama cokmesi onlenir | Dusuk |
| B4 | Veri yukleme fonksiyonlarini birlestir (loadUsers, loadChannels) | Tekrar eden kod azalir, bug riski duser | Dusuk |
| B5 | WebSocket reconnect state machine | Race condition kapanir | Orta |
| B6 | Presence handler stacking duzelt | Stabilite artar | Orta |
| B7 | Hardcoded renkleri tema token'larina tasi | Gorsel tutarlilik artar | Dusuk |
| B8 | CSP header ekle | Guvenlik katmani artar | Dusuk |

### C. Sonraya Birakilabilir (roadmap)

| # | Eylem | Etki |
|---|-------|------|
| C1 | Virtualized listeler | Olceklendirme |
| C2 | components/ alt klasor organizasyonu | Navigasyon kolayligi |
| C3 | supabase.ts domain bazli bolme | Okunabilirlik |
| C4 | ESC handler hook'u | Code reuse |
| C5 | Avatar component birlestirme | Code reuse |
| C6 | z-index sistemi | UI tutarliligi |
| C7 | i18n altyapisi | Coklu dil destegi |
| C8 | Structured logging | Operasyonel gorunurluk |

### D. Bilincli Olarak Boyle Kalabilir

| # | Alan | Neden |
|---|------|-------|
| D1 | Tek dil (Turkce) | Hedef kitle Turkce; i18n ihtiyaci yoksa gereksiz karmasiklik |
| D2 | SQLite DM depolama | Performans ve basitlik icin dogru secim; PostgreSQL'e gecis gereksiz |
| D3 | Module-scope WebSocket singleton | React disinda veri katmani; class'a gecis kozmetik |
| D4 | 7 context provider | Sayisi makul; birlestirme gereksiz karmasiklik yaratir |
| D5 | Electron + Capacitor + Web coklu platform | Mimari karmasiklik kabul edilebilir; platform.ts ile yonetiliyor |

---

### En Tehlikeli 10 Sorun

1. `.env`'de sunucu sirlari ifsa (SEC-01)
2. DM arkadaslik kontrolu eksik (SEC-04)
3. Presence handler stacking (STAB-01)
4. WebSocket reconnect race (STAB-02)
5. LiveKit unmount sonrasi setState (STAB-03)
6. SQLite graceful shutdown yok (SRV-01)
7. Sessiz catch bloklari (SRV-02)
8. CORS null origin izni (SEC-02)
9. Kanal join/leave yarisi (STAB-05)
10. Presence state sync race (STAB-04)

### En Pahaliya Patlayabilecek 10 Sorun

1. App.tsx monoliti (ARC-02) — her degisiklik regresyon riski
2. ChatView monoliti (ARC-03) — performans + bakim maliyeti
3. `.env` ifsa (SEC-01) — veri ihlali tazminat/itibar maliyeti
4. Error Boundary eksik (DATA-03) — uretimdeki herhangi bir hata = beyaz ekran
5. Tekrar eden veri yukleme (DATA-02) — bir yerdeki fix digerinde eksik kalir
6. Test altyapisi yok — her degisiklik manuel test gerektirir
7. Inline component'ler (PERF-01) — kullanici sayisi artinca performans cokus
8. Graceful shutdown yok (SRV-01) — veri kaybi
9. DM guvenlik acigi (SEC-04) — kullanici guveni kaybı
10. Timer leak'ler (PERF-07) — uzun sureli kullanim sonrasi bellek artisi

### En Cok Gelistirme Hizini Yavaslataran 10 Sorun

1. App.tsx 2572 satir — onboarding, merge conflict, navigasyon zorlugu
2. ChatView.tsx 3066 satir — ayni sebepler
3. 4x tekrarlanan kullanici yukleme kodu — her degisiklikte 4 yer guncelleme
4. 3x tekrarlanan kanal yukleme kodu — ayni sorun
5. 49 handler fonksiyonu tek dosyada — yeni ozellik ekleme zorlugu
6. 54 useState tek component'te — state yonetimi karmasa
7. components/ duz 70+ dosya — aranilan dosyayi bulma zorlugu
8. Test altyapisi yok — refactor guvensiz
9. Duplicate logic (ESC, avatar, tarih) — her yeni yerde ayni kodu yaz
10. supabase.ts 490 satir tek dosya — API degisikliginde navigasyon zorlugu

### En Az Riskle Buyuk Fayda Saglayacak 10 Iyilestirme

1. `.env`'yi `.gitignore`'a ekle — 1 satir, kritik guvenlik
2. Sessiz catch bloklarina log ekle — 4 satir, debugging muazzam iyilesir
3. Error Boundary ekle — 20 satir component, uygulamanin cokme direnci artar
4. loadUsers/loadChannels fonksiyonlari cikar — 50 satir, 300+ satir tekrar azalir
5. CORS null origin cikar — 1 satir, guvenlik artar
6. useEscapeKey hook'u yaz — 10 satir, 5 yerde tekrar kalkar
7. Hardcoded renklere tema token'lari — CSS'te 4 token ekle, 40 yerde kullan
8. DM friendship filter — 5 satir SQL, guvenlik acigi kapanir
9. Dead code sil (ChatView hidden footer, debug log'lari) — temizlik
10. graceful shutdown handler — 15 satir, veri butunlugu korunur

---

## 16. EK ANALIZLER

### 16.1 Sorumlulugu Fazla Olan Dosyalar

| Dosya | Sorumluluk Sayisi |
|-------|------------------|
| App.tsx | 8+ (auth, channel, moderation, admin, network, presence, invite, settings) |
| ChatView.tsx | 6+ (voice UI, chat, mobile drawer, controls, modals, participants) |
| supabase.ts | 6+ (auth, profile, channel, moderation, invite, activity) |
| usePresence.ts | 4+ (presence tracking, broadcast handling, membership sync, status management) |
| chat-server.cjs | 3+ (room chat, DM, auth) |

### 16.2 Hardcoded Endpoint/URL Adaylari

| Deger | Dosyalar | Not |
|-------|----------|-----|
| `https://api.cylksohbet.org` | App.tsx, ForgotPasswordModal, ForcePasswordChangeModal, livekit.ts | Env fallback olarak hardcoded |
| `wss://api.cylksohbet.org/ws/chat` | chatService.ts | Env fallback olarak hardcoded |
| `ws://46.225.99.185:7880` | .env.production | IP adresi hardcoded |
| `10001` | chat-server.cjs | Default port |
| `https://fonts.googleapis.com/...` | index.css | CDN hardcoded |
| `github.com/OWNER/REPO` | githubReleases.ts, androidApk.ts | Repo bilgisi hardcoded |

### 16.3 Hardcoded Renk Bypass Adaylari (Tema Disinda)

| Renk | Kullanim | Dosya Sayisi |
|------|---------|-------------|
| `text-red-400/500` | Hata, tehlike, ban | 12+ |
| `text-emerald-400/500` | Basari, onay | 10+ |
| `text-violet-400` | AFK, etkinlik | 6 |
| `text-amber-400` | Uyari, onemli | 3 |
| `text-blue-400/500` | Bilgi, secim | 8 |
| `bg-red-500/10-20` | Hata arka plan | 8+ |
| `bg-emerald-500/5-10` | Basari arka plan | 5+ |
| `bg-orange-500/20` | Admin mute | 5 |

### 16.4 Debug/Test Kodu Temizlenmesi Gereken

| Yer | Icerik |
|-----|--------|
| ChatView.tsx satir 446, 449 | console.log invite modal debug |
| ChatView.tsx satir 1232 | console.log modal render condition |
| ChatView.tsx satir 1844-1858 | TEST BUTONU (gecici) + FAKE_NAMES dizisi |
| ChatView.tsx satir 2670-2830 | hidden footer (kullanilmayan ~160 satir) |

### 16.5 Reusable Component Firsatlari

| Firsat | Mevcut Durum |
|--------|-------------|
| AvatarDisplay | 4+ yerde ayni http kontrol + fallback mantigi |
| EmptyState | 5+ yerde farkli bos durum gosterimi |
| ConfirmDialog | 3 ayri implementasyon (ConfirmContext, ConfirmModal, MiniConfirm) |
| EscapeKeyHandler | 5+ yerde ayni window keydown pattern |
| DateFormatter | 3+ yerde inline tarih formatlama |
| StatusBadge | Coklu yerlerde durum rengi/ikonu hesaplama |

### 16.6 Global State / Context Sisme Riski

| Context | Deger Sayisi | Risk |
|---------|-------------|------|
| AppStateContext | 40+ handler + 20+ deger | YUKSEK — herhangi bir degisiklik tum consumer'lari etkiler |
| SettingsCtx | 18 deger | ORTA — buyuyor ama henuz sorun degil |
| UIContext | 6 modal/menu durumu | DUSUK — makul |
| UserContext | 5 deger + 5 fonksiyon | DUSUK — makul |
| ChannelContext | 4 deger | DUSUK — minimal |
| AudioCtx | 8 deger | DUSUK — makul |
| ConfirmContext | 1 fonksiyon | DUSUK — minimal |

### 16.7 Event-Driven Bug Cikarabilecek Alanlar

| Alan | Risk | Aciklama |
|------|------|----------|
| Presence sync + broadcast | YUKSEK | Ayni anda sync ve broadcast farklı veri gosterebbe |
| LiveKit event + presence update | YUKSEK | ParticipantConnected ve presence join yarisi |
| DM WebSocket + chat WebSocket | ORTA | Ayni socket, farkli handler'lar, reconnect sirasinda karisabilir |
| Admin mute broadcast + timer check | ORTA | Broadcast ile timer ayni anda bitis kontrol ederse cift islem |
| Auto-leave + manual leave | DUSUK | Timer tetiklenmesi sirasinda kullanici manual ayrilir |

### 16.8 "Tek Kisiye Bagli Bilgi" Karmasik Bolumleri

| Bolge | Neden Karisik |
|-------|--------------|
| usePresence.ts satir 73-114 | Room membership sync — presence'tan oda uyeligi cikarim algoritmasi |
| useLiveKitConnection.ts satir 181-312 | 10+ event handler, timeout, abort, ref yonetimi |
| App.tsx satir 717-861 | Session restore — 144 satirlik akis, 5 async islem sirasiyla |
| App.tsx satir 935-986 | Kod zamanlayici + bos oda silme — iki farkli sorumluluk tek effect |
| ChatView.tsx satir 601-642 | Dominant speaker hysteresis algoritmasi |
| chat-server.cjs satir 286-311 | Oda temizleme zamanlama mantigi (TOCTOU guvenli ama karisik) |

---

## RAPOR SONU

**Toplam Bulgu Sayisi:**
- Kritik: 10
- Yuksek: 15
- Orta: 18
- Dusuk: 10
- Bilgi: 5

**Genel Degerlendirme:**
PigeVox gercek kullanicilar tarafindan kullanilan, calisan bir urun. Temel mimari kararlar (Supabase, LiveKit, Electron guvenlik modeli) dogru. Ancak hizli gelistirme surecinde biriken teknik borc — ozellikle App.tsx ve ChatView.tsx monolitleri — hem stabilite hem gelistirme hizi icin ciddi risk olusturuyor. Guvenlik tarafinda `.env` ifsa konusu acil mudahale gerektiriyor.

En yuksek ROI (yatirim getirisi) siralamasiyla: (1) .env ifsa duzelt, (2) Error Boundary ekle, (3) App.tsx'i hook'lara bol, (4) ChatView inline component'leri cikar.
