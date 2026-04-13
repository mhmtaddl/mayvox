export type ThemeKey =
  | "cyanViolet"
  | "emeraldCyan"
  | "violetPink"
  | "blueYellow"
  | "midnightBlueBird"
  | "arcticWhite";

export interface AppTheme {
  key: ThemeKey;
  name: string;
  description: string;
  isLight: boolean;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundElevated: string;
  surface: string;
  panel: string;
  panelHover: string;
  panelActive: string;
  borderSubtle: string;
  divider: string;
  glow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  textOnAccent: string;
  buttonPrimaryBg: string;
  buttonPrimaryHover: string;
  buttonPrimaryText: string;
  buttonGhostBg: string;
  buttonGhostHover: string;
  buttonGhostText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  success: string;
  warning: string;
  danger: string;
  successText: string;
  warningText: string;
  dangerText: string;
  iconPrimary: string;
  iconSecondary: string;
  selection: string;
  scrollbarThumb: string;
  elevatedPanel: string;
  elevatedPanelHover: string;
  popoverBg: string;
  popoverBorder: string;
  popoverText: string;
  popoverTextSecondary: string;
  popoverShadow: string;
}

export const themes: Record<ThemeKey, AppTheme> = {
  cyanViolet: {
    key: "cyanViolet", name: "Cyan – Violet",
    description: "Futuristik, premium varsayılan tema.",
    isLight: false,
    primary: "#27E3FF", secondary: "#C25CFF", accent: "#8AF7FF",
    background: "#070D1A", backgroundElevated: "#0A1122",
    surface: "rgba(255,255,255,0.035)", panel: "rgba(255,255,255,0.05)",
    panelHover: "rgba(255,255,255,0.07)", panelActive: "rgba(255,255,255,0.085)",
    borderSubtle: "rgba(255,255,255,0.07)", divider: "rgba(255,255,255,0.05)",
    glow: "rgba(39,227,255,0.18)",
    textPrimary: "rgba(255,255,255,0.93)", textSecondary: "rgba(255,255,255,0.70)",
    textMuted: "rgba(255,255,255,0.44)", textOnPrimary: "#04131A", textOnAccent: "#06131A",
    buttonPrimaryBg: "#27E3FF", buttonPrimaryHover: "#4BE9FF", buttonPrimaryText: "#04131A",
    buttonGhostBg: "rgba(255,255,255,0.045)", buttonGhostHover: "rgba(255,255,255,0.075)", buttonGhostText: "rgba(255,255,255,0.90)",
    inputBg: "rgba(255,255,255,0.035)", inputBorder: "rgba(255,255,255,0.08)",
    inputText: "rgba(255,255,255,0.92)", inputPlaceholder: "rgba(255,255,255,0.38)",
    success: "#23D18B", warning: "#F6B73C", danger: "#FF5D73",
    successText: "#D6FFEC", warningText: "#FFF2CF", dangerText: "#FFE0E5",
    iconPrimary: "#27E3FF", iconSecondary: "rgba(255,255,255,0.72)",
    selection: "rgba(39,227,255,0.14)", scrollbarThumb: "rgba(39,227,255,0.45)",
    elevatedPanel: "rgba(255,255,255,0.075)", elevatedPanelHover: "rgba(255,255,255,0.095)",
    popoverBg: "#0C1326", popoverBorder: "rgba(39,227,255,0.10)",
    popoverText: "rgba(255,255,255,0.95)", popoverTextSecondary: "rgba(255,255,255,0.68)",
    popoverShadow: "0 12px 40px rgba(0,0,0,0.45)",
  },
  emeraldCyan: {
    key: "emeraldCyan", name: "Emerald – Cyan",
    description: "Temiz, güven veren, profesyonel.",
    isLight: false,
    primary: "#12F0A4", secondary: "#29D7FF", accent: "#7AF8D7",
    background: "#071712", backgroundElevated: "#0A1D18",
    surface: "rgba(255,255,255,0.03)", panel: "rgba(255,255,255,0.045)",
    panelHover: "rgba(255,255,255,0.065)", panelActive: "rgba(255,255,255,0.08)",
    borderSubtle: "rgba(255,255,255,0.065)", divider: "rgba(255,255,255,0.045)",
    glow: "rgba(18,240,164,0.16)",
    textPrimary: "rgba(255,255,255,0.93)", textSecondary: "rgba(255,255,255,0.71)",
    textMuted: "rgba(255,255,255,0.43)", textOnPrimary: "#04150F", textOnAccent: "#06151A",
    buttonPrimaryBg: "#12F0A4", buttonPrimaryHover: "#34F4B3", buttonPrimaryText: "#04150F",
    buttonGhostBg: "rgba(255,255,255,0.04)", buttonGhostHover: "rgba(255,255,255,0.07)", buttonGhostText: "rgba(255,255,255,0.90)",
    inputBg: "rgba(255,255,255,0.03)", inputBorder: "rgba(255,255,255,0.075)",
    inputText: "rgba(255,255,255,0.92)", inputPlaceholder: "rgba(255,255,255,0.38)",
    success: "#29D88F", warning: "#E8B949", danger: "#FF6277",
    successText: "#DBFFEE", warningText: "#FFF0C8", dangerText: "#FFE1E6",
    iconPrimary: "#12F0A4", iconSecondary: "rgba(255,255,255,0.72)",
    selection: "rgba(18,240,164,0.13)", scrollbarThumb: "rgba(18,240,164,0.44)",
    elevatedPanel: "rgba(255,255,255,0.07)", elevatedPanelHover: "rgba(255,255,255,0.09)",
    popoverBg: "#0C2420", popoverBorder: "rgba(18,240,164,0.10)",
    popoverText: "rgba(255,255,255,0.95)", popoverTextSecondary: "rgba(255,255,255,0.68)",
    popoverShadow: "0 12px 40px rgba(0,0,0,0.42)",
  },
  violetPink: {
    key: "violetPink", name: "Violet – Pink",
    description: "Cesur, dikkat çekici, karakterli.",
    isLight: false,
    primary: "#A970FF", secondary: "#FF4FD8", accent: "#FFC6F9",
    background: "#0d0b1a", backgroundElevated: "#15101f",
    surface: "rgba(255,255,255,0.04)", panel: "rgba(255,255,255,0.055)",
    panelHover: "rgba(255,255,255,0.075)", panelActive: "rgba(255,255,255,0.09)",
    borderSubtle: "rgba(255,255,255,0.08)", divider: "rgba(255,255,255,0.05)",
    glow: "rgba(169,112,255,0.18)",
    textPrimary: "rgba(255,255,255,0.94)", textSecondary: "rgba(255,255,255,0.71)",
    textMuted: "rgba(255,255,255,0.44)", textOnPrimary: "#13081F", textOnAccent: "#1A0A16",
    buttonPrimaryBg: "#A970FF", buttonPrimaryHover: "#B786FF", buttonPrimaryText: "#13081F",
    buttonGhostBg: "rgba(255,255,255,0.045)", buttonGhostHover: "rgba(255,255,255,0.075)", buttonGhostText: "rgba(255,255,255,0.90)",
    inputBg: "rgba(255,255,255,0.035)", inputBorder: "rgba(255,255,255,0.08)",
    inputText: "rgba(255,255,255,0.92)", inputPlaceholder: "rgba(255,255,255,0.38)",
    success: "#30D58C", warning: "#F0B651", danger: "#FF5A82",
    successText: "#D9FFED", warningText: "#FFF0CB", dangerText: "#FFE0E8",
    iconPrimary: "#FF4FD8", iconSecondary: "rgba(255,255,255,0.72)",
    selection: "rgba(255,79,216,0.12)", scrollbarThumb: "rgba(169,112,255,0.44)",
    elevatedPanel: "rgba(255,255,255,0.08)", elevatedPanelHover: "rgba(255,255,255,0.10)",
    popoverBg: "#150C24", popoverBorder: "rgba(169,112,255,0.12)",
    popoverText: "rgba(255,255,255,0.95)", popoverTextSecondary: "rgba(255,255,255,0.68)",
    popoverShadow: "0 12px 40px rgba(0,0,0,0.45)",
  },
  blueYellow: {
    key: "blueYellow", name: "Mavi – Sarı",
    description: "Dengeli, kurumsal ama sıcak.",
    isLight: false,
    primary: "#F8D673", secondary: "#313F57", accent: "#F8D673",
    background: "#0C1320", backgroundElevated: "#121B2B",
    surface: "rgba(255,255,255,0.025)", panel: "rgba(255,255,255,0.04)",
    panelHover: "rgba(255,255,255,0.06)", panelActive: "rgba(255,255,255,0.075)",
    borderSubtle: "rgba(248,214,115,0.08)", divider: "rgba(248,214,115,0.045)",
    glow: "rgba(248,214,115,0.14)",
    textPrimary: "rgba(255,248,228,0.93)", textSecondary: "rgba(248,214,115,0.72)",
    textMuted: "rgba(248,214,115,0.42)", textOnPrimary: "#251E0B", textOnAccent: "#251E0B",
    buttonPrimaryBg: "#F8D673", buttonPrimaryHover: "#FBE08F", buttonPrimaryText: "#251E0B",
    buttonGhostBg: "rgba(255,255,255,0.03)", buttonGhostHover: "rgba(255,255,255,0.06)", buttonGhostText: "rgba(255,248,228,0.88)",
    inputBg: "rgba(255,255,255,0.025)", inputBorder: "rgba(248,214,115,0.08)",
    inputText: "rgba(255,248,228,0.92)", inputPlaceholder: "rgba(248,214,115,0.38)",
    success: "#4CCB8A", warning: "#F1C564", danger: "#E56D6D",
    successText: "#E3FFF0", warningText: "#FFF2D7", dangerText: "#FFE6E6",
    iconPrimary: "#F8D673", iconSecondary: "rgba(255,248,228,0.72)",
    selection: "rgba(248,214,115,0.11)", scrollbarThumb: "rgba(248,214,115,0.38)",
    elevatedPanel: "rgba(255,255,255,0.055)", elevatedPanelHover: "rgba(255,255,255,0.075)",
    popoverBg: "#141E30", popoverBorder: "rgba(248,214,115,0.10)",
    popoverText: "rgba(255,248,228,0.95)", popoverTextSecondary: "rgba(248,214,115,0.68)",
    popoverShadow: "0 12px 40px rgba(0,0,0,0.45)",
  },
  midnightBlueBird: {
    key: "midnightBlueBird", name: "Gece Yarısı – Mavi Kuş",
    description: "Sakin, sofistike, premium.",
    isLight: false,
    primary: "#1a5877", secondary: "#d4e8f1", accent: "#ffffff",
    background: "#0B1726", backgroundElevated: "#102033",
    surface: "rgba(255,255,255,0.025)", panel: "rgba(255,255,255,0.04)",
    panelHover: "rgba(255,255,255,0.06)", panelActive: "rgba(255,255,255,0.075)",
    borderSubtle: "rgba(212,232,241,0.08)", divider: "rgba(212,232,241,0.045)",
    glow: "rgba(212,232,241,0.14)",
    textPrimary: "rgba(255,255,255,0.94)", textSecondary: "rgba(212,232,241,0.76)",
    textMuted: "rgba(212,232,241,0.44)", textOnPrimary: "#EAF5FA", textOnAccent: "#122333",
    buttonPrimaryBg: "#d4e8f1", buttonPrimaryHover: "#E4F1F6", buttonPrimaryText: "#122333",
    buttonGhostBg: "rgba(255,255,255,0.03)", buttonGhostHover: "rgba(255,255,255,0.06)", buttonGhostText: "rgba(255,255,255,0.90)",
    inputBg: "rgba(255,255,255,0.025)", inputBorder: "rgba(212,232,241,0.08)",
    inputText: "rgba(255,255,255,0.92)", inputPlaceholder: "rgba(212,232,241,0.40)",
    success: "#49C690", warning: "#E2BE63", danger: "#DE7272",
    successText: "#E3FFF1", warningText: "#FFF3D9", dangerText: "#FFE8E8",
    iconPrimary: "#d4e8f1", iconSecondary: "rgba(212,232,241,0.74)",
    selection: "rgba(212,232,241,0.10)", scrollbarThumb: "rgba(212,232,241,0.36)",
    elevatedPanel: "rgba(255,255,255,0.055)", elevatedPanelHover: "rgba(255,255,255,0.075)",
    popoverBg: "#132538", popoverBorder: "rgba(212,232,241,0.09)",
    popoverText: "rgba(255,255,255,0.95)", popoverTextSecondary: "rgba(212,232,241,0.70)",
    popoverShadow: "0 12px 40px rgba(0,0,0,0.45)",
  },
  arcticWhite: {
    key: "arcticWhite", name: "Beyin Kırışıklığı",
    description: "Açık gri zemin, canlı kırmızı aksan.",
    isLight: true,
    primary: "#FF3A22", secondary: "#FF3A22", accent: "#FF3A22",
    background: "#D9D9D9", backgroundElevated: "#E8E8E8",
    surface: "rgba(0,0,0,0.03)", panel: "rgba(0,0,0,0.05)",
    panelHover: "rgba(0,0,0,0.08)", panelActive: "rgba(0,0,0,0.11)",
    borderSubtle: "rgba(0,0,0,0.10)", divider: "rgba(0,0,0,0.08)",
    glow: "rgba(255,58,34,0.18)",
    textPrimary: "rgba(20,20,20,0.92)", textSecondary: "rgba(40,40,40,0.75)",
    textMuted: "rgba(60,60,60,0.60)", textOnPrimary: "#FFFFFF", textOnAccent: "#FFFFFF",
    buttonPrimaryBg: "#FF3A22", buttonPrimaryHover: "#FF5540", buttonPrimaryText: "#FFFFFF",
    buttonGhostBg: "rgba(0,0,0,0.05)", buttonGhostHover: "rgba(0,0,0,0.09)", buttonGhostText: "rgba(20,20,20,0.85)",
    inputBg: "rgba(255,255,255,0.55)", inputBorder: "rgba(0,0,0,0.12)",
    inputText: "rgba(20,20,20,0.90)", inputPlaceholder: "rgba(60,60,60,0.50)",
    success: "#16A34A", warning: "#D97706", danger: "#FF3A22",
    successText: "#14532D", warningText: "#78350F", dangerText: "#7F1D1D",
    iconPrimary: "#FF3A22", iconSecondary: "rgba(40,40,40,0.65)",
    selection: "rgba(255,58,34,0.18)", scrollbarThumb: "rgba(255,58,34,0.35)",
    elevatedPanel: "rgba(255,255,255,0.45)", elevatedPanelHover: "rgba(255,255,255,0.60)",
    popoverBg: "#E8E8E8", popoverBorder: "rgba(0,0,0,0.10)",
    popoverText: "rgba(20,20,20,0.92)", popoverTextSecondary: "rgba(40,40,40,0.72)",
    popoverShadow: "0 12px 40px rgba(0,0,0,0.18)",
  },
};

export const defaultThemeKey: ThemeKey = "midnightBlueBird";

// ── Background presets (independent from theme accent) ──

export type BgType = "solid" | "soft-gradient" | "deep-gradient";

export interface BackgroundPreset {
  id: string;
  name: string;
  type: BgType;
  surface: string;      // CSS value applied to body
  /** Dominant hex color for luminance calculation */
  dominantHex: string;
  isLight: boolean;
}

export const backgroundPresets: BackgroundPreset[] = [
  { id: "bg-pigevox",       name: "MAYVOX",        type: "deep-gradient", surface: "linear-gradient(145deg, #1a0a12, #0d0b1a, #0a0e1a)", dominantHex: "#0d0b1a", isLight: false },
  { id: "bg-midnight",      name: "Midnight",       type: "solid",         surface: "#0B1220",  dominantHex: "#0B1220",  isLight: false },
  { id: "bg-midnight-depth",name: "Midnight Depth",  type: "deep-gradient", surface: "linear-gradient(135deg, #020617, #111827, #020617)", dominantHex: "#0A1018", isLight: false },
  { id: "bg-emerald-night", name: "Emerald Night",   type: "deep-gradient", surface: "linear-gradient(135deg, #020617, #064E3B, #020617)", dominantHex: "#042E24", isLight: false },
  { id: "bg-crimson-night", name: "Crimson Night",   type: "deep-gradient", surface: "linear-gradient(135deg, #020617, #7F1D1D, #020617)", dominantHex: "#3A1010", isLight: false },
  { id: "bg-amber-night",   name: "Amber Night",     type: "deep-gradient", surface: "linear-gradient(135deg, #020617, #92400E, #020617)", dominantHex: "#4A2208", isLight: false },
  { id: "bg-warm-graphite",name: "Warm Graphite",   type: "solid",         surface: "#1A1A1E",  dominantHex: "#1A1A1E",  isLight: false },
  // Slate Mist — premium iki-tonlu cool gradient + çok hafif radial highlight (center-top).
  // Apple/Figma-level: cam UI ile entegre, neon/gaming feeling YOK.
  { id: "bg-slate-mist",   name: "Slate Mist",      type: "deep-gradient",
    surface: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.04), transparent 50%), linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
    dominantHex: "#162033", isLight: false },
];

export const defaultBackgroundId = "bg-pigevox";

export const themeOrder: ThemeKey[] = [
  "cyanViolet",
  "emeraldCyan",
  "violetPink",
  "blueYellow",
  "midnightBlueBird",
  "arcticWhite",
];
