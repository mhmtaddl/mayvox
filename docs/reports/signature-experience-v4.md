# MAYVOX Signature Experience v4 — Design Note

## Özet

v4 tek bir ürün dili kuruyor: motion, ses, micro-haptic, bloom, idle-awareness.
Notification v3 **dokunulmadı**. v4 **parallel shared layer** olarak `src/lib/signature/` altında duruyor; her component opt-in olarak tüketir.

## Kurulum

`src/main.tsx` içinde tek satır ekleme ile global CSS helpers aktif:
```ts
import './lib/signature/signature.css';
```
Hiçbir mevcut element bu import'tan etkilenmiyor — tüm class'lar opt-in (`.mv-breath`, `.mv-speaker-pulse`, `.mv-pressable`, `.mv-depth`). `useWindowActivity`'nin zaten toggle ettiği `html.window-inactive` class'ı sayesinde idle state'te keyframe loop'lar CPU'yu yormaz.

## Modüller

### `motion.ts`
Tek motion dili — her component aynı preset'leri kullanır:
```ts
MV_SPRING.soft    = { stiffness: 320, damping: 30, mass: 0.9 }   // entrance default
MV_SPRING.crisp   = { stiffness: 480, damping: 34, mass: 0.7 }   // micro haptic
MV_SPRING.gentle  = { stiffness: 220, damping: 26, mass: 1.0 }   // panel/modal

MV_DURATION.fast   = 0.14
MV_DURATION.normal = 0.22
MV_DURATION.slow   = 0.42

MV_EASE.softOut   = [0.25, 1, 0.5, 1]
MV_EASE.softInOut = [0.45, 0, 0.25, 1]

MV_SCALE.hover = 1.015   // max 1.02 kuralı
MV_SCALE.press = 0.985
```

`MV_ENTRANCE` spread-ready entrance preset:
```tsx
<motion.div {...MV_ENTRANCE} />
```

### `interactionFeedback.ts`
```ts
MV_PRESS          // button default: hover+tap scale
MV_PRESS_SOFT     // nav icons, small clickables
MV_PRESS_ELEVATE  // hover'da y:-1 elevate
isWindowInactive()  // idle gate helper
```

Kullanım:
```tsx
<motion.button {...MV_PRESS}>Kaydet</motion.button>
<motion.div    {...MV_PRESS_SOFT} onClick={...} />
```

### `BloomHighlight.tsx`
Soft radial attention bloom — hard flash yerine:
```tsx
<div className="relative">
  <BloomHighlight active={isDmNew} color="var(--theme-accent)" intensity={0.35} />
  <ConversationRow ... />
</div>
```
- appear: 160ms `softOut`
- decay: 420ms (MV_DURATION.slow)
- pointer-events:none, absolute layer → layout etkilemez
- GPU composite (opacity + box-shadow)

### `sound.ts`
Opt-in UI audio engine — **notification sound ile ayrı**:
```ts
playSignature('open', { muted, deafened });   // panel açılışı
playSignature('tap');                          // micro click (varsayılan KAPALI — pref açılırsa)
playSignature('dm');                           // DM-specific kimlik (alternate/overlay)
```
Hard cap: 180ms total, 2 oscillator max, master gain 0.05, mute/deafen respect, localStorage toggle.
Auto-trigger YOK — her çağrı explicit.

### `signature.css` — CSS helpers (opt-in class'lar)
- `.mv-breath` → 6s opacity drift, "static ama alive"
- `.mv-speaker-pulse` → 1.8s box-shadow breath; active speaker kartına eklenir
- `.mv-pressable` → CSS-only press feedback (framer olmayan yerlerde)
- `.mv-depth` → subtle layered shadow; panel/modal'a ekleyince derinlik
- `@media (prefers-reduced-motion: reduce)` → tüm signature loop'lar otomatik kapanır
- `html.window-inactive` → tüm signature loop'ları `animation-play-state: paused` ile durdurur

## Layer eşleştirme (spec → implementation)

| Layer | Karşılık |
|---|---|
| L1 Signature motion | `motion.ts` presets |
| L2 Micro-haptic UI | `MV_PRESS*` variants + `.mv-pressable` CSS fallback |
| L3 Signature sound DNA | `sound.ts` (dm/invite/system identities) |
| L4 Attention bloom | `BloomHighlight` component |
| L5 Voice-presence feedback | `.mv-speaker-pulse` + `BloomHighlight active={isSpeaking}` |
| L6 Grouped event feedback | Notification v3 `revision pulse` zaten var; `BloomHighlight` ek bir katman olarak adapte edilebilir |
| L7 Focus/idle aware UI | `html.window-inactive` gate + `isWindowInactive()` helper |
| L8 Premium idle state | `.mv-breath` class, subtle opacity drift |
| L9 Consistency pass | Tüm component'ler `motion.ts`'i kullanır → tek dil |

## Adoption örneği (kısa)

```tsx
// Buttondaki micro-haptic:
import { motion } from 'motion/react';
import { MV_PRESS } from '../lib/signature';
<motion.button {...MV_PRESS} onClick={handleSave}>Kaydet</motion.button>

// Active speaker row'u:
import { BloomHighlight } from '../lib/signature';
<div className="relative mv-speaker-pulse">
  <BloomHighlight active={participant.isSpeaking} />
  <ParticipantCard ... />
</div>

// Panel modal'ı:
import { MV_ENTRANCE, MV_SPRING } from '../lib/signature';
<motion.div {...MV_ENTRANCE} transition={MV_SPRING.gentle} className="mv-depth">
  <PanelContent />
</motion.div>

// Idle breath — sabit bir badge'e:
<div className="mv-breath">...</div>
```

## Performance önlemleri

- **GPU composite only**: `transform`, `opacity`, `box-shadow` → reflow yok
- **`will-change` hint'i** yalnız loop class'larında — browser hazır
- **Idle gate**: `html.window-inactive` aktif oldukça tüm CSS loop'lar `animation-play-state: paused`; framer `whileHover/Tap` doğaları gereği user-input'a bağlı, zaten idle'da etkin değil
- **Reduced-motion media query**: sistem ayarı bütün signature loop'larını otomatik kapar
- **Bloom absolute layer**: layout reflow tetiklemez
- **Sound hard cap**: 180ms envelope, master gain 0.05 — clipping yok, CPU'da tek oscillator çifti
- **Opt-in philosophy**: hiçbir element zorla bu sisteme bağlanmadı — performans etkisi adoption kadar

## No regressions

- Notification v3 dokunulmadı (0 dosya değişti: service, policyEngine, sound, dedupe, intelligence/*)
- Yeni CSS class'lar hiçbir mevcut elementi etkilemez (class adı eşleşmesi yok)
- `signature.css` import'u yalnızca global keyframe + class helper'lar ekler; cascade tetiklemez
- Tests: 154/154 pass (v3 stabilization baseline korundu)

## Adoption roadmap (incremental)

Bu pass sadece **altyapıyı** kuruyor. Ürün tarafında incremental adoption:

1. **Sprint A**: `MV_PRESS` → büyük CTA butonları (Kaydet, Gönder, Sunucu oluştur)
2. **Sprint B**: `BloomHighlight` → active speaker row + new DM conversation item
3. **Sprint C**: `.mv-depth` → ServerSettings modal wrapper'ı, AnnouncementsPanel
4. **Sprint D**: `.mv-breath` → idle badge'ler (versiyon metni, boş state ikonları)
5. **Sprint E**: `playSignature('open')` → SettingsModal/ServerSettings açılışında (settings'te toggle var)

Her adım bağımsız PR — diff kontrolü korunur.

## Validation

- Frontend `tsc --noEmit` → **EXIT=0**
- Backend vitest → **154/154 pass** (değişmedi; signature layer pure foundation)
- Yeni dependency yok
- Mevcut import graph değişmedi (yalnız `main.tsx`'e 1 CSS import)
