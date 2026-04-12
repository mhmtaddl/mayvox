import { queryMany } from '../repositories/db';
import { ALL_CAPABILITIES, SYSTEM_ROLE_CAPS, type Capability } from '../capabilities';

export interface CapabilitySyncResult {
  ok: boolean;
  unknownInDb: string[];       // DB'de var ama kodda tanımlı değil
  unseededInCode: Capability[]; // kodda tanımlı ama HİÇBİR sistem rolüne seed edilmemiş
  errors: string[];
}

/**
 * Startup validation:
 *   (a) DB'de role_capabilities.capability kolonunda bulunan değerlerin tamamı kod const'ında var mı?
 *       → yoksa drift: kod güncellenmemiş
 *   (b) Kodda tanımlı her capability en az bir sistem rolü üzerinden seed edilmiş mi?
 *       → edilmemişse migration veya seed eksik
 *
 * Hedef: developer sistem rolleri / migration / const senkronunu unuttuğunda gürültü yapsın.
 */
export async function validateCapabilitySync(): Promise<CapabilitySyncResult> {
  const result: CapabilitySyncResult = {
    ok: true,
    unknownInDb: [],
    unseededInCode: [],
    errors: [],
  };

  // (a) DB capability set
  let dbCapabilities: string[] = [];
  try {
    const rows = await queryMany<{ capability: string }>(
      'SELECT DISTINCT capability FROM role_capabilities',
    );
    dbCapabilities = rows.map(r => r.capability);
  } catch (err) {
    result.errors.push(`capability-sync: DB read failed: ${err instanceof Error ? err.message : err}`);
    result.ok = false;
    return result;
  }

  const codeSet = new Set<string>(ALL_CAPABILITIES);
  for (const c of dbCapabilities) {
    if (!codeSet.has(c)) result.unknownInDb.push(c);
  }

  // (b) SYSTEM_ROLE_CAPS union — en az bir sistem rolüne seed edilmiş capability'leri topla
  const seededInCode = new Set<string>();
  for (const caps of Object.values(SYSTEM_ROLE_CAPS)) {
    for (const c of caps) seededInCode.add(c);
  }
  for (const c of ALL_CAPABILITIES) {
    if (!seededInCode.has(c)) result.unseededInCode.push(c);
  }

  result.ok = result.unknownInDb.length === 0 && result.unseededInCode.length === 0;
  return result;
}

/**
 * Startup'ta çağrılır. strict=true iken drift varsa process exit, aksi hâlde warn.
 * CAPABILITY_SYNC_STRICT=1 env'i production'da set edilir.
 */
export async function assertCapabilitySyncOnStartup(strict = false): Promise<void> {
  const res = await validateCapabilitySync();
  if (res.ok) {
    console.log('[capabilitySync] ✓ code ↔ DB capability set senkron');
    return;
  }

  const summary = [
    res.unknownInDb.length > 0 ? `unknown-in-db=[${res.unknownInDb.join(', ')}]` : null,
    res.unseededInCode.length > 0 ? `unseeded-in-code=[${res.unseededInCode.join(', ')}]` : null,
    ...res.errors,
  ].filter(Boolean).join(' | ');

  const msg = `[capabilitySync] DRIFT: ${summary}`;
  if (strict) {
    console.error(msg);
    console.error('[capabilitySync] strict mode — startup abort');
    process.exit(1);
  } else {
    console.warn(msg);
  }
}
