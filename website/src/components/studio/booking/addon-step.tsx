import { useId } from 'react';
import {
  addonMetaLabel,
  addonTotals,
  totalsLabel,
  type BookingAddonOption,
} from '@/lib/offers/addons';

/**
 * Step "Extra's" (20 Oct 2026) — the extras Beheer → Aanbod lists for the
 * chosen offering, as checkboxes with what each adds in time and money, a
 * running total, and one button to go on (with or without extras). Only
 * shown when the chosen service has extras; the widget derives the step.
 */
export function AddonStep({
  options,
  selectedIds,
  base,
  onToggle,
  onConfirm,
}: {
  options: BookingAddonOption[];
  selectedIds: string[];
  /** The chosen service: its duration and (variant) price. */
  base: { name: string; durationMinutes: number; priceCents: number | null };
  onToggle: (offeringId: string) => void;
  onConfirm: () => void;
}) {
  const baseId = useId();
  const chosen = options.filter((option) => selectedIds.includes(option.offeringId));
  const totals = addonTotals(base, chosen);

  return (
    <div className="studio-booking__addon-step">
      <p className="studio-booking__hint studio-booking__hint--lead">
        Wil je er iets bij? Je afspraak wordt dan langer en we rekenen het erbij.
      </p>
      <ul className="studio-booking__addons" aria-label="Extra’s">
        {options.map((option) => {
          const checked = selectedIds.includes(option.offeringId);
          const inputId = `${baseId}-${option.offeringId}`;
          return (
            <li key={option.offeringId}>
              <label className="studio-booking__addon" htmlFor={inputId} data-checked={checked}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(option.offeringId)}
                />
                <span>
                  <span className="studio-booking__addon-title">{option.title}</span>
                  <span className="studio-booking__addon-meta">{addonMetaLabel(option)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="studio-booking__total" role="status">
        {chosen.length === 0 ? `${base.name}: ` : ''}
        {totalsLabel(totals)}
      </p>
      <p className="studio-booking__actions">
        <button type="button" className="studio-btn studio-btn--primary" onClick={onConfirm}>
          {chosen.length === 0 ? 'Verder zonder extra’s' : 'Verder'}
        </button>
      </p>
    </div>
  );
}
