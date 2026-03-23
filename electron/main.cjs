const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require("electron");
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
  const candidates = [
    path.join(__dirname, "../build/icon.ico"),
    path.join(process.resourcesPath || "", "icon.ico"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return nativeImage.createFromPath(p);
    } catch {}
  }
  return nativeImage.createEmpty();
}

function setupTray(win) {
  tray = new Tray(getTrayIcon());
  tray.setToolTip("CylkSohbet");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Göster / Aç",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Çıkış",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    win.show();
    win.focus();
  });
}

function createWindow() {
  const saved = Store.get();

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      enableWebSQL: false,
    },
  });

  // Boyut/konum değişikliklerini kaydet (kapanmadan önce)
  const saveState = () => {
    if (win.isMaximized() || win.isMinimized()) return;
    const { width, height } = win.getBounds();
    const [x, y] = win.getPosition();
    Store.set({ width, height, x, y });
  };

  win.on("resize", saveState);
  win.on("move", saveState);

  // X butonuna basıldığında kapat değil, tray'e indir
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:3000");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// Renderer'dan gelen log mesajlarını dosyaya yaz
ipcMain.on("app:log", (_event, { level, message, data }) => {
  logger[level]?.(message, data);
});

// ── Auto-updater ───────────────────────────────────────────────────────────
function setupAutoUpdater(win) {
  if (isDev) return; // Güncelleme kontrolü sadece production'da

  autoUpdater.logger = {
    info:  (msg) => logger.info("[updater] " + msg),
    warn:  (msg) => logger.warn("[updater] " + msg),
    error: (msg) => logger.error("[updater] " + msg),
    debug: () => {},
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    logger.info("Yeni sürüm mevcut", info);
    const sizeMB = info.files?.[0]?.size
      ? Math.round(info.files[0].size / 1024 / 1024 * 10) / 10
      : null;
    win.webContents.send("updater:update-available", { version: info.version, sizeMB });
  });

  autoUpdater.on("download-progress", (progress) => {
    win.webContents.send("updater:download-progress", { percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    logger.info("Güncelleme indirildi", info);
    win.webContents.send("updater:update-downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    logger.error("Güncelleme hatası", { message: err?.message });
  });

  // İlk kontrolü 10 saniye sonra yap (uygulama tam yüklendikten sonra)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000);
  // Sonraki kontroller her 6 saatte bir
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

ipcMain.on("updater:start-download", () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

ipcMain.on("updater:install-now", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("app:getVersion", () => app.getVersion());

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
  createWindow();
  const win = BrowserWindow.getAllWindows()[0];
  setupAutoUpdater(win);
  setupGlobalPtt(win);
  setupTray(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      BrowserWindow.getAllWindows()[0].show();
    }
  });
});

// Pencere kapatılınca uygulama sonlanmaz — tray'de çalışmaya devam eder.
// Gerçek çıkış sadece tray > Çıkış ile olur (isQuitting = true).
app.on("window-all-closed", () => {
  // Kasıtlı boş bırakıldı
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  try { uIOhook?.stop(); } catch {}
});
