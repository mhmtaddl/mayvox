const { app, BrowserWindow } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

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

app.whenReady().then(() => {
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
