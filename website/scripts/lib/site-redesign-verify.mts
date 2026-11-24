/**
 * The check after `npm run cms:patch-site-redesign --apply`, on what visitors get: a second plan
 * finds nothing left and no blocker, the row counts moved by exactly the plan (pages, offerings,
 * services, providers, bookings, menus and settings not at all; blocks by the inserts minus the
 * replaced ones), every redesigned page reads through the public reader with the blocks of the
 * redesign (`redesignProblems`: the block types in order, a hero first, the `beginners` group on
 * the FAQ), and the offer catalogue shows each new photograph. An empty list means the redesign
 * is live as intended. Read-only; the readers are the cached ones of the site (in a script
 * `unstable_cache` is a pass-through, so they read the database).
 */
import { normalizeBlock, redesignProblems } from '@/lib/studio/seed-content/site-redesign';
import { sameValue } from './aanbod-correcties-targets.mjs';
import type { PlanDeps } from './aanbod-rollout.mjs';
import {
  planRedesign,
  redesignBlockers,
  redesignHasChanges,
  type RedesignPlan,
} from './site-redesign-plan.mjs';
import { describeCounts, readRedesignWorld } from './site-redesign-world.mjs';

/** `before` is the plan the apply wrote: its counts and the photographs it set. */
export async function verifyRedesign(deps: PlanDeps, before: RedesignPlan): Promise<string[]> {
  const world = await readRedesignWorld(deps);
  const plan = planRedesign(world);
  const problems = [...redesignBlockers(plan)];
  if (redesignHasChanges(plan)) {
    const pending = [...plan.pages, ...plan.offerings]
      .filter((entry) => entry.action === 'update')
      .map((entry) => ('path' in entry ? entry.path : entry.slug));
    problems.push(`a second plan still finds work: ${pending.join(', ')}`);
  }
  if (!sameValue(world.counts, before.expected)) {
    problems.push(
      `row counts are not what the plan expected: ${describeCounts(world.counts)} (expected ${describeCounts(before.expected)})`,
    );
  }

  const { getPublishedPage } = await import('@/lib/cms/content');
  for (const page of before.pages) {
    const live = await getPublishedPage(deps.locale, page.slug);
    if (!live) {
      problems.push(`page ${page.path}: the published page cannot be read`);
      continue;
    }
    const blocks = live.snapshot.blocks.flatMap((block) => {
      const result = normalizeBlock(block);
      return result ? [result] : [];
    });
    for (const problem of redesignProblems(page.slug, blocks)) {
      problems.push(`live ${page.path}: ${problem}`);
    }
  }

  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  let catalogue = await loadOfferCatalogue(deps.locale);
  if (catalogue.offers.length === 0) {
    // The store answers a failed read with an empty catalogue: one transport failure is read past.
    await new Promise((resolve) => setTimeout(resolve, 750));
    catalogue = await loadOfferCatalogue(deps.locale);
  }
  for (const offering of before.offerings.filter((entry) => entry.action === 'update')) {
    const shown = catalogue.bySlug[offering.slug]?.content.image.url ?? null;
    if (shown !== offering.image?.url) {
      problems.push(`catalogue: ${offering.slug} shows the image ${shown}`);
    }
  }
  return problems;
}
