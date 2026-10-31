import { z } from 'zod';
import { eyebrow, sectionVariantSchema } from './block-primitives';

/**
 * Block type for the studio's location ("Locatie"), added on 27 Oct 2026 at
 * Toshoni's request: a section on `/afspraak` with the exact address, a line
 * about parking and a small Google Maps map with the location pinned.
 * Registered in `blockRegistry` (`blocks.ts`) through
 * {@link locationBlockRegistry}; kept in its own module because `blocks.ts` is
 * already past the size limit (docs/engineering-best-practices.md S1). Plain
 * module (zod only, no I/O), like `blocks-aanbod.ts`.
 *
 * The block owns copy only. The address is deliberately NOT a field: it is
 * read from Instellingen → Contact (`siteSettingSchemas.contact`, which the
 * footer and the JSON-LD postal address read as well), so it is edited in one
 * place. Without address lines the block renders nothing (`studio/location.ts`).
 *
 * The map is a two-click embed (`components/studio/blocks/location-map.tsx`):
 * nothing is requested from Google until the visitor presses the button,
 * because the frame sets Google cookies (CLAUDE.md §4). `note` is a free line
 * under the address ("Parking beschikbaar voor de deur.", Toshoni, 27 Oct
 * 2026); an empty note shows nothing.
 *
 * The seed instance for `/afspraak` and the values for an existing database
 * live in `studio/seed-content/location-section.ts`.
 */

/** The copy a new block starts with; the renderer falls back to the labels when an editor empties them. */
export const LOCATION_DEFAULTS = {
  title: 'Waar vind je ons?',
  note: 'Parking beschikbaar voor de deur.',
  mapLabel: 'Kaart tonen',
  routeLabel: 'Route plannen',
} as const;

export const locationSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(LOCATION_DEFAULTS.title),
  intro: z.string().default(''),
  /** Under the address, e.g. parking; empty = nothing. */
  note: z.string().default(LOCATION_DEFAULTS.note),
  /** Off = address and route link only; no map, no Google request at all. */
  showMap: z.boolean().default(true),
  /** The button that loads the map. */
  mapLabel: z.string().default(LOCATION_DEFAULTS.mapLabel),
  /** The plain link to Google Maps. */
  routeLabel: z.string().default(LOCATION_DEFAULTS.routeLabel),
});

export const locationBlockRegistry = {
  location: {
    label: 'Locatie',
    description:
      'Het adres uit Instellingen → Contact, een opmerking (bv. parking), een kaart van Google Maps die pas laadt na een klik van de bezoeker en een link om de route te plannen.',
    editorHint:
      'Het adres komt uit Instellingen → Contact, dezelfde plaats als de footer: pas het daar aan. Zonder adresregels toont dit blok niets. De kaart laadt na toestemming in de cookiebanner, of nadat de bezoeker zelf op de knop klikt. Google kan dan cookies plaatsen. De opmerking onder het adres mag leeg blijven.',
    schema: locationSchema,
    defaultData: {
      variant: 'default',
      eyebrow: 'Locatie',
      title: LOCATION_DEFAULTS.title,
      intro: '',
      note: LOCATION_DEFAULTS.note,
      showMap: true,
      mapLabel: LOCATION_DEFAULTS.mapLabel,
      routeLabel: LOCATION_DEFAULTS.routeLabel,
    },
  },
} as const;
