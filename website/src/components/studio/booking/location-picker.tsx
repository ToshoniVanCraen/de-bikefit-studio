import { locationAddressLines, toggleLocation } from './location-choice';
import type { BookingLocationOption } from './types';

/**
 * Where the fit will be (20 Oct 2026), at the top of "Kies een dag en uur".
 * One place: named, with its address from Beheer → Locaties. Several: a row
 * of toggles ("Alle locaties" or any combination) that narrows the free
 * moments to those places, with the address of each chosen place underneath.
 * Pure markup; the selection lives in the widget (`location-choice.ts`).
 */
export function LocationPicker({
  locations,
  selected,
  onSelect,
}: {
  /** The places a fit for the chosen service may be at. */
  locations: BookingLocationOption[];
  /** Chosen place ids, or `null` for every place. */
  selected: string[] | null;
  onSelect: (next: string[] | null) => void;
}) {
  if (locations.length === 0) return null;

  if (locations.length === 1) {
    const [location] = locations;
    return (
      <div className="studio-booking__where">
        <p className="studio-booking__where-title">
          Je boekt voor <strong>{location.label}</strong>.
        </p>
        <AddressLines location={location} />
      </div>
    );
  }

  const shown = selected
    ? locations.filter((location) => selected.includes(location.id))
    : locations;

  return (
    <div className="studio-booking__where">
      <p className="studio-booking__where-title">Waar wil je langskomen?</p>
      <div className="studio-booking__chips" role="group" aria-label="Locatie">
        <button
          type="button"
          className="studio-booking__chip"
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          Alle locaties
        </button>
        {locations.map((location) => (
          <button
            key={location.id}
            type="button"
            className="studio-booking__chip"
            aria-pressed={selected !== null && selected.includes(location.id)}
            onClick={() => onSelect(toggleLocation(selected, location.id, locations))}
          >
            {location.label}
          </button>
        ))}
      </div>
      <div className="studio-booking__where-list">
        {shown.map((location) => (
          <div key={location.id}>
            <strong>{location.label}</strong>
            <AddressLines location={location} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AddressLines({ location }: { location: BookingLocationOption }) {
  const lines = locationAddressLines(location);
  if (lines.length === 0) return null;
  return (
    <address>
      {lines.map((line, index) => (
        <span key={index} className="studio-booking__where-line">
          {line}
        </span>
      ))}
    </address>
  );
}
