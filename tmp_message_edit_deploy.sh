#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="/opt/mayvox-server-backend"
CHAT_DIR="/opt/cylk-token-server"
SRC_BACKEND_DIR="/opt/mayvox-src/server-backend"
TS="$(date +%Y%m%d-%H%M%S)"

cd "$BACKEND_DIR"
cp src/services/roomActivityService.ts "src/services/roomActivityService.ts.bak-message-edit-$TS"
node <<'NODE'
const fs = require('fs');
const path = 'src/services/roomActivityService.ts';
let src = fs.readFileSync(path, 'utf8');
if (!src.includes("  | 'message_edit'")) {
  src = src.replace(
    "  | 'message_delete'\n  | 'message_report'",
    "  | 'message_delete'\n  | 'message_edit'\n  | 'message_report'"
  );
}
fs.writeFileSync(path, src);
NODE

DATABASE_URL="$(pm2 env 2 | sed -n 's/^DATABASE_URL: //p' | head -n 1)"
psql "$DATABASE_URL" <<'SQL'
ALTER TABLE room_activity_events
  DROP CONSTRAINT IF EXISTS room_activity_events_type_check;

ALTER TABLE room_activity_events
  ADD CONSTRAINT room_activity_events_type_check
  CHECK (
    type IN (
      'join',
      'leave',
      'chat_lock',
      'chat_unlock',
      'chat_clear',
      'automod',
      'voice_mute',
      'voice_unmute',
      'timeout',
      'timeout_clear',
      'room_kick',
      'chat_ban',
      'chat_unban',
      'message_delete',
      'message_edit',
      'message_report',
      'settings'
    )
  );
SQL

npm run build
pm2 restart mayvox-backend

cd "$CHAT_DIR"
cp chat-server.cjs "chat-server.cjs.bak-message-edit-$TS"
node <<'NODE'
const fs = require('fs');
const path = 'chat-server.cjs';
let src = fs.readFileSync(path, 'utf8');

src = src.replace(
  "        const moderated = !isOwnMessage || actorRank > 0;",
  "        const moderated = true;"
);

const oldEdit = `        broadcastToRoom(currentRoom, {
          type: 'edit',
          messageId: msg.messageId,
          text,
        });`;

const newEdit = `        const targetName = row.sender_name || await getProfileDisplayName(row.sender_id);
        broadcastToRoom(currentRoom, {
          type: 'edit',
          messageId: String(msg.messageId),
          text,
          actorId: userId,
          actorName: userName,
          targetUserId: row.sender_id,
          targetName,
        });

        if (row.server_id) {
          void recordRoomActivityEvent({
            serverId: row.server_id,
            channelId: currentRoom,
            type: 'message_edit',
            actorId: userId,
            targetUserId: row.sender_id,
            label: \`\${userName || 'Bir kullanıcı'}, \${targetName || 'Kullanıcı'} kullanıcısının mesajını düzenledi\`,
            metadata: { messageId: String(msg.messageId) },
          });
        }`;

if (src.includes(oldEdit)) {
  src = src.replace(oldEdit, newEdit);
}

const oldUpdate = `        const result = await pgPool.query(
          'UPDATE room_messages SET text = $1 WHERE id = $2 AND sender_id = $3',
          [text, msg.messageId, userId],
        );
        if (result.rowCount === 0) {
          return send(ws, { type: 'error', message: 'Bu mesaj düzenlenemedi' });
        }

        const targetName = row.sender_name || await getProfileDisplayName(row.sender_id);`;

const newUpdate = `        const row = await queryOne(
          \`SELECT m.id::text AS id,
                  m.sender_id::text AS sender_id,
                  m.sender_name,
                  c.server_id::text AS server_id
             FROM room_messages m
             JOIN channels c ON c.id::text = m.channel_id::text
            WHERE m.id::text = $1
              AND m.channel_id = $2
            LIMIT 1\`,
          [String(msg.messageId), currentRoom],
        );
        if (!row || String(row.sender_id) !== String(userId)) {
          return send(ws, { type: 'error', message: 'Bu mesaj düzenlenemedi' });
        }

        const result = await pgPool.query(
          'UPDATE room_messages SET text = $1 WHERE id::text = $2 AND sender_id = $3',
          [text, String(msg.messageId), userId],
        );
        if (result.rowCount === 0) {
          return send(ws, { type: 'error', message: 'Bu mesaj düzenlenemedi' });
        }

        const targetName = row.sender_name || await getProfileDisplayName(row.sender_id);`;

if (src.includes(oldUpdate)) {
  src = src.replace(oldUpdate, newUpdate);
}

fs.writeFileSync(path, src);
NODE

node --check chat-server.cjs
pm2 restart mayvox-chat
sleep 2
pm2 list

if [ -d "$SRC_BACKEND_DIR" ]; then
  cp "$BACKEND_DIR/src/services/roomActivityService.ts" "$SRC_BACKEND_DIR/src/services/roomActivityService.ts" 2>/dev/null || true
  cp "$BACKEND_DIR/dist/services/roomActivityService.js" "$SRC_BACKEND_DIR/dist/services/roomActivityService.js" 2>/dev/null || true
fi
if [ -f /opt/mayvox-src/chat-server.cjs ]; then
  cp "$CHAT_DIR/chat-server.cjs" /opt/mayvox-src/chat-server.cjs
fi

psql "$DATABASE_URL" -c "\\d+ room_activity_events" | grep room_activity_events_type_check -A2 || true
grep -n "message_edit\\|const row = await queryOne" "$CHAT_DIR/chat-server.cjs" | head -n 80
