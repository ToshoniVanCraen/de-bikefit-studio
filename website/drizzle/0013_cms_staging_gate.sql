-- First-party staging access gate (issue #18) — docs/staging-gate.md §3.
--
-- ADDITIVE. Creates TWO new tables: `cms_staging_gate_accounts` (one row per
-- named person who may open staging: identifier, scrypt password hash, note,
-- revocation time) and `cms_staging_gate_sessions` (one row per signed-in
-- browser: the cookie's HMAC tag as `token_hash`, created/last-used/revoked
-- times; no IP, no user agent), the sessions' foreign key to the accounts (ON
-- DELETE cascade) and two indexes for revoke-by-account and pruning. No link
-- to `cms_users`, no data change, no DROP. Nothing touches a webshop table
-- (`users`, `products`, `orders`, `order_items`).
--
-- Every statement is guarded (IF NOT EXISTS, duplicate_object) so the file is
-- safe to re-run; on neon-http each statement commits on its own, and a run
-- that failed half-way is simply repeated.
--
-- Apply BEFORE deploying a build that contains it: until the tables exist, the
-- gate on the staging host fails closed (503 `gate_unavailable`) and nobody can
-- sign in. Other hosts never read these tables.
CREATE TABLE IF NOT EXISTS "cms_staging_gate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"password_hash" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "cms_staging_gate_accounts_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_staging_gate_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "cms_staging_gate_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cms_staging_gate_sessions" ADD CONSTRAINT "cms_staging_gate_sessions_account_id_cms_staging_gate_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."cms_staging_gate_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_staging_gate_sessions_account_id_idx" ON "cms_staging_gate_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_staging_gate_sessions_last_used_at_idx" ON "cms_staging_gate_sessions" USING btree ("last_used_at");
