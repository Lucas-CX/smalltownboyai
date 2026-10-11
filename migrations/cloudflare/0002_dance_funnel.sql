CREATE TABLE `dance_funnel_event` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`user_id` text,
	`event` text NOT NULL,
	`source` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`device` text DEFAULT 'unknown' NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`resource_id` text,
	`mode` text DEFAULT 'unknown' NOT NULL,
	`diagnostic` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_dance_funnel_time` ON `dance_funnel_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dance_funnel_flow` ON `dance_funnel_event` (`flow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dance_funnel_resource` ON `dance_funnel_event` (`resource_id`,`event`);