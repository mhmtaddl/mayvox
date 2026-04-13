// ── Update System Constants ─────────────────────────────────────────────────

/** İlk check gecikmesi (ms) — uygulama tam yüklendikten sonra */
export const INITIAL_CHECK_DELAY = 10_000;

/** Desktop tekrar check aralığı (ms) — 5 saat */
export const DESKTOP_CHECK_INTERVAL = 5 * 60 * 60 * 1000;

/** Android tekrar check aralığı (ms) — 30 dakika */
export const ANDROID_CHECK_INTERVAL = 30 * 60 * 1000;

/** Network timeout (ms) */
export const FETCH_TIMEOUT = 15_000;

/** Otomatik retry sayısı (check veya download fail sonrası) */
export const MAX_AUTO_RETRIES = 2;

/** Retry arası bekleme (ms) — exponential backoff base */
export const RETRY_BASE_DELAY = 5_000;

/** APK yönlendirme sonrası tekrar check bekleme (ms) — loop önleme */
export const APK_REDIRECT_COOLDOWN = 30_000;

/** GitHub repo bilgisi */
export const GITHUB_OWNER = 'mhmtaddl';
export const GITHUB_REPO = 'mayvox';
