import { describe, expect, it } from 'vitest';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { AUDIENCE_LABELS, type OfferingAudience } from '@/lib/offers/offering-audience';
import type { AddonChoice } from '@/lib/offers/offering';
import {
  buildCopyTokenLookup,
  type CopyTokenOffer,
  type CopyTokenSources,
} from './copy-token-values';
import { resolveCopyTokensInText, type CopyTokenLookup } from './copy-tokens';

/** Intl puts a no-break space between the euro sign and the amount. */
const plain = (value: string) => value.replace(/\s/g, ' ');

const variant = (audience: OfferingAudience, priceCents: number | null) => ({
  audience,
  label: AUDIENCE_LABELS[audience],
  serviceId: null,
  serviceSlug: null,
  serviceName: null,
  durationMinutes: null,
  requiresGuardian: false,
  priceCents,
  bookable: true,
});

type OfferInput = {
  slug: string;
  priceLabel?: string;
  isListed?: boolean;
  isAddon?: boolean;
  addonMinutes?: number | null;
  addonOptions?: AddonChoice[];
  variants?: ReturnType<typeof variant>[];
};

function offer(input: OfferInput): CopyTokenOffer {
  return {
    offer: {
      id: `id-${input.slug}`,
      slug: input.slug,
      priceLabel: input.priceLabel ?? 'Prijs op aanvraag',
    },
    content: { slug: input.slug, title: input.slug },
    offering: {
      isListed: input.isListed ?? true,
      isAddon: input.isAddon ?? false,
      addonMinutes: input.addonMinutes ?? null,
      addonOptions: input.addonOptions ?? [],
      variants: input.variants ?? [variant('all', null)],
    },
  };
}

function build(partial: Partial<CopyTokenSources> = {}): CopyTokenLookup {
  return buildCopyTokenLookup({
    settings: defaultSiteSettings(),
    services: [],
    offers: [],
    studioAddress: null,
    ...partial,
  });
}

const read = (lookup: CopyTokenLookup, text: string) =>
  plain(resolveCopyTokensInText(text, lookup));

describe('buildCopyTokenLookup: durations', () => {
  it('maps the services the site offers to the label the widget shows', () => {
    const lookup = build({
      services: [
        { slug: 'volwassenenfit', durationLabel: '2 uur' },
        { slug: 'jeugdfit', durationLabel: '1 u 30 min' },
      ],
    });
    expect(read(lookup, '{{duur:volwassenenfit}} / {{duur:jeugdfit}} / {{duur:weg}}')).toBe(
      '2 uur / 1 u 30 min / in overleg',
    );
  });
});

describe('buildCopyTokenLookup: the facts of the settings', () => {
  it('a database without the rows prints the documented defaults', () => {
    const lookup = build();
    expect(read(lookup, '{{bedrijf}} | {{zetel}} | {{kbo}} | {{btw}}')).toBe(
      'Qarakter BV | Weversstraat 7, 1730 Asse | BE 1036.912.281 | BE 1036.912.281',
    );
    expect(
      read(
        lookup,
        '{{opvolging:volwassene}} | {{tweede-bezoek-gratis}} | {{cadeaubon-geldigheid}}',
      ),
    ).toBe('zes maanden | zes maanden | een jaar');
    // Instellingen → Contact is empty: the phone is the constant pair, the rest is empty.
    expect(read(lookup, '{{telefoon}} | {{telefoon-href}}')).toBe(
      '+32 473 95 26 33 | tel:+32473952633',
    );
    expect(read(lookup, '[{{e-mail}}] [{{adres}}] [{{adres-studio}}]')).toBe('[] [] []');
  });

  it('prints the contact settings: phone pair, e-mail and the address on one line', () => {
    const settings = defaultSiteSettings();
    settings.contact = {
      ...settings.contact,
      phoneLabel: ' 0473 12 34 56 ',
      phoneHref: ' tel:+32473123456 ',
      email: ' info@studio.test ',
      addressLines: ['Halsesteenweg 406 a'],
      postalCode: '9403',
      city: 'Neigem',
    };
    const lookup = build({ settings });
    expect(read(lookup, '{{telefoon}} {{telefoon-href}} {{e-mail}}')).toBe(
      '0473 12 34 56 tel:+32473123456 info@studio.test',
    );
    expect(read(lookup, '{{adres}}')).toBe('Halsesteenweg 406 a, 9403 Neigem');
  });

  it('the e-mail is a bare address: anything else (a scheme, a space, a quote) prints empty', () => {
    for (const email of [
      'javascript:alert(1)//@x.be',
      'mailto:info@studio.test',
      'info@studio.test?bcc=x@y.z extra',
      '"info"@studio.test',
      'geen adres',
      '',
    ]) {
      const settings = defaultSiteSettings();
      settings.contact = { ...settings.contact, email };
      expect(read(build({ settings }), '[{{e-mail}}]')).toBe('[]');
    }
    const settings = defaultSiteSettings();
    settings.contact = { ...settings.contact, email: 'voornaam.achternaam+bikefit@studio-x.be' };
    expect(read(build({ settings }), '{{e-mail}}')).toBe('voornaam.achternaam+bikefit@studio-x.be');
  });

  it('a phone link that is no plain tel: link falls back to the constant pair', () => {
    for (const phoneHref of ['', 'javascript:alert(1)', 'https://wa.me/32473952633', 'tel:"x"']) {
      const settings = defaultSiteSettings();
      settings.contact = { ...settings.contact, phoneLabel: '0473 12 34 56', phoneHref };
      expect(read(build({ settings }), '{{telefoon}} {{telefoon-href}}')).toBe(
        '+32 473 95 26 33 tel:+32473952633',
      );
    }
  });

  it('the studio address is the default location; each master speaks for the other when it is empty', () => {
    const studioAddress = { addressLines: ['Kerkstraat 1'], postalCode: '9400', city: 'Ninove' };
    const settings = defaultSiteSettings();
    settings.contact = {
      ...settings.contact,
      addressLines: ['Halsesteenweg 406 a'],
      postalCode: '9403',
      city: 'Neigem',
    };
    expect(read(build({ settings, studioAddress }), '{{adres}} | {{adres-studio}}')).toBe(
      'Halsesteenweg 406 a, 9403 Neigem | Kerkstraat 1, 9400 Ninove',
    );
    expect(read(build({ settings }), '{{adres}} | {{adres-studio}}')).toBe(
      'Halsesteenweg 406 a, 9403 Neigem | Halsesteenweg 406 a, 9403 Neigem',
    );
    expect(read(build({ studioAddress }), '{{adres}} | {{adres-studio}}')).toBe(
      'Kerkstraat 1, 9400 Ninove | Kerkstraat 1, 9400 Ninove',
    );
  });

  it('prints the business and rules settings as they are set', () => {
    const settings = defaultSiteSettings();
    settings.business = {
      legalName: 'Studio BV',
      seatAddressLines: ['Zetelstraat 1', 'Bus 2'],
      seatPostalCode: '9000',
      seatCity: 'Gent',
      seatCountry: 'BE',
      enterpriseNumber: '0123.456.789',
      vatNumber: 'BE 0123.456.789',
    };
    settings.rules = {
      followUpMonthsAdult: 9,
      secondVisitFreeMonths: 3,
      voucherValidityMonths: 12,
    };
    const lookup = build({ settings });
    expect(read(lookup, '{{bedrijf}}, {{zetel}}, {{kbo}}, {{btw}}')).toBe(
      'Studio BV, Zetelstraat 1, Bus 2, 9000 Gent, 0123.456.789, BE 0123.456.789',
    );
    expect(
      read(lookup, '{{opvolging:volwassene}}, {{tweede-bezoek-gratis}}, {{cadeaubon-geldigheid}}'),
    ).toBe('9 maanden, 3 maanden, een jaar');
  });
});

describe('buildCopyTokenLookup: prices', () => {
  const fit = offer({
    slug: 'bikefit-huidige-fiets',
    priceLabel: 'Volwassene € 275,00 · Jeugd – eenmalig € 150,00',
    variants: [variant('adult', 27500), variant('youth', 15000)],
  });

  it('the line form is the card line, the variant form is one amount in prose', () => {
    const lookup = build({ offers: [fit] });
    expect(read(lookup, '{{prijs:bikefit-huidige-fiets}}')).toBe(
      'Volwassene € 275,00 · Jeugd – eenmalig € 150,00',
    );
    expect(
      read(lookup, '{{prijs:bikefit-huidige-fiets:adult}}, {{prijs:bikefit-huidige-fiets:youth}}'),
    ).toBe('€ 275, € 150');
  });

  it('an amount with cents keeps them; a variant without a price reads "op aanvraag"', () => {
    const lookup = build({
      offers: [
        offer({ slug: 'coaching', variants: [variant('all', 6550)] }),
        offer({ slug: 'nog-zonder-prijs', variants: [variant('all', null)] }),
      ],
    });
    expect(read(lookup, '{{prijs:coaching:all}}')).toBe('€ 65,50');
    expect(read(lookup, '{{prijs:nog-zonder-prijs:all}}')).toBe('op aanvraag');
    expect(read(lookup, '{{prijs:nog-zonder-prijs}}')).toBe('Prijs op aanvraag');
    expect(read(lookup, '{{prijs:bestaat-niet}} {{prijs:bestaat-niet:all}}')).toBe(
      'op aanvraag op aanvraag',
    );
  });

  it('an offering that is not shown on the website reads the fallback', () => {
    const lookup = build({
      offers: [offer({ slug: 'verborgen', isListed: false, variants: [variant('all', 9900)] })],
    });
    expect(read(lookup, '{{prijs:verborgen}} / {{prijs:verborgen:all}}')).toBe(
      'op aanvraag / op aanvraag',
    );
  });

  describe('a free-text price (an offering that is asked for)', () => {
    const secondVisit = offer({
      slug: 'tweede-bezoek',
      priceLabel:
        'Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:tweede-bezoek:all}}',
      variants: [variant('all', 7500)],
    });

    it('is resolved once for the line form', () => {
      expect(read(build({ offers: [secondVisit] }), '{{prijs:tweede-bezoek}}')).toBe(
        'Gratis binnen zes maanden na je fit, daarna € 75',
      );
    });

    it('is never read by the variant form: that is the cents of the variant', () => {
      expect(read(build({ offers: [secondVisit] }), '{{prijs:tweede-bezoek:all}}')).toBe('€ 75');
    });

    it('does not recurse: its own line form reads "op aanvraag", another offering\'s line is printed', () => {
      const selfish = offer({
        slug: 'cirkel',
        priceLabel: 'Zie {{prijs:cirkel}} of {{prijs:tweede-bezoek}} voor {{prijs:cirkel:all}}',
        variants: [variant('all', 5000)],
      });
      const lookup = build({ offers: [selfish, secondVisit] });
      expect(read(lookup, '{{prijs:cirkel}}')).toBe(
        'Zie op aanvraag of Gratis binnen zes maanden na je fit, daarna € 75 voor € 50',
      );
    });

    it('does not loop between two offerings: the one that leads back reads "op aanvraag"', () => {
      const first = offer({
        slug: 'een',
        priceLabel: 'Eerst {{prijs:twee}}',
        variants: [variant('all', 1000)],
      });
      const second = offer({
        slug: 'twee',
        priceLabel: 'Dan {{prijs:een}} en {{prijs:een:all}}',
        variants: [variant('all', 2000)],
      });
      const lookup = build({ offers: [first, second] });
      expect(read(lookup, '{{prijs:twee}}')).toBe('Dan op aanvraag en € 10');
      expect(read(lookup, '{{prijs:een}}')).toBe('Eerst Dan op aanvraag en € 10');
    });

    it('resolves a line that is not a text as it is, whatever the order of the offerings', () => {
      const plain = offer({
        slug: 'gewoon',
        priceLabel: '€ 60,00',
        variants: [variant('all', 6000)],
      });
      const pointing = offer({
        slug: 'wijzer',
        priceLabel: 'Net als gewoon: {{prijs:gewoon}}',
        variants: [variant('all', 7000)],
      });
      for (const offers of [
        [plain, pointing],
        [pointing, plain],
      ]) {
        expect(read(build({ offers }), '{{prijs:wijzer}}')).toBe('Net als gewoon: € 60,00');
      }
    });
  });
});

describe('buildCopyTokenLookup: extras', () => {
  const choices: AddonChoice[] = [
    { key: 'zelfde-type', label: 'Zelfde type fiets', minutes: 30, priceCents: 7500 },
    { key: 'ander-type', label: 'Ander type fiets', minutes: 60, priceCents: 15000 },
  ];

  it('an extra without choices reads price, then time', () => {
    const lookup = build({
      offers: [
        offer({
          slug: 'voetanalyse',
          isAddon: true,
          addonMinutes: 30,
          variants: [variant('all', 8500)],
        }),
      ],
    });
    expect(read(lookup, '{{extra:voetanalyse}}')).toBe('€ 85 en 30 minuten extra');
  });

  it('an extra with choices reads one sentence per choice and nothing without the choice', () => {
    const lookup = build({
      offers: [
        offer({
          slug: 'bikefit-tweede-fiets',
          isAddon: true,
          addonMinutes: 30,
          addonOptions: choices,
          variants: [variant('all', 7500)],
        }),
      ],
    });
    expect(read(lookup, '{{extra:bikefit-tweede-fiets:zelfde-type}}')).toBe(
      '€ 75 en 30 minuten extra',
    );
    expect(read(lookup, '{{extra:bikefit-tweede-fiets:ander-type}}')).toBe('€ 150 en 1 uur extra');
    expect(read(lookup, '{{extra:bikefit-tweede-fiets}}')).toBe('in overleg');
    expect(read(lookup, '{{extra:bikefit-tweede-fiets:onbekend}}')).toBe('in overleg');
  });

  it('leaves out what the widget leaves out: hidden, no time, no price, no extra at all', () => {
    const lookup = build({
      offers: [
        offer({
          slug: 'verborgen',
          isListed: false,
          isAddon: true,
          addonMinutes: 30,
          variants: [variant('all', 5000)],
        }),
        offer({
          slug: 'zonder-tijd',
          isAddon: true,
          addonMinutes: null,
          variants: [variant('all', 5000)],
        }),
        offer({
          slug: 'zonder-prijs',
          isAddon: true,
          addonMinutes: 30,
          variants: [variant('all', null)],
        }),
        offer({ slug: 'geen-extra', addonMinutes: 30, variants: [variant('all', 5000)] }),
      ],
    });
    for (const slug of ['verborgen', 'zonder-tijd', 'zonder-prijs', 'geen-extra']) {
      expect(read(lookup, `{{extra:${slug}}}`)).toBe('in overleg');
    }
  });
});
