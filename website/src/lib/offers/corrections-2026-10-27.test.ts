import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { OFFERING_PRICE_CHANGES } from './aanbod-prices';
import {
  OFFERING_TEXT_CORRECTIONS,
  OFFERING_TEXT_FIELDS,
  SERVICE_TEXT_CORRECTIONS,
  type OfferingTextFields,
} from './corrections-2026-10-27';
import { DEFAULT_OFFERS } from './defaults';
import { validateOfferingContent } from './offering-content';

/**
 * The text corrections of 27 Oct 2026 for the offerings and the booking
 * services: the live text before, the defaults after. The patch writes exactly
 * the fields named in `from`, and only where a field still holds that text.
 */

const defaultOf = (slug: string) => {
  const found = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug);
  if (!found) throw new Error(slug);
  return found.content;
};
const correctionOf = (slug: string) => {
  const found = OFFERING_TEXT_CORRECTIONS.find((entry) => entry.slug === slug);
  if (!found) throw new Error(slug);
  return found;
};
const keysOf = (fields: Partial<OfferingTextFields>) =>
  Object.keys(fields) as Array<keyof OfferingTextFields>;

/** A copy token as an editor types it. */
const TOKEN = /\{\{[a-z0-9:-]+\}\}/;

describe('offering text corrections', () => {
  it('has one entry per default offering, in the order of the defaults', () => {
    expect(OFFERING_TEXT_CORRECTIONS.map((entry) => entry.slug)).toEqual(
      DEFAULT_OFFERS.map((entry) => entry.content.slug),
    );
    expect(OFFERING_TEXT_CORRECTIONS).toHaveLength(9);
  });

  it('names the same fields in from and to, only editorial fields, and every one of them changes', () => {
    for (const { slug, from, to } of OFFERING_TEXT_CORRECTIONS) {
      expect(keysOf(from).length, slug).toBeGreaterThan(0);
      expect(keysOf(to), slug).toEqual(keysOf(from));
      for (const key of keysOf(from)) {
        expect(OFFERING_TEXT_FIELDS, `${slug}.${key}`).toContain(key);
        expect(from[key], `${slug}.${key}`).not.toEqual(to[key]);
      }
    }
  });

  it('ends on the defaults: a fresh database and a corrected one read the same', () => {
    for (const { slug, to } of OFFERING_TEXT_CORRECTIONS) {
      expect(defaultOf(slug), slug).toMatchObject(to);
    }
  });

  it('starts from live text, which has no token yet, and ends on text that refers to the master', () => {
    for (const { slug, from, to } of OFFERING_TEXT_CORRECTIONS) {
      expect(JSON.stringify(from), `${slug} from`).not.toMatch(TOKEN);
      expect(JSON.stringify(to), `${slug} to`).toMatch(TOKEN);
    }
  });

  it('knows the two fits as the patch of 20 Oct 2026 left them (the defaults moved on after it)', () => {
    for (const slug of ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets']) {
      const change = OFFERING_PRICE_CHANGES.find((entry) => entry.slug === slug)!;
      const { from } = correctionOf(slug);
      expect(from.contents).toEqual(change.to.contents);
      expect(from.extras).toEqual(change.to.extras);
      expect(from.metaDescription).toBe(change.to.metaDescription);
      expect(from.contents?.at(-1)).toBe(
        'Probleemopvolging tot zes maanden na je fit is inbegrepen. Onder 16: € 150 zonder opvolging, € 275 met.',
      );
    }
    // The new bike's adjustment and the youth package are of 27 Oct: the live text has neither.
    expect(correctionOf('bikefit-nieuwe-fiets').from.extras).toContain(
      'Afstelling van je nieuwe fiets na de aankoop.',
    );
    expect(correctionOf('bikefit-nieuwe-fiets').to.extras).not.toContain(
      'Afstelling van je nieuwe fiets na de aankoop.',
    );
  });

  it('lets the Duur of the fit that is asked for follow the Volwassenenfit service', () => {
    const { from, to } = correctionOf('bikefit-nieuwe-fiets');
    expect(from.duration).toBe('2 uur');
    expect(to.duration).toBe('{{duur:volwassenenfit}}');
    // The other fit is booked online: its Duur comes from its services and was never typed.
    expect(correctionOf('bikefit-huidige-fiets').from).not.toHaveProperty('duration');
  });

  it('turns the youth sentence of the fits into two bullets of tokens: adult window, three prices', () => {
    for (const slug of ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets']) {
      const to = correctionOf(slug).to.contents ?? [];
      expect(to.at(-2)).toBe(
        'Probleemopvolging tot {{opvolging:volwassene}} na je fit is inbegrepen.',
      );
      expect(to.at(-1)).toContain(`{{prijs:${slug}:youth}}`);
      expect(to.at(-1)).toContain(`{{prijs:${slug}:youth-package}}`);
      expect(to.at(-1)).toContain('{{opvolging:jeugd-pakket}}');
    }
  });

  it('gives Bikefit – tweede bezoek its price text (empty before) and lets the window and price follow the master', () => {
    const { from, to } = correctionOf('bikefit-tweede-bezoek');
    expect(from.priceText).toBe('');
    expect(to.priceText).toBe(
      'Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}',
    );
    // The price text names the variant's price: the price line of this offering is this very text.
    expect(to.priceText).not.toMatch(/\{\{prijs:bikefit-tweede-bezoek\}\}/);
  });

  it('chains the morning’s inspanningstest correction into one entry with the final text', () => {
    expect(correctionOf('lactaattest').from.title).toBe('Lactaattest');
    expect(correctionOf('lactaattest').to.title).toBe('Inspanningstest');
    expect(correctionOf('lactaattest').to.metaDescription).toMatch(
      /^Inspanningstest voor fietsers: .* \{\{prijs:lactaattest:all\}\}\.$/,
    );
    expect(correctionOf('coaching').from.extras).toContain('Een lactaattest.');
    expect(correctionOf('coaching').to.extras).toContain('Een inspanningstest.');
  });

  it('writes no amount, window or duration of a second bike: the choices print them', () => {
    const { to } = correctionOf('bikefit-tweede-fiets');
    expect(to.contents).toEqual([
      'Zelfde type fiets: {{extra:bikefit-tweede-fiets:zelfde-type}}.',
      'Ander type fiets: {{extra:bikefit-tweede-fiets:ander-type}}.',
      'We nemen de maten van je eerste fiets over en stemmen de tweede erop af.',
    ]);
    expect(JSON.stringify(to)).not.toMatch(/\d/);
  });

  it('keeps every default inside the limits Beheer would check on a save (the tokens count as typed)', () => {
    for (const { content } of DEFAULT_OFFERS) {
      const checked = validateOfferingContent(content);
      expect(checked.ok, `${content.slug}: ${checked.ok ? '' : checked.message}`).toBe(true);
    }
  });
});

describe('service text corrections', () => {
  const byService = (slug: string) => {
    const found = SERVICE_TEXT_CORRECTIONS.find((entry) => entry.slug === slug);
    if (!found) throw new Error(slug);
    return found;
  };

  it('covers the adult fit and the one-off youth fit, ending on the default services', () => {
    expect(SERVICE_TEXT_CORRECTIONS.map((entry) => entry.slug)).toEqual([
      'volwassenenfit',
      'jeugdfit',
    ]);
    for (const { slug, to } of SERVICE_TEXT_CORRECTIONS) {
      const service = DEFAULT_SERVICES.find((entry) => entry.slug === slug)!;
      expect(to).toEqual({
        name: service.name,
        choiceLabel: service.choiceLabel,
        description: service.description,
      });
    }
  });

  it('renames Jeugdfit as the 20 Oct 2026 patch left it: the package is a third service', () => {
    const { from, to } = byService('jeugdfit');
    expect(from).toEqual({
      name: 'Jeugdfit',
      choiceLabel: 'Jeugd',
      description:
        'Voor fietsers onder 16: dezelfde fit, afgestemd op een lichaam in groei, zonder probleemopvolging. Met opvolging kies je Volwassene (€ 275).',
    });
    expect(to.name).toBe('Jeugdfit – eenmalig');
    expect(to.choiceLabel).toBe('Jeugd – eenmalig');
    expect(to.description).toContain('{{prijs:bikefit-huidige-fiets:youth-package}}');
    expect(to.description).toContain('{{opvolging:jeugd-pakket}}');
    expect(DEFAULT_SERVICES.map((service) => service.slug)).toContain('jeugdfit-pakket');
  });

  it('lets the adult description follow the follow-up window of the master', () => {
    const { from, to } = byService('volwassenenfit');
    expect(from.name).toBe(to.name);
    expect(from.choiceLabel).toBe(to.choiceLabel);
    expect(from.description).toContain('tot zes maanden na je fit');
    expect(to.description).toContain('tot {{opvolging:volwassene}} na je fit');
  });
});
