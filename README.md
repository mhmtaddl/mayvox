# PigeVox — Caylaklar Sesli Sohbet

Electron + React ile yazılmış, LiveKit tabanlı masaüstü sesli sohbet uygulaması.

## Özellikler

- Mayvox backend üzerinden kullanıcı girişi (davet kodu veya kullanıcı adı/parola)
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
| Auth / DB | Mayvox Backend + PostgreSQL |
| Token Server | Express — Hetzner/PM2 |
| PTT Hook | uiohook-napi |
| Build | Vite 6, electron-builder (NSIS) |

---

## Geliştirme Ortamı

### Gereksinimler

- Node.js 20+
- npm 10+
- Çalışan bir LiveKit sunucusu
- Çalışan Mayvox backend/PostgreSQL ortamı

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
| `VITE_LIVEKIT_URL` | LiveKit WebSocket endpoint (`ws://` veya `wss://`) |
| `VITE_TOKEN_SERVER_URL` | Token server adresi (dev: `http://localhost:10000`) |
| `VITE_API_BASE_URL` | Mayvox backend API adresi (dev: `http://localhost:4001`) |
| `VITE_CHAT_SERVER_URL` | Chat/realtime bridge adresi (dev: `http://localhost:10001`) |

> Production build için `.env.production` bu değerleri otomatik ezer.

### Sunucu tarafı — Render dashboard / yerel `.env`

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | PostgreSQL bağlantı adresi |
| `JWT_SECRET` | Backend/token JWT imzalama sırrı |
| `LIVEKIT_API_KEY` | LiveKit API anahtarı |
| `LIVEKIT_API_SECRET` | LiveKit API sırrı |
| `LIVEKIT_URL` | LiveKit server URL'i |

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

## Token Server

`server.cjs` — Express tabanlı, Mayvox JWT doğrulamalı LiveKit token endpoint.

```
POST /livekit-token
Authorization: Bearer <mayvox-jwt>
Body: { roomName, participantName }
```

Deploy ortamında şu env var'ları set edin:
`DATABASE_URL`, `JWT_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

---

## Güvenlik Notları

- LiveKit `LIVEKIT_API_SECRET` hiçbir zaman istemci bundle'a girmez.
- Token server rate-limit uygular (IP başına 20 istek/dakika).
- CORS yalnızca `localhost:3000` ve packaged Electron origin'ine izin verir.
