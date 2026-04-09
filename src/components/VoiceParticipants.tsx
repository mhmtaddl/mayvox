import React, { useRef, useState, useEffect } from 'react';
import { UserCard, RoomNetworkVisualization, CARD_SCALE_MAP } from './chat';
import type { CardScale } from './chat';
import type { CardStyle } from './chat/cardStyles';
import type { User } from '../types';
import type { ChatMessage } from './ChatPanel';
import ChatPanel from './ChatPanel';
import { getRoomModeConfig } from '../lib/roomModeConfig';

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

  const makeClickHandler = (userId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onProfileClick(userId, e.clientX, e.clientY);
  };

  const isSpeakingForUser = (user: User) => {
    const isMe = user.id === currentUser.id;
    return (isMe && isPttPressed && !isMuted && !isVoiceBanned) || (!isMe && !!user.isSpeaking);
  };

  const isBroadcastSpeaker = (userId: string) => {
    if (currentChannel?.mode !== 'broadcast') return false;
    const sp = currentChannel.speakerIds || [];
    return sp.length > 0 ? sp.includes(userId) : currentChannel.ownerId === userId;
  };

  const renderCardProps = (user: User) => {
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
      onContextMenu: (e: React.MouseEvent) => { if (!isMe && isAdmin) { e.preventDefault(); if (confirm(`${user.name} odadan çıkarılsın mı?`)) onKickUser(user.id); } },
    };
  };

  const networkParticipants = members.map(user => {
    const isMe = user.id === currentUser.id;
    const speaking = isSpeakingForUser(user);
    return {
      id: user.id,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      age: user.age,
      avatar: user.avatar,
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
      onContextMenu: (e: React.MouseEvent) => { if (!isMe && isAdmin) { e.preventDefault(); if (confirm(`${user.name} odadan çıkarılsın mı?`)) onKickUser(user.id); } },
    };
  });

  const chatEnabled = getRoomModeConfig(channels.find(c => c.id === activeChannel)?.mode).chatEnabled;

  return (
    <>
      {/* Desktop layout */}
      {!forceMobile && (
        <div className="hidden lg:block relative h-full">
          <div ref={cardsRef} className="px-3 pt-3 pb-1">
            <RoomNetworkVisualization
              cardStyle={cardStyle}
              participants={networkParticipants}
            />
          </div>

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
          />
        </div>
      )}

      {/* Mobile layout */}
      <div className={`${forceMobile ? '' : 'lg:hidden'} grid ${scaleConfig.gridGap} mx-auto w-full ${
        s === 3
          ? (count <= 1 ? 'grid-cols-1 max-w-lg' : count <= 4 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' : 'grid-cols-2 sm:grid-cols-3')
          : s === 2
            ? (count <= 1 ? 'grid-cols-1 max-w-md' : count <= 3 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' : 'grid-cols-2 sm:grid-cols-3')
            : (count <= 1 ? 'grid-cols-1 max-w-sm' : count <= 4 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4')
      }`}>
        {members.map(user => (
          <UserCard key={user.id} {...renderCardProps(user)} />
        ))}
      </div>
    </>
  );
}

export default React.memo(VoiceParticipants);
