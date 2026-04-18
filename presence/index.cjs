/**
 * Presence factory.
 *   PRESENCE_STORE=memory (default, Phase 1)
 *   PRESENCE_STORE=redis  (Phase 2, henüz etkin değil)
 */

const { createPresenceService } = require('./presenceService.cjs');

function loadStore() {
  const kind = (process.env.PRESENCE_STORE || 'memory').toLowerCase();
  if (kind === 'redis') {
    throw new Error(
      '[presence] Redis store Phase 2 — henüz yok. ' +
      'PRESENCE_STORE=memory kullan ya da env değişkenini kaldır.'
    );
  }
  console.log('[presence] In-memory store (single-process)');
  return require('./presenceStore-memory.cjs');
}

module.exports = { createPresenceService, loadStore };
