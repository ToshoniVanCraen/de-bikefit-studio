import { describe, expect, it } from 'vitest';
import {
  GIFT_VOUCHER_DEFAULT_AMOUNTS,
  GIFT_VOUCHER_VALIDITY_NOTE,
} from '@/lib/gift-voucher/amounts';
import { defaultDataFor, parsePublishedSnapshot, validateBlock } from './blocks';
import { giftVoucherSchema } from './blocks-aanbod';

/**
 * The `giftVoucher` block gained `amounts` and `validityNote` on 27 Oct 2026
 * (Toshoni). Both default in the schema, so content saved before that day shows
 * them without a data change; the editor can still empty either one.
 */

/** The block as every database holds it today: what `cms:seed` wrote on 13 Oct 2026. */
const LEGACY = {
  sortOrder: 0,
  eyebrow: 'Aanbod',
  title: 'Cadeaubon',
  summary: 'Fietsplezier cadeau doen, met een bedrag en een boodschap naar keuze.',
  intro: 'Geef iemand fietsplezier cadeau.',
  formTitle: 'Bestel je cadeaubon',
  sentTitle: 'Je bestelling is verstuurd',
  sentText: '',
};

function parse(data: unknown) {
  const result = giftVoucherSchema.safeParse(data);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
}

describe('giftVoucher block: content saved before 27 Oct 2026', () => {
  it('gets the three suggested amounts and the validity line from the schema', () => {
    const data = parse(LEGACY);
    expect(data.amounts).toEqual([
      { cents: 7500, caption: '' },
      { cents: 15000, caption: '' },
      { cents: 27500, caption: 'Volledige bikefit' },
    ]);
    // The length is the token of the `rules` setting, not a typed "een jaar" (27 Oct 2026).
    expect(data.validityNote).toBe(GIFT_VOUCHER_VALIDITY_NOTE);
    expect(data.validityNote).toContain('{{cadeaubon-geldigheid}}');
  });

  it('keeps every other field exactly as saved', () => {
    expect(parse(LEGACY)).toMatchObject(LEGACY);
  });

  it('reaches the public page through the published snapshot, which is what the site reads', () => {
    const snapshot = parsePublishedSnapshot({
      version: 1,
      locale: 'nl',
      slug: 'cadeaubon',
      translationGroup: 'offer-cadeaubon',
      title: 'Cadeaubon',
      kind: 'default',
      publishedAt: '2026-10-13T09:00:00.000Z',
      seo: {},
      blocks: [{ id: 'voucher', type: 'giftVoucher', data: LEGACY }],
    });
    const block = snapshot?.blocks[0];
    expect(block?.type).toBe('giftVoucher');
    expect(block?.type === 'giftVoucher' && block.data.amounts.map((a) => a.cents)).toEqual([
      7500, 15000, 27500,
    ]);
    expect(block?.type === 'giftVoucher' && block.data.validityNote).toBe(
      GIFT_VOUCHER_VALIDITY_NOTE,
    );
  });

  it('gets its own copy of the amounts each time, so nothing can edit the defaults', () => {
    const first = parse(LEGACY);
    first.amounts.push({ cents: 1000, caption: '' });
    first.amounts[0].caption = 'veranderd';
    expect(parse(LEGACY).amounts).toEqual(GIFT_VOUCHER_DEFAULT_AMOUNTS);
    expect(GIFT_VOUCHER_DEFAULT_AMOUNTS[0].caption).toBe('');
  });
});

describe('giftVoucher block: what an editor saves', () => {
  it('keeps edited amounts, in the order given', () => {
    const data = parse({
      ...LEGACY,
      amounts: [
        { cents: 5000, caption: 'Een eerste kennismaking' },
        { cents: 7500, caption: '' },
      ],
    });
    expect(data.amounts).toEqual([
      { cents: 5000, caption: 'Een eerste kennismaking' },
      { cents: 7500, caption: '' },
    ]);
  });

  it('keeps an emptied list and an emptied validity line empty, never putting the defaults back', () => {
    const data = parse({ ...LEGACY, amounts: [], validityNote: '' });
    expect(data.amounts).toEqual([]);
    expect(data.validityNote).toBe('');
  });

  it('refuses an amount outside € 1 to € 5.000, with a Dutch message that names the field', () => {
    const result = validateBlock('giftVoucher', {
      ...LEGACY,
      amounts: [{ cents: 0, caption: '' }],
    });
    expect(result.ok).toBe(false);
    const message = result.ok ? '' : result.message.replace(/\s/g, ' ');
    expect(message).toBe(
      'amounts.0.cents: Een voorgesteld bedrag ligt tussen € 1,00 en € 5.000,00.',
    );
  });

  it('refuses seven amounts and the same amount twice', () => {
    const seven = Array.from({ length: 7 }, (_, index) => ({
      cents: (index + 1) * 100,
      caption: '',
    }));
    expect(validateBlock('giftVoucher', { ...LEGACY, amounts: seven }).ok).toBe(false);
    const twice = [
      { cents: 7500, caption: '' },
      { cents: 7500, caption: 'Nog eens' },
    ];
    const result = validateBlock('giftVoucher', { ...LEGACY, amounts: twice });
    expect(result.ok ? '' : result.message).toContain('maar één keer');
  });
});

describe('giftVoucher block: "add this block"', () => {
  it('starts with the suggested amounts and the validity line, and passes its own schema', () => {
    const data = defaultDataFor('giftVoucher');
    expect(data.amounts).toEqual(GIFT_VOUCHER_DEFAULT_AMOUNTS);
    expect(data.validityNote).toBe(GIFT_VOUCHER_VALIDITY_NOTE);
    expect(validateBlock('giftVoucher', data).ok).toBe(true);
  });
});
