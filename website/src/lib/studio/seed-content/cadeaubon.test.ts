import { describe, expect, it } from 'vitest';
import { validateBlock } from '@/lib/cms/blocks';
import {
  GIFT_VOUCHER_DEFAULT_AMOUNTS,
  GIFT_VOUCHER_VALIDITY_NOTE,
} from '@/lib/gift-voucher/amounts';
import { GIFT_VOUCHER_PAGE_SLUG, GIFT_VOUCHER_SUBMIT_LABEL } from '@/lib/gift-voucher/order';
import { AANBOD_PAGES } from './aanbod';
import { CADEAUBON_CARD, CADEAUBON_PAGE, CADEAUBON_PATH } from './cadeaubon';

describe('cadeaubon page (seed)', () => {
  it('lives at /cadeaubon with exactly one valid gift voucher block', () => {
    expect(GIFT_VOUCHER_PAGE_SLUG).toBe('cadeaubon');
    expect(CADEAUBON_PAGE.slug).toBe(GIFT_VOUCHER_PAGE_SLUG);
    expect(CADEAUBON_PATH).toBe('/cadeaubon');
    expect(CADEAUBON_PAGE.blocks.map((block) => block.type)).toEqual(['giftVoucher']);
    for (const block of CADEAUBON_PAGE.blocks)
      expect(validateBlock(block.type, block.data).ok).toBe(true);
  });

  it('is the one extra card under Overige on /aanbod, priced "Bedrag naar keuze", nowhere else', () => {
    expect(CADEAUBON_CARD).toEqual({
      category: 'overige',
      title: 'Cadeaubon',
      summary:
        'Fietsplezier cadeau doen, met € 75, € 150 of € 275. Geldig {{cadeaubon-geldigheid}} na aankoop.',
      priceLabel: 'Bedrag naar keuze',
      href: '/cadeaubon',
    });
    const cards = (page: (typeof AANBOD_PAGES)[number]) =>
      page.blocks
        .filter((block) => block.type === 'offerCatalogue')
        .flatMap((block) => (block.data.extraCards as { href: string }[] | undefined) ?? []);
    expect(cards(AANBOD_PAGES.find((entry) => entry.slug === 'aanbod')!)).toEqual([CADEAUBON_CARD]);
    for (const page of AANBOD_PAGES.filter((entry) => entry.slug !== 'aanbod')) {
      expect(cards(page)).toEqual([]);
    }
  });

  it('suggests € 75, € 150 and € 275 and says a voucher is valid for one year (Toshoni, 27 Oct 2026)', () => {
    const [block] = CADEAUBON_PAGE.blocks;
    expect(block.data.amounts).toEqual(GIFT_VOUCHER_DEFAULT_AMOUNTS);
    expect(block.data.validityNote).toBe(GIFT_VOUCHER_VALIDITY_NOTE);
    // The period is the copy token (it resolves to "een jaar"), never typed; the amounts are block data.
    expect(GIFT_VOUCHER_VALIDITY_NOTE).toBe(
      'Een cadeaubon is {{cadeaubon-geldigheid}} geldig na aankoop.',
    );
    expect(CADEAUBON_PAGE.metaDescription).toContain('Geldig {{cadeaubon-geldigheid}} na aankoop.');
    expect(CADEAUBON_CARD.summary).toContain('Geldig {{cadeaubon-geldigheid}} na aankoop.');
    for (const text of [CADEAUBON_PAGE.metaDescription, CADEAUBON_CARD.summary]) {
      for (const amount of ['€ 75', '€ 150', '€ 275']) expect(text).toContain(amount);
      expect(text).not.toMatch(/een jaar/i);
    }
  });

  it('still states no terms, payment method, refund or minimum (not decided)', () => {
    const text = JSON.stringify(CADEAUBON_PAGE).toLowerCase();
    for (const word of [
      'voorwaarde',
      'maand',
      'minimum',
      'bancontact',
      'overschrijving',
      'terugbetaal',
    ]) {
      expect(text).not.toContain(word);
    }
    expect(GIFT_VOUCHER_SUBMIT_LABEL).toBe('Bestel nu');
  });
});
