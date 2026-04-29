import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { UserCard, RoomNetworkVisualization, CARD_SCALE_MAP } from './chat';
import type { CardScale } from './chat';
import type { CardStyle } from './chat/cardStyles';
import type { User } from '../types';
import type { ChatMessage } from './ChatPanel';
import ChatPanel from './ChatPanel';
import { getRoomModeConfig } from '../lib/roomModeConfig';
import { BloomHighlight } from '../lib/signature';
import { getPublicDisplayName } from '../lib/formatName';

interface Props {
  forceMobile: boolean;
  members: User[];
  currentUser: User;
  isPttPressed: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVoiceBanned: boolean;
  volumeLevel: number;
  speakingLevels: Record<string, number>;
  dominantSpeakerId: string | null;
  currentChannel: { ownerId?: string; mode?: string; speakerIds?: string[] } | undefined;
  getIntensity: (user: User) => number;
  getEffectiveStatus: () => string;
  cardScale: number;
  cardStyle: CardStyle;
  onProfileClick: (userId: string, x: number, y: number) => void;
  onKickUser: (userId: string) => void;
  /** Sağ-tık / context menü talebi — ChatView seviyesinde role-aware menü açar. */
  onRequestMemberMenu?: (user: User, x: number, y: number) => void;
  isAdmin: boolean;
  // Chat panel props
  activeChannel: string | null;
  channels: { id: string; mode?: string }[];
  chatMessages: ChatMessage[];
  chatMuted: boolean;
  onToggleChatMuted: () => void;
  editingMsgId: string | null;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteMessage: (id: string) => void;
  onClearAll: () => void;
  onSendMessage: () => void;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  onChatScroll: () => void;
  isAtBottom: boolean;
  newMsgCount: number;
  onScrollToBottom: () => void;
  isModerator: boolean;
  /** Flood cooldown aktif mi — aktifse input + send disabled. */
  isFloodCooling?: boolean;
}

function VoiceParticipants({
  forceMobile,
  members,
  currentUser,
  isPttPressed,
  isMuted,
  isDeafened,
  isVoiceBanned,
  volumeLevel,
  speakingLevels,
  dominantSpeakerId,
  currentChannel,
  getIntensity,
  getEffectiveStatus,
  cardScale,
  cardStyle,
  onProfileClick,
  onKickUser,
  onRequestMemberMenu,
  isAdmin,
  activeChannel,
  channels,
  chatMessages,
  chatMuted,
  onToggleChatMuted,
  editingMsgId,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteMessage,
  onClearAll,
  onSendMessage,
  chatInput,
  onChatInputChange,
  chatScrollRef,
  onChatScroll,
  isAtBottom,
  newMsgCount,
  onScrollToBottom,
  isModerator,
  isFloodCooling,
}: Props) {
  const cardsRef = useRef<HTMLDivElement>(null);
  const [cardsHeight, setCardsHeight] = useState(0);
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCardsHeight(e.contentRect.height + 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = members.length;
  const s = cardScale;
  const scaleConfig = CARD_SCALE_MAP[cardScale as CardScale];

  const makeClickHandler = useCallback((userId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onProfileClick(userId, e.clientX, e.clientY);
  }, [onProfileClick]);

  const isSpeakingForUser = useCallback((user: User) => {
    const isMe = user.id === currentUser.id;
    return (isMe && isPttPressed && !isMuted && !isVoiceBanned) || (!isMe && !!user.isSpeaking);
  }, [currentUser.id, isPttPressed, isMuted, isVoiceBanned]);

  const isBroadcastSpeaker = useCallback((userId: string) => {
    if (currentChannel?.mode !== 'broadcast') return false;
    const sp = currentChannel.speakerIds || [];
    return sp.length > 0 ? sp.includes(userId) : currentChannel.ownerId === userId;
  }, [currentChannel?.mode, currentChannel?.speakerIds, currentChannel?.ownerId]);

  const renderCardProps = useCallback((user: User) => {
    const isMe = user.id === currentUser.id;
    const speaking = isSpeakingForUser(user);
    return {
      user,
      isMe,
      isOwner: currentChannel?.ownerId === user.id,
      isSpeakingActive: speaking,
      isDominant: speaking && user.id === dominantSpeakerId,
      intensity: getIntensity(user),
      scale: scaleConfig,
      isBroadcastSpeaker: isBroadcastSpeaker(user.id),
      isPttPressed,
      isMuted: isMe ? isMuted : false,
      isDeafened: isMe ? isDeafened : false,
      isVoiceBanned: isMe ? isVoiceBanned : false,
      volumeLevel,
      speakingLevel: speakingLevels[user.name] ?? 0,
      effectiveStatus: getEffectiveStatus(),
      onClick: makeClickHandler(user.id),
      onDoubleClick: () => { if (!isMe && isAdmin) onKickUser(user.id); },
      onContextMenu: (e: React.MouseEvent) => {
        if (isMe) return;
        e.preventDefault();
        onRequestMemberMenu?.(user, e.clientX, e.clientY);
      },
    };
  }, [
    currentUser.id,
    currentChannel?.ownerId,
    dominantSpeakerId,
    getIntensity,
    scaleConfig,
    isBroadcastSpeaker,
    isPttPressed,
    isMuted,
    isDeafened,
    isVoiceBanned,
    volumeLevel,
    speakingLevels,
    getEffectiveStatus,
    makeClickHandler,
    isAdmin,
    onKickUser,
    onRequestMemberMenu,
    isSpeakingForUser,
  ]);

  const networkParticipants = useMemo(() => members.map(user => {
    const isMe = user.id === currentUser.id;
    const speaking = isSpeakingForUser(user);
    return {
      id: user.id,
      name: getPublicDisplayName(user),
      firstName: user.firstName,
      lastName: user.lastName,
      age: user.age,
      avatar: user.avatar,
      statusText: isMe ? getEffectiveStatus() : (user.statusText || 'Online'),
      isSelf: isMe,
      isSpeaking: speaking,
      isMuted: isMe ? isMuted : (!!user.selfMuted || !!user.isMuted),
      isDeafened: isMe ? isDeafened : !!user.selfDeafened,
      platform: user.platform,
      isAdmin: user.isAdmin,
      isModerator: user.isModerator,
      appVersion: user.appVersion,
      onClick: makeClickHandler(user.id),
      onDoubleClick: () => { if (!isMe && isAdmin) onKickUser(user.id); },
      onContextMenu: (e: React.MouseEvent) => {
        if (isMe) return;
        e.preventDefault();
        onRequestMemberMenu?.(user, e.clientX, e.clientY);
      },
    };
  }), [
    members,
    currentUser.id,
    isSpeakingForUser,
    isMuted,
    isDeafened,
    getEffectiveStatus,
    makeClickHandler,
    isAdmin,
    onKickUser,
    onRequestMemberMenu,
  ]);

  const chatEnabled = getRoomModeConfig(channels.find(c => c.id === activeChannel)?.mode).chatEnabled;

  // Simple grid fallback — sadece küçük tarayıcı penceresi için (non-forceMobile + non-lg)
  const showGridFallback = !forceMobile;

  return (
    <>
      {/* Network visualization — desktop + forceMobile (Android) */}
      <div className={`${forceMobile ? 'block' : 'hidden lg:block'} relative h-full`}>
        <div ref={cardsRef} className="px-3 pt-3 pb-1">
          <RoomNetworkVisualization
            cardStyle={cardStyle}
            participants={networkParticipants}
          />
        </div>

        {/* ChatPanel — desktop ile aynı; network viz altına absolute yerleşir */}
        <ChatPanel
          chatEnabled={chatEnabled}
          cardsHeight={cardsHeight}
          messages={chatMessages}
          currentUserId={currentUser.id}
          isAdmin={isAdmin}
          isModerator={isModerator}
          chatMuted={chatMuted}
          onToggleChatMuted={onToggleChatMuted}
          editingMsgId={editingMsgId}
          editingText={editingText}
          onEditingTextChange={onEditingTextChange}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onDeleteMessage={onDeleteMessage}
          onClearAll={onClearAll}
          onSendMessage={onSendMessage}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          chatScrollRef={chatScrollRef}
          onScroll={onChatScroll}
          isAtBottom={isAtBottom}
          newMsgCount={newMsgCount}
          onScrollToBottom={onScrollToBottom}
          isFloodCooling={isFloodCooling}
        />
      </div>

      {/* Grid fallback — sadece küçük tarayıcı penceresinde (Android'de render edilmez) */}
      {showGridFallback && (
        <div className={`lg:hidden grid ${scaleConfig.gridGap} mx-auto w-full ${
          s === 3
            ? (count <= 1 ? 'grid-cols-1 max-w-lg' : count <= 4 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' : 'grid-cols-2 sm:grid-cols-3')
            : s === 2
              ? (count <= 1 ? 'grid-cols-1 max-w-md' : count <= 3 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' : 'grid-cols-2 sm:grid-cols-3')
              : (count <= 1 ? 'grid-cols-1 max-w-sm' : count <= 4 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4')
        }`}>
          {members.map(user => {
            const props = renderCardProps(user);
            const isSpeaking = !!(props as { isSpeaking?: boolean }).isSpeaking;
            return (
              <div key={user.id} className={`relative ${isSpeaking ? 'mv-speaker-pulse rounded-xl' : ''}`}>
                {isSpeaking && (
                  <BloomHighlight
                    active={true}
                    color="var(--theme-accent)"
                    intensity={0.22}
                    spread={40}
                    borderRadius={12}
                  />
                )}
                <UserCard {...props} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default React.memo(VoiceParticipants);
