/**
 * Clean radial layout — generous spacing, no overlap, true center.
 */

export interface RoomNodeData {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  avatar: string;
  isSelf: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  platform?: 'mobile' | 'desktop';
  isAdmin?: boolean;
  isModerator?: boolean;
  appVersion?: string;
  onClick?: (e: any) => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: any) => void;
}

export interface PositionedNode extends RoomNodeData {
  x: number;
  y: number;
  ring: number;
  scale: number;
}

const TAU = Math.PI * 2;

function ringAngles(n: number, offset = -Math.PI / 2): number[] {
  return Array.from({ length: n }, (_, i) => offset + (TAU / n) * i);
}

export function buildRadialLayout(
  participants: RoomNodeData[],
  width: number,
  height: number,
): { center: PositionedNode | null; remotes: PositionedNode[] } {
  const self = participants.find(p => p.isSelf);
  if (!self) return { center: null, remotes: [] };

  const remotes = participants
    .filter(p => !p.isSelf)
    .sort((a, b) => {
      if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
      return a.name.localeCompare(b.name, 'tr');
    });

  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);

  // Ring radii — generous, proportional to canvas
  const r1 = Math.max(180, minDim * 0.28);
  const r2 = Math.max(310, minDim * 0.44);

  const CAP1 = 6;
  const a1 = ringAngles(Math.min(remotes.length, CAP1));
  const a2 = ringAngles(Math.max(0, remotes.length - CAP1), -Math.PI / 2 + TAU / 16);

  const placed: PositionedNode[] = remotes.map((p, i) => {
    const inR1 = i < CAP1;
    const angle = inR1 ? a1[i] : a2[i - CAP1];
    const radius = inR1 ? r1 : r2;
    return {
      ...p,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      ring: inR1 ? 1 : 2,
      scale: inR1 ? 0.92 : 0.84,
    };
  });

  return {
    center: { ...self, x: cx, y: cy, ring: 0, scale: 1 },
    remotes: placed,
  };
}
