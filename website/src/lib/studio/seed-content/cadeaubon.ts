import {
  GIFT_VOUCHER_DEFAULT_AMOUNTS,
  GIFT_VOUCHER_VALIDITY_NOTE,
} from '@/lib/gift-voucher/amounts';
import { GIFT_VOUCHER_PAGE_SLUG } from '@/lib/gift-voucher/order';
import { GIFT_VOUCHER_PRICE_LABEL } from '@/lib/offers/catalogue';
import type { SeedPage } from './shared';

/**
 * The gift voucher ("Cadeaubon", Toshoni, 13 Oct 2026): the page `/cadeaubon`
 * with its order form, and its card under "Overige" on `/aanbod` (an
 * `extraCards` entry of that page's catalogue block, `aanbod.ts`). Plain data,
 * no I/O. Until 17 Oct 2026 the page lived at `/aanbod/cadeaubon`; that path
 * redirects (`navigation.ts`, applied by `cms:migrate-aanbod`).
 *
 * Used by `npm run cms:seed` (fresh databases) and by `cms:migrate-aanbod`.
 * What the year-end promotion of 27 Oct 2026 changed on an existing database
 * (main menu item, home section, the texts below) is `cadeaubon-promo.ts`.
 *
 * COPY PROVENANCE: the request itself (custom amount, personal text, contact
 * details, "Bestel nu" e-mails the studio, invoice and payment link made by
 * hand). Toshoni, 27 Oct 2026, for the year-end period: three suggested
 * amounts (€ 75, € 150 and € 275 "Volledige bikefit") next to "Ander bedrag",
 * and "een jaar geldig na aankoop". Terms, a minimum amount, delivery and the
 * form of the voucher are still not stated: the studio has not decided those.
 * The three amounts are the block's own data and stay literal in the texts that
 * name them; the validity is the token `{{cadeaubon-geldigheid}}` everywhere it is said.
 */

export const CADEAUBON_PATH = `/${GIFT_VOUCHER_PAGE_SLUG}`;

/** The card on `/aanbod`, under Overige, after the offerings. */
export const CADEAUBON_CARD = {
  category: 'overige' as const,
  title: 'Cadeaubon',
  summary:
    'Fietsplezier cadeau doen, met € 75, € 150 of € 275. Geldig {{cadeaubon-geldigheid}} na aankoop.',
  priceLabel: GIFT_VOUCHER_PRICE_LABEL,
  href: CADEAUBON_PATH,
};

export const CADEAUBON_PAGE: SeedPage = {
  slug: GIFT_VOUCHER_PAGE_SLUG,
  title: 'Cadeaubon',
  translationGroup: 'offer-cadeaubon',
  source: 'work block 2026-10-13 (gift voucher request); Toshoni 27 Oct 2026 (amounts, validity)',
  metaTitle: 'Cadeaubon',
  metaDescription:
    'Bestel een cadeaubon van De Bikefit Studio: € 75, € 150 of € 275 (een volledige bikefit), of een bedrag naar keuze. Geldig {{cadeaubon-geldigheid}} na aankoop.',
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'giftVoucher',
      data: {
        sortOrder: 0,
        eyebrow: 'Aanbod',
        title: 'Cadeaubon',
        summary: CADEAUBON_CARD.summary,
        intro:
          'Geef iemand fietsplezier cadeau. Je kiest zelf het bedrag en schrijft er een persoonlijke boodschap bij. Na je bestelling sturen we je een factuur en een betaallink.',
        formTitle: 'Bestel je cadeaubon',
        sentTitle: 'Je bestelling is verstuurd',
        sentText: '',
        // Written out (the block schema would default them too) so Beheer shows them.
        amounts: GIFT_VOUCHER_DEFAULT_AMOUNTS.map((amount) => ({ ...amount })),
        validityNote: GIFT_VOUCHER_VALIDITY_NOTE,
      },
    },
  ],
};
