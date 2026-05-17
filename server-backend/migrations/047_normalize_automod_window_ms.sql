-- Oto-Mod flood windowMs backend validation minimum is 6000ms.
-- Normalize older saved server configs that still carry the previous 5000ms default.

UPDATE servers
SET moderation_config = jsonb_set(
  moderation_config,
  '{flood,windowMs}',
  '6000'::jsonb,
  true
)
WHERE moderation_config ? 'flood'
  AND (moderation_config #>> '{flood,windowMs}') ~ '^[0-9]+$'
  AND ((moderation_config #>> '{flood,windowMs}')::int < 6000);
