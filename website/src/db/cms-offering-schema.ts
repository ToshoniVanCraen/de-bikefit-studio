/**
 * The offer ("Aanbod" in Beheer), created by `drizzle/0010_cms_offerings.sql`
 * and widened by `drizzle/0011_cms_offerings_content.sql`. Kept apart from
 * `./cms-schema.ts`, which is already past the file-size limit; the same
 * `cms_` prefix and conventions apply, and `drizzle.config.ts` and `./cms.ts`
 * list this file too. Architecture: docs/cms-architecture.md §14 and
 * docs/booking-architecture.md §14.
 *
 * Since 17 Oct 2026 an offering is the offer itself — there is no offer page
 * any more. One row holds, in ONE place:
 *
 *  - the copy a visitor reads on `/aanbod` and `/aanbod/<slug>` (title,
 *    summary, intro, Doel, Inhoud, Mogelijke extra's, image, category, order,
 *    the free-text Duur of an offering that is asked for, the meta description);
 *  - what an admin decides: shown on the website or not, one option or
 *    separate Volwassene/Jeugd variants, booked directly online or asked for
 *    through the enquiry form.
 *
 * `cms_offering_variants` keeps, per variant, the booking service it is booked
 * as (`cms_services`, which owns duration, buffer, guardian rule and location
 * and is written by the same admin form) and its public price in cents
 * (`null` = "Prijs op aanvraag"). Who offers a variant stays
 * `cms_provider_services` (the provider's own subscription). Bookings keep
 * referencing `cms_services` by id; nothing here touches `cms_bookings`.
 *
 * Extra's (20 Oct 2026): `is_addon` marks an offering a visitor can tick when
 * booking another offering that lists it in `cms_offering_addons` (its
 * `addon_minutes` and its variant price are added); `sold_alone = false`
 * makes it an extra only (never booked or asked for on its own).
 * `cms_booking_addons` keeps, per booking, a snapshot of the extras ticked
 * (title, minutes, price), so later edits in Beheer → Aanbod never change
 * what was booked. Migration 0015.
 *
 * `page_id` is the offer page an offering was derived from before 17 Oct 2026;
 * it is nullable, unused by the app and only read by `cms:migrate-aanbod`.
 *
 * Closed sets (`category`, `booking_mode`, `variant_mode`, `audience`) are
 * `text`, validated by zod in `src/lib/offers/*`, like every other closed set
 * in the CMS except `cms_role`.
 */
import {
  integer,
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { cmsBookings, cmsPages, cmsServices, cmsUsers, DEFAULT_LOCALE } from './cms-schema';

/** The shape of `src/lib/cms/block-primitives.ts` `CmsImageRef`, kept structural here. */
export type CmsOfferingImage = {
  mediaId: string | null;
  url: string | null;
  alt: string;
  decorative: boolean;
};

export const cmsOfferings = pgTable(
  'cms_offerings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    locale: text('locale').default(DEFAULT_LOCALE).notNull(),
    /** Last URL segment of `/aanbod/<slug>`; also what `?dienst=` carries. */
    slug: text('slug').default('').notNull(),
    /** `bikefit` | `begeleiding` | `overige` (overview order). */
    category: text('category').default('bikefit').notNull(),
    /** Position inside its category on every overview (lower first). */
    sortOrder: integer('sort_order').default(0).notNull(),
    title: text('title').default('').notNull(),
    /** One or two sentences for the overview card; empty = the intro. */
    summary: text('summary').default('').notNull(),
    intro: text('intro').default('').notNull(),
    /** Doel */
    goal: text('goal').default('').notNull(),
    /** Inhoud — one item per entry. */
    contents: jsonb('contents').$type<string[]>().default([]).notNull(),
    /** Mogelijke extra's — one item per entry. */
    extras: jsonb('extras').$type<string[]>().default([]).notNull(),
    extrasNote: text('extras_note').default('').notNull(),
    /** Free-text Duur, public only for an offering that is asked for; '' = "Duur in overleg". */
    duration: text('duration').default('').notNull(),
    /** Text of the booking button; '' = the default label. */
    ctaLabel: text('cta_label').default('').notNull(),
    image: jsonb('image').$type<CmsOfferingImage | null>(),
    metaDescription: text('meta_description').default('').notNull(),
    /** Legacy: the offer page this offering came from (migration only). */
    pageId: text('page_id').references(() => cmsPages.id, { onDelete: 'cascade' }),
    /** "Tonen op de website": listed in the overviews, its page served, bookable. */
    isListed: boolean('is_listed').default(true).notNull(),
    /** `direct` (online booking) | `enquiry` (the enquiry form on the offer page). */
    bookingMode: text('booking_mode').default('enquiry').notNull(),
    /** `single` (one option) | `audience` (Volwassene and Jeugd apart). */
    variantMode: text('variant_mode').default('single').notNull(),
    /** Can be ticked as an extra when booking an offering that lists it (needs `addonMinutes` and a price). */
    isAddon: boolean('is_addon').default(false).notNull(),
    /** Booked or asked for on its own; `false` = only as an extra (then `isAddon` holds). */
    soldAlone: boolean('sold_alone').default(true).notNull(),
    /** Minutes an extra adds to the appointment; `null` unless `isAddon`. */
    addonMinutes: integer('addon_minutes'),
    updatedBy: text('updated_by').references(() => cmsUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('cms_offerings_page_id_key').on(t.pageId),
    uniqueIndex('cms_offerings_locale_slug_key').on(t.locale, t.slug),
  ],
);

export const cmsOfferingVariants = pgTable(
  'cms_offering_variants',
  {
    offeringId: text('offering_id')
      .notNull()
      .references(() => cmsOfferings.id, { onDelete: 'cascade' }),
    /** `all` (single option) | `adult` (Volwassene) | `youth` (Jeugd). */
    audience: text('audience').notNull(),
    /** The booking service this variant is booked as; `null` = none (enquiry only). */
    serviceId: text('service_id').references(() => cmsServices.id, { onDelete: 'set null' }),
    /** Public price in euro cents; `null` = "Prijs op aanvraag". Never 0. */
    priceCents: integer('price_cents'),
  },
  (t) => [
    primaryKey({ columns: [t.offeringId, t.audience] }),
    index('cms_offering_variants_service_idx').on(t.serviceId),
  ],
);

export type CmsOffering = typeof cmsOfferings.$inferSelect;
export type NewCmsOffering = typeof cmsOfferings.$inferInsert;
export type CmsOfferingVariant = typeof cmsOfferingVariants.$inferSelect;

/** "Extra's bij dit aanbod": which extras a visitor may add when booking `offering_id`. */
export const cmsOfferingAddons = pgTable(
  'cms_offering_addons',
  {
    offeringId: text('offering_id')
      .notNull()
      .references(() => cmsOfferings.id, { onDelete: 'cascade' }),
    /** The extra (an offering with `is_addon`). */
    addonId: text('addon_id')
      .notNull()
      .references(() => cmsOfferings.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.offeringId, t.addonId] }),
    index('cms_offering_addons_addon_idx').on(t.addonId),
  ],
);

/** The extras a booking was made with: a snapshot, never re-read from the offering. */
export const cmsBookingAddons = pgTable(
  'cms_booking_addons',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    bookingId: text('booking_id')
      .notNull()
      .references(() => cmsBookings.id, { onDelete: 'cascade' }),
    /** The extra's offering at booking time; null once that offering is deleted. */
    offeringId: text('offering_id').references(() => cmsOfferings.id, { onDelete: 'set null' }),
    slug: text('slug').default('').notNull(),
    title: text('title').notNull(),
    /** Minutes added to the appointment (already inside `cms_bookings.ends_at`). */
    minutes: integer('minutes').notNull(),
    priceCents: integer('price_cents'),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (t) => [index('cms_booking_addons_booking_idx').on(t.bookingId)],
);

export type CmsOfferingAddon = typeof cmsOfferingAddons.$inferSelect;
export type CmsBookingAddon = typeof cmsBookingAddons.$inferSelect;
