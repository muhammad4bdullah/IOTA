DROP TABLE IF EXISTS upload_sessions;
ALTER TABLE games DROP COLUMN content_type;
ALTER TABLE games DROP COLUMN file_size;
ALTER TABLE games DROP COLUMN file_name;
ALTER TABLE games DROP COLUMN file_key;
