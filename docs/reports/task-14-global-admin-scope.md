# Task #14 — Global (System) Admin Panel — Scope

## Required scope
- **Auth gate:** MAYVOX system admin (NOT server admin). Needs `is_system_admin` flag source — likely Supabase `profiles.role` or similar; must be verified.
- **Backend routes:** `GET /admin/servers`, `DELETE /admin/servers/:id`, `PATCH /admin/servers/:id` (ban/unban/etc.)
- **Middleware:** `requireSystemAdmin` — enforced at route level, audited
- **Frontend:** Settings → Yönetim → Sunucular (new tab in SettingsView)
- **UI:** paginated server list, search, per-row actions (delete, ban, force-leave owner)
- **Audit:** all admin actions logged to `audit_log` with `system_admin_action` prefix

## Recommendation
Full scope; needs its own sprint. Security-sensitive — system admin identity verification cannot be shortcut.

## Status
[~] DEFERRED — dedicated session with threat-model review.
