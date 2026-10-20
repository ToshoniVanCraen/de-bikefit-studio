import { describe, expect, it } from 'vitest';
import { sanitizeRichTextHtml } from '@/lib/cms/actions/sanitize';
import { validateBlocks } from '@/lib/cms/blocks';
import { editorialImage } from '@/lib/studio/editorial-images';
import {
  AANBOD_PAGES,
  FOOTER_MENU,
  MAIN_MENU,
  OFFER_GROUPS,
  OTHER_OFFER_GROUP,
  TEAM_MEMBERS,
} from './aanbod';
import { AFSPRAAK_PAGE, OTHER_QUESTION_HTML } from './appointment';
import { CADEAUBON_CARD } from './cadeaubon';
import before from './page-cleanup.fixture.json';
import {
  cleanupBlocks,
  contactEmailAction,
  PAGE_CLEANUP_SPECS,
  pageCleanupProblems,
  retargetContactLinks,
  type CleanupBlock,
} from './page-cleanup';
import { CONTACT_EMAIL, PHONE_LABEL } from './shared';

/**
 * `page-cleanup.fixture.json` is the seed definition of the touched pages and
 * menus at staging@9c655fe — what `cms:rollout-aanbod` and
 * `cms:patch-booking-cta` published on staging. These tests prove that the
 * patch turns exactly that into today's seed, and that it refuses or skips
 * everything else.
 */

const TARGETS = [...AANBOD_PAGES, AFSPRAAK_PAGE];

/**
 * The review of 19 Oct 2026 changed only the phone label on the pages this
 * patch touches (`0473 95 26 33` → `+32 473 95 26 33`); the patch itself is
 * the 13 Oct state, so the comparison reads the fixture with today's number.
 */
const OLD_PHONE_LABEL = '0473 95 26 33';
function withTodaysPhone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).split(OLD_PHONE_LABEL).join(PHONE_LABEL)) as T;
}

/**
 * Since 20 Oct 2026 /ons-team shows Rutger alone, with his own portrait and an
 * updated internal note (Toshoni: Robin and Goran removed). The patch itself
 * is the 13 Oct state, so the comparison keeps today's members only and reads
 * each with today's portrait and note; name, role and bio are still compared.
 */
/**
 * Since 20 Oct 2026 "Jonge fietsers groeien" on /voor-wie shows Rutger's own
 * photo with a young rider instead of the AI image; the patch itself is the
 * 13 Oct state, so the comparison reads that block with today's image.
 */
function withTodaysVoorWieImage<T extends { type: string; data: Record<string, unknown> }>(
  blocks: T[],
): T[] {
  return blocks.map((block) =>
    block.type === 'imageText' && block.data.title === 'Jonge fietsers groeien'
      ? { ...block, data: { ...block.data, image: editorialImage('rutger-jeugd') } }
      : block,
  );
}

function withTodaysTeam<T extends { type: string; data: Record<string, unknown> }>(
  blocks: T[],
): T[] {
  return blocks.map((block) => {
    if (block.type !== 'team') return block;
    const members = (block.data.members as Array<Record<string, unknown>>).flatMap((member) => {
      const today = TEAM_MEMBERS.find((entry) => entry.name === member.name);
      return today ? [{ ...member, image: today.image, internalNote: today.internalNote }] : [];
    });
    return { ...block, data: { ...block.data, members } };
  });
}

/**
 * Since 20 Oct 2026 "Reken op de tijd" on /afspraak reads its durations from
 * the offer through `{{duur:…}}` tokens; the patch itself is the 13 Oct
 * state, so the comparison reads the fixture with today's sentence.
 */
const OLD_DURATION_SENTENCE =
  'Reken op 90 minuten voor een standaard bikefit voor volwassenen. Een jeugdfit is korter — ongeveer 60 minuten. We haasten ons niet — als het klaar is, is het klaar.';
const DURATION_SENTENCE =
  'Reken op {{duur:volwassenenfit}} voor een bikefit voor volwassenen en {{duur:jeugdfit}} voor een jeugdfit. We haasten ons niet — als het klaar is, is het klaar.';
function withTodaysDurations<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).split(OLD_DURATION_SENTENCE).join(DURATION_SENTENCE),
  ) as T;
}

function oldPage(slug: string) {
  const page = before.pages.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`fixture has no page ${slug}`);
  return { ...page, blocks: page.blocks as CleanupBlock[] };
}

function targetPage(slug: string) {
  const page = TARGETS.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`seed has no page ${slug}`);
  return page;
}

/** As stored: validated (defaults filled in) and rich text sanitised. */
function stored(blocks: readonly CleanupBlock[]) {
  const result = validateBlocks(blocks);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.blocks.map((block) => {
    const data = block.data as Record<string, unknown>;
    return block.type === 'richText' && typeof data.html === 'string'
      ? { type: block.type, data: { ...data, html: sanitizeRichTextHtml(data.html) } }
      : { type: block.type, data };
  });
}

describe('page cleanup patch (review 13 Oct 2026)', () => {
  it('covers exactly /aanbod, /voor-wie, /ons-team and /afspraak', () => {
    expect(PAGE_CLEANUP_SPECS.map((spec) => spec.slug)).toEqual([
      'aanbod',
      'voor-wie',
      'ons-team',
      'afspraak',
    ]);
  });

  for (const spec of PAGE_CLEANUP_SPECS) {
    it(`/${spec.slug}: turns the staging content into today's seed, without conflicts`, () => {
      const old = oldPage(spec.slug);
      const result = cleanupBlocks(spec, stored(old.blocks));
      expect(result.conflicts).toEqual([]);
      expect(result.changes.length).toBeGreaterThan(0);
      // /aanbod also got the Overige group (13 Oct) and the voucher card on its
      // catalogue block (17 Oct, `cms:migrate-aanbod`); neither is this patch's.
      const next =
        spec.slug === 'aanbod'
          ? result.next.map((block) =>
              block.type === 'offerCatalogue'
                ? {
                    ...block,
                    data: {
                      ...block.data,
                      groups: [...OFFER_GROUPS, OTHER_OFFER_GROUP],
                      extraCards: [CADEAUBON_CARD],
                    },
                  }
                : block,
            )
          : result.next;
      expect(
        withTodaysVoorWieImage(withTodaysTeam(withTodaysDurations(withTodaysPhone(next)))),
      ).toEqual(stored(targetPage(spec.slug).blocks));
      expect(pageCleanupProblems(spec.slug, stored(old.blocks)).length).toBeGreaterThan(0);
      expect(pageCleanupProblems(spec.slug, result.next)).toEqual([]);

      const meta = spec.metaDescription;
      expect(meta?.from ?? old.metaDescription).toBe(old.metaDescription);
      expect(withTodaysPhone(meta?.to ?? old.metaDescription)).toBe(
        targetPage(spec.slug).metaDescription,
      );

      const again = cleanupBlocks(spec, result.next);
      expect(again.changes).toEqual([]);
      expect(again.updated).toEqual([]);
      expect(again.conflicts).toEqual([]);
    });
  }

  it('/afspraak opens on "Kies je moment" and keeps the widget settings and phone link', () => {
    const spec = PAGE_CLEANUP_SPECS.find((entry) => entry.slug === 'afspraak')!;
    const result = cleanupBlocks(spec, stored(oldPage('afspraak').blocks));
    expect(result.removed.map((block) => block.type)).toEqual([
      'hero',
      'services',
      'contact',
      'cta',
    ]);
    expect(result.next.map((block) => block.type)).toEqual(['booking', 'richText']);
    const booking = result.next[0].data;
    expect(booking).toMatchObject({ title: 'Kies je moment', eyebrow: '', serviceIds: [] });
    expect(booking.showProviderChoice).toBe(true);
    const html = String(result.next[1].data.html);
    expect(html).toContain('<h3>Andere vraag?</h3>');
    expect(html).toContain(`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`);
    expect(html.match(/href="tel:\+32473952633"/g)).toHaveLength(2);
  });

  it('refuses a field an editor changed since the rollout, and leaves it alone', () => {
    const spec = PAGE_CLEANUP_SPECS.find((entry) => entry.slug === 'voor-wie')!;
    const blocks = stored(oldPage('voor-wie').blocks);
    const audience = blocks.find((block) => block.type === 'audience')!;
    audience.data = { ...audience.data, title: 'Een titel van de redactie' };
    const result = cleanupBlocks(spec, blocks);
    expect(result.conflicts).toEqual([
      expect.stringContaining('audience.title: expected "Waar je ook staat"'),
    ]);
    expect(result.next.find((block) => block.type === 'audience')?.data.title).toBe(
      'Een titel van de redactie',
    );
  });

  it('reports a missing or doubled target block instead of guessing', () => {
    const spec = PAGE_CLEANUP_SPECS.find((entry) => entry.slug === 'ons-team')!;
    const blocks = stored(oldPage('ons-team').blocks);
    expect(
      cleanupBlocks(
        spec,
        blocks.filter((block) => block.type !== 'team'),
      ).conflicts,
    ).toEqual(['team: expected one such block, found 0', 'team: expected one such block, found 0']);
    const team = blocks.find((block) => block.type === 'team')!;
    expect(cleanupBlocks(spec, [...blocks, team]).conflicts).toHaveLength(2);
  });

  it('never touches the caller’s block objects', () => {
    const spec = PAGE_CLEANUP_SPECS.find((entry) => entry.slug === 'aanbod')!;
    const blocks = stored(oldPage('aanbod').blocks);
    const snapshot = JSON.stringify(blocks);
    cleanupBlocks(spec, blocks);
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });

  it('"Andere vraag?" survives the rich-text sanitiser unchanged', () => {
    expect(sanitizeRichTextHtml(OTHER_QUESTION_HTML)).toBe(OTHER_QUESTION_HTML);
  });
});

/** The seed menus as the 13 Oct review left them (before the 19 Oct review moved the FAQ up and emptied the footer). */
const MENUS_13_OCT = {
  main: [
    ['Aanbod', '/aanbod', ''],
    ['Voor wie', '/voor-wie', ''],
    ['Bikefit', '/bikefit', ''],
    ['Ons team', '/ons-team', ''],
    ['Contact', '/afspraak', ''],
  ],
  footer: [
    ['Aanbod', '/aanbod', 'Studio'],
    ['Voor wie', '/voor-wie', 'Studio'],
    ['Bikefit', '/bikefit', 'Studio'],
    ['Ons team', '/ons-team', 'Studio'],
    ['Contact', '/afspraak', 'Studio'],
    ['Afspraak maken', '/afspraak', 'Praktisch'],
    ['Werkwijze', '/bikefit#werkwijze', 'Praktisch'],
    ['Veelgestelde vragen', '/veelgestelde-vragen', 'Praktisch'],
    ['Privacyverklaring', '/privacy', 'Juridisch'],
    ['Algemene voorwaarden', '/algemene-voorwaarden', 'Juridisch'],
  ],
};

describe('menus: Contact → /afspraak', () => {
  it('turns the staging menus into the 13 Oct seed menus, once', () => {
    const main = retargetContactLinks(before.menus.main);
    const footer = retargetContactLinks(before.menus.footer);
    const shape = (items: { label: string; href: string; group: string }[]) =>
      items.map((item) => [item.label, item.href, item.group]);
    expect(shape(main.items)).toEqual(MENUS_13_OCT.main);
    expect(shape(footer.items)).toEqual(MENUS_13_OCT.footer);
    // Today's seed is further along (19 Oct 2026) but still has no /contact link.
    expect(retargetContactLinks(FOOTER_MENU).changed).toEqual([]);
    expect([...main.changed, ...footer.changed]).toEqual([
      '"Contact" /contact → /afspraak',
      '"Contact" /contact → /afspraak',
    ]);
    expect(retargetContactLinks(MAIN_MENU).changed).toEqual([]);
  });

  it('keeps query and hash, skips external links and look-alike paths, recurses into children', () => {
    const { items, changed } = retargetContactLinks([
      { label: 'Vraag', href: '/contact?dienst=coaching#boeken', external: false },
      { label: 'Extern', href: '/contact', external: true },
      { label: 'Contacten', href: '/contacten', external: false },
      {
        label: 'Meer',
        href: '/voor-wie',
        external: false,
        children: [{ label: 'Contact', href: '/contact/', external: false }],
      },
    ]);
    expect(items.map((item) => item.href)).toEqual([
      '/afspraak?dienst=coaching#boeken',
      '/contact',
      '/contacten',
      '/voor-wie',
    ]);
    expect(items[3].children?.[0].href).toBe('/afspraak');
    expect(changed).toHaveLength(2);
  });
});

describe('settings: public e-mail address', () => {
  it('fills an empty address, keeps the confirmed one, refuses another one', () => {
    expect(contactEmailAction('')).toBe('set');
    expect(contactEmailAction('  ')).toBe('set');
    expect(contactEmailAction(CONTACT_EMAIL)).toBe('');
    expect(contactEmailAction('iemand@example.be')).toContain('not empty');
  });
});
