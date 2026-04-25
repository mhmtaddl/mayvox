const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session, screen } = require("electron");
const { autoUpdater } = require("electron-updater");

// ── Chromium autoplay policy ─────────────────────────────────────────────────
// Prod packaged build'de default autoplay policy 'document-user-activation-required'.
// Ses odasına join gesture'ı ilk AudioContext/ilk audio elementini unlock ediyor
// ama TrackSubscribed ile SONRADAN oluşturulan remote audio elementler yeni
// element olduğu için play() autoplay'e takılıyor → kullanıcı diğerlerinin sesini
// duymuyor (kendi mic'i gönderilmeye devam ediyor). Bu flag onu kaldırır.
// Mutlaka app.whenReady ÖNCESİ set edilmeli.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const path = require("path");
const fs = require("fs");
const { setupGameDetection, getDetector } = require("./game-detection.cjs");
const { setupOverlayWindow, getOverlayManager } = require("./overlay-window.cjs");

// ── Global PTT Hook (uiohook-napi) ────────────────────────────────────────────
let uIOhook = null;
try {
  uIOhook = require("uiohook-napi").uIOhook;
} catch (e) {
  // uiohook-napi yüklenemezse PTT sadece pencere odaklıyken çalışır
}

// uiohook scan code → görüntü adı eşlemesi
const keycodeToName = {
  1: "ESCAPE", 2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
  12: "-", 13: "=", 14: "BACKSPACE", 15: "TAB",
  16: "Q", 17: "W", 18: "E", 19: "R", 20: "T", 21: "Y", 22: "U", 23: "I", 24: "O", 25: "P",
  26: "[", 27: "]", 28: "ENTER",
  29: "CTRL", 30: "A", 31: "S", 32: "D", 33: "F", 34: "G", 35: "H",
  36: "J", 37: "K", 38: "L", 39: ";", 40: "'",
  41: "`", 42: "SHIFT", 43: "\\",
  44: "Z", 45: "X", 46: "C", 47: "V", 48: "B", 49: "N", 50: "M",
  51: ",", 52: ".", 53: "/", 54: "SHIFT", 55: "NUM *",
  56: "ALT", 57: "SPACE", 58: "CAPS LOCK",
  59: "F1", 60: "F2", 61: "F3", 62: "F4", 63: "F5", 64: "F6",
  65: "F7", 66: "F8", 67: "F9", 68: "F10", 87: "F11", 88: "F12",
  71: "NUM 7", 72: "NUM 8", 73: "NUM 9", 74: "NUM -",
  75: "NUM 4", 76: "NUM 5", 77: "NUM 6", 78: "NUM +",
  79: "NUM 1", 80: "NUM 2", 81: "NUM 3", 82: "NUM 0", 83: "NUM .",
  3613: "CTRL", 3640: "ALT GR",
  3675: "WIN", 3676: "WIN",
  57416: "UP", 57419: "LEFT", 57421: "RIGHT", 57424: "DOWN",
  57373: "PAGE UP", 57369: "PAGE DOWN",
  57375: "END", 57362: "HOME",
  57426: "INSERT", 57427: "DELETE",
};

// Ad → keycode ters eşlemesi (ilk eşleşen alınır)
const nameToKeycode = {};
for (const [code, name] of Object.entries(keycodeToName)) {
  if (!nameToKeycode[name]) nameToKeycode[name] = parseInt(code);
}
// Eski format uyumluluğu
nameToKeycode["CONTROL"] = 29;
nameToKeycode["ALT GR"] = 3640;

// uiohook mouse button → görüntü adı (uiohook: 1=sol, 2=sağ, 3=orta)
const mouseButtonToName = { 1: "MOUSE 0", 2: "MOUSE 2", 3: "MOUSE 1" };

// Global PTT durumu
let pttKeycode = null;       // uiohook keycode (klavye)
let pttMouseButton = null;   // uiohook button (fare)
let isListeningForPtt = false;
let pttWindow = null;
let pttDownActive = false;   // OS key-repeat aynı basışta ptt:down spam'lemesin

// Tray & quit state
let tray = null;
let isQuitting = false;
let authWindowMode = false;
let preAuthBounds = null;

// Installer/uninstall kaynaklı başlatma mı?
function isInstallerArgs(argv) {
  const flags = ['--updated', '--install', '--uninstall', '--squirrel-install',
    '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete'];
  return argv.some(a => flags.includes(a.toLowerCase()));
}

// ── Single Instance Lock ─────────────────────────────────────────────────────
// Installer veya ikinci bir instance çalışırsa, mevcut instance kapanır.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function parseSavedPttKey(keyStr) {
  if (!keyStr) return;
  pttDownActive = false;
  const upper = keyStr.trim().toUpperCase();
  if (upper.startsWith("MOUSE ")) {
    const browserBtn = parseInt(upper.replace("MOUSE ", ""));
    // Browser 0→uiohook 1 (sol), 1→uiohook 3 (orta), 2→uiohook 2 (sağ)
    pttMouseButton = browserBtn === 0 ? 1 : browserBtn === 2 ? 2 : 3;
    pttKeycode = null;
  } else {
    pttKeycode = nameToKeycode[upper] ?? null;
    pttMouseButton = null;
  }
}

function setupGlobalPtt(win) {
  if (!uIOhook) return;
  pttWindow = win;

  uIOhook.on("keydown", (e) => {
    if (isListeningForPtt) {
      isListeningForPtt = false;
      pttKeycode = e.keycode;
      pttMouseButton = null;
      const displayName = keycodeToName[e.keycode] || `KEY${e.keycode}`;
      win.webContents.send("ptt:keyAssigned", { displayName, rawCode: `k${e.keycode}` });
      return;
    }
    if (pttKeycode !== null && e.keycode === pttKeycode) {
      if (pttDownActive) return;
      pttDownActive = true;
      win.webContents.send("ptt:down");
    }
  });

  uIOhook.on("keyup", (e) => {
    if (pttKeycode !== null && e.keycode === pttKeycode) {
      if (!pttDownActive) return;
      pttDownActive = false;
      win.webContents.send("ptt:up");
    }
  });

  uIOhook.on("mousedown", (e) => {
    if (isListeningForPtt) {
      isListeningForPtt = false;
      pttMouseButton = e.button;
      pttKeycode = null;
      const displayName = mouseButtonToName[e.button] || `MOUSE ${e.button}`;
      win.webContents.send("ptt:keyAssigned", { displayName, rawCode: `m${e.button}` });
      return;
    }
    if (pttMouseButton !== null && e.button === pttMouseButton) {
      if (pttDownActive) return;
      pttDownActive = true;
      win.webContents.send("ptt:down");
    }
  });

  uIOhook.on("mouseup", (e) => {
    if (pttMouseButton !== null && e.button === pttMouseButton) {
      if (!pttDownActive) return;
      pttDownActive = false;
      win.webContents.send("ptt:up");
    }
  });

  try {
    uIOhook.start();
  } catch (err) {
    logger.error("uiohook başlatılamadı", { message: err?.message });
  }
}

ipcMain.on("ptt:init", (_event, keyStr) => {
  parseSavedPttKey(keyStr);
});

// Raw keycode tabanlı init — isim çakışmalarını (sol/sağ CTRL gibi) önler
ipcMain.on("ptt:initRaw", (_event, rawCode) => {
  if (!rawCode) return;
  pttDownActive = false;
  if (rawCode.startsWith("k")) {
    pttKeycode = parseInt(rawCode.slice(1));
    pttMouseButton = null;
  } else if (rawCode.startsWith("m")) {
    pttMouseButton = parseInt(rawCode.slice(1));
    pttKeycode = null;
  }
});

ipcMain.on("ptt:startListening", () => {
  isListeningForPtt = true;
});

ipcMain.on("ptt:stopListening", () => {
  isListeningForPtt = false;
});

const isDev = !app.isPackaged;

// ── File logger ───────────────────────────────────────────────────────────────
// logsDir lazy init: app.getPath() ancak app ready olduktan sonra güvenli çalışır.
const logger = (() => {
  let logsDir = null;

  const getLogsDir = () => {
    if (logsDir) return logsDir;
    logsDir = path.join(app.getPath("userData"), "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    // Eski log dosyalarını temizle (7 günden eski)
    try {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      fs.readdirSync(logsDir).forEach((f) => {
        const fullPath = path.join(logsDir, f);
        if (fs.statSync(fullPath).mtimeMs < cutoff) fs.unlinkSync(fullPath);
      });
    } catch {}
    return logsDir;
  };

  const getLogPath = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return path.join(getLogsDir(), `app-${dateStr}.log`);
  };

  const write = (level, message, data) => {
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level.toUpperCase()}] ${message}`;
    if (data !== undefined && data !== null) {
      try { line += `\n  Data: ${JSON.stringify(data, null, 2)}`; } catch { line += `\n  Data: [unserializable]`; }
    }
    line += "\n";
    try { fs.appendFileSync(getLogPath(), line, "utf8"); } catch {}
    if (isDev) process.stdout.write(`[LOG] ${line}`);
  };

  return {
    info:  (msg, data) => write("info",  msg, data),
    warn:  (msg, data) => write("warn",  msg, data),
    error: (msg, data) => write("error", msg, data),
  };
})();

// V8 heap limitini düşür (varsayılan ~700MB → 256MB yeter)
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=256");
// Kullanılmayan GPU süreçlerini kapatmaya zorla
app.commandLine.appendSwitch("enable-features", "EnableBFCache");

// Pencere boyutu ve konumunu localStorage'a benzer şekilde kaydet
const Store = (() => {
  const storeFile = path.join(app.getPath("userData"), "window-state.json");
  const defaults = { width: 1400, height: 900, x: undefined, y: undefined };
  let data = defaults;
  try { data = { ...defaults, ...JSON.parse(fs.readFileSync(storeFile, "utf8")) }; } catch {}
  return {
    get: () => data,
    set: (val) => {
      data = { ...data, ...val };
      try { fs.writeFileSync(storeFile, JSON.stringify(data)); } catch {}
    },
  };
})();

function getTrayIcon() {
  // icon.ico aslında PNG formatında — .png uzantısıyla okut
  const candidates = [
    path.join(__dirname, "../build/tray-icon.png"),
    path.join(process.resourcesPath || "", "tray-icon.png"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      const img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) continue;
      const size = img.getSize();
      const side = Math.min(size.width, size.height);
      const square = img.crop({ x: Math.floor((size.width - side) / 2), y: 0, width: side, height: side });
      return square.resize({ width: 16, height: 16, quality: "best" });
    } catch {}
  }
  return nativeImage.createEmpty();
}

function setupTray(win) {
  tray = new Tray(getTrayIcon());
  tray.setToolTip("MAYVOX");

  // İlk menü oluştur
  updateTrayMenu(win, null);

  tray.on("double-click", () => {
    win.show();
    win.focus();
  });
}

// Tray menüsünü güncelleyen yardımcı
function updateTrayMenu(win, channelName) {
  if (!tray) return;
  const items = [
    {
      label: "Aç",
      click: () => { win.show(); win.focus(); },
    },
  ];

  if (channelName) {
    items.push({
      label: channelName,
      enabled: false,
    });
  }

  items.push({ type: "separator" });
  items.push({
    label: "Çıkış",
    click: () => { isQuitting = true; app.quit(); },
  });

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// Renderer'dan oda değişikliği bildirimi
ipcMain.on("tray:set-channel", (_e, channelName) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) updateTrayMenu(win, channelName || null);
});

// ── Splash → Main pencere geçişi ─────────────────────────────────────────────
// Splash: ayrı HTML, sadece logo + CSS nefes animasyonu. React yüklemez.
// Main: React uygulaması, show=false ile arka planda yüklenir.
// Main ready-to-show → splash fade-out (opacity) → splash destroy → main show.

const mainWebPrefs = {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  spellcheck: false,
  backgroundThrottling: false,
  enableWebSQL: false,
};

function createSplashWindow() {
  const splash = new BrowserWindow({
    // Update durumu etiketi + progress bar için height biraz arttırıldı; logo alanı aynı.
    width: 200,
    height: 200,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload-splash.cjs"),
    },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
  setTimeout(() => { try { if (!splash.isDestroyed() && !splash.isVisible()) splash.show(); } catch {} }, 100);
  return splash;
}

/** Pencere opacity'sini animate et. steps × interval = toplam süre. */
function animateOpacity(win, from, to, steps, interval) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  return new Promise((resolve) => {
    let current = from;
    const delta = (to - from) / steps;
    const tick = () => {
      current += delta;
      const done = to > from ? current >= to : current <= to;
      if (done) {
        try { win.setOpacity(Math.max(0, Math.min(1, to))); } catch {}
        resolve();
        return;
      }
      try { win.setOpacity(Math.max(0, Math.min(1, current))); } catch {}
      setTimeout(tick, interval);
    };
    tick();
  });
}

/** Splash fade-out + destroy */
function fadeSplashOut(splash) {
  if (!splash || splash.isDestroyed()) return Promise.resolve();
  return animateOpacity(splash, 1, 0, 8, 18).then(() => {
    if (!splash.isDestroyed()) splash.destroy();
  });
}

/** Main window fade-in */
function fadeMainIn(win) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  try { win.setOpacity(0); } catch {}
  win.show();
  return animateOpacity(win, 0, 1, 10, 16);
}

function createMainWindow() {
  const saved = Store.get();

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    // ── Custom MayVox chrome — premium frameless ──
    // Native title bar gizli; renderer içinde AppChrome bileşeni drag region + window
    // controls sağlar. Resize/snap davranışı OS tarafından korunur.
    frame: false,
    titleBarStyle: "hidden",
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    thickFrame: false,
    roundedCorners: true,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: mainWebPrefs,
  });

  // ── Window state changes → renderer'a duyur (maximize ikon güncellemesi) ──
  const sendWinState = () => {
    try {
      win.webContents.send("window:state", {
        maximized: win.isMaximized(),
        focused: win.isFocused(),
        authMode: authWindowMode,
      });
    } catch { /* no-op */ }
  };
  win.on("maximize", sendWinState);
  win.on("unmaximize", sendWinState);
  win.on("focus", sendWinState);
  win.on("blur", sendWinState);
  win.webContents.on("did-finish-load", sendWinState);

  const saveState = () => {
    if (authWindowMode) return;
    if (win.isMaximized() || win.isMinimized()) return;
    const { width, height } = win.getBounds();
    const [x, y] = win.getPosition();
    Store.set({ width, height, x, y });
  };
  win.on("resize", saveState);
  win.on("move", saveState);

  win.on("close", (e) => {
    if (isQuitting || authWindowMode) {
      isQuitting = true;
      logger.info("Window close: quitting mode — pencere kapanacak");
      return;
    }
    e.preventDefault();
    win.hide();
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:3000");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return win;
}

function createWindow() {
  const win = createMainWindow();
  win.show();
  return win;
}

// Renderer'dan gelen log mesajlarını dosyaya yaz
ipcMain.on("app:log", (_event, { level, message, data }) => {
  logger[level]?.(message, data);
});

ipcMain.handle("app:getVersion", () => app.getVersion());

// Harici URL aç — çift protokol guard'ı (preload'da + burada)
ipcMain.on("shell:open-external", (_event, url) => {
  try {
    if (typeof url !== "string") return;
    if (!/^https?:\/\//i.test(url)) return;
    shell.openExternal(url).catch((err) => {
      logger.warn?.("[shell] openExternal error: " + (err?.message || err));
    });
  } catch (err) {
    logger.warn?.("[shell] openExternal crash: " + (err?.message || err));
  }
});

// ── Custom MayVox window controls ──
function withWin(event, fn) {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) fn(win);
  } catch (err) {
    logger.warn?.("[window] control error: " + (err?.message || err));
  }
}
function toggleMaximize(win) {
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
}
ipcMain.on("window:minimize", (e) => withWin(e, (w) => w.minimize()));
ipcMain.on("window:maximize-restore", (e) => withWin(e, toggleMaximize));
ipcMain.on("window:toggle-maximize", (e) => withWin(e, toggleMaximize));
ipcMain.handle("window:toggle-maximize", (e) => withWin(e, toggleMaximize));
ipcMain.on("window:close", (e) => withWin(e, (w) => {
  if (authWindowMode) {
    isQuitting = true;
    app.quit();
    return;
  }
  w.close();
}));
ipcMain.on("window:set-auth-mode", (e, payload) => withWin(e, (w) => {
  const enabled = !!payload?.enabled;

  if (enabled) {
    const alreadyAuth = authWindowMode;
    if (!authWindowMode && !w.isMaximized() && !w.isMinimized()) {
      preAuthBounds = w.getBounds();
    }
    authWindowMode = true;
    if (w.isMaximized()) w.unmaximize();

    const display = screen.getDisplayMatching(w.getBounds());
    const workArea = display?.workArea || { width: 1400, height: 900 };
    const target = { width: 540, height: 760 };
    const width = Math.max(540, Math.min(target.width, workArea.width - 40));
    const height = Math.max(760, Math.min(target.height, workArea.height - 40));

    w.setResizable(false);
    w.setMaximizable(true);
    w.setMinimumSize(width, height);
    w.setMaximumSize(10000, 10000);
    if (!alreadyAuth) {
      w.setSize(width, height, true);
      w.center();
    }
    try {
      w.webContents.send("window:state", { maximized: false, focused: w.isFocused(), authMode: true });
    } catch { /* no-op */ }
    return;
  }

  if (!authWindowMode) return;
  authWindowMode = false;
  w.setResizable(true);
  w.setMaximizable(true);
  w.setMaximumSize(10000, 10000);
  w.setMinimumSize(1100, 700);

  const saved = Store.get();
  const bounds = preAuthBounds || saved;
  const width = Math.max(1100, bounds.width || saved.width || 1400);
  const height = Math.max(700, bounds.height || saved.height || 900);
  if (typeof bounds.x === "number" && typeof bounds.y === "number") {
    w.setBounds({ x: bounds.x, y: bounds.y, width, height }, true);
  } else {
    w.setSize(width, height, true);
    w.center();
  }
  preAuthBounds = null;
  try {
    w.webContents.send("window:state", { maximized: w.isMaximized(), focused: w.isFocused(), authMode: false });
  } catch { /* no-op */ }
}));
ipcMain.handle("window:is-maximized", (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getAllWindows()[0];
    return !!(w && !w.isDestroyed() && w.isMaximized());
  } catch { return false; }
});
ipcMain.handle("window:is-focused", (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getAllWindows()[0];
    return !!(w && !w.isDestroyed() && w.isFocused());
  } catch { return true; }
});

// Notification attention — renderer'dan flash toggle.
// Focus alındığında Electron otomatik stop eder; yine de explicit off da destekli.
ipcMain.on("notify:flash", (event, on) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.flashFrame(!!on);
  } catch (err) {
    logger.warn?.("[notify] flashFrame error: " + (err?.message || err));
  }
});

// ── Auto-updater ───────────────────────────────────────────────────────────
// Tek autoUpdater örneği; başlatılma + busy flag module-scope.
// Startup gate (Discord-vari sessiz güncelleme) + renderer-driven secondary UI
// aynı örneği dinler, aynı busy flag'ini paylaşır — çift check/download yok.
let autoUpdaterInitialized = false;
let setupAutoUpdaterInitialized = false; // listener/ipc handler duplicate önleme
let isUpdaterBusy = false;
let mainWinRef = null; // setupAutoUpdater listener'ları buraya yazar; activate'te referans güncellenir

function initAutoUpdater() {
  if (autoUpdaterInitialized) return;
  autoUpdaterInitialized = true;
  autoUpdater.logger = {
    info:  (msg) => logger.info("[updater] " + msg),
    warn:  (msg) => logger.warn("[updater] " + msg),
    error: (msg) => logger.error("[updater] " + msg),
    debug: () => {},
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Busy flag'i her terminal event'te sıfırla — hangi listener önce gelirse
  // gelsin, sonraki check/download guard'ı tutarlı davransın.
  autoUpdater.on("update-available",     () => { isUpdaterBusy = false; });
  autoUpdater.on("update-not-available", () => { isUpdaterBusy = false; });
  autoUpdater.on("update-downloaded",    () => { isUpdaterBusy = false; });
  autoUpdater.on("error",                () => { isUpdaterBusy = false; });
}

function setupAutoUpdater(win) {
  if (isDev) return;
  initAutoUpdater();
  // Activate handler veya benzeri bir yerde tekrar çağrılırsa sadece win referansını
  // güncelle — listener/ipc handler'ları BİR DEFA bağlı kalır (duplicate önleme).
  mainWinRef = win;
  if (setupAutoUpdaterInitialized) return;
  setupAutoUpdaterInitialized = true;

  const safeSend = (channel, data) => {
    try {
      const w = mainWinRef;
      if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
        w.webContents.send(channel, data);
      }
    } catch {}
  };

  autoUpdater.on("checking-for-update", () => safeSend("update:checking"));

  autoUpdater.on("update-available", (info) => {
    logger.info("Update available", { version: info.version });
    const size = info.files?.[0]?.size;
    safeSend("update:available", { version: info.version, size });
  });

  autoUpdater.on("update-not-available", () => safeSend("update:not-available"));

  autoUpdater.on("download-progress", (progress) => {
    safeSend("update:progress", { percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    logger.info("Update downloaded", { version: info.version });
    safeSend("update:downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    logger.error("Update error", { message: err?.message });
    safeSend("update:error", { message: err?.message || "Bilinmeyen hata" });
  });

  ipcMain.on("update:check", () => {
    if (isUpdaterBusy) return;
    isUpdaterBusy = true;
    autoUpdater.checkForUpdates().catch(e => {
      isUpdaterBusy = false;
      logger.warn("Check failed", { message: e?.message });
    });
  });

  ipcMain.on("update:download", () => {
    if (isUpdaterBusy) return;
    isUpdaterBusy = true;
    autoUpdater.downloadUpdate().catch(e => {
      isUpdaterBusy = false;
      logger.error("Download failed", { message: e?.message });
    });
  });

  ipcMain.on("update:install", () => {
    // Gate install başlattıysa isQuitting = true olur — çift quitAndInstall engellenir.
    if (isQuitting) return;
    try {
      const diagPath = path.join(process.env.TEMP || app.getPath('temp'), 'MAYVOX-update-debug.log');
      const diag = [
        `[${new Date().toISOString()}] update:install tetiklendi (renderer)`,
        `execPath: ${process.execPath}`,
        `exePath: ${app.getPath('exe')}`,
        `isPackaged: ${app.isPackaged}`,
      ].join('\n') + '\n';
      fs.appendFileSync(diagPath, diag, 'utf8');
    } catch {}
    isQuitting = true;
    autoUpdater.quitAndInstall(true, true);
  });
}

// ── Game Activity — renderer toggle IPC ─────────────────────────────────────
// Renderer setEnabled(true/false) gönderir; detector toggle'a göre polling
// başlatır/durdurur. Kapalıyken hiçbir tarama/publish olmaz (privacy-first).
ipcMain.on("game:set-enabled", (_event, enabled) => {
  try {
    const det = getDetector();
    if (det) det.setEnabled(!!enabled);
  } catch (err) {
    logger.warn?.("[game] set-enabled hatası: " + (err?.message || err));
  }
});

// ── Ses Overlay — renderer IPC ──────────────────────────────────────────────
// applySettings: toggle / position / size / clickThrough değişimlerinde.
// update: participant snapshot'ı (throttled renderer tarafında).
ipcMain.on("overlay:apply-settings", (_event, settings) => {
  try {
    const mgr = getOverlayManager();
    if (mgr && settings && typeof settings === 'object') mgr.applySettings(settings);
  } catch (err) {
    logger.warn?.("[overlay] apply-settings hatası: " + (err?.message || err));
  }
});
ipcMain.on("overlay:update", (_event, snapshot) => {
  try {
    const mgr = getOverlayManager();
    if (mgr && snapshot && typeof snapshot === 'object') mgr.sendSnapshot(snapshot);
  } catch (err) {
    logger.warn?.("[overlay] update hatası: " + (err?.message || err));
  }
});

// ── Startup Update Gate (Discord-vari sessiz akış) ──────────────────────────
// Splash açıldıktan sonra main pencere göstermeden önce tetiklenir.
// - update-not-available / error / timeout → onResolve('none'|'error'|'timeout')
//   ardından normal splash→main geçişi yapılır.
// - update-available → splash "updating" moduna geçer, download başlar,
//   bittiğinde quitAndInstall çağrılır; onResolve HİÇ çağrılmaz (app restart).
//
// NOT: NSIS `oneClick: false` olduğu için Windows'ta UAC prompt + kısa süreli
// installer penceresi görünebilir; tam sessiz kurulum GARANTİ edilemez.
// `quitAndInstall(true, true)` mümkün olan en sessiz + auto-restart davranışını
// talep eder. Bunu `oneClick: true`'ya çevirmek daha sessiz yapar ama
// release/installer UX sözleşmesini değiştirir — kapsam dışı.
function runStartupUpdateGate(splash, mainWin, onResolve, onDownloadingChange) {
  if (isDev) { onResolve('none'); return; }

  initAutoUpdater();

  const TIMEOUT_MS = 7000;
  let resolved = false;
  let downloading = false;

  const splashSend = (channel, data) => {
    try {
      if (splash && !splash.isDestroyed() && splash.webContents && !splash.webContents.isDestroyed()) {
        splash.webContents.send(channel, data);
      }
    } catch {}
  };

  const setDownloading = (v) => {
    downloading = v;
    try { onDownloadingChange?.(v); } catch {}
  };

  const resolveOnce = (decision) => {
    if (resolved) return;
    resolved = true;
    cleanup();
    // Busy flag'i terminal path'lerde (timeout/error dahil) kesin resetle —
    // aksi halde renderer'ın sonraki check'leri sonsuz skip edilir.
    isUpdaterBusy = false;
    setDownloading(false);
    onResolve(decision);
  };

  const onChecking      = ()     => splashSend('splash:update-mode', 'checking');
  const onNotAvailable  = ()     => resolveOnce('none');
  const onAvailable     = (info) => {
    setDownloading(true);
    logger.info("[startup-gate] update available, download başlıyor", { version: info?.version });
    splashSend('splash:update-mode', 'downloading');
    splashSend('splash:update-progress', 0);
    isUpdaterBusy = true;
    autoUpdater.downloadUpdate().catch(e => {
      logger.error("[startup-gate] download fail", { message: e?.message });
      resolveOnce('error');
    });
  };
  const onProgress      = (p)    => splashSend('splash:update-progress', Math.round(p?.percent || 0));
  const onDownloaded    = ()     => {
    if (resolved) return;
    resolved = true;
    cleanup(); // 300ms içinde gelebilecek error event'i terminal path'e girmesin
    logger.info("[startup-gate] download tamam, install başlıyor");
    splashSend('splash:update-mode', 'installing');
    try {
      const diagPath = path.join(process.env.TEMP || app.getPath('temp'), 'MAYVOX-update-debug.log');
      fs.appendFileSync(diagPath, `[${new Date().toISOString()}] startup-gate quitAndInstall\n`, 'utf8');
    } catch {}
    // quitAndInstall garantili çağrı — setTimeout içinde çift quit guard'ı.
    setTimeout(() => {
      if (isQuitting) return;
      isQuitting = true;
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (e) {
        logger.error("[startup-gate] quitAndInstall fail", { message: e?.message });
        isQuitting = false;
        setDownloading(false);
        onResolve('error');
      }
    }, 300); // Splash'ın installing animasyonunu gösterebilmesi için küçük delay.
  };
  const onError         = (err)  => {
    logger.warn("[startup-gate] error → normal açılışa düşülüyor", { message: err?.message });
    splashSend('splash:update-mode', 'error');
    resolveOnce('error');
  };

  autoUpdater.on('checking-for-update', onChecking);
  autoUpdater.on('update-not-available', onNotAvailable);
  autoUpdater.on('update-available', onAvailable);
  autoUpdater.on('download-progress', onProgress);
  autoUpdater.on('update-downloaded', onDownloaded);
  autoUpdater.on('error', onError);

  function cleanup() {
    autoUpdater.removeListener('checking-for-update', onChecking);
    autoUpdater.removeListener('update-not-available', onNotAvailable);
    autoUpdater.removeListener('update-available', onAvailable);
    autoUpdater.removeListener('download-progress', onProgress);
    autoUpdater.removeListener('update-downloaded', onDownloaded);
    autoUpdater.removeListener('error', onError);
  }

  // Timeout: update-available aldıysak (download sürüyorsa) timeout'u IPTAL,
  // yoksa 7s içinde karar gelmezse normal açılışa düşürelim.
  const timer = setTimeout(() => {
    if (resolved) return;
    if (downloading) return; // Download devam ediyorsa timeout'u yeme — bitmesini bekle.
    logger.info("[startup-gate] timeout → normal açılış");
    resolveOnce('timeout');
  }, TIMEOUT_MS);
  const origCleanup = cleanup;
  cleanup = () => { try { clearTimeout(timer); } catch {} origCleanup(); };

  isUpdaterBusy = true;
  autoUpdater.checkForUpdates().catch(e => {
    logger.warn("[startup-gate] checkForUpdates reject", { message: e?.message });
    resolveOnce('error');
  });
}

// ── Main process crash handling ────────────────────────────────────────────
// uncaughtException: logger zaten init edilmiş olabilir ya da olmayabilir.
// Güvenli tarafta kalmak için her iki durumu da handle ediyoruz.
process.on("uncaughtException", (err) => {
  logger.error("Main process uncaught exception", {
    message: err?.message,
    stack: err?.stack,
  });
  // Uygulama burada çökmez; Electron kendi crash raporlamasını devam ettirir.
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : null;
  logger.error("Main process unhandled rejection", {
    message: err?.message ?? String(reason),
    stack: err?.stack,
  });
});

// ── Windows Audio Ducking opt-out ────────────────────────────────────────────
// Windows varsayılan: bir app mic açınca ("communications activity") diğer
// uygulamaların sesini %80 kısar. PUBG vb. oyun sesleri kısılmasın diye HKCU
// UserDuckingPreference'ı "Hiçbir şey yapma" (3) değerine çekiyoruz.
// İlk runda bir kere; sonraki runlarda kullanıcı manuel değiştirdiyse saygı duy.
// Değerler: 0=mute other, 1=-80% (default), 2=-50%, 3=do nothing.
function applyWindowsDuckingOptOut() {
  if (process.platform !== 'win32') return;
  try {
    const flagFile = path.join(app.getPath('userData'), '.ducking-optout-applied');
    if (fs.existsSync(flagFile)) return;

    const { execFile } = require('child_process');
    execFile('reg', [
      'add', 'HKCU\\Software\\Microsoft\\Multimedia\\Audio',
      '/v', 'UserDuckingPreference',
      '/t', 'REG_DWORD',
      '/d', '3',
      '/f',
    ], { windowsHide: true }, (err) => {
      if (err) {
        logger.warn("Windows ducking opt-out başarısız", { error: err.message });
        return;
      }
      try { fs.writeFileSync(flagFile, new Date().toISOString()); } catch {}
      logger.info("Windows ducking opt-out uygulandı (UserDuckingPreference=3)");
    });
  } catch (e) {
    logger.warn("Windows ducking opt-out exception", { error: e.message });
  }
}

app.whenReady().then(() => {
  logger.info("Uygulama başlatıldı", { version: app.getVersion(), isDev });
  applyWindowsDuckingOptOut();

  // ── Media & speaker-selection permissions ────────────────────────────────
  // Production build file:// origin'inde yükleniyor; dev'de http://127.0.0.1:3000.
  // Chromium file:// origin'inde 'speaker-selection' iznini default vermiyor →
  // HTMLAudioElement.setSinkId() ve Room.switchActiveDevice('audiooutput') silently
  // reject oluyor → kullanıcı çıkış cihazını seçmesine rağmen ses hoparlörden gelmeye
  // devam ediyor. Hem request hem check handler'ı ile media + speaker-selection
  // explicit grant edilir; diğer izinler Electron default davranışına (grant) uyar.
  const mediaPermissions = new Set(['media', 'speaker-selection', 'audioCapture', 'videoCapture']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (mediaPermissions.has(permission)) return callback(true);
    return callback(true);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (mediaPermissions.has(permission)) return true;
    return true;
  });

  // ── Splash + Main paralel başlatma + Startup Update Gate ──
  // 1. Splash anında açılır
  // 2. Main window arka planda React yükler (show: false)
  // 3. Startup update gate paralelde çalışır (prod only)
  // 4. İKİ koşul da sağlanınca splash→main geçişi olur:
  //    - mainReady = main window ready-to-show
  //    - updateGateResolved = gate 'none'/'error'/'timeout' döndü
  // 5. Gate 'downloading' yoluna girerse splash kalır, download/install akışı
  //    kendi içinde ilerler, app restart olur — transition çağrılmaz.
  const splash = createSplashWindow();
  const mainWin = createMainWindow();
  const startTs = Date.now();
  const MIN_SPLASH_MS = 1200;

  let transitioned = false;
  let mainReady = false;
  let updateGateResolved = isDev; // dev'de gate bypass
  let gateDownloading = false;    // download/install devam ediyorsa safety timeout ezmesin

  function doTransition() {
    if (transitioned) return;
    transitioned = true;
    fadeSplashOut(splash);
    if (mainWin && !mainWin.isDestroyed()) fadeMainIn(mainWin);
    // Renderer'a update state'i idle'a çek — aksi halde startup sırasında
    // tetiklenen check'lerden kalan 'checking' state'i versiyon barında
    // sonsuz spinner'a döner.
    try {
      if (mainWin && !mainWin.isDestroyed() && mainWin.webContents && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.once('did-finish-load', () => {
          try { mainWin.webContents.send('update:idle'); } catch {}
        });
        // Eğer zaten yüklendiyse (ready-to-show sonrası) doğrudan gönder
        if (!mainWin.webContents.isLoading()) {
          setTimeout(() => { try { mainWin.webContents.send('update:idle'); } catch {} }, 50);
        }
      }
    } catch {}
  }

  function attemptTransition() {
    if (transitioned) return;
    if (!mainReady || !updateGateResolved) return;
    const elapsed = Date.now() - startTs;
    if (elapsed < MIN_SPLASH_MS) {
      setTimeout(attemptTransition, MIN_SPLASH_MS - elapsed);
      return;
    }
    doTransition();
  }

  mainWin.once("ready-to-show", () => {
    mainReady = true;
    attemptTransition();
  });

  // Güvenlik: 12s içinde transition olmadıysa zorla geç.
  // ANCAK gate hâlâ download/install yapıyorsa main'i açmak quitAndInstall
  // sonrası restart yolunu bozar → splash açık kalır, gate kendi terminal
  // path'ini takip eder.
  setTimeout(() => {
    if (transitioned) return;
    if (gateDownloading) {
      logger.info("Splash 12s safety geçti ama update download/install devam ediyor — bekleme sürüyor");
      return;
    }
    logger.info("Splash timeout 12s — zorla normal açılışa geçiliyor");
    mainReady = true;
    updateGateResolved = true;
    doTransition();
  }, 12000);

  // ── Discord-vari sessiz startup update check ──
  // Fail-safe: herhangi bir error/timeout → updateGateResolved=true → normal akış.
  runStartupUpdateGate(splash, mainWin, (decision) => {
    logger.info("[startup-gate] resolved", { decision });
    updateGateResolved = true;
    attemptTransition();
  }, (v) => { gateDownloading = v; });

  setupAutoUpdater(mainWin);
  setupGlobalPtt(mainWin);
  setupTray(mainWin);
  // Oyun algılama — opt-in; renderer enable komutu gelene kadar polling durur.
  setupGameDetection(mainWin, logger);
  // Ses overlay — opt-in; settings update gelmediği sürece window oluşturulmaz.
  setupOverlayWindow({ isDev, logger });

  // İkinci instance tetiklenirse
  app.on("second-instance", (_event, argv) => {
    // Installer/uninstall kaynaklı ise uygulamayı kapat
    if (isInstallerArgs(argv)) {
      logger.info("second-instance: installer algılandı, uygulama kapatılıyor", { argv: argv.slice(0, 5) });
      isQuitting = true;
      app.quit();
      return;
    }
    // Normal ikinci instance → pencereyi öne getir
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    } else if (splash && !splash.isDestroyed()) {
      splash.show();
      splash.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Tüm pencereler kapanmışsa yeni ana pencere aç
      const win = createMainWindow();
      win.show();
      setupAutoUpdater(win);
      setupGlobalPtt(win);
      setupTray(win);
    } else {
      BrowserWindow.getAllWindows()[0].show();
    }
  });
});

// Pencere kapatılınca uygulama sonlanmaz — tray'de çalışmaya devam eder.
// Gerçek çıkış sadece tray > Çıkış ile olur (isQuitting = true).
// Ama installer/quit modundaysa process sonlansın.
app.on("window-all-closed", () => {
  try { fs.appendFileSync(path.join(process.env.TEMP || app.getPath('temp'), 'MAYVOX-update-debug.log'), `[${new Date().toISOString()}] window-all-closed isQuitting=${isQuitting}\n`, 'utf8'); } catch {}
  if (isQuitting) app.quit();
});

app.on("before-quit", () => {
  try { fs.appendFileSync(path.join(process.env.TEMP || app.getPath('temp'), 'MAYVOX-update-debug.log'), `[${new Date().toISOString()}] before-quit tetiklendi\n`, 'utf8'); } catch {}
  isQuitting = true;
  // Native kaynakları erken serbest bırak — installer başlamadan dosya kilitleri kalksın
  if (uIOhook) {
    try { uIOhook.stop(); } catch (e) { logger.error("uIOhook stop hatası", { message: e?.message }); }
    uIOhook = null;
  }
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
  try { getOverlayManager()?.dispose(); } catch {}
});

app.on("will-quit", () => {
  try { fs.appendFileSync(path.join(process.env.TEMP || app.getPath('temp'), 'MAYVOX-update-debug.log'), `[${new Date().toISOString()}] will-quit tetiklendi\n`, 'utf8'); } catch {}
  // before-quit'te temizlenmediyse son şans
  if (uIOhook) {
    try { uIOhook.stop(); } catch {}
    uIOhook = null;
  }
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
});
