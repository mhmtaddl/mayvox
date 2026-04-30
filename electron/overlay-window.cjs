/**
 * Overlay BrowserWindow manager.
 *
 * Ayrı, hafif, transparan, always-on-top pencere. Ana pencereyle IPC
 * köprüsü üzerinden senkronize — hiçbir audio/session/token tutmaz.
 *
 * Lifecycle:
 *   applySettings({enabled:true}) → window varsa kullanır, yoksa oluşturur + show
 *   applySettings({enabled:false}) → hide, kapalı kalırsa renderer'ı kapat
 *   dispose()  → app quit'te close + null
 *
 * Snapshot delivery: lastSnapshotRef + did-finish-load replay. İlk tick
 * preload hazır olmadan gelirse kaybolmasın diye cache'lenir.
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');

// Pencere boyutları — speaking scale/glow için +iç padding content tarafında
// absorbe edilir. Yükseklik satır başına yaklaşık avatar + gap + guard ile hesap.
const SIZE_PRESETS = {
  small:  { width: 200, height: 276 },
  medium: { width: 260, height: 340 },
  large:  { width: 320, height: 410 },
};
// Ekran kenarından boşluk — overlay "HUD öğesi" gibi dursun, çerçeveye yapışmasın
const EDGE_MARGIN = 24;

// Anchor → (0..1 fraction, sol-üst kökenli) — types.ts ile simetrik.
const ANCHOR_FRAC = {
  'top-left':         { fx: 0,    fy: 0 },
  'top-mid-left':     { fx: 0.33, fy: 0 },
  'top-mid-right':    { fx: 0.67, fy: 0 },
  'top-right':        { fx: 1,    fy: 0 },
  'right-top-mid':    { fx: 1,    fy: 0.33 },
  'right-bot-mid':    { fx: 1,    fy: 0.67 },
  'bottom-right':     { fx: 1,    fy: 1 },
  'bottom-mid-right': { fx: 0.67, fy: 1 },
  'bottom-mid-left':  { fx: 0.33, fy: 1 },
  'bottom-left':      { fx: 0,    fy: 1 },
  'left-bot-mid':     { fx: 0,    fy: 0.67 },
  'left-top-mid':     { fx: 0,    fy: 0.33 },
};

function computeBounds(position, size) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.medium;
  let display;
  try {
    display = screen.getPrimaryDisplay();
  } catch {
    return { ...preset, x: EDGE_MARGIN, y: EDGE_MARGIN };
  }
  const wa = display.workArea;
  const margin = Math.min(EDGE_MARGIN, Math.floor(Math.min(wa.width, wa.height) / 8));
  const maxWidth = Math.max(1, wa.width - margin * 2);
  const maxHeight = Math.max(1, wa.height - margin * 2);
  const width = Math.min(preset.width, maxWidth);
  const height = Math.min(preset.height, maxHeight);
  const frac = ANCHOR_FRAC[position] || ANCHOR_FRAC['left-top-mid'];
  const usableW = Math.max(0, wa.width  - width  - margin * 2);
  const usableH = Math.max(0, wa.height - height - margin * 2);
  const x = Math.round(wa.x + margin + frac.fx * usableW);
  const y = Math.round(wa.y + margin + frac.fy * usableH);
  return { width, height, x, y };
}

class OverlayWindowManager {
  constructor({ isDev, logger }) {
    this.isDev = !!isDev;
    this.logger = logger || { info: () => {}, warn: () => {} };
    this.win = null;
    this.ready = false;
    this.lastSnapshot = null;
    this.destroyTimer = null;
    this.currentSettings = {
      enabled: false,
      position: 'top-right',
      size: 'medium',
      showOnlySpeaking: false,
      showSelf: true,
      clickThrough: true,
    };
  }

  // Overlay gerçekten görünmesi gereken durum mu?
  // - settings.enabled
  // - lastSnapshot.participants.length > 0 (oda + katılımcı var)
  // Ana pencere minimize/tray/hidden olsa bile overlay bağımsız görünür —
  // kullanıcı "oyun içi gösterim" toggle'ı açıksa pencere durumundan bağımsız
  // oyun üzerinde her zaman görünmeli (kullanıcı talebi, KURAL).
  _shouldBeVisible() {
    if (!this.currentSettings.enabled) return false;
    if (!this.lastSnapshot) return false;
    if (!this.lastSnapshot.roomId) return false;
    if (!Array.isArray(this.lastSnapshot.participants) || this.lastSnapshot.participants.length === 0) return false;
    return true;
  }

  _syncVisibility() {
    if (!this.win || this.win.isDestroyed()) return;
    const shouldShow = this._shouldBeVisible();
    if (shouldShow) {
      if (this.destroyTimer) {
        clearTimeout(this.destroyTimer);
        this.destroyTimer = null;
      }
      if (!this.win.isVisible()) {
        try { this.win.show(); } catch {}
        try { this.win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
      }
    } else {
      if (this.win.isVisible()) {
        try { this.win.hide(); } catch {}
      }
      this._scheduleDestroyIfIdle();
    }
  }

  _ensureWindow() {
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer);
      this.destroyTimer = null;
    }
    if (this.win && !this.win.isDestroyed()) return this.win;
    const bounds = computeBounds(this.currentSettings.position, this.currentSettings.size);
    // NOT: `focusable: true` Windows'ta transparent window'un ilk paint
    // kaybını engeller. Click-through'u setIgnoreMouseEvents ile sağlıyoruz;
    // focusable zaten tıklanabilirliği etkilemez (input odak meselesi).
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      show: false,
      hasShadow: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'overlay-preload.cjs'),
        backgroundThrottling: false,
      },
    });

    // Always-on-top seviyesi: 'screen-saver' pek çok fullscreen windowed oyunda kalır.
    try { win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}

    const target = this.isDev
      ? 'http://127.0.0.1:3000/overlay.html'
      : `file://${path.join(__dirname, '../dist/overlay.html').replace(/\\/g, '/')}`;
    win.loadURL(target).catch((err) => this.logger.warn?.('[overlay] loadURL err: ' + (err?.message || err)));

    // Click-through ilk kurulumda uygulanır
    try { win.setIgnoreMouseEvents(!!this.currentSettings.clickThrough, { forward: true }); } catch {}

    // Sayfa hazır olunca: ready flag + son snapshot replay (ilk paint için kritik)
    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.currentSettings.enabled) this._flushSnapshot();
      this.logger.info?.('[overlay] did-finish-load, snapshot flush');
    });

    win.on('closed', () => { this.win = null; this.ready = false; });
    this.win = win;
    return win;
  }

  _scheduleDestroy(reason = 'idle') {
    if (this.destroyTimer) clearTimeout(this.destroyTimer);
    this.destroyTimer = setTimeout(() => {
      this.destroyTimer = null;
      if (reason === 'disabled') {
        if (this.currentSettings.enabled) return;
      } else if (this._shouldBeVisible()) {
        return;
      }
      if (!this.win || this.win.isDestroyed()) return;
      try { this.win.destroy(); } catch {}
      this.win = null;
      this.ready = false;
    }, 30_000);
  }

  _scheduleDestroyIfDisabled() {
    this._scheduleDestroy('disabled');
  }

  _scheduleDestroyIfIdle() {
    this._scheduleDestroy('idle');
  }

  applySettings(next) {
    const prev = this.currentSettings;
    this.currentSettings = { ...prev, ...next };

    // Toggle kapalıysa pencere yaratmaya gerek yok — varsa gizle.
    if (!this.currentSettings.enabled) {
      this.lastSnapshot = null;
      this._flushInactiveSnapshot();
      if (this.win && !this.win.isDestroyed()) this.win.hide();
      this._scheduleDestroyIfDisabled();
      return;
    }

    const bounds = computeBounds(this.currentSettings.position, this.currentSettings.size);
    // Pencereyi sadece gerçekten görüneceği zaman yarat. Toggle açık ama kullanıcı
    // odada değilse/katılımcı yoksa ayrı renderer süreci boşuna bellekte kalmasın.
    if (!this._shouldBeVisible()) {
      if (this.win && !this.win.isDestroyed()) {
        try { this.win.setBounds(bounds); } catch {}
        try { this.win.setIgnoreMouseEvents(!!this.currentSettings.clickThrough, { forward: true }); } catch {}
        this._syncVisibility();
      }
      return;
    }

    const win = this._ensureWindow();
    try { win.setBounds(bounds); } catch {}
    try { win.setIgnoreMouseEvents(!!this.currentSettings.clickThrough, { forward: true }); } catch {}
    this._syncVisibility();
    this._flushSnapshot();
  }

  sendSnapshot(snapshot) {
    // Size'ı mevcut settings'ten enjekte et — renderer window URL'si sabit.
    this.lastSnapshot = {
      ...snapshot,
      size: this.currentSettings.size,
    };
    // Snapshot geldiğinde (özellikle roomId/participants değiştiyse) visibility re-check
    if (this.currentSettings.enabled) {
      if (this._shouldBeVisible()) this._ensureWindow();
      this._syncVisibility();
      this._flushSnapshot();
    }
  }

  _flushSnapshot() {
    if (!this.ready) return;
    if (!this.lastSnapshot) return;
    if (!this.win || this.win.isDestroyed()) return;
    try {
      if (this.win.webContents && !this.win.webContents.isDestroyed()) {
        this.win.webContents.send('overlay:data', this.lastSnapshot);
      }
    } catch {}
  }

  _flushInactiveSnapshot() {
    if (!this.ready) return;
    if (!this.win || this.win.isDestroyed()) return;
    try {
      if (this.win.webContents && !this.win.webContents.isDestroyed()) {
        this.win.webContents.send('overlay:data', {
          roomId: null,
          roomName: null,
          participants: [],
          size: this.currentSettings.size,
          cardOpacity: this.currentSettings.cardOpacity ?? 50,
          variant: this.currentSettings.variant || 'capsule',
        });
      }
    } catch {}
  }

  hide() {
    if (this.win && !this.win.isDestroyed()) this.win.hide();
  }

  dispose() {
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer);
      this.destroyTimer = null;
    }
    if (this.win && !this.win.isDestroyed()) {
      try { this.win.close(); } catch {}
    }
    this.win = null;
    this.ready = false;
    this.lastSnapshot = null;
  }
}

let _manager = null;
function setupOverlayWindow({ isDev, logger }) {
  if (_manager) return _manager;
  _manager = new OverlayWindowManager({ isDev, logger });
  return _manager;
}
function getOverlayManager() { return _manager; }

module.exports = { setupOverlayWindow, getOverlayManager };
