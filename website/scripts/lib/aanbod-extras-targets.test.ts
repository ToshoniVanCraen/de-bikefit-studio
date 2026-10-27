import { describe, expect, it } from 'vitest';
import {
  decideExtras,
  extrasTargets,
  PREVIOUS_EXTRAS_TARGETS,
  UNSET,
  type ExtrasDecision,
  type ExtrasTarget,
  type StoredExtraState,
} from './aanbod-extras-targets.mjs';

/**
 * The rules of `cms:patch-aanbod-extras`, on plain data: what the targets are
 * (Toshoni, 27 Oct 2026: only the second bike is an extra, the three analyses
 * are included in every bikefit) and what the patch does with a database in
 * each state it can be in — fresh from migration 0015, the state of 20 Oct 2026
 * (staging and production), the target — and with an admin's own edit.
 */

const SECOND_BIKE = 'bikefit-tweede-fiets';
const ANALYSES = ['voetanalyse', 'zadelanalyse', 'afstellen-schoenplaatjes'] as const;
const BIKEFITS = ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets'] as const;

const targets = extrasTargets();

function targetOf(slug: string): ExtrasTarget {
  const target = targets.find((entry) => entry.slug === slug);
  if (!target) throw new Error(`no target for ${slug}`);
  return target;
}

/** An offering that already has the target. */
function atTarget(slug: string): StoredExtraState {
  const { isAddon, soldAlone, addonMinutes, addonOptions, addonSlugs } = targetOf(slug);
  return {
    isAddon,
    soldAlone,
    addonMinutes,
    addonOptions: addonOptions.map((choice) => ({ ...choice })),
    addonSlugs: [...addonSlugs],
  };
}

/** What the first version of this patch left (the second run also wrote the choices). */
function at20Oct(slug: string): StoredExtraState {
  const previous = PREVIOUS_EXTRAS_TARGETS.find((entry) => entry.slug === slug);
  if (!previous) throw new Error(`no state of 20 Oct for ${slug}`);
  return {
    isAddon: previous.isAddon,
    soldAlone: previous.soldAlone,
    addonMinutes: previous.addonMinutes,
    addonOptions: slug === SECOND_BIKE ? atTarget(SECOND_BIKE).addonOptions : [],
    addonSlugs: [...previous.addonSlugs],
  };
}

/** What migration 0015 leaves on every row. */
const fresh = (): StoredExtraState => ({ ...UNSET, addonOptions: [], addonSlugs: [] });

const NOTHING: ExtrasDecision = {
  columns: null,
  options: null,
  addonSlugs: null,
  changes: [],
  blockers: [],
};

/** What the apply leaves behind, from a decision. */
function applied(stored: StoredExtraState, decision: ExtrasDecision): StoredExtraState {
  return {
    ...stored,
    ...(decision.columns ?? {}),
    addonOptions: decision.options ?? stored.addonOptions,
    addonSlugs: decision.addonSlugs ?? stored.addonSlugs,
  };
}

describe('extrasTargets', () => {
  it('manages both bikefits, the second bike and the three analyses, in overview order', () => {
    expect(targets.map((target) => target.slug)).toEqual([
      'bikefit-nieuwe-fiets',
      'bikefit-huidige-fiets',
      SECOND_BIKE,
      ...ANALYSES,
    ]);
  });

  it('makes the second bike the only extra: an extra only, with its two choices', () => {
    expect(targets.filter((target) => target.isAddon).map((target) => target.slug)).toEqual([
      SECOND_BIKE,
    ]);
    expect(targetOf(SECOND_BIKE)).toMatchObject({
      isAddon: true,
      soldAlone: false,
      addonMinutes: 30,
      addonSlugs: [],
    });
    expect(
      targetOf(SECOND_BIKE).addonOptions.map(
        (choice) => `${choice.key}:${choice.minutes}:${choice.priceCents}`,
      ),
    ).toEqual(['zelfde-type:30:7500', 'ander-type:60:15000']);
  });

  it('lets both bikefits allow the second bike and nothing else', () => {
    for (const slug of BIKEFITS) {
      expect(targetOf(slug)).toMatchObject({
        ...UNSET,
        addonOptions: [],
        addonSlugs: [SECOND_BIKE],
      });
    }
  });

  it('keeps the three analyses managed, as offerings that are no extra and allow none', () => {
    for (const slug of ANALYSES) {
      expect(targetOf(slug)).toEqual({ slug, ...UNSET, addonOptions: [], addonSlugs: [] });
    }
  });

  it('copies the defaults: changing a target leaves the defaults alone', () => {
    const copy = extrasTargets();
    copy[2].addonOptions[0].minutes = 1;
    copy[0].addonSlugs.push('x');
    expect(extrasTargets()[2].addonOptions[0].minutes).toBe(30);
    expect(extrasTargets()[0].addonSlugs).toEqual([SECOND_BIKE]);
  });
});

describe('PREVIOUS_EXTRAS_TARGETS', () => {
  it('records the extras of 20 Oct 2026: the analyses +30 / +60 / +15 min, four links per bikefit', () => {
    expect(
      PREVIOUS_EXTRAS_TARGETS.filter((entry) => entry.isAddon).map(
        (entry) => `${entry.slug}:${entry.addonMinutes}:${entry.soldAlone}`,
      ),
    ).toEqual([
      `${SECOND_BIKE}:30:false`,
      'voetanalyse:30:true',
      'zadelanalyse:60:true',
      'afstellen-schoenplaatjes:15:true',
    ]);
    for (const slug of BIKEFITS) {
      expect(at20Oct(slug).addonSlugs).toEqual([SECOND_BIKE, ...ANALYSES]);
    }
  });
});

describe('decideExtras: a database in the state of 20 Oct 2026 (staging, production)', () => {
  it.each([
    ['voetanalyse', 30],
    ['zadelanalyse', 60],
    ['afstellen-schoenplaatjes', 15],
  ])('%s is no extra any more', (slug, minutes) => {
    expect(decideExtras(targetOf(slug), at20Oct(slug))).toEqual({
      ...NOTHING,
      columns: { isAddon: false, soldAlone: true, addonMinutes: null },
      changes: [`geen extra meer (was extra, ${minutes} min)`],
    });
  });

  it.each(BIKEFITS)('%s keeps the second bike and loses the three other links', (slug) => {
    expect(decideExtras(targetOf(slug), at20Oct(slug))).toEqual({
      ...NOTHING,
      addonSlugs: [SECOND_BIKE],
      changes: ["extra's: bikefit-tweede-fiets (3 verwijderd)"],
    });
  });

  it('leaves the second bike and its choices as they are', () => {
    expect(decideExtras(targetOf(SECOND_BIKE), at20Oct(SECOND_BIKE))).toEqual(NOTHING);
  });

  it('prunes the four links whatever their order', () => {
    const shuffled: StoredExtraState = {
      ...at20Oct('bikefit-huidige-fiets'),
      addonSlugs: ['zadelanalyse', SECOND_BIKE, 'afstellen-schoenplaatjes', 'voetanalyse'],
    };
    expect(decideExtras(targetOf('bikefit-huidige-fiets'), shuffled)).toMatchObject({
      addonSlugs: [SECOND_BIKE],
      changes: ["extra's: bikefit-tweede-fiets (3 verwijderd)"],
      blockers: [],
    });
  });

  it('writes only the choices of a second bike that had the first run but not the second', () => {
    const firstRunOnly: StoredExtraState = { ...at20Oct(SECOND_BIKE), addonOptions: [] };
    const decision = decideExtras(targetOf(SECOND_BIKE), firstRunOnly);
    expect(decision).toMatchObject({ columns: null, addonSlugs: null, blockers: [] });
    expect(decision.options?.map((choice) => choice.key)).toEqual(['zelfde-type', 'ander-type']);
    expect(decision.changes).toHaveLength(1);
    expect(decision.changes[0]).toMatch(/^keuzes: zelfde-type \(30 min, 7500 cent\)/);
  });
});

describe('decideExtras: a fresh database (migration 0015 only)', () => {
  it('gives the second bike its columns and its two choices', () => {
    const decision = decideExtras(targetOf(SECOND_BIKE), fresh());
    expect(decision.columns).toEqual({ isAddon: true, soldAlone: false, addonMinutes: 30 });
    expect(decision.options).toEqual(targetOf(SECOND_BIKE).addonOptions);
    expect(decision.addonSlugs).toBeNull();
    expect(decision.changes[0]).toBe('als extra te boeken, enkel als extra, +30 min');
    expect(decision.blockers).toEqual([]);
  });

  it.each(BIKEFITS)('links %s to the second bike', (slug) => {
    expect(decideExtras(targetOf(slug), fresh())).toEqual({
      ...NOTHING,
      addonSlugs: [SECOND_BIKE],
      changes: ["extra's: + bikefit-tweede-fiets"],
    });
  });

  it.each(ANALYSES)('has nothing to do for %s: it is no extra already', (slug) => {
    expect(decideExtras(targetOf(slug), fresh())).toEqual(NOTHING);
  });
});

describe('decideExtras: the target', () => {
  it('finds nothing to do on a database that has it', () => {
    for (const target of targets) {
      expect(decideExtras(target, atTarget(target.slug))).toEqual(NOTHING);
    }
  });

  it('reaches the target from a fresh database and from the state of 20 Oct 2026, and then stays', () => {
    for (const target of targets) {
      for (const start of [fresh(), at20Oct(target.slug)]) {
        const decision = decideExtras(target, start);
        expect(decision.blockers).toEqual([]);
        const end = applied(start, decision);
        expect(end).toEqual(atTarget(target.slug));
        expect(decideExtras(target, end)).toEqual(NOTHING);
      }
    }
  });
});

describe('decideExtras: what an admin changed in Beheer is never overwritten', () => {
  it('blocks an analysis whose extra time was changed', () => {
    const edited: StoredExtraState = { ...at20Oct('voetanalyse'), addonMinutes: 45 };
    const decision = decideExtras(targetOf('voetanalyse'), edited);
    expect(decision.columns).toBeNull();
    expect(decision.blockers).toEqual([
      'offering voetanalyse: the extra settings were changed in Beheer (als extra te boeken, ook apart, +45 min) — not touched',
    ]);
  });

  it('blocks an analysis that was made an extra only, and one that was given choices', () => {
    const extraOnly: StoredExtraState = { ...at20Oct('zadelanalyse'), soldAlone: false };
    expect(decideExtras(targetOf('zadelanalyse'), extraOnly).blockers).toHaveLength(1);
    const withChoices: StoredExtraState = {
      ...fresh(),
      addonOptions: [{ key: 'kort', label: 'Kort', minutes: 15, priceCents: 3000 }],
    };
    expect(decideExtras(targetOf('afstellen-schoenplaatjes'), withChoices).blockers).toEqual([
      'offering afstellen-schoenplaatjes: has its own keuzes (kort (15 min, 3000 cent)) — not touched',
    ]);
  });

  it('blocks a bikefit with some of the four links, with an extra of its own, or with five', () => {
    const slug = 'bikefit-nieuwe-fiets';
    for (const addonSlugs of [
      [SECOND_BIKE, 'voetanalyse', 'zadelanalyse'],
      [SECOND_BIKE, 'lactaattest'],
      ['lactaattest'],
      [SECOND_BIKE, 'voetanalyse', 'zadelanalyse', 'afstellen-schoenplaatjes', 'lactaattest'],
    ]) {
      const decision = decideExtras(targetOf(slug), { ...fresh(), addonSlugs });
      expect(decision.addonSlugs).toBeNull();
      expect(decision.blockers).toEqual([
        `offering ${slug}: has its own extra's (${addonSlugs.join(', ')}) — not touched`,
      ]);
    }
  });

  it('blocks a second bike with other choices or other minutes', () => {
    const otherChoices: StoredExtraState = {
      ...at20Oct(SECOND_BIKE),
      addonOptions: [
        { key: 'zelfde-type', label: 'Zelfde type fiets', minutes: 30, priceCents: 9900 },
      ],
    };
    expect(decideExtras(targetOf(SECOND_BIKE), otherChoices).blockers).toHaveLength(1);
    const otherMinutes: StoredExtraState = { ...at20Oct(SECOND_BIKE), addonMinutes: 45 };
    expect(decideExtras(targetOf(SECOND_BIKE), otherMinutes).blockers).toHaveLength(1);
  });

  it('judges the three groups on their own: a blocked group does not hide a change in another', () => {
    const decision = decideExtras(targetOf('bikefit-huidige-fiets'), {
      ...fresh(),
      isAddon: true,
      addonMinutes: 20,
    });
    // The columns were edited (blocked); the empty links are still planned.
    expect(decision.blockers).toHaveLength(1);
    expect(decision.columns).toBeNull();
    expect(decision.addonSlugs).toEqual([SECOND_BIKE]);
  });
});
