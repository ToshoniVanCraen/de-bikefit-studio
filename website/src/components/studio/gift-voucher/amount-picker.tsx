'use client';

import { formatPrice } from '@/lib/booking/format';
import {
  GIFT_VOUCHER_OTHER_AMOUNT,
  amountChoiceKey,
  type GiftVoucherAmount,
} from '@/lib/gift-voucher/amounts';

/**
 * The amount choice of the gift voucher form (Toshoni, 27 Oct 2026): the
 * suggested amounts as radio cards, plus "Ander bedrag", which makes the form
 * show its free amount field. Native radios in a labelled group, so arrow keys,
 * grouping and the screen reader's "1 van 4" come from the browser.
 *
 * Controlled by the form (`choice` is an {@link amountChoiceKey} or
 * {@link GIFT_VOUCHER_OTHER_AMOUNT}, `''` while nothing is chosen). It only
 * reports the choice: filling the amount and validating it stay with the form
 * and the server, exactly as for a typed amount.
 */
export function AmountPicker({
  id,
  amounts,
  choice,
  error,
  onChoose,
}: {
  id: string;
  amounts: readonly GiftVoucherAmount[];
  choice: string;
  error?: string;
  onChoose: (choice: string) => void;
}) {
  const errorId = `${id}-error`;
  const options = [
    ...amounts.map((amount) => ({
      key: amountChoiceKey(amount.cents),
      title: formatPrice(amount.cents),
      caption: amount.caption,
    })),
    { key: GIFT_VOUCHER_OTHER_AMOUNT, title: 'Ander bedrag', caption: '' },
  ];

  return (
    <fieldset
      className="studio-voucher__choice"
      role="radiogroup"
      aria-required="true"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="studio-booking__label">Kies een bedrag</legend>
      <div className="studio-voucher__amounts">
        {options.map((option) => (
          <label key={option.key} className="studio-voucher__amount">
            <input
              type="radio"
              name="amountChoice"
              value={option.key}
              checked={choice === option.key}
              onChange={() => onChoose(option.key)}
              className="studio-voucher__amount-input"
            />
            <span className="studio-voucher__amount-title">{option.title}</span>
            {option.caption ? (
              <span className="studio-voucher__amount-caption">{option.caption}</span>
            ) : null}
          </label>
        ))}
      </div>
      {error ? (
        <p className="studio-booking__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
