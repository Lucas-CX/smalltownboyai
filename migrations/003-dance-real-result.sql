ALTER TABLE dance_job ADD COLUMN generation_mode text NOT NULL DEFAULT 'mock';
ALTER TABLE dance_job ADD COLUMN result_key text;
