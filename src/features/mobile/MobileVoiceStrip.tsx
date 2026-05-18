import React, { useState } from 'react';
import { MicOff, Volume2 } from 'lucide-react';

export interface MobileVoiceParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
  speaking?: boolean;
  muted?: boolean;
  deafened?: boolean;
}

interface MobileVoiceStripProps {
  participants?: MobileVoiceParticipant[];
}

export default function MobileVoiceStrip({ participants = [] }: MobileVoiceStripProps) {
  const visible = participants.slice(0, 6);
  const overflowCount = Math.max(0, participants.length - visible.length);

  return (
    <section className="mb-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">Ses</h3>
        <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/48">{participants.length} kisi</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
        {visible.length > 0 ? visible.map(participant => (
          <VoiceParticipantCard key={participant.id} participant={participant} />
        )) : (
          <div className="w-full rounded-xl px-3 py-3 text-[11px] font-medium text-[var(--theme-secondary-text)]/50" style={{ background: 'rgba(var(--glass-tint),0.025)' }}>
            Ses odasinda kimse yok
          </div>
        )}

        {overflowCount > 0 && (
          <div
            className="flex min-w-[58px] items-center justify-center rounded-xl px-3 text-[12px] font-black text-[var(--theme-accent)]"
            style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}
          >
            +{overflowCount}
          </div>
        )}
      </div>
    </section>
  );
}

function VoiceParticipantCard({ participant }: { key?: unknown; participant: MobileVoiceParticipant }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = !!participant.avatarUrl && !avatarFailed;

  return (
    <div
            className="flex min-w-[76px] max-w-[92px] flex-col items-center gap-1.5 rounded-[13px] px-2 py-1.5 md:min-w-0 md:max-w-none md:flex-row md:text-left"
      style={{
        background: 'rgba(var(--glass-tint),0.024)',
        boxShadow: participant.speaking
          ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.26)'
          : 'inset 0 0 0 1px rgba(var(--glass-tint),0.024)',
      }}
    >
      <div className="relative shrink-0">
        <span
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[12px] text-[12px] font-black text-[var(--theme-text)]"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}
        >
          {showAvatar ? (
            <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setAvatarFailed(true)} />
          ) : (
            participant.name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?'
          )}
        </span>
        {participant.muted ? (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white">
            <MicOff size={11} />
          </span>
        ) : participant.speaking ? (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-text-on-accent,#050505)]">
            <Volume2 size={11} />
          </span>
        ) : null}
      </div>
      <span className="min-w-0 md:flex-1">
        <span className="block w-full truncate text-center text-[10.5px] font-semibold text-[var(--theme-text)]/82 md:text-left">{participant.name}</span>
      </span>
    </div>
  );
}
