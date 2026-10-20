-- Follow-up mails and reviews (Toshoni, 20 Oct 2026) — docs/booking-architecture.md §17.
--
-- ADDITIVE. Two things:
--  * `cms_bookings.reminder_sent_at` and `review_requested_at`: when the
--    reminder (12–36 h before the start) and the review request (20–72 h
--    after the end) went out; null = not yet. Existing rows get null, so a
--    booking from before this migration that is still in a window gets its
--    mail at the next run, and one that is not never does.
--  * `cms_reviews`: one row per review request — the e-mailed link's token
--    hash and expiry, a snapshot of the customer, service, provider and
--    appointment, and once submitted the score (1–5), the text, the consent to
--    show the first name, and the admin's decision. `booking_id` is unique
--    (one review per appointment) and set to null when the booking is purged.
--    Nothing is published automatically.
-- No row is created, updated or removed; nothing touches cms_services,
-- cms_provider_services or a webshop table.
--
-- Every statement is guarded (IF NOT EXISTS / duplicate_object) so the file is
-- safe to re-run; on neon-http each statement commits on its own, and a run
-- that failed half-way is simply repeated.
--
-- Apply BEFORE deploying a build that contains it: the new build selects the
-- two columns on every booking list and the cron route reads the table.
CREATE TABLE IF NOT EXISTS "cms_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'nl' NOT NULL,
	"booking_id" text,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"service_name" text NOT NULL,
	"provider_name" text DEFAULT '' NOT NULL,
	"appointment_at" timestamp with time zone NOT NULL,
	"rating" integer,
	"body" text DEFAULT '' NOT NULL,
	"allow_first_name" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_bookings" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_bookings" ADD COLUMN IF NOT EXISTS "review_requested_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_reviews" ADD CONSTRAINT "cms_reviews_booking_id_cms_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."cms_bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_reviews" ADD CONSTRAINT "cms_reviews_decided_by_cms_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."cms_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cms_reviews_token_hash_key" ON "cms_reviews" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cms_reviews_booking_key" ON "cms_reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_reviews_status_idx" ON "cms_reviews" USING btree ("status","submitted_at");
