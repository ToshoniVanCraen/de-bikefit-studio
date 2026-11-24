import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { editorialImage } from '@/lib/studio/editorial-images';
import { canonicalData, isNew, restructureBlocks } from './page-restructure';
import {
  decideOfferingImage,
  OFFERING_IMAGE_TARGETS,
  OLD_OFFERING_IMAGE_URLS,
  REDESIGN_PAGES,
  REDESIGN_SLUGS,
  redesignBefore,
  redesignProblems,
  redesignSpec,
  redesignTarget,
  SITE_REDESIGN_SPECS,
} from './site-redesign';
import type { CleanupBlock } from './page-cleanup';

/**
 * The redesign of 24 Nov 2026: the seeds are the design, and the guarded changes of
 * `cms:patch-site-redesign` turn the frozen state of staging and production into exactly the
 * seeds, block for block, once; an editor's change is never overwritten.
 */

type Row = CleanupBlock & { id: string };
const rows = (slug: string, blocks: CleanupBlock[]): Row[] =>
  blocks.map((block, index) => ({ id: `${slug || 'home'}-${index}`, ...block }));

function apply(slug: string, blocks: Row[]) {
  const spec = redesignSpec(slug);
  if (!spec) throw new Error(`no spec for ${slug}`);
  const result = restructureBlocks(spec, blocks);
  const next: Row[] = result.next.map((entry, index) =>
    entry.block
      ? { ...entry.block, data: entry.data }
      : { id: `new-${index}`, type: entry.type, data: entry.data },
  );
  return { result, next };
}

const plain = (blocks: readonly CleanupBlock[]) =>
  blocks.map((block) => canonicalData({ type: block.type, data: block.data }));

describe('the seeds of the redesign', () => {
  it('cover the eight pages, each opening with a hero (or a block that draws one)', () => {
    expect([...REDESIGN_SLUGS].sort()).toEqual(
      [
        '',
        'aanbod',
        'afspraak',
        'bikefit',
        'cadeaubon',
        'ons-team',
        'veelgestelde-vragen',
        'voor-wie',
      ].sort(),
    );
    for (const slug of REDESIGN_SLUGS) {
      expect(redesignProblems(slug, redesignTarget(slug)), slug).toEqual([]);
    }
  });

  it('use the new photographs and none of the generated images', () => {
    const text = JSON.stringify(REDESIGN_PAGES);
    for (const url of OLD_OFFERING_IMAGE_URLS) expect(text).not.toContain(url);
    expect(text).not.toContain('rutger-jeugd');
    for (const slot of [
      'samen-bergop',
      'muur-ronse-duo',
      'muur-ronse-bank',
      'band-wisselen',
      'jonge-fietser',
      'renner-rug',
      'rutger-klim',
      'zonsondergang-weg',
    ] as const) {
      expect(text, slot).toContain(String(editorialImage(slot).url));
    }
  });

  it('keep out what the owner removed on 27 Oct 2026', () => {
    const text = JSON.stringify(REDESIGN_PAGES);
    expect(text).not.toMatch(/schoenzolen|3D-geprint|diploma|gediplomeerd/i);
    expect(text).not.toMatch(/Reken op 2 uur|\d+ uur voor een bikefit/);
    expect(text).not.toMatch(/Lactaattest/);
    expect(text).toContain('{{duur:volwassenenfit}}');
  });

  it('the FAQ has the beginners first, under their anchor, then the eight questions', () => {
    const faq = redesignTarget('veelgestelde-vragen').find((block) => block.type === 'faq');
    const items = faq?.data.items as { question: string; group: string; groupAnchor: string }[];
    expect(items).toHaveLength(13);
    expect(items[0]).toMatchObject({ group: 'Nieuw op de fiets?', groupAnchor: 'beginners' });
    expect(items.slice(5).every((item) => item.group === 'Over de bikefit')).toBe(true);
  });
});

describe('the patch turns the frozen pages into the seeds', () => {
  for (const slug of REDESIGN_SLUGS) {
    it(`/${slug}: block for block, once, and nothing on a second run`, () => {
      const before = rows(slug, redesignBefore(slug));
      const { result, next } = apply(slug, before);
      expect(result.conflicts).toEqual([]);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(plain(next)).toEqual(plain(redesignTarget(slug)));

      const again = apply(slug, next);
      expect(again.result.changes).toEqual([]);
      expect(again.result.conflicts).toEqual([]);
      expect(again.result.next.some(isNew)).toBe(false);
    });
  }

  it('changes only what the redesign changes: no field of a block it keeps is touched otherwise', () => {
    const aanbod = redesignSpec('aanbod');
    const fields = aanbod?.edits.map((edit) => (edit.kind === 'set' ? edit.field : edit.kind));
    // The page head's button and photograph, the closing band's photograph.
    expect(fields?.sort()).toEqual(['image', 'image', 'primaryCta']);
  });

  it('converts the three blocks whose type changes', () => {
    const replaced = SITE_REDESIGN_SPECS.flatMap((spec) =>
      spec.blocks.flatMap((edit) =>
        edit.kind === 'replaceBlock' ? [`${spec.slug}: ${edit.select.label}`] : [],
      ),
    );
    expect(replaced).toEqual([
      ': cta "Goede begeleiding begint bij de juiste mensen."',
      'bikefit: imageText "Waarom is een bikefit belangrijk?"',
      'afspraak: richText "Voor je komt"',
    ]);
  });

  it('refuses a page an editor changed and leaves the change in place', () => {
    const before = rows('', redesignBefore('')).map((block) =>
      block.type === 'cta' && block.data.title === 'Goede begeleiding begint bij de juiste mensen.'
        ? { ...block, data: { ...block.data, body: 'Door de redactie herschreven.' } }
        : block,
    );
    const { result, next } = apply('', before);
    expect(result.conflicts).toEqual([
      expect.stringContaining('cta "Goede begeleiding begint bij de juiste mensen.": edited'),
    ]);
    expect(JSON.stringify(next)).toContain('Door de redactie herschreven.');

    const hero = rows('aanbod', redesignBefore('aanbod')).map((block) =>
      block.type === 'hero'
        ? {
            ...block,
            data: { ...block.data, primaryCta: { label: 'Bel', href: '/x', external: false } },
          }
        : block,
    );
    expect(apply('aanbod', hero).result.conflicts).toEqual([
      expect.stringContaining('hero "Ons aanbod".primaryCta: expected'),
    ]);
  });

  it('leaves the /aanbod subtitle production holds as it is', () => {
    const own =
      'Elke fietser is anders. Daarom werkt De Bikefit Studio uitsluitend met ervaren, gediplomeerde professionals. Samen zoeken we wat bij jou past: van je eerste kilometers tot een nieuw sportief doel. Persoonlijke fietsbegeleiding, in de studio of bij jou thuis.';
    const before = rows('aanbod', redesignBefore('aanbod')).map((block) =>
      block.type === 'hero' ? { ...block, data: { ...block.data, subtitle: own } } : block,
    );
    const { result, next } = apply('aanbod', before);
    expect(result.conflicts).toEqual([]);
    expect(next[0].data.subtitle).toBe(own);
  });
});

describe('the offering photographs', () => {
  it('one per offering, a real photograph', () => {
    expect(OFFERING_IMAGE_TARGETS.map((entry) => entry.slug).sort()).toEqual(
      DEFAULT_OFFERS.map((offer) => offer.content.slug).sort(),
    );
    for (const target of OFFERING_IMAGE_TARGETS) {
      expect(target.image.url).toMatch(/^\/images\/editorial\/.+-v1\.webp$/);
      expect(OLD_OFFERING_IMAGE_URLS).not.toContain(target.image.url);
    }
  });

  it('replaces a generated default or nothing, keeps an editor’s photo', () => {
    const target = OFFERING_IMAGE_TARGETS[0].image;
    expect(decideOfferingImage({ ...target }, target)).toEqual({ action: 'done' });
    expect(decideOfferingImage(null, target)).toEqual({ action: 'set', from: 'no image' });
    expect(decideOfferingImage({ mediaId: null, url: '' }, target)).toEqual({
      action: 'set',
      from: 'no image',
    });
    expect(
      decideOfferingImage({ mediaId: null, url: OLD_OFFERING_IMAGE_URLS[1], alt: 'x' }, target),
    ).toEqual({ action: 'set', from: OLD_OFFERING_IMAGE_URLS[1] });
    expect(decideOfferingImage({ mediaId: 'm1', url: null }, target).action).toBe('keep');
    expect(decideOfferingImage({ mediaId: null, url: '/brand/eigen.webp' }, target).action).toBe(
      'keep',
    );
  });
});
