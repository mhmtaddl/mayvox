/**
 * Game Detection — Windows desktop only, opt-in.
 *
 * Akış: tasklist /fo csv /nh → whitelist match → state machine (8s açılış
 * debounce + 5s kapanış tolerance) → renderer'a sadece sanitize edilmiş
 * { name: string | null }. Ham process listesi RENDERER'A GİTMEZ.
 *
 * Kontrol: setEnabled(true/false). Kapalıyken polling tamamen durur.
 * Power: suspend → pause, resume → restart (varsa enabled).
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { powerMonitor } = require('electron');

const POLL_INTERVAL_MS = 10_000;
const ACTIVATION_DELAY_MS = 2_000;
const DEACTIVATION_TOLERANCE_MS = 5_000;

let whitelist = []; // [{ displayName, processes: string[] }]
let processLookup = new Map(); // lowercase exe name → displayName

function loadWhitelist() {
  try {
    const p = path.join(__dirname, 'game-whitelist.json');
    const raw = fs.readFileSync(p, 'utf8');
    whitelist = JSON.parse(raw);
    processLookup = new Map();
    for (const entry of whitelist) {
      if (!entry || !Array.isArray(entry.processes)) continue;
      for (const proc of entry.processes) {
        processLookup.set(String(proc).toLowerCase(), entry.displayName);
      }
    }
  } catch (err) {
    whitelist = [];
    processLookup = new Map();
    console.warn('[game-detection] whitelist yüklenemedi:', err?.message || err);
  }
}

// Windows tasklist — CSV no-header: "Image","PID","Session","SessName","Mem"
function fetchProcessNames() {
  return new Promise((resolve) => {
    exec('tasklist /fo csv /nh', { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const names = new Set();
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        // İlk CSV alanı = exe adı, çift-tırnak içinde
        const m = line.match(/^"([^"]+)"/);
        if (m && m[1]) names.add(m[1].toLowerCase());
      }
      resolve(Array.from(names));
    });
  });
}

function detectGameFromProcesses(processNames) {
  // İlk whitelist eşleşmesi — whitelist sırası = öncelik
  for (const entry of whitelist) {
    for (const proc of entry.processes) {
      if (processNames.includes(proc.toLowerCase())) {
        return entry.displayName;
      }
    }
  }
  return null;
}

// ── State machine ──────────────────────────────────────────────────────────
// published: şu an renderer'a yayılmış oyun adı (veya null)
// candidate: gözlenen aday oyun; ACTIVATION_DELAY_MS boyunca sabit kalırsa publish
// lostAt: published oyun son görüldüğü timestamp; DEACTIVATION_TOLERANCE_MS sonra clear

class GameDetector {
  constructor({ onChange, logger }) {
    this.onChange = onChange;
    this.logger = logger || { info: () => {}, warn: () => {} };
    this.enabled = false;
    this.pollTimer = null;
    this.published = null;
    this.candidate = null;
    this.candidateSince = 0;
    this.lastSeenAt = 0;
    this._suspended = false;
    this._loopBusy = false;
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) {
      if (enabled) {
        this._emit(this.published);
        void this._tick();
      }
      return;
    }
    this.enabled = enabled;
    if (enabled) {
      loadWhitelist();
      this._start();
      this._emit(this.published);
      void this._tick();
    } else {
      this._stop();
      this._reset();
    }
  }

  _start() {
    if (this._suspended) return;
    if (this.pollTimer) return;
    // İlk tick'i hemen (küçük delay) — startup + enable toggle için hızlı feedback
    setTimeout(() => this._tick(), 500);
    this.pollTimer = setInterval(() => this._tick(), POLL_INTERVAL_MS);
  }

  _stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  _reset() {
    this.candidate = null;
    this.candidateSince = 0;
    this.lastSeenAt = 0;
    if (this.published !== null) {
      this.published = null;
      this._emit(null);
    }
  }

  async _tick() {
    if (!this.enabled || this._suspended) return;
    if (this._loopBusy) return; // tasklist yavaşsa üst üste binmesin
    this._loopBusy = true;
    try {
      const names = await fetchProcessNames();
      const detected = detectGameFromProcesses(names);
      this._apply(detected);
    } catch (err) {
      this.logger.warn('[game-detection] tick hatası: ' + (err?.message || err));
    } finally {
      this._loopBusy = false;
    }
  }

  _apply(detected) {
    const now = Date.now();
    if (detected) {
      // Aynı oyun zaten yayınlandı → sadece heartbeat güncelle
      if (this.published === detected) {
        this.lastSeenAt = now;
        this.candidate = null;
        return;
      }
      // Farklı bir oyun aday veya yeni aday başlıyor
      if (this.candidate !== detected) {
        this.candidate = detected;
        this.candidateSince = now;
      }
      // Aday yeterince sabit kaldı mı?
      if (now - this.candidateSince >= ACTIVATION_DELAY_MS) {
        this.published = detected;
        this.candidate = null;
        this.lastSeenAt = now;
        this._emit(detected);
      }
    } else {
      // Oyun bulunamadı — candidate'ı düşür
      this.candidate = null;
      this.candidateSince = 0;
      // Yayında bir oyun varsa tolerance bekle
      if (this.published !== null) {
        if (this.lastSeenAt === 0) this.lastSeenAt = now;
        if (now - this.lastSeenAt >= DEACTIVATION_TOLERANCE_MS) {
          this.published = null;
          this.lastSeenAt = 0;
          this._emit(null);
        }
      }
    }
  }

  _emit(name) {
    try {
      this.onChange(name);
    } catch (err) {
      this.logger.warn('[game-detection] onChange hatası: ' + (err?.message || err));
    }
  }

  handleSuspend() {
    this._suspended = true;
    this._stop();
    // published'ı tutuyoruz — suspend kısa olabilir, resume'da hızlı doğrulansın
  }

  handleResume() {
    this._suspended = false;
    if (this.enabled) this._start();
  }

  dispose() {
    this._stop();
    this.enabled = false;
  }
}

let _detectorSingleton = null;
let _sendFn = null;
let _powerHandlersBound = false;

function bindPowerHandlers(detector) {
  if (_powerHandlersBound) return;
  _powerHandlersBound = true;
  try {
    powerMonitor.on('suspend', () => detector.handleSuspend());
    powerMonitor.on('lock-screen', () => detector.handleSuspend());
    powerMonitor.on('resume', () => detector.handleResume());
    powerMonitor.on('unlock-screen', () => detector.handleResume());
  } catch {}
}

/**
 * setupGameDetection(mainWin, logger) — main process'ten çağrılır.
 * webContents.send('game:activity-changed', { name }) ile renderer'a yayınlar.
 * Dönen nesnede `setEnabled(bool)` ile kontrol edilir.
 */
function setupGameDetection(mainWin, logger) {
  _sendFn = (name) => {
    try {
      if (!mainWin || mainWin.isDestroyed()) return;
      if (!mainWin.webContents || mainWin.webContents.isDestroyed()) return;
      mainWin.webContents.send('game:activity-changed', { name });
    } catch {}
  };

  _detectorSingleton = new GameDetector({
    onChange: (name) => _sendFn && _sendFn(name),
    logger,
  });
  bindPowerHandlers(_detectorSingleton);
  return _detectorSingleton;
}

function getDetector() {
  return _detectorSingleton;
}

module.exports = { setupGameDetection, getDetector };
