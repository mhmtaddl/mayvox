import { describe, it, expect } from 'vitest';
import { ALL_CAPABILITIES, SYSTEM_ROLE_CAPS, type Capability } from '../../capabilities';

/**
 * Code-internal capability sanity — DB sync'i integration test gerektirir;
 * bu dosya yalnızca const'lar arasında iç tutarlılığı doğrular.
 */
describe('capability const internal sanity', () => {
  it('tüm ALL_CAPABILITIES unique', () => {
    const set = new Set(ALL_CAPABILITIES);
    expect(set.size).toBe(ALL_CAPABILITIES.length);
  });

  it('her ALL_CAPABILITIES en az bir sistem rolüne seed edilmiş', () => {
    const seeded = new Set<string>();
    for (const caps of Object.values(SYSTEM_ROLE_CAPS)) {
      for (const c of caps) seeded.add(c);
    }
    const unseeded = ALL_CAPABILITIES.filter(c => !seeded.has(c));
    expect(unseeded).toEqual([]);
  });

  it('hiçbir SYSTEM_ROLE_CAPS entry\'si unknown capability içermez', () => {
    const valid = new Set<string>(ALL_CAPABILITIES);
    for (const [role, caps] of Object.entries(SYSTEM_ROLE_CAPS)) {
      const unknown = (caps as Capability[]).filter(c => !valid.has(c));
      expect(unknown, `${role} rolünde geçersiz capability: ${unknown.join(', ')}`).toEqual([]);
    }
  });
});
