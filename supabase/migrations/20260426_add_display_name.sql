ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE profiles
SET display_name = NULLIF(trim(concat_ws(' ', first_name, last_name)), '')
WHERE display_name IS NULL OR trim(display_name) = '';

UPDATE profiles
SET display_name = name
WHERE display_name IS NULL OR trim(display_name) = '';

UPDATE profiles
SET display_name = 'Kullanici'
WHERE display_name IS NULL
   OR char_length(trim(display_name)) < 2
   OR char_length(trim(display_name)) > 24
   OR display_name ~ '[[:cntrl:]]';

ALTER TABLE profiles
ALTER COLUMN display_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_display_name_len_chk'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_display_name_len_chk
    CHECK (char_length(trim(display_name)) BETWEEN 2 AND 24);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_display_name_no_control_chk'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_display_name_no_control_chk
    CHECK (display_name !~ '[[:cntrl:]]');
  END IF;
END $$;
