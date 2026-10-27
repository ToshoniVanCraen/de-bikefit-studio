import { z } from 'zod';
import { formatPrice } from '@/lib/booking/format';
import { GIFT_VOUCHER_MAX_CENTS, GIFT_VOUCHER_MIN_CENTS } from './order';

/**
 * The suggested amounts on `/cadeaubon` ("vaste bedragen", Toshoni, 27 Oct 2026):
 * a few amounts the visitor can pick with one click, next to "Ander bedrag" with
 * the free amount field. Pure (zod and the price formatter only), so the block
 * schema (`cms/blocks-aanbod.ts`), the order form and the seed share one shape.
 *
 * A suggestion is a UI convenience, never a rule: choosing one only fills the
 * amount field, and the order is validated exactly as before
 * (`validateGiftVoucherOrder`, on the client and on the server).
 */

/** More than this does not fit on one row of the form, and nobody needs more. */
export const GIFT_VOUCHER_MAX_SUGGESTED_AMOUNTS = 6;

const RANGE_MESSAGE = `Een voorgesteld bedrag ligt tussen ${formatPrice(GIFT_VOUCHER_MIN_CENTS)} en ${formatPrice(GIFT_VOUCHER_MAX_CENTS)}.`;

/** One suggestion: the amount in cents and an optional short caption ("Volledige bikefit"). */
export const giftVoucherAmountSchema = z.object({
  cents: z
    .number()
    .int('Een voorgesteld bedrag is een geheel aantal eurocent.')
    .min(GIFT_VOUCHER_MIN_CENTS, RANGE_MESSAGE)
    .max(GIFT_VOUCHER_MAX_CENTS, RANGE_MESSAGE),
  caption: z.string().trim().max(40, 'Een bijschrift telt maximaal 40 tekens.').default(''),
});

export type GiftVoucherAmount = z.infer<typeof giftVoucherAmountSchema>;

/** The list as an editor saves it: at most six, each amount once. An empty list is allowed (free amount only). */
export const giftVoucherAmountsSchema = z
  .array(giftVoucherAmountSchema)
  .max(
    GIFT_VOUCHER_MAX_SUGGESTED_AMOUNTS,
    `Maximaal ${GIFT_VOUCHER_MAX_SUGGESTED_AMOUNTS} voorgestelde bedragen.`,
  )
  .refine(
    (amounts) => new Set(amounts.map((amount) => amount.cents)).size === amounts.length,
    'Elk voorgesteld bedrag mag maar één keer voorkomen.',
  );

/**
 * What the page shows until an editor changes it (Toshoni, 27 Oct 2026). The
 * block schema applies these to content saved before the field existed, so the
 * live page picks them up without a data change.
 */
export const GIFT_VOUCHER_DEFAULT_AMOUNTS: readonly GiftVoucherAmount[] = [
  { cents: 7500, caption: '' },
  { cents: 15000, caption: '' },
  { cents: 27500, caption: 'Volledige bikefit' },
];

/**
 * How long a voucher is valid (one year after purchase, Toshoni, 27 Oct 2026); the
 * block's default `validityNote`. The period is the copy token `{{cadeaubon-geldigheid}}`
 * ("een jaar"), resolved on the public site from the master, so the sentence never types it.
 */
export const GIFT_VOUCHER_VALIDITY_NOTE =
  'Een cadeaubon is {{cadeaubon-geldigheid}} geldig na aankoop.';

/** The choice that reveals the free amount field. */
export const GIFT_VOUCHER_OTHER_AMOUNT = 'other';

/** The form's choice value of a suggestion; never equal to {@link GIFT_VOUCHER_OTHER_AMOUNT}. */
export function amountChoiceKey(cents: number): string {
  return String(cents);
}

/**
 * Cents → what the amount field holds once a suggestion is chosen, in the
 * notation the field is documented to take: `7500` → `'75'`, `7550` → `'75,50'`.
 * `parseEuroAmountToCents` reads it back to the same cents.
 */
export function formatAmountInput(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
}
