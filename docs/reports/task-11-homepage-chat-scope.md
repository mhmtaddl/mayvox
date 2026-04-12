# Task #11 — Server Homepage Chat (Pro/Ultra) — Scope

## Required scope
- **DB:** `server_home_messages` table (server_id, user_id, body, created_at, indexed)
- **Migration:** new PG migration file
- **Backend service:** `serverHomeChatService.ts` (post, list-bounded-by-plan)
- **Backend routes:** `POST /servers/:id/home-chat`, `GET /servers/:id/home-chat`
- **Plan enforcement:** Pro=100 msgs, Ultra=250 msgs, Free=disabled — window-based or LIMIT
- **Frontend:** when `activeChannel === null` and server plan is pro/ultra → render HomeChatPanel
- **Realtime:** WS event `server:home_chat:new` — chat-server or polling fallback
- **Retention:** rolling window per plan (oldest beyond cap auto-cleaned)

## Estimated size
- ~6 new files (migration, backend service, route, frontend panel, hook, types)
- ~3 modified (ChatView routing, chat-server WS, serverService)
- Backend tests for plan-based limit
- ~500-800 LOC total

## Recommendation
This is feature-sized work, not a polish fix. Belongs in its own dedicated sprint with:
1. Schema migration + deploy planning
2. Backend PR with tests
3. Frontend PR with empty-state + chat UI
4. Realtime wiring PR

## Status
[~] DEFERRED — requires dedicated implementation session. No partial done that would ship broken state.
