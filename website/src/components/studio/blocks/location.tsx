import { getSiteSettings } from '@/lib/cms/content';
import { LOCATION_DEFAULTS } from '@/lib/cms/blocks-location';
import { LEGAL_LINKS } from '@/lib/studio/legal';
import { studioPlace } from '@/lib/studio/location';
import { StudioButtonLink } from '../link';
import { LocationMap } from './location-map';
import { StudioSection } from './section';
import type { BlockProps } from './types';

/**
 * `location`: where the studio is. The exact address as text, a line under it
 * (parking), a plain link to plan the route and, unless the editor switched it
 * off, the Google Maps map with the location pinned.
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
        <div className="studio-location__details">
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
          {note ? <p className="studio-location__note">{note}</p> : null}
          <p className="studio-location__route">
            <StudioButtonLink
              href={place.routeUrl}
              variant={data.variant === 'dark' ? 'ghost-on-dark' : 'outline'}
            >
              {routeLabel}
              <span className="sr-only"> (opent Google Maps in een nieuw tabblad)</span>
            </StudioButtonLink>
          </p>
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
