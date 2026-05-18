import React, { useState } from 'react';
import { HeadphoneOff, Headphones, Lock, Mic, MicOff, Send, Smile, Trash2, Unlock, Volume2 } from 'lucide-react';
import AvatarContent from '../../components/AvatarContent';
import type { MobileVoiceParticipant } from './MobileVoiceStrip';

interface MobileRoomMessage {
  id: string;
  sender: string;
  text: string;
  time?: string;
}

interface MobileRoomActivity {
  id: string;
  label: string;
  time?: string;
}

interface MobileRoomScreenProps {
  serverName?: string;
  channelName?: string;
  channelType?: 'text' | 'voice' | 'stage' | string;
  connected?: boolean;
  participantCount?: number;
  participants?: MobileVoiceParticipant[];
  messages?: MobileRoomMessage[];
  activities?: MobileRoomActivity[];
  chatLocked?: boolean;
  canModerateChat?: boolean;
  canViewActivity?: boolean;
  canClearActivity?: boolean;
  onClearMessages?: () => void;
  onToggleChatLocked?: () => void;
  onClearActivity?: () => void;
  onOpenChannels?: () => void;
  onOpenMembers?: () => void;
  onOpenPinned?: () => void;
  onOpenMedia?: () => void;
  onOpenRoomSettings?: () => void;
}

const CHAT_PREVIEW = [
  { id: '1', name: 'MAYVox', message: 'Mobil sohbet akisi burada daha hafif bir liste olarak gorunecek.', time: 'Simdi' },
  { id: '2', name: 'Echo', message: 'Oda gecisi, medya ve sabitlenenler sonraki fazda baglanacak.', time: '12:44' },
  { id: '3', name: 'Nova', message: 'Bu alan simdilik preview; gercek mesaj logicine dokunmuyor.', time: '12:42' },
];

export default function MobileRoomScreen({
  serverName,
  channelName,
  channelType = 'voice',
  connected = false,
  participantCount,
  participants = [],
  messages = [],
  activities = [],
  chatLocked = false,
  canModerateChat = false,
  canViewActivity = false,
  canClearActivity = false,
  onClearMessages,
  onToggleChatLocked,
  onClearActivity,
}: MobileRoomScreenProps) {
  const count = typeof participantCount === 'number' ? participantCount : participants.length;
  const visibleMessages = messages.length > 0 ? messages : CHAT_PREVIEW.map(message => ({
    id: message.id,
    sender: message.name,
    text: message.message,
    time: message.time,
  }));

  return (
    <div className="h-full min-h-0 overflow-hidden pb-2 pt-1">
      <div className={`grid h-full min-h-0 w-full gap-2 ${canViewActivity ? 'lg:grid-cols-[minmax(0,1.32fr)_minmax(245px,0.78fr)_minmax(250px,0.78fr)]' : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.82fr)]'}`}>
        <section className="flex min-h-0 min-w-0 flex-col rounded-[16px] px-3 py-2.5" style={{ background: 'rgba(var(--glass-tint),0.022)' }}>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-black text-[var(--theme-text)]/90">Chat</h3>
              <p className="truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/52">{messages.length > 0 ? 'Odadaki son mesajlar' : 'Bu odada henuz mesaj yok'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canModerateChat && (
                <>
                  <IconAction label="Tum mesajlari sil" icon={<Trash2 size={14} />} onClick={onClearMessages} />
                  <IconAction label={chatLocked ? 'Sohbet kilidini ac' : 'Sohbeti kilitle'} icon={chatLocked ? <Unlock size={14} /> : <Lock size={14} />} onClick={onToggleChatLocked} active={chatLocked} />
                </>
              )}
              <Pill>{channelType === 'text' ? 'Text' : connected ? 'Voice' : 'Bagli degil'}</Pill>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
            {visibleMessages.slice(-7).map(message => (
              <MessagePreviewRow key={message.id} name={message.sender} message={message.text} time={message.time || ''} />
            ))}
          </div>

          <ComposerPlaceholder />
        </section>

        {canViewActivity && <ActivityPreview activities={activities} canClear={canClearActivity} onClear={onClearActivity} />}

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <RoomMembersCard serverName={serverName} channelName={channelName} count={count} participants={participants} />
        </section>
      </div>
    </div>
  );
}

function ActivityPreview({ activities, canClear, onClear }: { activities: MobileRoomActivity[]; canClear?: boolean; onClear?: () => void }) {
  const visible = activities.slice(0, 8);

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-[16px] px-3 py-2.5" style={{ background: 'rgba(var(--glass-tint),0.022)' }}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-[12px] font-black text-[var(--theme-text)]/88">Son olaylar</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/45">{activities.length}</span>
          {canClear && <IconAction label="Son olaylari temizle" icon={<Trash2 size={13} />} onClick={onClear} />}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
        {visible.length > 0 ? visible.map(activity => (
          <div key={activity.id} className="rounded-[13px] px-3 py-2" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
            <p className="truncate text-[11px] font-semibold text-[var(--theme-text)]/82">{activity.label}</p>
            {activity.time && <p className="mt-0.5 text-[9.5px] font-medium text-[var(--theme-secondary-text)]/48">{activity.time}</p>}
          </div>
        )) : (
          <div className="rounded-[13px] px-3 py-2.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/54" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
            Son olay yok
          </div>
        )}
      </div>
    </section>
  );
}

function IconAction({ label, icon, onClick, active = false }: { label: string; icon: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors active:scale-[0.98] ${active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/62'}`}
      style={{ background: active ? 'rgba(var(--theme-accent-rgb),0.08)' : 'rgba(var(--glass-tint),0.028)' }}
    >
      {icon}
    </button>
  );
}

function MessagePreviewRow({ name, message, time }: { key?: unknown; name: string; message: string; time: string }) {
  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';

  return (
    <div className="flex min-h-[50px] items-center gap-2.5 rounded-[13px] px-3 py-1.5" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-black text-[var(--theme-text)]"
        style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}
        aria-hidden="true"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11.5px] font-bold text-[var(--theme-text)]/88">{name}</span>
          <span className="shrink-0 text-[10px] font-semibold text-[var(--theme-secondary-text)]/42">{time}</span>
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/58">{message}</span>
      </span>
    </div>
  );
}

function ComposerPlaceholder() {
  return (
    <div className="mt-2 rounded-[16px] px-2 py-1.5" style={{ background: 'rgba(var(--glass-tint),0.024)' }}>
      <div className="flex min-h-11 items-center gap-2 rounded-[13px] px-2" style={{ background: 'rgba(var(--glass-tint),0.024)' }}>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--theme-secondary-text)]/60" aria-label="Emoji">
          <Smile size={16} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[var(--theme-secondary-text)]/55">Mesaj yaz...</span>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--theme-accent)]" aria-label="Gonder">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function RoomMembersCard({ count, participants }: { serverName?: string; channelName?: string; count: number; participants: MobileVoiceParticipant[] }) {
  const visible = participants.slice(0, 8);

  return (
    <section className="min-h-0 rounded-[16px] px-2.5 py-2.5" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="truncate text-[12px] font-black text-[var(--theme-text)]/86">Kullanicilar</h3>
        <span className="shrink-0 text-[10px] font-bold text-[var(--theme-secondary-text)]/48">{count}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {visible.length > 0 ? visible.map(participant => (
          <RoomMemberCard key={participant.id} participant={participant} />
        )) : (
          <div className="col-span-2 rounded-[13px] px-3 py-2.5 text-[11px] font-medium text-[var(--theme-secondary-text)]/54" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
            Odada kimse yok
          </div>
        )}
      </div>
    </section>
  );
}

function RoomMemberCard({ participant }: { key?: unknown; participant: MobileVoiceParticipant }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatar = participant.avatarUrl && !avatarFailed ? participant.avatarUrl : '';

  return (
    <div
      className="relative flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-[13px] px-2 py-2 text-center"
      style={{
        background: participant.speaking ? 'rgba(var(--theme-accent-rgb),0.075)' : 'rgba(var(--glass-tint),0.016)',
        boxShadow: participant.speaking
          ? '0 0 18px rgba(var(--theme-accent-rgb),0.16), inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.24)'
          : 'none',
      }}
    >
      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden avatar-squircle text-[12px] font-black"
        style={{
          background: avatar
            ? 'rgba(0,0,0,0.14)'
            : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)',
          color: 'var(--theme-accent)',
        }}
      >
        <AvatarContent
          avatar={avatar}
          firstName={participant.name}
          name={participant.name}
          letterClassName="text-[12px] font-black"
        />
        {participant.avatarUrl && !avatarFailed && (
          <img
            src={participant.avatarUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            onError={() => setAvatarFailed(true)}
          />
        )}
      </span>
      <span className="block w-full truncate text-[10.5px] font-semibold text-[var(--theme-text)]/82">{participant.name}</span>
      <span className="mt-0.5 flex items-center justify-center gap-1.5 text-[var(--theme-secondary-text)]/52">
        {participant.muted ? <MicOff size={11} className="text-red-300/85" /> : <Mic size={11} />}
        {participant.deafened ? <HeadphoneOff size={11} className="text-red-300/85" /> : <Headphones size={11} />}
        {participant.speaking && <Volume2 size={11} className="text-[var(--theme-accent)]" />}
      </span>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full px-2.5 text-[10px] font-bold text-[var(--theme-secondary-text)]/72" style={{ background: 'rgba(var(--glass-tint),0.045)' }}>
      {children}
    </span>
  );
}
