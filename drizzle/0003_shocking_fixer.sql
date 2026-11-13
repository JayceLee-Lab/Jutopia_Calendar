CREATE TABLE `maintenance_log` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`payload` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
