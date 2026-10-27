import {
  GIFT_VOUCHER_DEFAULT_AMOUNTS,
  GIFT_VOUCHER_VALIDITY_NOTE,
} from '@/lib/gift-voucher/amounts';
import { GIFT_VOUCHER_PAGE_SLUG } from '@/lib/gift-voucher/order';
import { CADEAUBON_CARD, CADEAUBON_PAGE, CADEAUBON_PATH } from './cadeaubon';
import type { PageTextGuard } from './page-cleanup';
import type { SeedBlock, SeedNavigationItem } from './shared';

/**
 * The year-end promotion of the gift voucher (Toshoni, 27 Oct 2026: "de
 * cadeaubon zit verstopt onder Overige ... in het menu en op de homepage
 * zetten, vaste bedragen voorstellen en de geldigheid vermelden") as exact,
 * guarded changes: the pure half of the data patch that brings an existing
 * database to the seeds. The seeds (`navigation.ts`, `aanbod.ts`,
 * `cadeaubon.ts`) already hold the target state, and the texts below are read
 * from them, so they cannot drift; this module adds what the seeds cannot say:
 * where a change goes in a database that holds the previous seeds, and the
 * value it expects to find there. Plain data, no I/O; the patch itself is
 * written elsewhere.
 *
 * How a patch uses {@link CADEAUBON_PROMO}:
 *
 *   menu         insert `item` into the `key` menu directly before the item
 *                labelled `before`; nothing to do when an item with that `href`
 *                is already there.
 *   home         insert `block` directly after the first block of type `after`
 *                on the page `slug` (the home page); nothing to do when the home
 *                page already has a block with the same `title`.
 *   voucherPage  on the page `slug`, in its one `blockType` block: every
 *                `blockEdits` entry must find `from` in `field` (or already `to`;
 *                any other value is an editor's change and a conflict, never
 *                overwritten); every `blockAdditions` field that is absent is
 *                added (stored content from before 27 Oct 2026 has neither, and
 *                Beheer shows an absent field empty although the public page
 *                already uses the schema default); `metaDescription` guarded the
 *                same way.
 *   aanbodCard   on the page `slug`, in the `blockType` block, the `extraCards`
 *                entry whose `href` is `cardHref`: every `edits` entry the same
 *                way as `blockEdits`.
 *
 * What the public pages show needs no patch: the block schema applies the
 * defaults of `amounts` and `validityNote` to content saved without them
 * (`parsePublishedSnapshot`), so the form, the suggested amounts and the
 * validity line are live as soon as the code is.
 */

/** One text field: the value the patch expects to find, and the one it writes. */
export type CadeaubonTextEdit = { field: string; from: string; to: string };

export type CadeaubonPromo = {
  menu: { key: 'main'; item: SeedNavigationItem; before: string };
  home: { slug: string; after: string; block: SeedBlock };
  voucherPage: {
    slug: string;
    blockType: string;
    blockEdits: readonly CadeaubonTextEdit[];
    blockAdditions: Readonly<Record<string, unknown>>;
    metaDescription: PageTextGuard;
  };
  aanbodCard: {
    slug: string;
    blockType: string;
    cardHref: string;
    edits: readonly CadeaubonTextEdit[];
  };
};

// --------------------------------------------------------- previous texts ----

/** The card text and the voucher block's `summary` as `cms:seed` and `cms:migrate-aanbod` wrote them (13 and 17 Oct 2026). */
const OLD_SUMMARY = 'Fietsplezier cadeau doen, met een bedrag en een boodschap naar keuze.';

/** The voucher page's meta description as `cms:seed` wrote it (13 Oct 2026). */
const OLD_META_DESCRIPTION =
  'Bestel een cadeaubon van De Bikefit Studio: je kiest zelf het bedrag en schrijft er een persoonlijke boodschap bij.';

// ------------------------------------------------------------- menu, home ----

/** The main-menu item; the voucher leaves "Overige" and sits next to "Contact". */
export const CADEAUBON_MENU_ITEM: SeedNavigationItem = {
  label: 'Cadeaubon',
  href: CADEAUBON_PATH,
  external: false,
  group: '',
  children: [],
};

/**
 * The home section after the offer catalogue: the accent band (`cta`), which
 * has no eyebrow, so the title says it: "Geef fietsplezier cadeau". The body
 * names the three suggested amounts and the validity; no dashes between
 * sentences (Toshoni, 27 Oct 2026).
 */
export const CADEAUBON_HOME_BLOCK: SeedBlock = {
  type: 'cta',
  data: {
    variant: 'accent',
    title: 'Geef fietsplezier cadeau',
    body: `Kies een cadeaubon van € 75 of € 150, of van € 275 voor een volledige bikefit. ${GIFT_VOUCHER_VALIDITY_NOTE}`,
    primaryCta: { label: 'Bestel een cadeaubon', href: CADEAUBON_PATH, external: false },
    secondaryCta: null,
  },
};

// -------------------------------------------------------------- the patch ----

export const CADEAUBON_PROMO: CadeaubonPromo = {
  menu: { key: 'main', item: CADEAUBON_MENU_ITEM, before: 'Contact' },
  home: { slug: '', after: 'offerCatalogue', block: CADEAUBON_HOME_BLOCK },
  voucherPage: {
    slug: GIFT_VOUCHER_PAGE_SLUG,
    blockType: 'giftVoucher',
    blockEdits: [{ field: 'summary', from: OLD_SUMMARY, to: CADEAUBON_CARD.summary }],
    blockAdditions: {
      amounts: GIFT_VOUCHER_DEFAULT_AMOUNTS.map((amount) => ({ ...amount })),
      validityNote: GIFT_VOUCHER_VALIDITY_NOTE,
    },
    metaDescription: { from: OLD_META_DESCRIPTION, to: CADEAUBON_PAGE.metaDescription },
  },
  aanbodCard: {
    slug: 'aanbod',
    blockType: 'offerCatalogue',
    cardHref: CADEAUBON_PATH,
    edits: [{ field: 'summary', from: OLD_SUMMARY, to: CADEAUBON_CARD.summary }],
  },
};
