import { describe, expect, it } from 'vitest';
import { validateBlock, validateNavigationItems } from '@/lib/cms/blocks';
import { giftVoucherSchema } from '@/lib/cms/blocks-aanbod';
import {
  GIFT_VOUCHER_DEFAULT_AMOUNTS,
  GIFT_VOUCHER_VALIDITY_NOTE,
} from '@/lib/gift-voucher/amounts';
import { AANBOD_PAGES, MAIN_MENU } from './aanbod';
import { CADEAUBON_CARD, CADEAUBON_PAGE, CADEAUBON_PATH } from './cadeaubon';
import {
  CADEAUBON_HOME_BLOCK,
  CADEAUBON_MENU_ITEM,
  CADEAUBON_PROMO,
  type CadeaubonPromo,
} from './cadeaubon-promo';
import type { SeedBlock, SeedNavigationItem } from './shared';

/**
 * The year-end promotion of the gift voucher (Toshoni, 27 Oct 2026) as a patch
 * would apply it: each instruction in `CADEAUBON_PROMO` is carried out here on
 * the content of the previous seeds, and must end on today's seeds.
 */

// What the previous seeds held, written out once more so the test is independent of the module.
const OLD_SUMMARY = 'Fietsplezier cadeau doen, met een bedrag en een boodschap naar keuze.';
const OLD_META =
  'Bestel een cadeaubon van De Bikefit Studio: je kiest zelf het bedrag en schrijft er een persoonlijke boodschap bij.';
/** The voucher block as `cms:seed` wrote it on 13 Oct 2026 (no suggested amounts, no validity). */
const LEGACY_VOUCHER_DATA = {
  sortOrder: 0,
  eyebrow: 'Aanbod',
  title: 'Cadeaubon',
  summary: OLD_SUMMARY,
  intro:
    'Geef iemand fietsplezier cadeau. Je kiest zelf het bedrag en schrijft er een persoonlijke boodschap bij. Na je bestelling sturen we je een factuur en een betaallink.',
  formTitle: 'Bestel je cadeaubon',
  sentTitle: 'Je bestelling is verstuurd',
  sentText: '',
};

function seedPage(slug: string) {
  const page = AANBOD_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`no seed page "${slug}"`);
  return page;
}

// ---- the instructions, carried out ------------------------------------------------

function insertMenuItem(
  items: readonly SeedNavigationItem[],
  promo: CadeaubonPromo['menu'],
): SeedNavigationItem[] {
  if (items.some((item) => item.href === promo.item.href)) return [...items];
  const index = items.findIndex((item) => item.label === promo.before);
  return index < 0
    ? [...items, promo.item]
    : [...items.slice(0, index), promo.item, ...items.slice(index)];
}

function insertHomeBlock(blocks: readonly SeedBlock[], promo: CadeaubonPromo['home']): SeedBlock[] {
  if (
    blocks.some(
      (block) => block.type === promo.block.type && block.data.title === promo.block.data.title,
    )
  ) {
    return [...blocks];
  }
  const index = blocks.findIndex((block) => block.type === promo.after);
  return index < 0
    ? [...blocks, promo.block]
    : [...blocks.slice(0, index + 1), promo.block, ...blocks.slice(index + 1)];
}

/** Edits guarded by the value they expect; `conflicts` names what an editor changed. */
function applyEdits(
  data: Record<string, unknown>,
  edits: CadeaubonPromo['aanbodCard']['edits'],
): { data: Record<string, unknown>; conflicts: string[] } {
  const next = { ...data };
  const conflicts: string[] = [];
  for (const edit of edits) {
    if (next[edit.field] === edit.to) continue;
    if (next[edit.field] === edit.from) next[edit.field] = edit.to;
    else conflicts.push(edit.field);
  }
  return { data: next, conflicts };
}

function withAdditions(
  data: Record<string, unknown>,
  additions: Readonly<Record<string, unknown>>,
) {
  const next = { ...data };
  for (const [field, value] of Object.entries(additions)) {
    if (!(field in next)) next[field] = structuredClone(value);
  }
  return next;
}

// ---------------------------------------------------------------------- menu ----

describe('main menu', () => {
  it('puts "Cadeaubon" → /cadeaubon in front of "Contact"', () => {
    expect(CADEAUBON_PROMO.menu).toEqual({
      key: 'main',
      item: { label: 'Cadeaubon', href: '/cadeaubon', external: false, group: '', children: [] },
      before: 'Contact',
    });
    expect(CADEAUBON_MENU_ITEM).toBe(CADEAUBON_PROMO.menu.item);
    expect(CADEAUBON_PATH).toBe('/cadeaubon');
  });

  it('is in the seed menu once, directly before "Contact"', () => {
    const labels = MAIN_MENU.map((item) => item.label);
    expect(labels).toEqual([
      'Aanbod',
      'Voor wie',
      'Bikefit',
      'Ons team',
      'Veelgestelde vragen',
      'Cadeaubon',
      'Contact',
    ]);
    expect(MAIN_MENU[labels.indexOf('Contact') - 1]).toEqual(CADEAUBON_PROMO.menu.item);
    expect(validateNavigationItems(MAIN_MENU).ok).toBe(true);
  });

  it('turns the previous menu into the seed menu, once', () => {
    const previous = MAIN_MENU.filter((item) => item.href !== CADEAUBON_PATH);
    expect(previous.map((item) => item.label)).toEqual([
      'Aanbod',
      'Voor wie',
      'Bikefit',
      'Ons team',
      'Veelgestelde vragen',
      'Contact',
    ]);
    const patched = insertMenuItem(previous, CADEAUBON_PROMO.menu);
    expect(patched).toEqual(MAIN_MENU);
    expect(insertMenuItem(patched, CADEAUBON_PROMO.menu)).toEqual(patched);
  });
});

// ---------------------------------------------------------------------- home ----

describe('home page', () => {
  const home = seedPage(CADEAUBON_PROMO.home.slug);

  it('says "Geef fietsplezier cadeau", names the three amounts and the validity, and sends to /cadeaubon', () => {
    const { data } = CADEAUBON_HOME_BLOCK;
    expect(CADEAUBON_HOME_BLOCK.type).toBe('cta');
    expect(data.variant).toBe('accent');
    expect(data.title).toBe('Geef fietsplezier cadeau');
    expect(data.primaryCta).toEqual({
      label: 'Bestel een cadeaubon',
      href: '/cadeaubon',
      external: false,
    });
    expect(data.secondaryCta).toBeNull();
    const body = String(data.body);
    for (const amount of GIFT_VOUCHER_DEFAULT_AMOUNTS) {
      expect(body).toContain(`€ ${amount.cents / 100}`);
    }
    expect(body).toContain(GIFT_VOUCHER_VALIDITY_NOTE);
    expect(body).toBe(
      'Kies een cadeaubon van € 75 of € 150, of van € 275 voor een volledige bikefit. Een cadeaubon is {{cadeaubon-geldigheid}} geldig na aankoop.',
    );
    expect(validateBlock(CADEAUBON_HOME_BLOCK.type, data).ok).toBe(true);
  });

  it('is the section right after the offer catalogue, and the only one that sends to the voucher page', () => {
    expect(CADEAUBON_PROMO.home.after).toBe('offerCatalogue');
    expect(home.blocks.map((block) => block.type).slice(0, 4)).toEqual([
      'hero',
      'offerCatalogue',
      'cta',
      'imageText',
    ]);
    expect(home.blocks[2]).toEqual(CADEAUBON_HOME_BLOCK);
    const links = home.blocks.filter((block) => JSON.stringify(block.data).includes('/cadeaubon'));
    expect(links).toEqual([CADEAUBON_HOME_BLOCK]);
  });

  it('turns the previous home page into the seed page, once', () => {
    const previous = home.blocks.filter((block) => block !== CADEAUBON_HOME_BLOCK);
    expect(previous).toHaveLength(home.blocks.length - 1);
    const patched = insertHomeBlock(previous, CADEAUBON_PROMO.home);
    expect(patched).toEqual(home.blocks);
    expect(insertHomeBlock(patched, CADEAUBON_PROMO.home)).toEqual(patched);
  });
});

// ----------------------------------------------------------------- the texts ----

describe('guarded text edits', () => {
  const { voucherPage, aanbodCard } = CADEAUBON_PROMO;
  const voucherBlock = CADEAUBON_PAGE.blocks[0];
  const catalogue = seedPage(aanbodCard.slug).blocks.find(
    (block) => block.type === aanbodCard.blockType,
  );
  const card = (catalogue?.data.extraCards as { href: string; summary: string }[]).find(
    (entry) => entry.href === aanbodCard.cardHref,
  );

  it('target the voucher page and the voucher card on /aanbod', () => {
    expect(voucherPage.slug).toBe('cadeaubon');
    expect(voucherPage.blockType).toBe(voucherBlock.type);
    expect(aanbodCard).toMatchObject({ slug: 'aanbod', blockType: 'offerCatalogue' });
    expect(card).toBeDefined();
    for (const edit of voucherPage.blockEdits) {
      expect(Object.keys(giftVoucherSchema.shape)).toContain(edit.field);
    }
    for (const edit of aanbodCard.edits) expect(Object.keys(card ?? {})).toContain(edit.field);
  });

  it('expect the previous texts and write what the seeds hold now', () => {
    expect(voucherPage.blockEdits).toEqual([
      { field: 'summary', from: OLD_SUMMARY, to: CADEAUBON_CARD.summary },
    ]);
    expect(aanbodCard.edits).toEqual([
      { field: 'summary', from: OLD_SUMMARY, to: CADEAUBON_CARD.summary },
    ]);
    expect(voucherPage.metaDescription).toEqual({
      from: OLD_META,
      to: CADEAUBON_PAGE.metaDescription,
    });
    expect(voucherBlock.data.summary).toBe(CADEAUBON_CARD.summary);
    expect(card?.summary).toBe(CADEAUBON_CARD.summary);
  });

  it('really change something, and nothing of the previous texts is left in the seeds', () => {
    for (const edit of [...voucherPage.blockEdits, ...aanbodCard.edits]) {
      expect(edit.to).not.toBe(edit.from);
    }
    expect(voucherPage.metaDescription.to).not.toBe(voucherPage.metaDescription.from);
    const seeds = JSON.stringify([AANBOD_PAGES, CADEAUBON_PAGE]);
    expect(seeds).not.toContain(OLD_SUMMARY);
    expect(seeds).not.toContain(OLD_META);
  });

  it('turn the stored voucher block and card into the seed, once', () => {
    const result = applyEdits(LEGACY_VOUCHER_DATA, voucherPage.blockEdits);
    expect(result.conflicts).toEqual([]);
    expect(result.data.summary).toBe(CADEAUBON_CARD.summary);
    expect(applyEdits(result.data, voucherPage.blockEdits)).toEqual(result);

    const oldCard = { ...card, summary: OLD_SUMMARY };
    expect(applyEdits(oldCard, aanbodCard.edits).data).toEqual(card);
  });

  it('refuse a text an editor changed, and leave it alone', () => {
    const edited = { ...LEGACY_VOUCHER_DATA, summary: 'Door de redactie herschreven.' };
    const result = applyEdits(edited, voucherPage.blockEdits);
    expect(result.conflicts).toEqual(['summary']);
    expect(result.data.summary).toBe('Door de redactie herschreven.');
  });

  it('keep the meta description a search result can show', () => {
    // The token resolves to "een jaar", so the text a search result shows is shorter than the raw one.
    expect(
      voucherPage.metaDescription.to.replace('{{cadeaubon-geldigheid}}', 'een jaar').length,
    ).toBeLessThanOrEqual(160);
    expect(voucherPage.metaDescription.to).toContain('Geldig {{cadeaubon-geldigheid}} na aankoop.');
  });
});

describe('fields the stored voucher block does not have yet', () => {
  const { blockAdditions } = CADEAUBON_PROMO.voucherPage;

  it('are the suggested amounts and the validity line', () => {
    expect(blockAdditions).toEqual({
      amounts: [
        { cents: 7500, caption: '' },
        { cents: 15000, caption: '' },
        { cents: 27500, caption: 'Volledige bikefit' },
      ],
      validityNote: 'Een cadeaubon is {{cadeaubon-geldigheid}} geldig na aankoop.',
    });
    expect(blockAdditions.amounts).not.toBe(GIFT_VOUCHER_DEFAULT_AMOUNTS);
  });

  it('are what the schema gives an old block anyway, so adding them changes nothing publicly', () => {
    for (const field of Object.keys(blockAdditions))
      expect(LEGACY_VOUCHER_DATA).not.toHaveProperty(field);
    const plain = validateBlock('giftVoucher', LEGACY_VOUCHER_DATA);
    const added = validateBlock('giftVoucher', withAdditions(LEGACY_VOUCHER_DATA, blockAdditions));
    expect(plain.ok && added.ok).toBe(true);
    expect(added).toEqual(plain);
  });

  it('are not added over an editor’s own value, an emptied one included', () => {
    const edited = { ...LEGACY_VOUCHER_DATA, amounts: [], validityNote: '' };
    expect(withAdditions(edited, blockAdditions)).toEqual(edited);
  });

  it('end on the seed block: the previous block, edited and added to, is today’s block', () => {
    const edited = applyEdits(LEGACY_VOUCHER_DATA, CADEAUBON_PROMO.voucherPage.blockEdits).data;
    const patched = validateBlock('giftVoucher', withAdditions(edited, blockAdditions));
    const seed = validateBlock(CADEAUBON_PAGE.blocks[0].type, CADEAUBON_PAGE.blocks[0].data);
    expect(patched.ok && seed.ok).toBe(true);
    expect(patched).toEqual(seed);
  });
});

// ----------------------------------------------------------------- the copy ----

describe('the copy', () => {
  const texts = [
    String(CADEAUBON_HOME_BLOCK.data.title),
    String(CADEAUBON_HOME_BLOCK.data.body),
    CADEAUBON_CARD.summary,
    CADEAUBON_PAGE.metaDescription,
    GIFT_VOUCHER_VALIDITY_NOTE,
    ...GIFT_VOUCHER_DEFAULT_AMOUNTS.map((amount) => amount.caption),
  ];

  it('writes no dash between sentences (Toshoni, 27 Oct 2026): a comma or a colon instead', () => {
    for (const text of texts) expect(text).not.toMatch(/ [-–—] /);
  });

  it('promises nothing the studio has not decided: no terms, refund, minimum or delivery', () => {
    for (const text of texts) {
      expect(text.toLowerCase()).not.toMatch(
        /voorwaarde|terugbetaal|terugbetalen|minimum|minstens|levering|verzend|maanden/,
      );
    }
  });
});
