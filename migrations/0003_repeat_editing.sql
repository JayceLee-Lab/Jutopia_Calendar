ALTER TABLE `events` ADD `series_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `repeat_rule` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `repeat_until` text DEFAULT '' NOT NULL;