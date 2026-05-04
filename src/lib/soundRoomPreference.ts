const PLAY_IN_CHAT_ROOM_KEY = 'mv:sm:play-in-chat-room';

let chatRoomActive = false;

export function setSoundChatRoomActive(active: boolean) {
  chatRoomActive = active;
}

export function isSoundChatRoomActive(): boolean {
  return chatRoomActive;
}

export function isSoundsInChatRoomEnabled(): boolean {
  try {
    return localStorage.getItem(PLAY_IN_CHAT_ROOM_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setSoundsInChatRoomEnabled(enabled: boolean) {
  try {
    localStorage.setItem(PLAY_IN_CHAT_ROOM_KEY, enabled ? '1' : '0');
  } catch {
    // no-op
  }
}

export function shouldSuppressSettingsSoundInChatRoom(): boolean {
  return chatRoomActive && !isSoundsInChatRoomEnabled();
}
