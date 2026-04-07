# PigeVox — Caylaklar Sesli Sohbet

Electron + React ile yazılmış, LiveKit tabanlı masaüstü sesli sohbet uygulaması.

## Özellikler

- Supabase Auth üzerinden kullanıcı girişi (davet kodu veya kullanıcı adı/parola)
- LiveKit self-hosted ses odaları
- Bas-konuş (PTT) — arka planda çalışırken de tuş/fare dinler (uiohook-napi)
- Oda şifresi, davet-only oda, kullanıcı başına ses seviyesi
- Moderasyon: susturma, ban, admin atama

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| UI | React 19, TypeScript, Tailwind CSS v4, Motion |
| Masaüstü | Electron 41 |
| Ses | LiveKit (self-hosted, `livekit-server-sdk`) |
| Auth / DB | Supabase |
| Token Server | Express — Render.com |
| PTT Hook | uiohook-napi |
| Build | Vite 6, electron-builder (NSIS) |

---

## Geliştirme Ortamı

### Gereksinimler

- Node.js 20+
- npm 10+
- Çalışan bir LiveKit sunucusu
- Supabase projesi

### Kurulum

```bash
npm install
cp .env.example .env
# .env içindeki değerleri doldurun
```

### Yerel Geliştirme

```bash
# Vite dev server + token server + Electron aynı anda
npm run electron:dev
```

Portlar: Vite → `3000`, token server → `3001`

---

## Ortam Değişkenleri

### İstemci tarafı — `.env` (Vite bundle'a gömülür, public)

| Değişken | Açıklama |
|----------|----------|
| `VITE_SUPABASE_URL` | Supabase proje URL'i |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public, RLS korumalı) |
| `VITE_LIVEKIT_URL` | LiveKit WebSocket endpoint (`ws://` veya `wss://`) |
| `VITE_TOKEN_SERVER_URL` | Token server adresi (dev: `http://localhost:3001`) |

> Production build için `.env.production` bu değerleri otomatik ezer.

### Sunucu tarafı — Render dashboard / yerel `.env`

| Değişken | Açıklama |
|----------|----------|
| `SUPABASE_URL` | Supabase proje URL'i (token server kullanır) |
| `SUPABASE_ANON_KEY` | Supabase anon key (token server kullanır) |
| `LIVEKIT_API_KEY` | LiveKit API anahtarı |
| `LIVEKIT_API_SECRET` | LiveKit API sırrı |

> `LIVEKIT_URL` token server tarafından kullanılmaz; token üretmek için yalnızca `LIVEKIT_API_KEY` ve `LIVEKIT_API_SECRET` gereklidir.

---

## Build & Paketleme

```bash
npm run build          # Vite production build (dist/)
npm run electron:build # Electron NSIS installer (release/)
```

## Güncelleme Yayımlama (GitHub Releases)

```powershell
$env:GH_TOKEN="ghp_..."
npm run electron:build -- --publish always
```

Kullanıcılar bir sonraki açılışta güncellemeyi bildirim olarak görür.

---

## Token Server (Render.com)

`server.cjs` — Express tabanlı, Supabase JWT doğrulamalı LiveKit token endpoint.

```
POST /livekit-token
Authorization: Bearer <supabase-access-token>
Body: { roomName, participantName }
```

Render'a deploy için `render.yaml` hazırdır. Dashboard'da şu env var'ları set edin:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

---

## Güvenlik Notları

- Supabase anon key kasıtlı olarak public'tir; RLS politikaları ile korunur.
- LiveKit `LIVEKIT_API_SECRET` hiçbir zaman istemci bundle'a girmez.
- Token server rate-limit uygular (IP başına 20 istek/dakika).
- CORS yalnızca `localhost:3000` ve packaged Electron origin'ine izin verir.
