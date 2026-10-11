CREATE TABLE `dance_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`payment_mode` text DEFAULT 'mock' NOT NULL,
	`payment_id` text,
	`amount_cents` integer DEFAULT 1290 NOT NULL,
	`photos` text NOT NULL,
	`scenario` text DEFAULT 'success' NOT NULL,
	`provider_id` text,
	`error_code` text,
	`provider_cost_cents` integer,
	`next_run_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`support_requested` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `dance_job_request_key_unique` ON `dance_job` (`request_key`);
CREATE UNIQUE INDEX `dance_job_payment_id_unique` ON `dance_job` (`payment_id`);
CREATE INDEX `idx_dance_owner` ON `dance_job` (`user_id`);
CREATE INDEX `idx_dance_queue` ON `dance_job` (`status`,`next_run_at`);
