CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`family` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_family_dates` ON `events` (`family`,`start`,`end`);