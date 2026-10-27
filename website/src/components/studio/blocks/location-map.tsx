'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { StudioLink } from '../link';

/**
 * The map of the `location` block, as a two-click embed.
 *
 * A Google Maps frame sets Google cookies and hands Google the visitor's IP
 * address the moment it loads, and CLAUDE.md §4 allows no non-essential script
 * or cookie before consent. So the server renders only a placeholder: a short
 * notice that the map comes from Google Maps, and a button. The iframe is not in
 * the HTML, not in the DOM and not requested until the button is pressed; the
 * press is the visitor's explicit, informed choice for this view. Nothing is
 * remembered (no cookie, no storage): the next visit asks again.
 *
 * The button disappears when the frame replaces it, so keyboard focus moves into
 * the frame instead of falling back to the page. The address and the plain
 * "Route plannen" link sit next to this component (`location.tsx`), so they stay
 * visible after the map has loaded and when scripts are off.
 *
 * `src` is the key-less embed built from the contact settings
 * (`studio/location.ts`); it is never typed in here.
 */
export function LocationMap({
  src,
  title,
  buttonLabel,
  privacyHref,
}: {
  /** The Google Maps embed URL; only used once the visitor asks for the map. */
  src: string;
  /** The frame's accessible name, e.g. "Kaart: De Bikefit Studio". */
  title: string;
  /** The button that loads the map. */
  buttonLabel: string;
  /** Where the privacy statement lives. */
  privacyHref: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const noticeId = useId();

  useEffect(() => {
    if (loaded) frameRef.current?.focus();
  }, [loaded]);

  if (loaded) {
    return (
      <div className="studio-location__map">
        <iframe
          ref={frameRef}
          className="studio-location__frame"
          src={src}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="studio-location__map studio-location__map--idle">
      <p id={noticeId} className="studio-location__privacy">
        Deze kaart komt van Google Maps. Bij het laden ontvangt Google je IP-adres en kan Google
        cookies plaatsen. <StudioLink href={privacyHref}>Lees ons privacybeleid</StudioLink>.
      </p>
      <button
        type="button"
        className="studio-btn studio-btn--primary"
        aria-describedby={noticeId}
        onClick={() => setLoaded(true)}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
