ALTER TABLE `events` ADD `calendar_type` text DEFAULT 'solar' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `lunar_start` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `color` text DEFAULT '' NOT NULL;