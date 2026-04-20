const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

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

// Tray & quit state
let tray = null;
let isQuitting = false;

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
      win.webContents.send("ptt:down");
    }
  });

  uIOhook.on("keyup", (e) => {
    if (pttKeycode !== null && e.keycode === pttKeycode) {
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
      win.webContents.send("ptt:down");
    }
  });

  uIOhook.on("mouseup", (e) => {
    if (pttMouseButton !== null && e.button === pttMouseButton) {
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
    width: 148,
    height: 148,
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
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
  // Fallback: ready-to-show gelmezse (örn. asset yükleme sorunu) 100ms içinde yine göster
  // — aksi halde splash hiç görünmeyebilir ve kullanıcı "direkt büyük pencere" görür.
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
    backgroundColor: "#060a14",
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: mainWebPrefs,
  });

  // ── Window state changes → renderer'a duyur (maximize ikon güncellemesi) ──
  const sendWinState = () => {
    try {
      win.webContents.send("window:state", {
        maximized: win.isMaximized(),
        focused: win.isFocused(),
      });
    } catch { /* no-op */ }
  };
  win.on("maximize", sendWinState);
  win.on("unmaximize", sendWinState);
  win.on("focus", sendWinState);
  win.on("blur", sendWinState);
  win.webContents.on("did-finish-load", sendWinState);

  const saveState = () => {
    if (win.isMaximized() || win.isMinimized()) return;
    const { width, height } = win.getBounds();
    const [x, y] = win.getPosition();
    Store.set({ width, height, x, y });
  };
  win.on("resize", saveState);
  win.on("move", saveState);

  win.on("close", (e) => {
    if (isQuitting) {
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
ipcMain.on("window:minimize", (e) => withWin(e, (w) => w.minimize()));
ipcMain.on("window:maximize-restore", (e) => withWin(e, (w) => {
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
}));
ipcMain.on("window:close", (e) => withWin(e, (w) => w.close()));
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
function setupAutoUpdater(win) {
  if (isDev) return;

  let isCheckingOrDownloading = false;

  autoUpdater.logger = {
    info:  (msg) => logger.info("[updater] " + msg),
    warn:  (msg) => logger.warn("[updater] " + msg),
    error: (msg) => logger.error("[updater] " + msg),
    debug: () => {},
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Güvenli send — window destroy olduysa crash önle
  const safeSend = (channel, data) => {
    try {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    } catch {}
  };

  // Event'leri renderer'a ilet + guard sıfırla
  autoUpdater.on("checking-for-update", () => {
    safeSend("update:checking");
  });

  autoUpdater.on("update-available", (info) => {
    isCheckingOrDownloading = false;
    logger.info("Update available", { version: info.version });
    const size = info.files?.[0]?.size;
    safeSend("update:available", { version: info.version, size });
  });

  autoUpdater.on("update-not-available", () => {
    isCheckingOrDownloading = false;
    safeSend("update:not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    safeSend("update:progress", { percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    isCheckingOrDownloading = false;
    logger.info("Update downloaded", { version: info.version });
    safeSend("update:downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    isCheckingOrDownloading = false;
    logger.error("Update error", { message: err?.message });
    safeSend("update:error", { message: err?.message || "Bilinmeyen hata" });
  });

  // Renderer'dan gelen komutlar — duplicate guard
  ipcMain.on("update:check", () => {
    if (isCheckingOrDownloading) return;
    isCheckingOrDownloading = true;
    autoUpdater.checkForUpdates().catch(e => {
      isCheckingOrDownloading = false;
      logger.warn("Check failed", { message: e?.message });
    });
  });

  ipcMain.on("update:download", () => {
    if (isCheckingOrDownloading) return;
    isCheckingOrDownloading = true;
    autoUpdater.downloadUpdate().catch(e => {
      isCheckingOrDownloading = false;
      logger.error("Download failed", { message: e?.message });
    });
  });

  ipcMain.on("update:install", () => {
    try {
      const diagPath = path.join(process.env.TEMP || app.getPath('temp'), 'MAYVOX-update-debug.log');
      const diag = [
        `[${new Date().toISOString()}] update:install tetiklendi`,
        `execPath: ${process.execPath}`,
        `exePath: ${app.getPath('exe')}`,
        `userData: ${app.getPath('userData')}`,
        `isPackaged: ${app.isPackaged}`,
        `pid: ${process.pid}`,
        `quitAndInstall(true, true) çağrılacak`,
      ].join('\n') + '\n';
      fs.appendFileSync(diagPath, diag, 'utf8');
    } catch {}
    isQuitting = true;
    autoUpdater.quitAndInstall(true, true);
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

app.whenReady().then(() => {
  logger.info("Uygulama başlatıldı", { version: app.getVersion(), isDev });

  // ── Splash + Main paralel başlatma ──
  // 1. Splash anında açılır (sadece HTML + CSS, çok hızlı)
  // 2. Main window arka planda React yükler (show: false)
  // 3. Main ready-to-show → splash fade-out → main show
  const splash = createSplashWindow();
  const mainWin = createMainWindow();
  const startTs = Date.now();
  const MIN_SPLASH_MS = 1200;

  let transitioned = false;
  function doTransition() {
    if (transitioned) return;
    transitioned = true;
    // Overlap: splash fade-out başlarken main fade-in de başlar
    // → boş masaüstü asla görünmez
    fadeSplashOut(splash);
    if (mainWin && !mainWin.isDestroyed()) fadeMainIn(mainWin);
  }

  mainWin.once("ready-to-show", () => {
    // Warm cache'de React çok hızlı yüklenebilir — splash göz kırpıp kaybolmasın diye
    // minimum görünür süre garanti et.
    const elapsed = Date.now() - startTs;
    const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
    setTimeout(doTransition, wait);
  });

  // Güvenlik: 12s içinde ready-to-show gelmezse yine de geçiş yap
  setTimeout(() => {
    if (!transitioned) {
      logger.info("Splash timeout — ana pencereye geçiliyor");
      doTransition();
    }
  }, 12000);

  setupAutoUpdater(mainWin);
  setupGlobalPtt(mainWin);
  setupTray(mainWin);

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
