# Proje Kuralları — PigeVox

## Türkçe UI Text Yazım Standardı

Kullanıcıya görünen TÜM metinler doğrudan UTF-8 Türkçe karakter ile yazılmalı.

### YASAK
- Unicode escape: `\u0131`, `\u00fc`, `\u015f` vb.
- Çift escape: `\\u0131`
- String başında kaçış: `\Ş`, `\Ç`, `\Ğ`, `\İ`, `\Ö`, `\Ü`
- JSON stringify edilmiş UI metni

### DOĞRU
```tsx
<label>Şifre Tekrar</label>
<button>Kaydet</button>
<input placeholder="Kullanıcı ara..." />
```

### Refactor / Büyük Değişiklik Sonrası Kontrol
Her büyük değişiklikten sonra şu pattern'leri ara ve düzelt:
- `\u0` (unicode escape)
- `\Ç`, `\Ş`, `\Ğ`, `\İ`, `\Ö`, `\Ü` (stray backslash)

### Agent Kuralı
Kod üretirken Türkçe metinleri ASLA escape etme. Olduğu gibi UTF-8 yaz.

## Orta Panel Navigasyon Kuralı — ASLA BOZULMAMALI

Kullanıcı bir sohbet/ses odasına **nerede tıklarsa tıklasın** (sol sidebar, dock,
davet, bildirim, event), orta panel mutlaka o odayı açmalıdır.

### Zorunlu davranış
Kanal tıklaması → hepsi kapanır:
- `view === 'settings'` → `setView('chat')`
- `settingsServerId` → `setSettingsServerId(null)` + `setSettingsInitialTab(undefined)`
- `showDiscover` → `setShowDiscover(false)`
- `isServerHomeView` → `setIsServerHomeView(false)`

### Nerede uygulanır
1. `ChatView.tsx` — `activeChannel` değişim effect'i (her yeni oda açılışında)
2. `ChatView.tsx` — `mayvox:goto-chat` event listener (aynı odaya tekrar tıklama)
3. `App.tsx` — `handleJoinChannel` içinde `setView('chat')` + event dispatch

### YASAK
- Yeni bir "keep settings open while in channel" kısayolu eklemek
- `settingsServerId` state'ini kanal tıklamasında korumak
- Sohbet odası tıklandığında orta panelin başka bir şey gösterdiği bir akış kurmak

Bu kural kullanıcı kaygısıdır: sohbet/ses odasına tıklayınca o odanın açılmaması
kullanıcıyı "kayboldum" hissine iter. Bozan refactor PR'ları reddedilir.

## Mesaj Bildirim Sesi Kuralı — ASLA BOZULMAMALI

Kullanıcı bir sohbet/ses odasında **içeride** olsa bile, odada başka biri mesaj
gönderdiğinde mesaj bildirim tonu **mutlaka** çalar. "In-room suppression" (aynı
odadayken ses kısma/susturma) **YOK**.

### Zorunlu davranış
`src/features/chatview/hooks/useChatMessages.ts` → `onMessage`:
- Mesaj sender'ı `currentUser.id` değilse → `playMessageReceive({ bypassEnabled: true })`
- MP3 fail → `previewNotifySound()` (pref-bypass beep)
- Hiçbir koşul: `activeChannel === msg.roomId` kontrolü, `chatMuted` gate'i, focus check vb. **yok**

### YASAK
- "Aynı odadaysam bildirim sesi gerekmez" mantığı eklemek
- `chatMuted` (moderator sohbeti engelle toggle'ı) sound gate olarak kullanmak — o yazma yetkisiyle ilgili, ses değil
- `isActivelyViewingRoom` veya `activeChannel === roomId` tipinde gate eklemek
- Sadece DM için var olan `isActivelyViewingDm` benzeri bir gate'i room mesajlarına genişletmek
- `resolveEffectiveMode`'da `isInVoiceRoom` trigger'ı eklemek (VOICE_PRIORITY otomatik geçiş DM sesini kısar)
- `applyModeAdjustment` VOICE_PRIORITY branch'inde `IN_VOICE_PASSIVE` downgrade'i
- Herhangi bir notification intelligence/policy katmanında "voice room içindeyken sessize al" mantığı

### Neden iki yerde düzeltildi
1. `useChatMessages.onMessage` → chat room mesajları için direkt `playMessageReceive`
2. `modes.ts` `resolveEffectiveMode` + `applyModeAdjustment` → DM sesleri voice room'dayken kısılmasın

Sadece `IN_VOICE_ACTIVE` (kullanıcı aktif konuşuyorken) ducking yapılır; konuşma sırasında
DM tonu araya girmesin. Odada **oturmak** ses suppression'ına neden olmaz.

Bu kural kullanıcı talebidir: "sohbet odasında dahi olsa o ses, ton çalacak.
mesaj sesini duyacak herkes." Bozan refactor PR'ları reddedilir.
