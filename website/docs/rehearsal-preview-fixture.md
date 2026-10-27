# Isolated synthetic rehearsal preview (27 October 2026)

This is **not** a production-data copy. The fixture is derived from the repository's
pre-correction self-test fixture, plus the exact public `/aanbod` subtitle supplied for
this rehearsal. It creates no bookings, customers, Google links, e-mail configuration,
cron configuration or usable login. Provider profiles are synthetic: `Toshoni` (the
patch's name matcher) and `Fitter`. The admin and provider users have unusable password
hashes; the admin's MFA row is an unusable sentinel. Do not use this branch to test login.

## Strict target preflight (Arend)

The designated Neon rehearsal branch is `br-mute-king-a2lcokbj`, endpoint
`ep-patient-leaf-a277rinr`, derived from **Staging**, not Production. Independently
verify in Neon that the endpoint host in `DATABASE_URL` belongs to that branch, the
preview deployment uses that same endpoint, and all 33 `cms_*` tables are empty.
It is schema-only through migration 0017 (`cms_offerings.price_text` exists), but
`drizzle.__drizzle_migrations` is **empty**. **Never run `db:migrate` on this branch:**
that would replay 0000–0017 against an already-created schema. Do not fabricate or
stamp migration journal rows. If the schema or branch identity differs, stop.

Set branch-scoped `DATABASE_URL`, `CMS_SESSION_SECRET`, `CMS_MFA_ENCRYPTION_KEY`, and
`NEXT_PUBLIC_SITE_URL` (an isolated branch-specific `*-git-*.vercel.app` preview). No Resend, cron, Google,
GA4 or gate secrets. Keep the preview access-restricted and unindexed. Set a new
branch-specific UUID as `CMS_REHEARSAL_MARKER` for the fixture command (not committed).
In the Neon SQL editor **for the verified rehearsal branch only**, create the marker:

```sql
INSERT INTO cms_site_settings (locale, key, value)
VALUES ('nl', 'rehearsal.fixture.guard',
        jsonb_build_object('marker', '<same branch-specific UUID>', 'state', 'empty'));
```

That marker must be the **only** row in any `cms_*` table. It binds the fixture to this
particular empty branch; `--expect-host` and `--expect-site` separately bind the
connection and preview. The command checks all CMS table counts before its first
write and fails closed on occupied tables, an absent/mismatched marker, a public site,
or a non-Neon remote host. It does not create the marker itself. An interrupted apply
may leave a partial synthetic database; do **not** rerun against partial rows—discard
and recreate the isolated schema-only branch, then repeat the preflight.

## Fixture setup

Use the exact host (not URL) of the verified branch and exact preview origin:

```bash
cd website
npm run cms:rehearsal-fixture -- --expect-host '<Neon endpoint host>' --expect-site 'https://<isolated-preview>.vercel.app'
npm run cms:rehearsal-fixture -- --apply --expect-host '<Neon endpoint host>' --expect-site 'https://<isolated-preview>.vercel.app'
npm run cms:rehearsal-fixture -- --expect-host '<Neon endpoint host>' --expect-site 'https://<isolated-preview>.vercel.app'
```

The first run is read-only; the final run prints `already installed; nothing written`.
The `installed` marker means this **pre-correction** fixture is complete, not that
`cms:patch-aanbod-correcties` was applied. Do not run `cms:bootstrap`, `cms:seed`, or
`cms:seed-booking` here: they create the current corrected defaults (and the latter
would re-subscribe Toshoni).

The fixture includes all nine offerings, the old pre-27-Oct page/settings/menu copy,
two providers, current-bike adult/youth direct booking, new-bike adult/youth direct
booking, and direct 60-minute foot/saddle/cleats services. Original public prices are held on offering variants
in cents: adult €275, youth €150, foot €85, saddle €60, cleats €15.
The synthetic direct services have `price_cents = NULL`, `show_price = false`,
matching the production-shaped service/variant split. The new-bike
and analysis services are rehearsal-only synthetic bookings. The exact supplied
subtitle is published on the `/aanbod` hero; the correction patch explicitly
recognizes and preserves this editor-owned value while changing other fields.

## Correction rehearsal and assertions

Use the correction patch's **default remove mode**, never `--staging-retain-toshoni`:
there are two providers, so the patch should remove Toshoni's subscriptions and keep
Fitter's. Keep its backup in a private directory, and do not run it until the matching
preview build is deployed (the patch publishes a new `location` block).

```bash
npm run cms:patch-aanbod-correcties -- --expect-host '<Neon endpoint host>'
npm run cms:patch-aanbod-correcties -- --apply --expect-host '<Neon endpoint host>' --backup-dir .rollout-backups
npm run cms:patch-aanbod-correcties -- --expect-host '<Neon endpoint host>'
```

First dry run must have no `!` and plan two €275/120-minute guardian-required youth
package services (one per directly booked bikefit), `60 → 120 min` on the new bike, `60 → 30 min` on foot, and `60 → 15 min`
on cleats. Saddle remains 60. Post-apply dry run must say `nothing to do`. Check:

```sql
SELECT s.slug, s.price_cents, s.duration_minutes, s.requires_guardian
FROM cms_services s WHERE s.slug IN
  ('bikefit-nieuwe-fiets-volwassene','bikefit-nieuwe-fiets-jeugd','voetanalyse',
   'zadelanalyse','afstellen-schoenplaatjes','jeugdfit-pakket',
   'bikefit-nieuwe-fiets-jeugd-pakket')
ORDER BY s.slug;
-- both packages 27500/120/true; new-bike 120 (adult/youth), foot 30,
-- saddle 60, cleats 15. Synthetic direct-service prices are null by design;
-- the public prices live on cms_offering_variants.

SELECT o.slug, v.audience, v.price_cents, s.slug AS service_slug
FROM cms_offerings o JOIN cms_offering_variants v ON v.offering_id = o.id
LEFT JOIN cms_services s ON s.id = v.service_id
WHERE o.slug IN ('bikefit-nieuwe-fiets','bikefit-huidige-fiets',
                 'voetanalyse','zadelanalyse','afstellen-schoenplaatjes')
ORDER BY o.slug, v.audience;
-- adult 27500, youth 15000, youth-package 27500 on both fits;
-- foot 8500, saddle 6000, cleats 1500; direct variants have a service.

SELECT p.display_name, count(ps.service_id) AS subscriptions
FROM cms_providers p LEFT JOIN cms_provider_services ps ON ps.provider_id = p.id
GROUP BY p.id, p.display_name ORDER BY p.display_name;
-- Fitter still offers services and the youth package; Toshoni has zero.

SELECT b.data->>'subtitle' AS subtitle
FROM cms_blocks b JOIN cms_pages p ON p.id = b.page_id
WHERE p.slug = 'aanbod' AND b.type = 'hero';
-- Must equal the exact supplied sentence; also inspect the published `/aanbod` hero.

SELECT count(*) FROM cms_bookings; -- 0
```

Preview click-through: `/aanbod` keeps the supplied hero subtitle;
`/afspraak` offers the two adult/youth current-bike variants plus the package;
new-bike and the three analyses show direct-booking paths and corrected durations;
Toshoni is not a bookable provider, Fitter is. No production/staging deployment or
production data is part of this rehearsal.
