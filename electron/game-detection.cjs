/**
 * Game Detection — Windows desktop only, opt-in.
 *
 * Akış: visible window process scan → whitelist match → state machine
 * (2s açılış debounce + 5s kapanış tolerance) → renderer'a sadece
 * sanitize edilmiş { name: string | null }. Ham process listesi RENDERER'A GİTMEZ.
 *
 * Kontrol: setEnabled(true/false). Kapalıyken polling tamamen durur.
 * Power: suspend → pause, resume → restart (varsa enabled).
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app, powerMonitor } = require('electron');

const POLL_INTERVAL_MS = 5_000;
const ACTIVATION_DELAY_MS = 2_000;
const DEACTIVATION_TOLERANCE_MS = 5_000;
const PROCESS_SCAN_TIMEOUT_MS = 5_000;
const VISIBLE_WINDOW_PROCESS_COMMAND =
  'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -or $_.MainWindowTitle } | ForEach-Object { $_.ProcessName }';
const PROCESS_PICKER_DENYLIST = new Set([
  'applicationframehost.exe',
  'audiodg.exe',
  'conhost.exe',
  'csrss.exe',
  'ctfmon.exe',
  'dllhost.exe',
  'dwm.exe',
  'explorer.exe',
  'fontdrvhost.exe',
  'lsass.exe',
  'memory compression.exe',
  'registry.exe',
  'runtimebroker.exe',
  'searchhost.exe',
  'securityhealthservice.exe',
  'services.exe',
  'sihost.exe',
  'smss.exe',
  'spoolsv.exe',
  'startmenuexperiencehost.exe',
  'svchost.exe',
  'system.exe',
  'systemsettings.exe',
  'taskhostw.exe',
  'textinputhost.exe',
  'wininit.exe',
  'winlogon.exe',
  'wmiprvse.exe',
]);

let whitelist = []; // [{ displayName, processes: string[] }]
let processLookup = new Map(); // lowercase exe name → displayName

function getCustomWhitelistPath() {
  return path.join(app.getPath('userData'), 'custom-game-whitelist.json');
}

function normalizeProcessName(name) {
  const value = String(name || '').trim();
  if (!value) return '';
  return value.toLowerCase().endsWith('.exe') ? value : `${value}.exe`;
}

function sanitizeCustomEntry(entry) {
  const displayName = String(entry?.displayName || '').trim().slice(0, 80);
  const processes = Array.isArray(entry?.processes)
    ? entry.processes.map(normalizeProcessName).filter(Boolean).slice(0, 8)
    : [];
  const unique = Array.from(new Set(processes));
  if (!displayName || unique.length === 0) return null;
  return { displayName, processes: unique };
}

function readCustomWhitelist() {
  try {
    const file = getCustomWhitelistPath();
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCustomEntry).filter(Boolean);
  } catch (err) {
    console.warn('[game-detection] custom whitelist okunamadı:', err?.message || err);
    return [];
  }
}

function writeCustomWhitelist(entries) {
  const clean = Array.isArray(entries) ? entries.map(sanitizeCustomEntry).filter(Boolean) : [];
  fs.writeFileSync(getCustomWhitelistPath(), JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

function loadWhitelist() {
  try {
    const p = path.join(__dirname, 'game-whitelist.json');
    const raw = fs.readFileSync(p, 'utf8');
    const builtIn = JSON.parse(raw);
    whitelist = [...(Array.isArray(builtIn) ? builtIn : []), ...readCustomWhitelist()];
    processLookup = new Map();
    for (const entry of whitelist) {
      if (!entry || !Array.isArray(entry.processes)) continue;
      for (const proc of entry.processes) {
        processLookup.set(normalizeProcessName(proc).toLowerCase(), entry.displayName);
      }
    }
  } catch (err) {
    whitelist = [];
    processLookup = new Map();
    console.warn('[game-detection] whitelist yüklenemedi:', err?.message || err);
  }
}

function parseTasklistNames(stdout) {
  const names = new Set();
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    // İlk CSV alanı = exe adı, çift-tırnak içinde
    const m = line.match(/^"([^"]+)"/);
    if (m && m[1]) names.add(m[1].toLowerCase());
  }
  return Array.from(names);
}

function parseTasklistEntries(stdout) {
  return parseTasklistNames(stdout)
    .filter(name => name && name.endsWith('.exe'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function parsePowerShellProcessNames(stdout) {
  const names = new Set();
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines) {
    const name = line.trim();
    if (!name) continue;
    names.add(name.toLowerCase().endsWith('.exe') ? name.toLowerCase() : `${name.toLowerCase()}.exe`);
  }
  return Array.from(names);
}

function parsePowerShellProcessEntries(stdout) {
  return parsePowerShellProcessNames(stdout).sort((a, b) => a.localeCompare(b, 'en'));
}

function isProcessPickerCandidate(name) {
  const normalized = normalizeProcessName(name).toLowerCase();
  if (!normalized || !normalized.endsWith('.exe')) return false;
  if (PROCESS_PICKER_DENYLIST.has(normalized)) return false;
  if (normalized.startsWith('microsoft.') || normalized.startsWith('windows.')) return false;
  return true;
}

function fetchVisibleProcessNames() {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile',
      '-ExecutionPolicy Bypass',
      '-Command',
      VISIBLE_WINDOW_PROCESS_COMMAND,
    ];

    execFile('powershell.exe', args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: PROCESS_SCAN_TIMEOUT_MS,
    }, (err, stdout) => {
      if (err) return reject(err);
      resolve(parsePowerShellProcessNames(stdout));
    });
  });
}

function fetchVisibleProcessEntries() {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile',
      '-ExecutionPolicy Bypass',
      '-Command',
      VISIBLE_WINDOW_PROCESS_COMMAND,
    ];

    execFile('powershell.exe', args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: PROCESS_SCAN_TIMEOUT_MS,
    }, (err, stdout) => {
      if (err) return reject(err);
      resolve(parsePowerShellProcessEntries(stdout));
    });
  });
}

// Windows tasklist — CSV no-header: "Image","PID","Session","SessName","Mem"
function fetchProcessNames() {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/fo', 'csv', '/nh'], {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: PROCESS_SCAN_TIMEOUT_MS,
    }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      resolve(parseTasklistNames(stdout));
    });
  });
}

function fetchProcessEntries() {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/fo', 'csv', '/nh'], {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: PROCESS_SCAN_TIMEOUT_MS,
    }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      resolve(parseTasklistEntries(stdout));
    });
  });
}

async function fetchDetectableProcessNames() {
  if (process.platform !== 'win32') return [];
  try {
    return await fetchVisibleProcessNames();
  } catch (err) {
    return fetchProcessNames();
  }
}

async function detectCurrentGame() {
  if (process.platform !== 'win32') return null;

  try {
    const visibleNames = await fetchVisibleProcessNames();
    const visibleDetected = detectGameFromProcesses(visibleNames);
    if (visibleDetected) return visibleDetected;
  } catch {
    // If the visible-window scan fails, fall through to the broader process scan.
  }

  const allNames = await fetchProcessNames();
  return detectGameFromProcesses(allNames);
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
    this.activationTimer = null;
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
    this._clearActivationTimer();
  }

  _reset() {
    this.candidate = null;
    this.candidateSince = 0;
    this._clearActivationTimer();
    this.lastSeenAt = 0;
    if (this.published !== null) {
      this.published = null;
      this._emit(null);
    }
  }

  _clearActivationTimer() {
    if (this.activationTimer) {
      clearTimeout(this.activationTimer);
      this.activationTimer = null;
    }
  }

  _scheduleActivationCheck() {
    this._clearActivationTimer();
    this.activationTimer = setTimeout(() => {
      this.activationTimer = null;
      void this._tick();
    }, ACTIVATION_DELAY_MS + 50);
  }

  async _tick() {
    if (!this.enabled || this._suspended) return;
    if (this._loopBusy) return; // tasklist yavaşsa üst üste binmesin
    this._loopBusy = true;
    try {
      const detected = await detectCurrentGame();
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
        this._scheduleActivationCheck();
      }
      // Aday yeterince sabit kaldı mı?
      if (now - this.candidateSince >= ACTIVATION_DELAY_MS) {
        this.published = detected;
        this.candidate = null;
        this._clearActivationTimer();
        this.lastSeenAt = now;
        this._emit(detected);
      }
    } else {
      // Oyun bulunamadı — candidate'ı düşür
      this.candidate = null;
      this.candidateSince = 0;
      this._clearActivationTimer();
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
    if (this.enabled) {
      this._start();
      void this._tick();
    }
  }

  async requestCurrent() {
    if (!this.enabled || this._suspended) {
      this._emit(null);
      return null;
    }
    await this._tick();
    this._emit(this.published);
    return this.published;
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

  if (_detectorSingleton) {
    _detectorSingleton.onChange = (name) => _sendFn && _sendFn(name);
    bindPowerHandlers(_detectorSingleton);
    if (_detectorSingleton.enabled) {
      _detectorSingleton._emit(_detectorSingleton.published);
      void _detectorSingleton._tick();
    }
    return _detectorSingleton;
  }

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

async function listOpenGameProcesses() {
  if (process.platform !== 'win32') return [];
  loadWhitelist();
  let names = [];
  try {
    names = await fetchVisibleProcessEntries();
  } catch {
    names = [];
  }
  if (names.length === 0) {
    names = (await fetchProcessEntries()).filter(isProcessPickerCandidate);
  }
  return names.map(name => ({
    name,
    displayName: processLookup.get(name.toLowerCase()) || null,
    known: processLookup.has(name.toLowerCase()),
  }));
}

function getCustomGames() {
  return readCustomWhitelist();
}

function addCustomGame(entry) {
  const nextEntry = sanitizeCustomEntry(entry);
  if (!nextEntry) throw new Error('Geçerli oyun adı ve exe seçimi gerekli.');
  const current = readCustomWhitelist();
  const withoutSameProc = current.filter(existing => {
    const existingProcesses = new Set(existing.processes.map(p => p.toLowerCase()));
    return !nextEntry.processes.some(proc => existingProcesses.has(proc.toLowerCase()));
  });
  const next = writeCustomWhitelist([...withoutSameProc, nextEntry]);
  loadWhitelist();
  const det = getDetector();
  if (det?.enabled) void det._tick();
  return next;
}

function removeCustomGame(processName) {
  const normalized = normalizeProcessName(processName).toLowerCase();
  const next = writeCustomWhitelist(
    readCustomWhitelist().filter(entry => !entry.processes.some(proc => proc.toLowerCase() === normalized)),
  );
  loadWhitelist();
  const det = getDetector();
  if (det?.enabled) void det._tick();
  return next;
}

module.exports = {
  setupGameDetection,
  getDetector,
  listOpenGameProcesses,
  getCustomGames,
  addCustomGame,
  removeCustomGame,
};
