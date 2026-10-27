import type { ProviderChoice } from './provider-choice';
import type { BookingProviderOption } from './types';

/**
 * Step 1 — with whom. Only rendered when the provider choice is switched on
 * and more than one provider can take the chosen service
 * (`resolveProviderStep()`); with one there is nothing to choose and the
 * widget starts at the service. A specific provider narrows the next steps to
 * their own services and agenda; "Iedereen" shows every free moment and
 * leaves the choice of provider to the beheerder, who tells the customer by
 * e-mail. Name and places only: the bio stays on the team page (Toshoni,
 * 27 Oct 2026: no text on the booking page).
 */
export function ProviderPicker({
  providers,
  selected,
  onSelect,
}: {
  providers: BookingProviderOption[];
  /** `undefined` while nothing has been chosen yet. */
  selected: ProviderChoice | undefined;
  onSelect: (choice: ProviderChoice) => void;
}) {
  return (
    <div className="studio-booking__options" role="group" aria-label="Kies bij wie">
      <button
        type="button"
        className="studio-booking__option"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
      >
        <span className="studio-booking__option-title">Iedereen</span>
        <span className="studio-booking__option-body">
          Maakt niet uit: toon alle vrije momenten. Bij wie je terechtkomt, laten we je per e-mail
          weten.
        </span>
      </button>

      {providers.map((provider) => {
        const places = provider.locations.map((location) => location.label).filter(Boolean);
        return (
          <button
            key={provider.id}
            type="button"
            className="studio-booking__option"
            aria-pressed={selected === provider.id}
            onClick={() => onSelect(provider.id)}
          >
            <span className="studio-booking__option-title">{provider.name}</span>
            {places.length > 0 ? (
              <span className="studio-booking__option-meta">{places.join(' · ')}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
