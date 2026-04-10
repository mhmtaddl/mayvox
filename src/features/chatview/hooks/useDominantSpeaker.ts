import { useMemo, useRef } from 'react';

interface Member {
  id: string;
  name: string;
  isSpeaking?: boolean;
}

interface UseDominantSpeakerOptions {
  members: Member[];
  currentUserId: string;
  isVoiceBanned: boolean;
  isPttPressed: boolean;
  isMuted: boolean;
  volumeLevel: number;
  speakingLevels: Record<string, number>;
}

export function useDominantSpeaker({
  members,
  currentUserId,
  isVoiceBanned,
  isPttPressed,
  isMuted,
  volumeLevel,
  speakingLevels,
}: UseDominantSpeakerOptions): string | null {
  const dominantSpeakerRef = useRef<string | null>(null);

  return useMemo(() => {
    let maxLevel = 0;
    let maxId: string | null = null;

    for (const member of members) {
      const isMe = member.id === currentUserId;
      const isSpeaking = isMe
        ? (isPttPressed && !isMuted && !isVoiceBanned)
        : !!member.isSpeaking;

      if (!isSpeaking) continue;

      const level = isMe ? volumeLevel / 80 : (speakingLevels[member.name] ?? 0) * 2.5;
      if (level > maxLevel) {
        maxLevel = level;
        maxId = member.id;
      }
    }

    // Hysteresis: keep current dominant unless new speaker is 20% louder
    const prev = dominantSpeakerRef.current;
    if (prev && prev !== maxId && maxLevel > 0) {
      const prevMember = members.find(m => m.id === prev);
      if (prevMember) {
        const prevIsMe = prev === currentUserId;
        const prevSpeaking = prevIsMe
          ? (isPttPressed && !isMuted && !isVoiceBanned)
          : !!prevMember.isSpeaking;
        if (prevSpeaking) {
          const prevLevel = prevIsMe ? volumeLevel / 80 : (speakingLevels[prevMember.name] ?? 0) * 2.5;
          if (maxLevel < prevLevel * 1.2) {
            return prev;
          }
        }
      }
    }

    dominantSpeakerRef.current = maxId;
    return maxId;
  }, [members, currentUserId, isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels]);
}
