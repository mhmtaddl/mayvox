// ── Electron Updater Adapter (Renderer Side) ────────────────────────────────
// Preload'dan expose edilen API'yi type-safe şekilde kullanır.

type UpdateCallback<T = void> = T extends void ? () => void : (data: T) => void;

interface ElectronUpdateAPI {
  onChecking: (cb: () => void) => void;
  onAvailable: (cb: (info: { version: string; size?: number }) => void) => void;
  onNotAvailable: (cb: () => void) => void;
  onProgress: (cb: (info: { percent: number }) => void) => void;
  onDownloaded: (cb: (info: { version: string }) => void) => void;
  onError: (cb: (info: { message: string }) => void) => void;
  check: () => void;
  download: () => void;
  install: () => void;
  removeAllListeners: () => void;
}

function getApi(): ElectronUpdateAPI | null {
  return (window as any).electronUpdate ?? null;
}

export function isElectronUpdateAvailable(): boolean {
  return getApi() !== null;
}

export function electronCheck(): void {
  getApi()?.check();
}

export function electronDownload(): void {
  getApi()?.download();
}

export function electronInstall(): void {
  getApi()?.install();
}

export function electronOnChecking(cb: UpdateCallback): void {
  getApi()?.onChecking(cb);
}

export function electronOnAvailable(cb: UpdateCallback<{ version: string; size?: number }>): void {
  getApi()?.onAvailable(cb);
}

export function electronOnNotAvailable(cb: UpdateCallback): void {
  getApi()?.onNotAvailable(cb);
}

export function electronOnProgress(cb: UpdateCallback<{ percent: number }>): void {
  getApi()?.onProgress(cb);
}

export function electronOnDownloaded(cb: UpdateCallback<{ version: string }>): void {
  getApi()?.onDownloaded(cb);
}

export function electronOnError(cb: UpdateCallback<{ message: string }>): void {
  getApi()?.onError(cb);
}

export function electronRemoveAllListeners(): void {
  getApi()?.removeAllListeners();
}
