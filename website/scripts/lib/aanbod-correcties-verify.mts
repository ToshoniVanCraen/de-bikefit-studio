/**
 * The check after `npm run cms:patch-aanbod-correcties --apply`, on what
 * visitors get: a second plan (in the mode of the first) finds nothing left (so
 * no youth package exists and no youth service asks for a guardian), the row
 * counts moved by exactly the plan, and the public readers show the corrections
 * (the catalogue, the site settings, the main menu, the published pages, the
 * provider list: without Toshoni, or with `staging-retain` with him and every
 * offering he had). An empty list means the corrections are live as intended.
 * Read-only.
 *
 * The readers are the cached ones the site uses; in a script `unstable_cache`
 * is a pass-through, so they read the database. The catalogue read is repeated
 * once when it comes back empty: the store answers a failed read with an empty
 * catalogue (not cached), and one transport failure on Neon is read past.
 */
import { correctionProblems } from '@/lib/studio/seed-content/corrections-2026-10-27';
import { STUDIO_CONTACT_ADDRESS } from '@/lib/studio/seed-content/location-section';
import { AUDIENCE_LABELS } from '@/lib/offers/offering';
import {
  correctiesBlockers,
  correctiesHasChanges,
  defaultInputs,
  planCorrecties,
  type CorrectiesPlan,
} from './aanbod-correcties-plan.mjs';
import { describeCounts } from './aanbod-correcties-print.mjs';
import { sameValue } from './aanbod-correcties-targets.mjs';
import { readWorld, type World } from './aanbod-correcties-world.mjs';
import { STAGING_RETAIN_FLAG } from './aanbod-correcties-youth.mjs';
import type { PlanDeps } from './aanbod-rollout.mjs';
import {
  PHONE_HREF_AFTER,
  PHONE_LABEL_AFTER,
} from '@/lib/studio/seed-content/corrections-2026-10-27';

const SPLIT_LABELS = [AUDIENCE_LABELS.adult, AUDIENCE_LABELS.youth];
/** The two bikefits, split by audience (Volwassene, Jeugd – eenmalig) since 20 Oct 2026. */
const SPLIT_FITS = ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets'];

/** Sections of a plan that still have something to do, by name. */
function pendingSections(plan: CorrectiesPlan): string[] {
  const pending = (entries: ReadonlyArray<{ action: string }>) =>
    entries.some((entry) => entry.action === 'update');
  return [
    pending([plan.packageGuard]) && 'legacy package service',
    pending(plan.settings) && 'settings',
    pending([plan.location]) && 'location',
    pending(plan.services) && 'services',
    pending(plan.guardians) && 'guardian rule',
    pending(plan.durations) && 'durations',
    pending(plan.offerings) && 'offerings',
    pending([plan.provider]) && 'provider',
    pending([plan.menu]) && 'menu',
    pending(plan.pages) && 'pages',
  ].filter((name): name is string => typeof name === 'string');
}

type ListPublicProviders = typeof import('@/lib/booking/content').listPublicProviders;

/**
 * `staging-retain`: Toshoni (the provider the second plan finds) is in the
 * public provider list and still offers every service he offered before the
 * apply (with the same location).
 */
async function keptProviderProblems(
  world: World,
  plan: CorrectiesPlan,
  before: CorrectiesPlan,
  listPublicProviders: ListPublicProviders,
): Promise<string[]> {
  const toshoni = plan.provider.provider;
  if (!toshoni) return []; // the second plan's blocker says why
  const listed = async () =>
    (await listPublicProviders()).some((provider) => provider.id === toshoni.id);
  const problems: string[] = [];
  if (!(await listed())) {
    problems.push(
      `providers: ${toshoni.displayName} is not in the public provider list (${STAGING_RETAIN_FLAG} keeps him)`,
    );
  }
  const now = world.subscriptions.filter((row) => row.providerId === toshoni.id);
  const lost = before.provider.kept.filter(
    (row) =>
      !now.some(
        (entry) => entry.serviceId === row.serviceId && entry.locationId === row.locationId,
      ),
  );
  if (lost.length > 0) {
    problems.push(
      `providers: ${toshoni.displayName} lost ${lost.length} of the ${before.provider.kept.length} offering(s) he had before the apply`,
    );
  }
  return problems;
}

/** `before` is the plan the apply wrote: its mode, its counts and what it kept. */
export async function verifyCorrecties(deps: PlanDeps, before: CorrectiesPlan): Promise<string[]> {
  const world = await readWorld(deps);
  const plan = planCorrecties(
    world,
    defaultInputs(),
    before.providerMode,
    before.reconcilePackageService,
  );
  const problems = [...correctiesBlockers(plan)];
  if (correctiesHasChanges(plan)) {
    problems.push(`a second plan still finds work: ${pendingSections(plan).join(', ')}`);
  }
  if (!sameValue(world.counts, before.expected)) {
    problems.push(
      `row counts are not what the plan expected: ${describeCounts(world.counts)} (expected ${describeCounts(before.expected)})`,
    );
  }

  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const { getNavigation, getPublishedPage, getSiteSettings } = await import('@/lib/cms/content');
  const { listPublicProviders } = await import('@/lib/booking/content');
  const inputs = defaultInputs();

  // The catalogue: two labelled variants on both bikefits, the free-text price, the durations.
  let catalogue = await loadOfferCatalogue(deps.locale);
  if (catalogue.offers.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    catalogue = await loadOfferCatalogue(deps.locale);
  }
  for (const slug of SPLIT_FITS) {
    const labels = catalogue.bySlug[slug]?.offering.variants.map((variant) => variant.label);
    if (!sameValue(labels, SPLIT_LABELS)) {
      problems.push(
        `catalogue: ${slug} shows ${JSON.stringify(labels ?? null)}, expected ${JSON.stringify(SPLIT_LABELS)}`,
      );
    }
  }
  for (const correction of inputs.offeringTexts) {
    const priceText = correction.to.priceText?.trim();
    const live = catalogue.bySlug[correction.slug];
    if (priceText && live?.offer.priceLabel !== priceText) {
      problems.push(`catalogue: ${correction.slug} shows the price "${live?.offer.priceLabel}"`);
    }
  }
  for (const target of inputs.durations) {
    for (const variant of catalogue.bySlug[target.slug]?.offering.variants ?? []) {
      if (
        variant.serviceId &&
        variant.durationMinutes !== null &&
        variant.durationMinutes !== target.minutes
      ) {
        problems.push(
          `catalogue: ${target.slug} takes ${variant.durationMinutes} min, expected ${target.minutes}`,
        );
      }
    }
  }

  // The site settings, as the footer and the JSON-LD read them.
  const { contact } = await getSiteSettings(deps.locale);
  if (
    !sameValue(contact.addressLines, STUDIO_CONTACT_ADDRESS.addressLines) ||
    contact.postalCode !== STUDIO_CONTACT_ADDRESS.postalCode ||
    contact.city !== STUDIO_CONTACT_ADDRESS.city
  ) {
    problems.push('settings: the contact address is not the studio address');
  }
  if (contact.phoneLabel !== '' && contact.phoneLabel !== PHONE_LABEL_AFTER) {
    problems.push(`settings: the phone label is ${contact.phoneLabel}`);
  }
  if (contact.phoneHref !== '' && contact.phoneHref !== PHONE_HREF_AFTER) {
    problems.push(`settings: the phone link is ${contact.phoneHref}`);
  }

  // The menu: "Cadeaubon" in front of "Contact".
  const menu = (await getNavigation(deps.locale, 'main')).map((item) => item.label);
  if (!(menu.includes('Cadeaubon') && menu.indexOf('Cadeaubon') < menu.indexOf('Contact'))) {
    problems.push(`menu: Cadeaubon is not before Contact (${menu.join(', ')})`);
  }

  // The pages, draft and published: the location section, the voucher section, no old texts.
  const { promo, locationSlug } = inputs.pages;
  const hasBlock = (
    blocks: ReadonlyArray<{ type: string; data: unknown }>,
    type: string,
    title?: string,
  ) =>
    blocks.some(
      (block) =>
        block.type === type &&
        (title === undefined || (block.data as { title?: unknown }).title === title),
    );
  for (const entry of world.pages) {
    const draft = entry.blocks.map((block) => ({ type: block.type, data: block.data }));
    if (entry.row.slug === locationSlug && !hasBlock(draft, 'location')) {
      problems.push(`page /${locationSlug}: the draft has no location block`);
    }
    if (
      entry.row.slug === promo.home.slug &&
      !hasBlock(draft, promo.home.block.type, String(promo.home.block.data.title))
    ) {
      problems.push('page /: the draft has no gift voucher section');
    }
    if (entry.row.status !== 'published') continue;
    const live = await getPublishedPage(deps.locale, entry.row.slug);
    const blocks = (live?.snapshot.blocks ?? []).map((block) => ({
      type: block.type,
      data: block.data as Record<string, unknown>,
    }));
    if (!live) problems.push(`page /${entry.row.slug}: the published page cannot be read`);
    if (entry.row.slug === locationSlug && !hasBlock(blocks, 'location')) {
      problems.push(`page /${locationSlug}: the published page has no location block`);
    }
    if (
      entry.row.slug === promo.home.slug &&
      !hasBlock(blocks, promo.home.block.type, String(promo.home.block.data.title))
    ) {
      problems.push('page /: the published page has no gift voucher section');
    }
    for (const problem of correctionProblems(entry.row.slug, blocks)) {
      problems.push(`live /${entry.row.slug}: ${problem}`);
    }
  }

  // Toshoni no longer shows as an Aanbieder (or, with `staging-retain`, still does): the
  // provider the second plan finds by the same identity (`isToshoni`), looked up by id;
  // two matches are a blocker of that plan.
  const toshoni = plan.provider.provider;
  if (before.providerMode === 'staging-retain') {
    problems.push(...(await keptProviderProblems(world, plan, before, listPublicProviders)));
  } else if (
    toshoni &&
    (await listPublicProviders()).some((provider) => provider.id === toshoni.id)
  ) {
    problems.push(`providers: ${toshoni.displayName} is still in the public provider list`);
  }
  return problems;
}
