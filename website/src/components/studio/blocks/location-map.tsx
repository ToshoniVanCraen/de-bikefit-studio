'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { readConsent, subscribeConsent } from '@/lib/analytics/consent';
import { StudioLink } from '../link';

/**
 * The map of the `location` block, consent-first with a per-view alternative.
 *
 * A Google Maps frame sets Google cookies and hands Google the visitor's IP
 * address the moment it loads, and CLAUDE.md §4 allows no non-essential script
 * or cookie before consent. So the server renders only a placeholder: a short
 * notice that the map comes from Google Maps, and a button. The iframe is not in
 * the server HTML. It mounts only after version-2 cookie consent or a direct
 * press of the map button. The press is an explicit, informed choice for this
 * view and is not remembered separately. Rejection or no choice keeps the
 * notice and button. Legacy Analytics-only cookie choices do not load Maps.
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
  /** The Google Maps embed URL; used only after banner consent or a map click. */
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
  const cookieConsent = useSyncExternalStore(subscribeConsent, readConsent, () => null);

  useEffect(() => {
    if (loaded) frameRef.current?.focus();
  }, [loaded]);

  if (loaded || cookieConsent === 'granted') {
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
