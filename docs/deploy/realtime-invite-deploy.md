# Realtime Invite Bridge — Deploy Rehberi

Bu rehber, `server-backend → chat-server` internal notify bridge'ini production'a
almak için gerekli env ve nginx adımlarını içerir.

## 1. Shared secret üret

İki serviste de aynı değer olmalı:

```bash
openssl rand -hex 32
# örn: 7e3a9f2c8b4d6e1a0f5c3b7d9e2a4c6b8d0e2f4a6c8b0d2e4f6a8c0b2d4e6f8a
```

## 2. server-backend env (Hetzner)

`/opt/cylk-server-backend/.env` dosyasına ekle:

```
INTERNAL_NOTIFY_SECRET=<üstteki değer>
CHAT_SERVER_URL=http://127.0.0.1:10001
```

Restart:
```bash
systemctl restart cylk-server-backend
```

Startup log'unda şunu görmelisin:
```
[realtime] bridge AKTİF → http://127.0.0.1:10001 (invite push etkin)
```

Eğer şunu görürsen secret eksiktir:
```
[realtime] bridge DEVRE DIŞI — INTERNAL_NOTIFY_SECRET tanımlı değil.
```

## 3. chat-server env

`/opt/cylk-chat-server/.env` dosyasına AYNI değeri ekle:

```
INTERNAL_NOTIFY_SECRET=<aynı değer>
```

Restart:
```bash
systemctl restart cylk-chat-server
```

Startup log'unda şunu görmelisin:
```
[chat-server] internal notify AKTİF (secret yüklü).
```

## 4. Nginx — /internal/* dış erişimini kapat

chat-server reverse-proxy config'ini `docs/deploy/nginx-chat-server.conf` dosyasından
kopyala:

```bash
cp docs/deploy/nginx-chat-server.conf /etc/nginx/sites-available/chat-server
# mevcut config varsa diff'ini al ve merge et
nginx -t
systemctl reload nginx
```

Kritik blok:
```nginx
location ^~ /internal/ {
    deny all;
    return 403;
}
```

Doğrula (dışarıdan 403 dönmeli):
```bash
curl -i https://api.cylksohbet.org/internal/notify-user
# HTTP/2 403
```

## 5. Savunma katmanları (defense-in-depth)

1. **Nginx**: `/internal/*` → 403
2. **chat-server kodu**: `isLoopbackRequest()` guard — sadece `127.0.0.1` kabul
3. **Shared secret**: `x-internal-secret` header doğrulaması

Üç katmandan birinin düşmesi durumunda diğer ikisi sistemi korur.

## 6. Doğrulama

İki cihaz aynı kullanıcı ile giriş yap:
- Admin (cihaz A) davet gönder → cihaz B'de 1 sn içinde bell badge artmalı
- Cihaz A'da accept → cihaz B'de satır kaybolmalı

## 7. Troubleshooting

**Log: `[realtimeNotify] failed url=... err=ECONNREFUSED`**
chat-server çalışmıyor veya yanlış port. `systemctl status cylk-chat-server` kontrol.

**Log: `[realtimeNotify] non-ok status=401`**
Secret'lar iki serviste farklı. Aynı değer olduğundan emin ol.

**Log: `[realtimeNotify] non-ok status=403`**
server-backend başka bir host'tan çağrı yapıyor (loopback değil). `CHAT_SERVER_URL`
`127.0.0.1` veya `localhost` olmalı — public hostname değil.

**Log: `[realtimeNotify] aborted url=...`**
chat-server 3 sn içinde cevap vermedi. CPU/event-loop dolu olabilir.
