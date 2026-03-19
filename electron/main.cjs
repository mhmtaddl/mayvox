const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;

// ── File logger ───────────────────────────────────────────────────────────────
const logger = (() => {
  const logsDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  // Eski log dosyalarını temizle (7 günden eski)
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    fs.readdirSync(logsDir).forEach((f) => {
      const fullPath = path.join(logsDir, f);
      if (fs.statSync(fullPath).mtimeMs < cutoff) fs.unlinkSync(fullPath);
    });
  } catch {}

  const getLogPath = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return path.join(logsDir, `app-${dateStr}.log`);
  };

  const write = (level, message, data) => {
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level.toUpperCase()}] ${message}`;
    if (data !== undefined && data !== null) {
      try { line += `\n  Data: ${JSON.stringify(data, null, 2)}`; } catch { line += `\n  Data: [unserializable]`; }
    }
    line += "\n";
    try { fs.appendFileSync(getLogPath(), line, "utf8"); } catch {}
    // Dev modda terminale de yaz
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
  const fs = require("fs");
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

app.whenReady().then(() => {
  logger.info("Uygulama başlatıldı", { version: app.getVersion(), isDev });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
