/**
 * Staging access gate accounts and sessions (issue #18), created by
 * `drizzle/0013_cms_staging_gate.sql`. Kept apart from `./cms-schema.ts`, which
 * is already past the file-size limit; the same `cms_` prefix and conventions
 * apply, and `drizzle.config.ts` and `./cms.ts` list this file too.
 * Design: docs/staging-gate.md §3.
 *
 * Deliberately NOT linked to `cms_users`: a CMS password never opens the gate
 * and the gate never reads CMS accounts. Nothing secret is stored in the clear:
 * passwords are scrypt hashes (`src/lib/cms/password.ts`) and a session stores
 * only the HMAC tag of its cookie token (`src/lib/staging-gate/token.ts`).
 * No IP address, no user agent.
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per person who may open staging. `identifier` is trimmed and
 * lower-cased by the CLI before it is stored; `note` says who it is for and
 * the approval reference. Revoking sets `revoked_at` (the row stays, so the
 * history of who had access stays too).
 */
export const cmsStagingGateAccounts = pgTable('cms_staging_gate_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  note: text('note').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/**
 * One row per signed-in browser. `token_hash` is the cookie's HMAC tag, the
 * only lookup key; the edge middleware reads it with raw SQL
 * (`src/lib/staging-gate/store-edge.ts`), so a column rename here must be
 * mirrored there. `last_used_at` only moves forward (one conditional UPDATE on
 * each authenticated request) so the 30-minute inactivity limit is exact.
 * The indexes serve the per-account revoke and the prune of old rows.
 */
export const cmsStagingGateSessions = pgTable(
  'cms_staging_gate_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => cmsStagingGateAccounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('cms_staging_gate_sessions_account_id_idx').on(t.accountId),
    index('cms_staging_gate_sessions_last_used_at_idx').on(t.lastUsedAt),
  ],
);
