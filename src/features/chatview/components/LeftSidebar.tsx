import React, { useMemo } from 'react';
import {
  Volume2,
  Lock,
  Sparkles,
  Timer,
  Radio,
  Headphones,
} from 'lucide-react';
import { formatFullName } from '../../../lib/formatName';
import { ConnectionQualityIndicator } from '../../../components/chat';
import DeviceBadge from '../../../components/chat/DeviceBadge';
import UpdateVersionHub from '../../update/components/UpdateVersionHub';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { useUI } from '../../../contexts/UIContext';
import { useAudio } from '../../../contexts/AudioContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { roomModeIcons, FORCE_MOBILE } from '../constants';
import { Coffee } from 'lucide-react';

interface Props {
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, channelId: string) => void;
  handleDragStart: (e: React.DragEvent, userName: string) => void;
  onUserClick: (userId: string, x: number, y: number) => void;
  activeServerName?: string;
  activeServerShortName?: string;
  activeServerAvatarUrl?: string;
}

export default function LeftSidebar({ handleDragOver, handleDrop, handleDragStart, onUserClick, activeServerName, activeServerShortName, activeServerAvatarUrl }: Props) {
  const { channels, activeChannel, isConnecting } = useChannel();
  const { currentUser, allUsers } = useUser();
  const { userVolumes, setContextMenu, setRoomModal, setToastMsg } = useUI();
  const { connectionLevel } = useAudio();
  const { handleJoinChannel, handleContextMenu, view, appVersion, showReleaseNotes, setShowReleaseNotes } = useAppState();

  const { leftSidebarW, handleSidebarDragStart } = useSidebarResize();

  const visibleChannels = useMemo(
    () => channels.filter(c => !c.isHidden || c.ownerId === currentUser.id || currentUser.isAdmin || activeChannel === c.id),
    [channels, currentUser.id, currentUser.isAdmin, activeChannel]
  );

  return (
    <aside className={`relative bg-[rgba(var(--theme-sidebar-rgb),0.08)] backdrop-blur-[20px] rounded-2xl ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} flex-col shrink-0`} style={{ width: leftSidebarW, boxShadow: '0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleSidebarDragStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-[var(--theme-accent)]/20 active:bg-[var(--theme-accent)]/30 transition-colors"
      />
      {/* Brand header — aktif sunucuya göre değişir */}
      <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-3 select-none">
        {activeServerAvatarUrl ? (
          <img src={activeServerAvatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-[var(--theme-accent)]/15" draggable={false} />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/15 flex items-center justify-center shrink-0" style={{ filter: 'drop-shadow(0 0 5px rgba(var(--theme-accent-rgb), 0.2))' }}>
            <span className="text-[13px] font-bold text-[var(--theme-accent)]">{activeServerShortName ?? 'MV'}</span>
          </div>
        )}
        <div className="flex flex-col leading-none min-w-0">
          <h1 className="text-[15px] font-bold text-[var(--theme-text)] truncate tracking-[-0.01em]">{activeServerName ?? 'MAYVOX'}</h1>
          <span className="text-[7.5px] font-medium tracking-[0.16em] uppercase text-[var(--theme-secondary-text)]/30 mt-0.5">voice & chat</span>
        </div>
      </div>
      <div className="mx-5 h-px mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.06), transparent)' }} />

      <div className="px-5 pb-5 flex flex-col flex-1 min-h-0">
        {visibleChannels.length === 0 ? (
          /* Sunucusuz durum — sidebar empty state */
          <div className="flex-1 flex flex-col items-center justify-center px-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(var(--glass-tint), 0.04)' }}>
              <Volume2 size={18} className="text-[var(--theme-secondary-text)]/25" />
            </div>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/40 text-center leading-relaxed max-w-[160px]">
              Bir sohbet sunucusuna katılarak ses kanallarını görüntüleyebilirsin.
            </p>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-2.5 text-[var(--theme-secondary-text)] font-extrabold mb-3">
          <Volume2 size={14} className="opacity-60" />
          <span className="uppercase text-[10px] tracking-[0.15em]">Ses Kanalları</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar" onClick={() => setContextMenu(null)}>
          {visibleChannels.map(channel => (
            <div key={channel.id} className="space-y-1">
              <button
                onClick={() => handleJoinChannel(channel.id)}
                onContextMenu={(e) => handleContextMenu(e, channel.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, channel.id)}
                disabled={isConnecting}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group disabled:cursor-not-allowed ${
                  activeChannel === channel.id
                    ? `bg-[var(--theme-accent)]/10 text-[var(--theme-text)] border border-[var(--theme-accent)]/20 shadow-[inset_0_0_12px_rgba(var(--theme-accent-rgb),0.08),inset_0_1px_0_rgba(var(--theme-accent-rgb),0.1)]${isConnecting ? ' animate-pulse' : ''}`
                    : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)]'
                }`}
              >
                <div className="relative">
                  {(() => { const IC = roomModeIcons[channel.mode || 'social'] || Coffee; return <IC size={16} className="opacity-70" />; })()}
                  {channel.password && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[var(--theme-border)]">
                      <Lock size={8} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="font-medium truncate" style={{ fontSize: channel.name.length > 14 ? '12px' : '14px' }}>{channel.name}</span>
                  {channel.deletionTimer !== undefined && !channel.userCount && (
                    <div className="flex items-center gap-1 bg-red-500/20 px-1.5 py-0.5 rounded border border-red-500/30 shrink-0">
                      <Timer size={10} className="text-red-500 animate-pulse" />
                      <span className="text-[9px] font-mono font-bold text-red-500">
                        {channel.deletionTimer}s
                      </span>
                    </div>
                  )}
                </div>
                {channel.userCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeChannel === channel.id ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]'
                  }`}>
                    {channel.userCount}
                  </span>
                )}
              </button>

              {/* Members List */}
              {channel.members && channel.members.length > 0 && (() => {
                const isBc = channel.mode === 'broadcast';
                const speakers = channel.speakerIds || [];
                const hasSpeakers = isBc && (speakers.length > 0 || !!channel.ownerId);
                const isSpeakerFn = (uid: string) => speakers.length > 0 ? speakers.includes(uid) : channel.ownerId === uid;

                const sorted = isBc
                  ? [...channel.members].sort((a, b) => (isSpeakerFn(b) ? 1 : 0) - (isSpeakerFn(a) ? 1 : 0))
                  : channel.members;

                let shownSpeakerLabel = false;
                let shownListenerLabel = false;

                return (
                <div className="pl-8 pr-2 space-y-0.5 pb-2 mt-0.5 ml-4 border-l border-[var(--theme-accent)]/10">
                  {sorted.map((memberId, idx) => {
                    const user = allUsers.find(u => u.id === memberId);
                    const isSp = isBc && user ? isSpeakerFn(user.id) : false;

                    let groupLabel: string | null = null;
                    if (hasSpeakers && user) {
                      if (isSp && !shownSpeakerLabel) { shownSpeakerLabel = true; groupLabel = 'Konuşmacılar'; }
                      if (!isSp && !shownListenerLabel) { shownListenerLabel = true; groupLabel = 'Dinleyiciler'; }
                    }

                    return (
                      <React.Fragment key={idx}>
                        {groupLabel && (
                          <>
                            {groupLabel === 'Dinleyiciler' && (
                              <div className="mx-1.5 my-1.5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.06), transparent)' }} />
                            )}
                            <div className="flex items-center gap-1.5 pt-1.5 pb-1 px-1.5">
                              {groupLabel === 'Konuşmacılar'
                                ? <Radio size={8} className="text-[var(--theme-accent)] opacity-50" />
                                : <Headphones size={8} className="text-[var(--theme-secondary-text)] opacity-30" />
                              }
                              <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]/50">{groupLabel}</span>
                            </div>
                          </>
                        )}
                      <div
                        draggable={!!currentUser.isAdmin}
                        onDragStart={(e) => handleDragStart(e, user?.name || memberId)}
                        onClick={(e) => user && onUserClick(user.id, e.clientX, e.clientY)}
                        className={`flex items-center gap-2 text-[11px] transition-all duration-150 group/member cursor-pointer py-1 px-1.5 rounded-lg hover:bg-[var(--theme-accent)]/5 active:scale-[0.98] ${
                          isBc && isSp
                            ? 'font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent)]'
                            : 'font-medium text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]'
                        } ${isBc && !isSp ? 'opacity-70' : ''}`}
                      >
                        <div className="relative shrink-0">
                          <div className="h-5 w-5 overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[7px]">
                            {user?.avatar?.startsWith('http')
                              ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              : user?.avatar || '?'}
                          </div>
                          {user && <DeviceBadge platform={user.platform} size={10} className="absolute -bottom-0.5 -right-0.5" />}
                        </div>
                        <span className="truncate flex-1">{user ? formatFullName(user.firstName, user.lastName) : memberId}</span>
                        {isBc && user && (isSp
                          ? <Radio size={9} className="shrink-0 text-[var(--theme-accent)]" />
                          : <Headphones size={9} className="shrink-0 text-[var(--theme-secondary-text)] opacity-40" />
                        )}
                        {user && userVolumes[user.id] !== undefined && userVolumes[user.id] !== 50 && (
                          <span className="text-[9px] text-[var(--theme-secondary-text)] font-bold">%{userVolumes[user.id]}</span>
                        )}
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          ))}

          {/* Oda Oluştur */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const userRooms = channels.filter(c => c.ownerId === currentUser.id);
              if (userRooms.length >= 2) {
                setToastMsg('Aynı anda en fazla 2 oda oluşturabilirsiniz.');
                return;
              }
              setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social' });
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
              channels.filter(c => c.ownerId === currentUser.id).length >= 2
                ? 'text-[var(--theme-secondary-text)]/40 cursor-not-allowed'
                : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-accent)]'
            }`}
          >
            <Sparkles size={15} />
            <span className="text-sm font-medium">Oda Oluştur</span>
          </button>
        </nav>
        </>
        )}
      </div>

      {/* Sol alt kontroller */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-center gap-3">
        {appVersion && (
          <UpdateVersionHub
            currentVersion={appVersion}
            isAdmin={!!currentUser.isAdmin}
            autoShowNotes={showReleaseNotes}
            onNotesShown={() => setShowReleaseNotes(false)}
          />
        )}
        <ConnectionQualityIndicator connectionLevel={connectionLevel} isConnecting={isConnecting} isActive={!!activeChannel} />
      </div>
    </aside>
  );
}
