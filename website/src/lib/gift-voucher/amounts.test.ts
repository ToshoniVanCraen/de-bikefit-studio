import { describe, expect, it } from 'vitest';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { buildCopyTokenLookup } from '@/lib/studio/copy-token-values';
import { resolveCopyTokensInText } from '@/lib/studio/copy-tokens';
import {
  amountChoiceKey,
  formatAmountInput,
  GIFT_VOUCHER_DEFAULT_AMOUNTS,
  GIFT_VOUCHER_MAX_SUGGESTED_AMOUNTS,
  GIFT_VOUCHER_OTHER_AMOUNT,
  GIFT_VOUCHER_VALIDITY_NOTE,
  giftVoucherAmountSchema,
  giftVoucherAmountsSchema,
} from './amounts';
import {
  GIFT_VOUCHER_MAX_CENTS,
  GIFT_VOUCHER_MIN_CENTS,
  parseEuroAmountToCents,
  validateGiftVoucherOrder,
} from './order';

const CONTACT = { name: 'An Peeters', email: 'an@example.com' };

describe('formatAmountInput', () => {
  it.each([
    [7500, '75'],
    [15000, '150'],
    [27500, '275'],
    [7550, '75,50'],
    [7505, '75,05'],
    [100, '1'],
    [99, '0,99'],
    [GIFT_VOUCHER_MAX_CENTS, '5000'],
  ])('%i cents → %j', (cents, text) => {
    expect(formatAmountInput(cents)).toBe(text);
  });

  it('is read back to the same cents by the amount parser: every amount up to € 200, then a spread up to the maximum', () => {
    const amounts = [GIFT_VOUCHER_MAX_CENTS];
    for (let cents = GIFT_VOUCHER_MIN_CENTS; cents <= 20_000; cents += 1) amounts.push(cents);
    for (let cents = 20_000; cents < GIFT_VOUCHER_MAX_CENTS; cents += 997) amounts.push(cents);
    for (const cents of amounts) {
      const text = formatAmountInput(cents);
      expect(parseEuroAmountToCents(text), `${cents} → ${text}`).toBe(cents);
    }
  });
});

describe('the suggested amounts (Toshoni, 27 Oct 2026)', () => {
  it('are € 75, € 150 and € 275 "Volledige bikefit", in that order', () => {
    expect(GIFT_VOUCHER_DEFAULT_AMOUNTS).toEqual([
      { cents: 7500, caption: '' },
      { cents: 15000, caption: '' },
      { cents: 27500, caption: 'Volledige bikefit' },
    ]);
  });

  it('pass their own schema', () => {
    expect(giftVoucherAmountsSchema.safeParse(GIFT_VOUCHER_DEFAULT_AMOUNTS).success).toBe(true);
  });

  it('fill the amount field with a value the order validation accepts as exactly that amount', () => {
    for (const { cents } of GIFT_VOUCHER_DEFAULT_AMOUNTS) {
      const check = validateGiftVoucherOrder({ ...CONTACT, amount: formatAmountInput(cents) });
      expect(check.ok && check.order.amountCents).toBe(cents);
    }
  });

  it('are never mistaken for "Ander bedrag"', () => {
    for (const { cents } of GIFT_VOUCHER_DEFAULT_AMOUNTS) {
      expect(amountChoiceKey(cents)).not.toBe(GIFT_VOUCHER_OTHER_AMOUNT);
    }
    expect(amountChoiceKey(7500)).toBe('7500');
  });

  it('the validity is one plain sentence whose length is a token, one year with the default rules', () => {
    expect(GIFT_VOUCHER_VALIDITY_NOTE).toBe(
      'Een cadeaubon is {{cadeaubon-geldigheid}} geldig na aankoop.',
    );
    const lookup = buildCopyTokenLookup({
      settings: defaultSiteSettings(),
      services: [],
      offers: [],
      studioAddress: null,
    });
    expect(resolveCopyTokensInText(GIFT_VOUCHER_VALIDITY_NOTE, lookup)).toBe(
      'Een cadeaubon is een jaar geldig na aankoop.',
    );
  });
});

describe('giftVoucherAmountSchema', () => {
  it('keeps an amount with a trimmed caption, and gives no caption an empty one', () => {
    expect(giftVoucherAmountSchema.parse({ cents: 5000, caption: '  Voor jou  ' })).toEqual({
      cents: 5000,
      caption: 'Voor jou',
    });
    expect(giftVoucherAmountSchema.parse({ cents: 5000 })).toEqual({ cents: 5000, caption: '' });
  });

  it('accepts the same range as the form: € 1 up to € 5.000', () => {
    expect(giftVoucherAmountSchema.safeParse({ cents: GIFT_VOUCHER_MIN_CENTS }).success).toBe(true);
    expect(giftVoucherAmountSchema.safeParse({ cents: GIFT_VOUCHER_MAX_CENTS }).success).toBe(true);
  });

  it.each([
    ['below € 1', { cents: GIFT_VOUCHER_MIN_CENTS - 1 }],
    ['above € 5.000', { cents: GIFT_VOUCHER_MAX_CENTS + 1 }],
    ['not whole cents', { cents: 7500.5 }],
    ['text instead of a number', { cents: '7500' }],
    ['no amount', {}],
    ['a caption over 40 characters', { cents: 7500, caption: 'x'.repeat(41) }],
  ])('refuses %s', (_label, input) => {
    expect(giftVoucherAmountSchema.safeParse(input).success).toBe(false);
  });

  it('says in Dutch what the range is, with the shared price format', () => {
    const result = giftVoucherAmountSchema.safeParse({ cents: 50 });
    const message = result.success ? '' : result.error.issues[0].message.replace(/\s/g, ' ');
    expect(message).toBe('Een voorgesteld bedrag ligt tussen € 1,00 en € 5.000,00.');
  });
});

describe('giftVoucherAmountsSchema', () => {
  const amount = (cents: number) => ({ cents, caption: '' });

  it('allows no suggestions at all (the form is then the free amount field)', () => {
    expect(giftVoucherAmountsSchema.parse([])).toEqual([]);
  });

  it('allows up to six suggestions, no more', () => {
    const six = [1, 2, 3, 4, 5, 6].map((euros) => amount(euros * 100));
    expect(GIFT_VOUCHER_MAX_SUGGESTED_AMOUNTS).toBe(6);
    expect(giftVoucherAmountsSchema.safeParse(six).success).toBe(true);
    expect(giftVoucherAmountsSchema.safeParse([...six, amount(700)]).success).toBe(false);
  });

  it('refuses the same amount twice, because a choice is identified by its amount', () => {
    const result = giftVoucherAmountsSchema.safeParse([amount(7500), amount(15000), amount(7500)]);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toBe(
      'Elk voorgesteld bedrag mag maar één keer voorkomen.',
    );
  });
});
