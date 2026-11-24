/**
 * Groups of a `faq` block: consecutive questions with the same `group` text sit
 * under one heading, and a group has an id that other pages can link to
 * (`/veelgestelde-vragen#beginners`). Plain module, no I/O.
 *
 * The data stays flat (`items`), so old blocks and the FAQPage JSON-LD
 * (`jsonld.ts` reads `items`) are untouched: grouping is only how the renderer
 * lays the same list out. A question without a group is rendered ungrouped.
 */

export type FaqItemLike = {
  question: string;
  answer: string;
  group: string;
  groupAnchor: string;
};

export type FaqSection<T extends FaqItemLike = FaqItemLike> = {
  /** The group heading; '' for questions without a group. */
  heading: string;
  /** The id of the heading, or null when the section has no heading. */
  id: string | null;
  /** The questions with their position in the whole list. */
  items: Array<{ item: T; index: number }>;
};

/** "Nieuw op de fiets?" becomes "nieuw-op-de-fiets"; accents are dropped. */
export function slugifyAnchor(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'groep';
}

export function groupFaqItems<T extends FaqItemLike>(items: readonly T[]): Array<FaqSection<T>> {
  const sections: Array<FaqSection<T>> = [];
  const usedIds = new Set<string>();

  items.forEach((item, index) => {
    const heading = item.group.trim();
    const last = sections[sections.length - 1];

    if (last && last.heading === heading) {
      last.items.push({ item, index });
      return;
    }
    sections.push({ heading, id: null, items: [{ item, index }] });
  });

  for (const section of sections) {
    if (!section.heading) continue;
    // The id typed on the first question of the run that has one wins; else the heading's slug.
    const typed = section.items.map(({ item }) => item.groupAnchor.trim()).find(Boolean);
    const base = typed || slugifyAnchor(section.heading);
    let id = base;
    for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`;
    usedIds.add(id);
    section.id = id;
  }
  return sections;
}
