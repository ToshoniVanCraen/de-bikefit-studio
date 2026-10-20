-- Extra's (add-ons) on offerings and the location choice (Toshoni, 20 Oct 2026)
-- — docs/booking-architecture.md §18, docs/cms-architecture.md §14.
--
-- ADDITIVE. Three things:
--  * `cms_offerings.is_addon` (default false), `sold_alone` (default true) and
--    `addon_minutes` (null): an offering a visitor can tick as an extra when
--    booking another offering, whether it is also sold on its own, and how
--    many minutes it adds. Existing rows keep today's behaviour (not an
--    extra, sold alone).
--  * `cms_offering_addons`: which extras an offering allows ("Extra's bij dit
--    aanbod"), in order. Empty after this migration;
--    `npm run cms:patch-aanbod-extras` fills in Toshoni's set.
--  * `cms_booking_addons`: per booking a snapshot of the extras ticked (title,
--    minutes, price), cascaded with the booking. Empty after this migration.
-- No row is created, updated or removed; nothing touches cms_services,
-- cms_provider_services, cms_bookings or a webshop table.
--
-- Every statement is guarded (IF NOT EXISTS / duplicate_object) so the file is
-- safe to re-run; on neon-http each statement commits on its own, and a run
-- that failed half-way is simply repeated.
--
-- Apply BEFORE deploying a build that contains it: the new build selects the
-- three columns on every offering read and the booking list reads the table.
CREATE TABLE IF NOT EXISTS "cms_booking_addons" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"offering_id" text,
	"slug" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"minutes" integer NOT NULL,
	"price_cents" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_offering_addons" (
	"offering_id" text NOT NULL,
	"addon_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cms_offering_addons_offering_id_addon_id_pk" PRIMARY KEY("offering_id","addon_id")
);
--> statement-breakpoint
ALTER TABLE "cms_offerings" ADD COLUMN IF NOT EXISTS "is_addon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_offerings" ADD COLUMN IF NOT EXISTS "sold_alone" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_offerings" ADD COLUMN IF NOT EXISTS "addon_minutes" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_booking_addons" ADD CONSTRAINT "cms_booking_addons_booking_id_cms_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."cms_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_booking_addons" ADD CONSTRAINT "cms_booking_addons_offering_id_cms_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."cms_offerings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_offering_addons" ADD CONSTRAINT "cms_offering_addons_offering_id_cms_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."cms_offerings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_offering_addons" ADD CONSTRAINT "cms_offering_addons_addon_id_cms_offerings_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."cms_offerings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_booking_addons_booking_idx" ON "cms_booking_addons" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_offering_addons_addon_idx" ON "cms_offering_addons" USING btree ("addon_id");
