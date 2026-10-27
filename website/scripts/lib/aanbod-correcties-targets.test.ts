import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import type { NavigationItem } from '@/lib/cms/blocks';
import {
  defaultSiteSettings,
  SITE_SETTING_KEYS,
  siteSettingSchemas,
} from '@/lib/cms/site-settings';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { CADEAUBON_MENU_ITEM } from '@/lib/studio/seed-content/cadeaubon-promo';
import {
  PHONE_HREF_AFTER,
  PHONE_HREF_BEFORE,
  PHONE_LABEL_AFTER,
  PHONE_LABEL_BEFORE,
  SETTING_TEXT_CORRECTIONS,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import { STUDIO_CONTACT_ADDRESS } from '@/lib/studio/seed-content/location-section';
import {
  alternativeStates,
  BEHEER_PREFILL_MINUTES,
  decideAddress,
  decideContact,
  decideDuration,
  decideMenu,
  decideSettingTexts,
  decideTexts,
  defaultSettingValue,
  DURATION_TARGETS,
  missingSettingKeys,
  serviceTextAfterRepoSave,
} from './aanbod-correcties-targets.mjs';

/**
 * The rules of the small sections of `cms:patch-aanbod-correcties` on plain
 * data: what each does with a database in the state of 20 Oct 2026, with one
 * that is done, and with an admin's own edit. The pages, the youth package and
 * the provider have their own tests.
 */

const BEFORE_CONTACT = {
  phoneLabel: PHONE_LABEL_BEFORE,
  phoneHref: PHONE_HREF_BEFORE,
  email: 'info@debikefitstudio.be',
  addressLines: [],
  postalCode: '',
  city: 'Ninove',
  country: 'BE',
  hours: 'Op afspraak',
  website: 'www.debikefitstudio.be',
};

describe('the address', () => {
  const none = { addressLines: [], postalCode: '', city: '' };

  it('moves "no street, Ninove" (or nothing) to the studio address, and leaves the target alone', () => {
    const ninove = decideAddress(
      { addressLines: [], postalCode: '', city: 'Ninove' },
      STUDIO_CONTACT_ADDRESS,
    );
    expect(ninove).toEqual({
      action: 'update',
      change: 'address: Ninove → Halsesteenweg 406 a, 9403 Neigem',
    });
    expect(decideAddress(none, STUDIO_CONTACT_ADDRESS).action).toBe('update');
    expect(
      decideAddress(
        { addressLines: ['Halsesteenweg 406 a'], postalCode: '9403', city: 'Neigem' },
        STUDIO_CONTACT_ADDRESS,
      ),
    ).toEqual({ action: 'none' });
  });

  it('blocks an address an admin typed in: it is neither the old nor the new one', () => {
    const own = decideAddress(
      { addressLines: ['Dorpsstraat 1'], postalCode: '9400', city: 'Ninove' },
      STUDIO_CONTACT_ADDRESS,
    );
    expect(own.action).toBe('blocked');
    expect(own).toMatchObject({ blocker: expect.stringContaining('Dorpsstraat 1, 9400 Ninove') });
    // A postal code alone is already the admin's own work.
    expect(
      decideAddress(
        { addressLines: [], postalCode: '9400', city: 'Ninove' },
        STUDIO_CONTACT_ADDRESS,
      ).action,
    ).toBe('blocked');
  });
});

describe('the contact setting', () => {
  it('writes the address and both halves of the phone number and keeps every other field', () => {
    const decision = decideContact(BEFORE_CONTACT);
    expect(decision.blockers).toEqual([]);
    expect(decision.changes).toEqual([
      'address: Ninove → Halsesteenweg 406 a, 9403 Neigem',
      `phone label: ${PHONE_LABEL_BEFORE} → ${PHONE_LABEL_AFTER}`,
      `phone link: ${PHONE_HREF_BEFORE} → ${PHONE_HREF_AFTER}`,
    ]);
    expect(decision.value).toEqual({
      ...BEFORE_CONTACT,
      phoneLabel: PHONE_LABEL_AFTER,
      phoneHref: PHONE_HREF_AFTER,
      addressLines: ['Halsesteenweg 406 a'],
      postalCode: '9403',
      city: 'Neigem',
      country: 'BE',
    });
  });

  it('is done on a second pass, and moves only the half that is still old', () => {
    const done = decideContact(decideContact(BEFORE_CONTACT).value);
    expect(done).toEqual({ value: null, changes: [], blockers: [] });
    const half = decideContact({
      ...BEFORE_CONTACT,
      phoneLabel: PHONE_LABEL_AFTER,
      addressLines: ['Halsesteenweg 406 a'],
      postalCode: '9403',
      city: 'Neigem',
    });
    expect(half.changes).toEqual([`phone link: ${PHONE_HREF_BEFORE} → ${PHONE_HREF_AFTER}`]);
  });

  it('refuses a phone field or an address an admin changed; an empty phone field has nothing to correct', () => {
    const own = decideContact({ ...BEFORE_CONTACT, phoneLabel: '0473/95.26.33' });
    expect(own.blockers).toEqual([expect.stringContaining('phone label holds neither')]);
    const empty = decideContact({
      ...BEFORE_CONTACT,
      phoneLabel: '',
      phoneHref: '',
      addressLines: ['Halsesteenweg 406 a'],
      postalCode: '9403',
      city: 'Neigem',
    });
    expect(empty).toEqual({ value: null, changes: [], blockers: [] });
    const street = decideContact({ ...BEFORE_CONTACT, addressLines: ['Dorpsstraat 1'] });
    expect(street.blockers).toEqual([expect.stringContaining('address holds neither')]);
    expect(decideContact('geen object').blockers).toEqual(['setting contact does not validate']);
  });
});

describe('settings groups that have no row yet', () => {
  it('lists every key of the schema without a row, business and rules among them', () => {
    expect(missingSettingKeys(new Set(['site', 'contact', 'seo']))).toEqual(
      SITE_SETTING_KEYS.filter((key) => !['site', 'contact', 'seo'].includes(key)),
    );
    expect(missingSettingKeys(new Set(SITE_SETTING_KEYS))).toEqual([]);
    expect(SITE_SETTING_KEYS).toEqual(expect.arrayContaining(['business', 'rules']));
  });

  it('takes the defaults from the schema: they validate, and equal what a fresh site shows', () => {
    for (const key of SITE_SETTING_KEYS) {
      const value = defaultSettingValue(key);
      expect(value, key).not.toBeNull();
      expect(siteSettingSchemas[key].safeParse(value).success, key).toBe(true);
    }
    // The two groups the patch writes for a database that never had them.
    expect(defaultSettingValue('business')).toEqual(defaultSiteSettings().business);
    expect(defaultSettingValue('rules')).toEqual(defaultSiteSettings().rules);
    expect(defaultSettingValue('rules')).toMatchObject({ followUpMonthsAdult: 6 });
  });
});

describe('default texts in the settings', () => {
  const [title, description] = SETTING_TEXT_CORRECTIONS;
  const seo = (over: Record<string, unknown>) => ({
    ...siteSettingSchemas.seo.parse({}),
    ...over,
  });

  it('writes the SEO title and description that lose their dashes, once', () => {
    const old = seo({ defaultMetaTitle: title.from, defaultMetaDescription: description.from });
    const decision = decideSettingTexts('seo', old, SETTING_TEXT_CORRECTIONS);
    expect(decision.value).toMatchObject({
      defaultMetaTitle: title.to,
      defaultMetaDescription: description.to,
      titleTemplate: '%s · De Bikefit Studio',
    });
    expect(decision.changes).toHaveLength(2);
    expect(decision.notes).toEqual([]);
    expect(decideSettingTexts('seo', decision.value, SETTING_TEXT_CORRECTIONS)).toEqual({
      value: null,
      changes: [],
      notes: [],
    });
  });

  it('leaves the studio’s own text alone, without blocking', () => {
    const own = seo({
      defaultMetaTitle: 'Onze eigen titel',
      defaultMetaDescription: description.from,
    });
    const decision = decideSettingTexts('seo', own, SETTING_TEXT_CORRECTIONS);
    expect(decision.notes).toEqual(['defaultMetaTitle is not the default text: left alone']);
    expect(decision.value).toMatchObject({
      defaultMetaTitle: 'Onze eigen titel',
      defaultMetaDescription: description.to,
    });
    expect(decideSettingTexts('seo', 'geen object', SETTING_TEXT_CORRECTIONS).value).toBeNull();
  });
});

describe('the main menu', () => {
  const item = (label: string, href: string): NavigationItem => ({
    label,
    href,
    external: false,
    group: '',
    children: [],
  });
  const before = [
    item('Aanbod', '/aanbod'),
    item('Veelgestelde vragen', '/veelgestelde-vragen'),
    item('Contact', '/afspraak'),
  ];

  it('puts "Cadeaubon" in front of "Contact", once', () => {
    const decision = decideMenu(before);
    expect(decision.items?.map((entry) => entry.label)).toEqual([
      'Aanbod',
      'Veelgestelde vragen',
      'Cadeaubon',
      'Contact',
    ]);
    expect(decision.items?.[2]).toEqual(CADEAUBON_MENU_ITEM);
    expect(decision.items?.[2]).not.toBe(CADEAUBON_MENU_ITEM);
    expect(decision.change).toBe('insert "Cadeaubon" (/cadeaubon) before "Contact"');
    expect(decideMenu(decision.items ?? []).items).toBeNull();
  });

  it('appends it when there is no "Contact", and leaves a menu that links there alone, also as a child', () => {
    expect(decideMenu([item('Aanbod', '/aanbod')]).items?.map((entry) => entry.label)).toEqual([
      'Aanbod',
      'Cadeaubon',
    ]);
    const nested = [
      {
        ...item('Overige', '#'),
        children: [{ label: 'Bon', href: '/cadeaubon', external: false }],
      },
    ];
    expect(decideMenu(nested).items).toBeNull();
  });
});

describe('copy: exact old → new, field by field', () => {
  const stored = { title: 'Lactaattest', extras: ['a', 'b'], summary: 'Door de redactie.' };
  const from = { title: 'Lactaattest', extras: ['a', 'b'] };
  const to = { title: 'Inspanningstest', extras: ['a', 'c'] };

  it('writes the fields that hold the old text, and only those named', () => {
    const decision = decideTexts('offering x', stored, from, to);
    expect(decision.writes).toEqual(to);
    expect(decision.before).toEqual(from);
    expect(decision.changes).toEqual([
      'title: "Lactaattest" → "Inspanningstest"',
      'extras: 2 → 2 item(s), 1 changed',
    ]);
    expect(decision.blockers).toEqual([]);
  });

  it('is done when the new text is there, field by field', () => {
    expect(decideTexts('offering x', { ...stored, ...to }, from, to).changes).toEqual([]);
    const half = decideTexts('offering x', { ...stored, title: 'Inspanningstest' }, from, to);
    expect(Object.keys(half.writes)).toEqual(['extras']);
  });

  it('refuses a field that holds neither text, and writes nothing for it', () => {
    const decision = decideTexts('offering x', { ...stored, title: 'Mijn eigen titel' }, from, to);
    expect(decision.blockers).toEqual([
      'offering x: title holds neither the old nor the new text (now "Mijn eigen titel") — edited in Beheer?',
    ]);
    expect(Object.keys(decision.writes)).toEqual(['extras']);
  });

  it('accepts another state known to be live', () => {
    const live = { name: 'Bikefit – huidige fiets – Jeugd' };
    const decision = decideTexts(
      'service jeugdfit',
      live,
      { name: 'Jeugdfit' },
      { name: 'Jeugdfit – eenmalig' },
      [{ name: 'iets anders' }, live],
    );
    expect(decision.writes).toEqual({ name: 'Jeugdfit – eenmalig' });
    expect(
      decideTexts('service jeugdfit', live, { name: 'Jeugdfit' }, { name: 'Jeugdfit – eenmalig' })
        .blockers,
    ).toHaveLength(1);
  });

  it('reads the alternatives a correction declares: a text is a description, a record is a state', () => {
    expect(alternativeStates(undefined)).toEqual([]);
    expect(alternativeStates('Samenvatting van het aanbod.')).toEqual([
      { description: 'Samenvatting van het aanbod.' },
    ]);
    expect(alternativeStates({ name: 'A', description: 'B' })).toEqual([
      { name: 'A', description: 'B' },
    ]);
    expect(alternativeStates(['x', { name: 'A' }])).toEqual([{ description: 'x' }, { name: 'A' }]);
  });

  it('knows what a save of the offering in Beheer (or the prices patch) leaves in a service', () => {
    const offering = { title: 'Bikefit – huidige fiets', summary: 'Comfortabeler fietsen.' };
    expect(serviceTextAfterRepoSave(offering, 'adult')).toEqual({
      name: 'Bikefit – huidige fiets – Volwassene',
      choiceLabel: 'Volwassene',
      description: 'Comfortabeler fietsen.',
    });
    expect(serviceTextAfterRepoSave(offering, 'youth')).toMatchObject({
      name: 'Bikefit – huidige fiets – Jeugd',
      choiceLabel: 'Jeugd',
    });
    expect(serviceTextAfterRepoSave(offering, 'all').name).toBe('Bikefit – huidige fiets');
  });
});

describe('durations', () => {
  it('are Toshoni’s: both bikefits 2 hours, voetanalyse 30, zadelanalyse 60, schoenplaatjes 15 minutes', () => {
    expect(DURATION_TARGETS).toEqual([
      { slug: 'bikefit-nieuwe-fiets', minutes: 120 },
      { slug: 'voetanalyse', minutes: 30 },
      { slug: 'zadelanalyse', minutes: 60 },
      { slug: 'afstellen-schoenplaatjes', minutes: 15 },
    ]);
    // The offers say the same: in words ("30 minuten", "1 uur", "15 minuten") or, for a bikefit,
    // with the copy token of the master service (`{{duur:volwassenenfit}}`).
    const minutesOf = (text: string) => {
      const hours = /^(\d+) uur$/.exec(text);
      const minutes = /^(\d+) minuten$/.exec(text);
      const token = /^\{\{duur:([a-z-]+)\}\}$/.exec(text);
      if (token) return DEFAULT_SERVICES.find((entry) => entry.slug === token[1])?.durationMinutes;
      return hours ? Number(hours[1]) * 60 : minutes ? Number(minutes[1]) : NaN;
    };
    for (const target of DURATION_TARGETS) {
      const offering = DEFAULT_OFFERS.find((entry) => entry.content.slug === target.slug);
      expect(minutesOf(offering?.content.duration ?? ''), target.slug).toBe(target.minutes);
    }
  });

  it('accept the target and the Beheer prefill (60), and refuse any other length', () => {
    expect(decideDuration(120, 120)).toEqual({ action: 'none' });
    expect(decideDuration(BEHEER_PREFILL_MINUTES, 120)).toEqual({
      action: 'update',
      change: '60 → 120 min',
    });
    expect(decideDuration(60, 60)).toEqual({ action: 'none' });
    expect(decideDuration(90, 120)).toMatchObject({
      action: 'blocked',
      blocker: expect.stringContaining('90 min'),
    });
  });
});
