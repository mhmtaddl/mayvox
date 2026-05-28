#!/usr/bin/env bash
set -euo pipefail

cd /opt/cylk-token-server
TS="$(date +%Y%m%d-%H%M%S)"
cp chat-server.cjs "chat-server.cjs.bak-report-count-$TS"

node <<'NODE'
const fs = require('fs');
const path = 'chat-server.cjs';
let src = fs.readFileSync(path, 'utf8');

const oldBlock = `        const reporterName = await getProfileDisplayName(userId);
        const targetName = row.sender_name || await getProfileDisplayName(row.sender_id);

        if (row.server_id) {
          void recordRoomActivityEvent({
            serverId: row.server_id,
            channelId: currentRoom,
            type: 'message_report',
            actorId: userId,
            targetUserId: row.sender_id,
            label: \`\${reporterName || 'Bir kullanıcı'}, \${targetName || 'Kullanıcı'} kullanıcısının mesajını bildirdi\`,
            metadata: { messageId },
          });
        }

        broadcastToRoom(currentRoom, {
          type: 'message_report',
          messageId,
          actorId: userId,
          actorName: reporterName,
          targetUserId: row.sender_id,
          targetName,
        });`;

const newBlock = `        const reporterName = await getProfileDisplayName(userId);
        const targetName = row.sender_name || await getProfileDisplayName(row.sender_id);

        let reportCount = 1;
        if (row.server_id) {
          const duplicate = await queryOne(
            \`SELECT id::text AS id
               FROM room_activity_events
              WHERE server_id = $1
                AND channel_id = $2
                AND type = 'message_report'
                AND actor_id = $3
                AND metadata->>'messageId' = $4
              LIMIT 1\`,
            [row.server_id, currentRoom, userId, messageId],
          );
          if (duplicate) {
            return send(ws, { type: 'error', code: 'message_already_reported', message: 'Bu mesajı zaten bildirdin.' });
          }

          const countRow = await queryOne(
            \`SELECT COUNT(DISTINCT actor_id)::int AS count
               FROM room_activity_events
              WHERE server_id = $1
                AND channel_id = $2
                AND type = 'message_report'
                AND metadata->>'messageId' = $3\`,
            [row.server_id, currentRoom, messageId],
          );
          reportCount = Number(countRow?.count || 0) + 1;

          void recordRoomActivityEvent({
            serverId: row.server_id,
            channelId: currentRoom,
            type: 'message_report',
            actorId: userId,
            targetUserId: row.sender_id,
            label: \`\${reporterName || 'Bir kullanıcı'}, \${targetName || 'Kullanıcı'} kullanıcısının mesajını bildirdi\`,
            metadata: { messageId, reportCount },
          });
        }

        broadcastToRoom(currentRoom, {
          type: 'message_report',
          messageId,
          actorId: userId,
          actorName: reporterName,
          targetUserId: row.sender_id,
          targetName,
          reportCount,
        });`;

if (!src.includes(oldBlock)) {
  console.error('report block marker not found');
  process.exit(1);
}
src = src.replace(oldBlock, newBlock);
fs.writeFileSync(path, src);
NODE

node --check chat-server.cjs
pm2 restart mayvox-chat
sleep 2
pm2 list
grep -n "message_already_reported\\|reportCount" chat-server.cjs | head -n 80
