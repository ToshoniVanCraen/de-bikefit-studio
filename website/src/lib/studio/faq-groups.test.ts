import { describe, expect, it } from 'vitest';
import { groupFaqItems, slugifyAnchor, type FaqItemLike } from './faq-groups';

const q = (question: string, group = '', groupAnchor = ''): FaqItemLike => ({
  question,
  answer: `${question} antwoord`,
  group,
  groupAnchor,
});

describe('slugifyAnchor', () => {
  it('makes a lower-case id without accents or punctuation', () => {
    expect(slugifyAnchor('Nieuw op de fiets?')).toBe('nieuw-op-de-fiets');
    expect(slugifyAnchor('Over de bikefit')).toBe('over-de-bikefit');
    expect(slugifyAnchor('Één ding, twee dingen')).toBe('een-ding-twee-dingen');
  });

  it('never returns an empty id', () => {
    expect(slugifyAnchor('???')).toBe('groep');
  });
});

describe('groupFaqItems', () => {
  it('keeps old flat data as one ungrouped section, in order', () => {
    const sections = groupFaqItems([q('a'), q('b'), q('c')]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ heading: '', id: null });
    expect(sections[0].items.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });

  it('puts consecutive equal groups under one heading', () => {
    const sections = groupFaqItems([
      q('a', 'Nieuw op de fiets?', 'beginners'),
      q('b', 'Nieuw op de fiets?'),
      q('c', 'Over de bikefit'),
      q('d', 'Over de bikefit'),
    ]);
    expect(sections.map((section) => section.heading)).toEqual([
      'Nieuw op de fiets?',
      'Over de bikefit',
    ]);
    expect(sections.map((section) => section.items.length)).toEqual([2, 2]);
  });

  it('uses the typed anchor of the group (beginners) and the slug of the heading otherwise', () => {
    const sections = groupFaqItems([
      q('a', 'Nieuw op de fiets?', 'beginners'),
      q('b', 'Over de bikefit'),
    ]);
    expect(sections.map((section) => section.id)).toEqual(['beginners', 'over-de-bikefit']);
  });

  it('takes the first typed anchor of a run, wherever in the run it sits', () => {
    const [section] = groupFaqItems([q('a', 'Groep'), q('b', 'Groep', 'eigen-id')]);
    expect(section.id).toBe('eigen-id');
  });

  it('keeps ids unique when a group comes back later', () => {
    const sections = groupFaqItems([q('a', 'Groep'), q('b', 'Andere'), q('c', 'Groep')]);
    expect(sections.map((section) => section.id)).toEqual(['groep', 'andere', 'groep-2']);
  });

  it('starts an ungrouped section for questions after a group, without a heading or id', () => {
    const sections = groupFaqItems([q('a', 'Groep'), q('b')]);
    expect(sections[1]).toMatchObject({ heading: '', id: null });
  });

  it('lists every question exactly once, so the FAQ JSON-LD (which reads the flat list) agrees', () => {
    const items = [q('a', 'X'), q('b', 'X'), q('c'), q('d', 'Y')];
    const flat = groupFaqItems(items).flatMap((section) => section.items.map((e) => e.index));
    expect(flat).toEqual([0, 1, 2, 3]);
  });
});
