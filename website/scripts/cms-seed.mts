/**
 * Seeds (and publishes) the Dutch public site.
 *
 *   npm run cms:seed                # create-or-update every page, then publish
 *   npm run cms:seed -- --only-missing   # never touch a page/menu that exists
 *   npm run cms:seed -- --refresh-slug afspraak
 *                                   # re-seed ONE page's draft blocks and
 *                                   # republish it; nothing else is touched
 *
 * Idempotent: the same input always produces the same published output, and a
 * second run changes nothing a reviewer would notice. Note that the default run
 * DOES overwrite draft blocks of the seeded pages — that is what makes it a
 * repeatable definition of the launch content. Use `--only-missing` once real
 * editing has started.
 *
 * `--refresh-slug <slug>` (also `--refresh-slug=<slug>`; `/` or `home` for the
 * home page) is for an environment where the pages already exist and have
 * been edited — e.g. staging getting the new `booking` block on `/afspraak`.
 * It replaces that page's draft blocks with the seed definition and publishes,
 * and leaves its title/SEO fields, every other page, the menus, the settings
 * and the redirects exactly as they are. If the page does not exist yet it is
 * created in full. It cannot be combined with `--only-missing`.
 *
 * ---------------------------------------------------------------------------
 * COPY PROVENANCE — every string below is lifted from the source material.
 * Nothing is invented: no prices, no street address, no commercial claims, no
 * testimonials. The one e-mail address is the confirmed CONTACT_EMAIL.
 *
 *   /, /aanbod,            src/lib/studio/seed-content/aanbod.ts — the 13 Oct 2026
 *   /voor-wie, /bikefit,   redesign (work block 2026-10-13-aanbod-staging-brief.md
 *   /ons-team, menus       + the earlier prototype copy); provenance is in that
 *                          file's header. Also used by `cms:rollout-aanbod`. The
 *                          offerings themselves are rows, not pages, since
 *                          17 Oct 2026 (`src/lib/offers/defaults.ts`, written
 *                          by `cms:bootstrap`); /cadeaubon is `cadeaubon.ts`.
 *                          `/over-ons` is no longer seeded: it redirects to
 *                          `/ons-team`.
 *   /veelgestelde-vragen   src/lib/studio/seed-content/faq.ts: content/about.html
 *                          §2 = prototype/bikefit.html#vragen (identical 8 Q&A)
 *   /afspraak              src/lib/studio/seed-content/appointment.ts:
 *                          content/booking.html (step order: dienst → datum &
 *                          tijd → gegevens → bevestiging; tone notes) + the
 *                          `booking` block (online booking, decided 24 Sep
 *                          2026: no payment) + the "wat breng je mee" / "hoe
 *                          lang duurt het" answers from content/about.html +
 *                          "Andere vraag?" (Toshoni's review, 13 Oct 2026).
 *                          `/contact` is no longer seeded: it redirects here.
 *   /privacy               src/lib/studio/seed-content/legal.ts: .winston work
 *   /algemene-voorwaarden  block 2026-09-24-legal-pages.md, pages 1 and 2
 *                          (standard Belgian texts, to be read by a lawyer
 *                          before production). Identity from the KBO register;
 *                          since 27 Oct 2026 the texts carry copy tokens
 *                          instead of the facts (`{{bedrijf}}`, `{{zetel}}`,
 *                          `{{kbo}}`, `{{e-mail}}`, `{{telefoon}}`,
 *                          `{{telefoon-href}}`), resolved on the public site from
 *                          Instellingen.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MODULE STUBS BELOW
 *
 * The brief requires publishing to go through `repo.publishPage()` so the
 * snapshots are the real thing — same validation, same audit entries, same
 * cache busting as the admin UI. `repo.ts` is a `server-only` module that
 * resolves its actor from the `cms_session` cookie via `next/headers`, none of
 * which exists in a plain Node process.
 *
 * So instead of bypassing the write API, this script gives it the request
 * context it expects: three tiny in-process module stubs (`server-only`,
 * `next/headers`, `next/cache`) registered through Node's `module.registerHooks`,
 * plus a REAL `cms_sessions` row for a real admin user. Every permission check,
 * every block validation and every audit write therefore runs exactly as it
 * does in the browser. The session is revoked again before the script exits.
 */
import { config } from 'dotenv';
// Pure modules (no `server-only`, no Next imports): safe to load before the stubs.
import {
  AANBOD_PAGES,
  AANBOD_REDIRECTS,
  FOOTER_MENU,
  MAIN_MENU,
} from '@/lib/studio/seed-content/aanbod';
import { AFSPRAAK_PAGE, CONTACT_REDIRECT } from '@/lib/studio/seed-content/appointment';
import { CADEAUBON_PAGE } from '@/lib/studio/seed-content/cadeaubon';
import { FAQ_PAGE } from '@/lib/studio/seed-content/faq';
import { PRIVACY_PAGE, TERMS_PAGE } from '@/lib/studio/seed-content/legal';
import { STUDIO_CONTACT_ADDRESS } from '@/lib/studio/seed-content/location-section';
import {
  CONTACT_EMAIL,
  PHONE_HREF,
  PHONE_LABEL,
  type SeedPage,
} from '@/lib/studio/seed-content/shared';
import { findActingAdmin } from './lib/cms-actor.mjs';
import { cookieJar, installRequestContextStubs } from './lib/request-context.mjs';

config({ path: '.env.local' });

// Must run before any `@/lib/cms/*` import (all of them are dynamic below).
installRequestContextStubs();

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * The FAQ and the legal pages are seed modules (`faq.ts`, `legal.ts` in
 * `src/lib/studio/seed-content/`, 27 Oct 2026: this script was past the size limit, and as modules
 * the corrections and the tests import the texts instead of copying or parsing them).
 */
const PAGES: SeedPage[] = [
  // ------------------------- /, /aanbod, /aanbod/*, /voor-wie, /bikefit, /ons-team
  ...AANBOD_PAGES,
  // ------------------------------------------------- /aanbod/cadeaubon ---
  CADEAUBON_PAGE,

  // ----------------------------------------------- /veelgestelde-vragen ---
  FAQ_PAGE,

  // ---------------------------------------------------------- /afspraak ---
  AFSPRAAK_PAGE,

  // ----------------------------------------------- /privacy, /algemene-voorwaarden ---
  PRIVACY_PAGE,
  TERMS_PAGE,
];

/**
 * Same values `cms-bootstrap.mts` writes, repeated here so a database that was
 * never bootstrapped still ends up with a complete site. Existing rows are
 * never overwritten — settings are the operator's, not the seed's.
 */
const DEFAULT_SETTINGS: Record<string, unknown> = {
  site: {
    name: 'De Bikefit Studio',
    tagline: 'Pijnvrij fietsen begint hier',
    mission:
      'Iedereen verdient het om te genieten van alles wat een fiets te bieden heeft. Ons werk is ervoor te zorgen dat jouw fiets je dat ook toelaat.',
    logoMediaId: null,
  },
  contact: {
    phoneLabel: PHONE_LABEL,
    phoneHref: PHONE_HREF,
    email: CONTACT_EMAIL,
    // The studio's address (Toshoni, 27 Oct 2026): addressLines, postalCode, city, country.
    ...STUDIO_CONTACT_ADDRESS,
    hours: 'Op afspraak',
    website: 'www.debikefitstudio.be',
  },
  seo: {
    defaultMetaTitle: 'De Bikefit Studio: professionele bikefit in Ninove',
    titleTemplate: '%s · De Bikefit Studio',
    defaultMetaDescription:
      'Fiets met comfort. Een bikefit lijnt de fiets uit op jou, niet omgekeerd, zodat elke rit beter voelt en je langer gezond blijft op de fiets.',
    defaultOgImageMediaId: null,
    // Staging must stay out of search results until launch.
    allowIndexing: false,
  },
  organization: {
    type: 'LocalBusiness',
    legalName: 'De Bikefit Studio',
    vatNumber: '',
    sameAs: [],
    priceRange: '',
    areaServed: ['Ninove', 'Oost-Vlaanderen'],
    latitude: null,
    longitude: null,
  },
  analytics: {
    enabled: false,
  },
};

/** The prototype's old URL, `/over-ons` → `/ons-team` and `/contact` → `/afspraak` (13 Oct 2026). */
const REDIRECTS = [
  {
    fromPath: '/bikefit.html',
    toPath: '/bikefit',
    statusCode: 301 as const,
    notes: 'Oude statische prototypepagina.',
  },
  ...AANBOD_REDIRECTS,
  CONTACT_REDIRECT,
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const onlyMissing = process.argv.includes('--only-missing');

/**
 * `--refresh-slug afspraak` / `--refresh-slug=afspraak` → `'afspraak'`;
 * `/`, `''` or `home` → `''` (the home page); absent → `null`.
 */
function parseRefreshSlug(args: string[]): string | null {
  let raw: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--refresh-slug') {
      raw = args[index + 1];
      if (raw === undefined || raw.startsWith('--')) {
        throw new Error('--refresh-slug needs a slug, e.g. --refresh-slug afspraak');
      }
      break;
    }
    if (arg.startsWith('--refresh-slug=')) {
      raw = arg.slice('--refresh-slug='.length);
      break;
    }
  }
  if (raw === undefined) return null;
  const slug = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return slug === 'home' ? '' : slug;
}

function log(symbol: string, message: string) {
  console.log(`${symbol} ${message}`);
}

async function main() {
  const refreshSlug = parseRefreshSlug(process.argv.slice(2));
  const refreshing = refreshSlug !== null;
  if (refreshing && onlyMissing) {
    throw new Error('--refresh-slug and --only-missing cannot be combined');
  }
  const pages = refreshing ? PAGES.filter((page) => page.slug === refreshSlug) : PAGES;
  if (refreshing && pages.length === 0) {
    const known = PAGES.map((page) => (page.slug ? page.slug : 'home')).join(', ');
    throw new Error(`--refresh-slug: no seeded page "${refreshSlug}" (known: ${known})`);
  }

  const { getCmsDb, cmsDriver } = await import('@/db/cms');
  const orm = await import('drizzle-orm');
  const { and, eq } = orm;
  const schema = await import('@/db/cms-schema');
  const { cmsNavigation, cmsPages, cmsRedirects, cmsSiteSettings, DEFAULT_LOCALE } = schema;

  log('→', `driver: ${cmsDriver()}`);
  const db = await getCmsDb();
  const locale = DEFAULT_LOCALE;

  // --- 1. An actor, and a real session for it ------------------------------
  // The oldest active admin who has chosen their own password and enrolled
  // two-step verification; nobody else could write (`scripts/lib/cms-actor.mts`).
  const { createSession, revokeSession } = await import('@/lib/cms/session');
  const actor = await findActingAdmin({ db, orm, schema });
  if (!actor) {
    throw new Error(
      'no active admin in this database; run cms:bootstrap first, then sign in once at ' +
        '/admin, choose a new password and set up two-step verification',
    );
  }
  log('=', `publishing as ${actor.email}`);

  // The operator's database access is the authentication (scripts/lib/cms-actor.mts).
  const session = await createSession(
    db,
    actor.id,
    { userAgent: 'cms-seed' },
    { mfaVerified: true },
  );
  cookieJar.set('cms_session', session.token);

  try {
    const repo = await import('@/lib/cms/repo');

    if (refreshing) {
      log('=', 'settings, menus and redirects left untouched (--refresh-slug)');
    }

    // --- 2. Site settings (create only; never overwrite an operator) -------
    for (const [key, value] of refreshing ? [] : Object.entries(DEFAULT_SETTINGS)) {
      const [existing] = await db
        .select({ key: cmsSiteSettings.key })
        .from(cmsSiteSettings)
        .where(and(eq(cmsSiteSettings.locale, locale), eq(cmsSiteSettings.key, key)))
        .limit(1);

      if (existing) {
        log('=', `setting ${locale}/${key} already set — left untouched`);
        continue;
      }
      const result = await repo.updateSiteSetting(
        locale,
        key as Parameters<typeof repo.updateSiteSetting>[1],
        value,
      );
      if (!result.ok) throw new Error(`setting ${key}: ${result.message}`);
      log('+', `setting ${locale}/${key} created`);
    }

    // --- 3. Navigation ----------------------------------------------------
    const menus = [
      ['main', MAIN_MENU],
      ['footer', FOOTER_MENU],
    ] as const;
    for (const [menuKey, items] of refreshing ? [] : menus) {
      const [existing] = await db
        .select({ items: cmsNavigation.items })
        .from(cmsNavigation)
        .where(and(eq(cmsNavigation.locale, locale), eq(cmsNavigation.menuKey, menuKey)))
        .limit(1);

      const populated = Array.isArray(existing?.items) && existing.items.length > 0;
      if (populated && onlyMissing) {
        log('=', `menu ${locale}/${menuKey} already has items — skipped (--only-missing)`);
        continue;
      }

      const result = await repo.updateNavigation(locale, menuKey, items);
      if (!result.ok) throw new Error(`menu ${menuKey}: ${result.message}`);
      log(populated ? '~' : '+', `menu ${locale}/${menuKey} — ${items.length} items`);
    }

    // --- 4. Pages ---------------------------------------------------------
    for (const spec of pages) {
      const path = spec.slug ? `/${spec.slug}` : '/';

      const [existing] = await db
        .select({ id: cmsPages.id, status: cmsPages.status })
        .from(cmsPages)
        .where(and(eq(cmsPages.locale, locale), eq(cmsPages.slug, spec.slug)))
        .limit(1);

      if (existing && onlyMissing) {
        log('=', `page ${path} exists — skipped (--only-missing)`);
        continue;
      }

      let pageId: string;
      if (existing) {
        pageId = existing.id;
      } else {
        const created = await repo.createPage({
          locale,
          slug: spec.slug,
          title: spec.title,
          translationGroup: spec.translationGroup,
        });
        if (!created.ok) throw new Error(`page ${path}: ${created.message}`);
        pageId = created.data.id;
      }

      if (refreshing && existing) {
        // Only the blocks are the seed's business on a refresh; the title and
        // SEO fields may have been edited on that environment since.
        log('=', `page ${path} — title and SEO fields left untouched (--refresh-slug)`);
      } else {
        const updated = await repo.updatePage(pageId, {
          slug: spec.slug,
          title: spec.title,
          translationGroup: spec.translationGroup,
          metaTitle: spec.metaTitle,
          metaDescription: spec.metaDescription,
          structuredDataType: spec.structuredDataType,
          noIndex: false,
        });
        if (!updated.ok) throw new Error(`page ${path}: ${updated.message}`);
      }

      // Replace the draft blocks with the seed definition, in order.
      const current = await repo.getPageForEdit(pageId);
      for (const block of current?.blocks ?? []) {
        const removed = await repo.deleteBlock(block.id);
        if (!removed.ok) throw new Error(`page ${path}: ${removed.message}`);
      }
      for (const blockSpec of spec.blocks) {
        const added = await repo.addBlock(
          pageId,
          blockSpec.type as Parameters<typeof repo.addBlock>[1],
        );
        if (!added.ok) throw new Error(`page ${path} (${blockSpec.type}): ${added.message}`);
        const written = await repo.updateBlock(added.data.id, blockSpec.data);
        if (!written.ok) throw new Error(`page ${path} (${blockSpec.type}): ${written.message}`);
      }

      const published = await repo.publishPage(pageId);
      if (!published.ok) throw new Error(`page ${path}: ${published.message}`);

      log(
        existing ? '~' : '+',
        `page ${path} — ${spec.blocks.length} blocks, published  [${spec.source}]`,
      );
    }

    // --- 5. Redirects -----------------------------------------------------
    for (const redirect of refreshing ? [] : REDIRECTS) {
      const [existing] = await db
        .select({ id: cmsRedirects.id })
        .from(cmsRedirects)
        .where(eq(cmsRedirects.fromPath, redirect.fromPath))
        .limit(1);

      if (existing) {
        log('=', `redirect ${redirect.fromPath} already exists — left untouched`);
        continue;
      }
      const result = await repo.createRedirect(redirect);
      if (!result.ok) throw new Error(`redirect ${redirect.fromPath}: ${result.message}`);
      log('+', `redirect ${redirect.fromPath} → ${redirect.toPath} (${redirect.statusCode})`);
    }
  } finally {
    // The seed session exists only for the duration of this script.
    await revokeSession(db, session.token);
    cookieJar.clear();
  }

  console.log('');
  log(
    '✓',
    refreshing
      ? `refresh complete — /${refreshSlug} re-seeded and published in ${locale}`
      : `seed complete — ${pages.length} pages published in ${locale}`,
  );
  console.log('  Indexing stays off until seo.allowIndexing is switched on in /admin.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ seed failed');
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
