import { getSiteSettings } from '@/lib/cms/content';
import { LOCATION_DEFAULTS } from '@/lib/cms/blocks-location';
import { LEGAL_LINKS } from '@/lib/studio/legal';
import { studioPlace } from '@/lib/studio/location';
import { StudioLink } from '../link';
import { LocationMap } from './location-map';
import { StudioSection } from './section';
import type { BlockProps } from './types';

/**
 * `location`: where the studio is. The design's contact grid (redesign of 24
 * Nov 2026): three columns under a 1px rule, Adres, Parking (the note) and
 * Route (a plain link to plan the route), and under it, unless the editor
 * switched it off, the Google Maps map with the location pinned.
 *
 * The address is read from Instellingen → Contact (`getSiteSettings`, cached),
 * the same source as the footer, and never typed into a component or a block. A
 * studio without a street line has no place to show, so the block renders
 * nothing (no half-empty section, no pin on a town centre).
 *
 * The map is consent-gated (`LocationMap`): this server component puts no
 * Google frame in the page, only the placeholder. The client loads the frame
 * after fresh banner consent or an explicit per-view click (CLAUDE.md §4). The address, the
 * note and the route link are plain HTML next to it, so they work without
 * scripts and stay visible after the map has loaded. The route link opens
 * Google Maps in a new tab; that is the visitor's own navigation, not an embed.
 */
export async function LocationBlock({
  data,
  anchor,
  headingLevel,
  locale,
}: BlockProps<'location'>) {
  const { contact, site } = await getSiteSettings(locale);
  const place = studioPlace(contact);
  if (!place) return null;

  const note = data.note.trim();
  const routeLabel = data.routeLabel.trim() || LOCATION_DEFAULTS.routeLabel;
  const mapLabel = data.mapLabel.trim() || LOCATION_DEFAULTS.mapLabel;
  const siteName = site.name.trim();
  const mapTitle = siteName ? `Kaart: ${siteName}` : 'Kaart met de ligging van de studio';

  return (
    <StudioSection
      variant={data.variant}
      anchor={anchor}
      eyebrow={data.eyebrow}
      title={data.title}
      lede={data.intro}
      headingLevel={headingLevel}
    >
      <div
        className={data.showMap ? 'studio-location studio-location--with-map' : 'studio-location'}
      >
        <div className="studio-location__grid">
          <div className="studio-location__cell">
            <p className="studio-location__label">Adres</p>
            <address className="studio-location__address">
              {place.lines.map((line, index) => (
                <span key={`${index}-${line}`} className="studio-location__line">
                  {line}
                </span>
              ))}
              {place.postalCity ? (
                <span className="studio-location__line">{place.postalCity}</span>
              ) : null}
            </address>
          </div>
          {note ? (
            <div className="studio-location__cell">
              <p className="studio-location__label">Parking</p>
              <p className="studio-location__value">{note}</p>
            </div>
          ) : null}
          <div className="studio-location__cell">
            <p className="studio-location__label">Route</p>
            <p className="studio-location__value">
              <StudioLink href={place.routeUrl} className="studio-location__route">
                {routeLabel} <span aria-hidden="true">&rarr;</span>
                <span className="sr-only"> (opent Google Maps in een nieuw tabblad)</span>
              </StudioLink>
            </p>
          </div>
        </div>

        {data.showMap ? (
          <LocationMap
            src={place.embedUrl}
            title={mapTitle}
            buttonLabel={mapLabel}
            privacyHref={LEGAL_LINKS.privacy}
          />
        ) : null}
      </div>
    </StudioSection>
  );
}
