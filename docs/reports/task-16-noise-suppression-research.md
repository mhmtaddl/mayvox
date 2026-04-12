# Task #16 — Noise Suppression Research

## Current state
MAYVOX şu an **browser native** noise suppression kullanıyor:
- `App.tsx:1003-1004`: `getUserMedia({ noiseSuppression, autoGainControl })`
- Chromium WebRTC'nin built-in NS'si — iyi ama premium değil

## Option A — Krisp SDK (mevcut)
**Artılar:**
- En iyi noise suppression quality (market standard)
- LiveKit'e Krisp track processor ile bağlanabilir (`@livekit/krisp-noise-filter`)
- Hazır, entegrasyonu ~2 saat

**Eksiler:**
- Commercial license gerektirir ($$$)
- Paket boyutu ~1.5 MB WASM
- Electron'da native build uyumsuzluğu test gerekir

## Option B — RNNoise WASM (open source)
**Artılar:**
- MIT license, bedava
- ~200 KB WASM, browser'da çalışır
- LiveKit ile `LocalAudioTrack.setProcessor()` üzerinden bağlanır
- Topluluk destekli, yeterince kaliteli

**Eksiler:**
- Krisp kadar iyi değil (yüksek/alt frekanslarda zayıf)
- Kendi track processor'unu yazmak gerekir

## Option C — LiveKit built-in Krisp (önerilen)
**Artılar:**
- `@livekit/krisp-noise-filter` paketi LiveKit tarafından maintained
- Tek satır aktivasyon: `track.setProcessor(KrispNoiseFilter())`
- MAYVOX zaten LiveKit kullanıyor — natural fit
- License maliyeti: LiveKit self-hosted license kapsamında

**Entegrasyon adımları:**
1. `npm install @livekit/krisp-noise-filter`
2. `useLiveKitConnection.ts` → `room.localParticipant.setMicrophoneEnabled(true)` sonrası:
   ```ts
   import { KrispNoiseFilter, isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';
   const localTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
   if (localTrack && isKrispNoiseFilterSupported()) {
     await localTrack.setProcessor(KrispNoiseFilter());
   }
   ```
3. Setting'de `isNoiseSuppressionEnabled` toggle → processor enable/disable
4. WASM assets'i Vite `optimizeDeps` veya public dir'e eklemek gerekebilir

## Lightweight alternative (NOT integration now)
Eğer Krisp commercial license istemiyorsan → **current `noiseSuppression: true`** yeterince iyi. Mevcut Chromium WebRTC NS zaten arka plan fan/klavye gürültüsünü filtreler.

## Recommendation
- **Kısa vadeli (bu pass):** mevcut Chromium native NS'yi koru. Zaten çalışıyor, kullanıcı şikayeti yoksa ekstra iş yaratmaz.
- **Orta vadeli (Pro/Ultra feature):** LiveKit Krisp entegrasyonu Pro+ planda özellik olarak sunulabilir — premium differentiator.

## Status
[~] RESEARCH COMPLETE, implementation DEFERRED — dedicated audio engineering pass gerektirir; paket eklemek + WASM load test + Electron CSP kontrolü.
