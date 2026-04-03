// ── Update System Domain Types ──────────────────────────────────────────────

export type UpdateLevel = 'optional' | 'recommended' | 'force';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdatePolicy {
  latestVersion: string;
  minSupportedVersion: string;
  updateLevel: UpdateLevel;
  message: string | null;
  assets: {
    desktop?: { downloadUrl: string; size?: number };
    android?: { apkUrl: string; size?: number };
  };
  publishedAt: string;
}

export interface UpdateState {
  phase: UpdatePhase;
  policy: UpdatePolicy | null;
  progress: number;        // 0-100
  error: string | null;
  version: string | null;  // available version
}

export type UpdateUrgency = 'none' | 'optional' | 'recommended' | 'force';

/** Electron main → renderer IPC event payloads */
export interface ElectronUpdateEvents {
  'update:checking': void;
  'update:available': { version: string; size?: number };
  'update:not-available': void;
  'update:progress': { percent: number };
  'update:downloaded': { version: string };
  'update:error': { message: string };
}

/** Renderer → Electron main IPC commands */
export interface ElectronUpdateCommands {
  'update:check': void;
  'update:download': void;
  'update:install': void;
}
