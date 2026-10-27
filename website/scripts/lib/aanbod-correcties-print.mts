/**
 * The dry-run printout of `npm run cms:patch-aanbod-correcties`: one line per
 * entity, `~` planned, `=` as intended, then the guards line. Blockers (`!`)
 * and the closing verdict are printed by the caller (`aanbod-correcties-patch.mts`),
 * like every patch of this family. Pure: a function of the plan.
 *
 * What a plan line looks like on a database in the state of 20 Oct 2026
 * (staging and production, before the corrections of 27 Oct 2026):
 *
 *   ~ setting contact — address: Ninove → Halsesteenweg 406 a, 9403 Neigem; phone label: …
 *   ~ setting business — new row with the schema defaults
 *   ~ location De Bikefit Studio, Ninove — address: Ninove → Halsesteenweg 406 a, 9403 Neigem
 *   ~ variant bikefit-huidige-fiets — Jeugd – volledig pakket: add variant at € 275,00; …
 *   ~ page /afspraak — 3 change(s), then publish
 *   ~ provider Toshoni — 3 offering(s) removed: volwassenenfit, jeugdfit, …
 *   = guards: pages 12, blocks 80, offerings 9, variants 11, services 5, bookings 2, …
 */
import { type CorrectiesPlan, type PagePlan } from './aanbod-correcties-plan.mjs';
import type { Counts } from './aanbod-correcties-world.mjs';
import type { PlanDeps } from './aanbod-rollout.mjs';

type Log = PlanDeps['log'];
type Planned = { action: string; changes: string[] };

/** `~` with the changes, `=` when there is nothing to do; a blocked entry without changes prints nothing here. */
function show(log: Log, entry: Planned, label: string, intended = 'as intended') {
  if (entry.changes.length > 0) log('~', `${label} — ${entry.changes.join('; ')}`);
  else if (entry.action === 'none') log('=', `${label} — ${intended}`);
}

function showPage(log: Log, page: PagePlan) {
  if (page.note) {
    log('=', `page ${page.path} — ${page.note}`);
  } else if (page.changes.length > 0) {
    log(
      '~',
      `page ${page.path} — ${page.changes.length} change(s)${page.publish ? ', then publish' : ', draft only'}`,
    );
    for (const change of page.changes) log(' ', `  ${change}`);
  } else if (page.row) {
    log('=', `page ${page.path} — nothing to change`);
  }
}

const COUNT_LABELS: ReadonlyArray<keyof Counts> = [
  'pages',
  'blocks',
  'offerings',
  'variants',
  'services',
  'bookings',
  'providers',
  'subscriptions',
];

export function describeCounts(counts: Counts): string {
  return COUNT_LABELS.map((key) => `${key} ${counts[key]}`).join(', ');
}

/** "blocks 82 (+2), services 6 (+1)": only what moves. */
export function describeCountChanges(before: Counts, after: Counts): string {
  return COUNT_LABELS.filter((key) => after[key] !== before[key])
    .map(
      (key) =>
        `${key} ${after[key]} (${after[key] > before[key] ? '+' : ''}${after[key] - before[key]})`,
    )
    .join(', ');
}

export function printCorrectiesPlan(plan: CorrectiesPlan, log: Log): void {
  for (const setting of plan.settings) {
    show(log, setting, `setting ${setting.key}`);
    for (const note of setting.notes) log('=', `setting ${setting.key} — ${note}`);
  }
  show(log, plan.location, `location ${plan.location.row?.name ?? ''}`.trim());
  for (const entry of plan.packages) show(log, entry, `variant ${entry.slug}`);
  for (const service of plan.services) show(log, service, `service ${service.slug}`);
  for (const duration of plan.durations) {
    show(log, duration, `duration ${duration.label}`, duration.note || 'as intended');
  }
  for (const offering of plan.offerings) show(log, offering, `offering ${offering.slug}`);

  const { provider } = plan.provider;
  if (!provider) {
    log('=', 'provider Toshoni — no such provider');
  } else {
    show(log, plan.provider, `provider ${provider.displayName}`, 'no offerings left');
    if (plan.provider.rows.length > 0) {
      log(
        '→',
        `provider list: cached for up to 5 minutes, so ${provider.displayName} leaves the options within that time`,
      );
    }
  }

  show(log, plan.menu, 'menu main', 'Cadeaubon is in the menu');
  for (const page of plan.pages) showPage(log, page);

  log('=', `guards: ${describeCounts(plan.guards)}`);
  const moves = describeCountChanges(plan.guards, plan.expected);
  if (moves) log('→', `after the apply: ${moves}`);
}
