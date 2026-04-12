-- 016_public_servers_open_join.sql
-- Bug fix: public sunucular join_policy='invite_only' olarak yaratılıyordu
-- (createServer bu kolonu hiç set etmiyor, DB default 'invite_only').
-- Bu nedenle Discover'dan tıklayan kullanıcılar 403 "davet kodu gerekiyor" alıyordu.
--
-- Kural: is_public=true olan sunucular 'open' join_policy'de olmalı.
-- is_public=false dokunulmaz (gizli sunucular davet-only kalır).

UPDATE servers
   SET join_policy = 'open'
 WHERE is_public = true
   AND join_policy = 'invite_only';
