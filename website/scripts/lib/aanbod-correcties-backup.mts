/**
 * The JSON backup of `npm run cms:patch-aanbod-correcties`, written FIRST: no
 * backup, no write. It holds every row the apply touches, as it is now, and
 * names what the apply creates, so `--restore <file>` returns the database to
 * exactly that: the pages (row and draft blocks, which also brings back the
 * published snapshot), the main menu, the settings, the location, the changed
 * columns of the offerings and the services, the third variant rows, Toshoni's
 * subscriptions (none when `--staging-retain-toshoni` kept him), and what to
 * delete again (the package service, the variant row, the subscriptions the run
 * added, his package row included).
 *
 * Read by zod, like every backup of this family. `pages` and the menu are in
 * the shape of `aanbod-rollout-backup`, so the restore reuses
 * `restoreAanbodRollout`.
 */
import { z } from 'zod';
import type { CorrectiesPlan } from './aanbod-correcties-plan.mjs';
import { PROVIDER_MODES } from './aanbod-correcties-youth.mjs';

const rowSchema = z.record(z.string(), z.unknown());

export const aanbodCorrectiesBackupSchema = z.object({
  kind: z.literal('aanbod-correcties-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  locale: z.string(),
  driver: z.string(),
  /** What the apply did with Toshoni's offerings; a backup from before the mode: `remove`. */
  providerMode: z.enum(PROVIDER_MODES).default('remove'),
  pages: z.array(z.object({ row: rowSchema, blocks: z.array(rowSchema) })),
  /** The main menu as it was (`null` = it had no row); absent = not touched. */
  menu: z.object({ items: z.array(z.unknown()).nullable() }).nullable(),
  settings: z.array(z.object({ key: z.string(), existed: z.boolean(), value: z.unknown() })),
  location: z
    .object({
      id: z.string(),
      addressLines: z.array(z.string()),
      postalCode: z.string(),
      city: z.string(),
      country: z.string(),
    })
    .nullable(),
  offerings: z.array(
    z.object({ id: z.string(), slug: z.string(), row: rowSchema, fields: z.array(z.string()) }),
  ),
  variants: z.array(
    z.object({
      offeringId: z.string(),
      audience: z.string(),
      /** The row existed (empty): put its service and price back; else delete it. */
      existed: z.boolean(),
      serviceId: z.string().nullable(),
      priceCents: z.number().int().nullable(),
    }),
  ),
  services: z.object({
    updated: z.array(
      z.object({ id: z.string(), slug: z.string(), row: rowSchema, fields: z.array(z.string()) }),
    ),
    /** By slug: the ids do not exist yet; the subscriptions of such a service go with it. */
    created: z.array(z.object({ slug: z.string() })),
  }),
  subscriptions: z.object({
    providerId: z.string().nullable(),
    removed: z.array(
      z.object({
        providerId: z.string(),
        serviceId: z.string(),
        locationId: z.string().nullable(),
      }),
    ),
    /** Added to a service that already existed. */
    created: z.array(z.object({ providerId: z.string(), serviceId: z.string() })),
  }),
  guards: z.record(z.string(), z.number()),
});
export type AanbodCorrectiesBackup = z.infer<typeof aanbodCorrectiesBackupSchema>;

export function toJson(row: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

/** Everything the apply is about to change, as it is now. */
export function buildCorrectiesBackup(
  plan: CorrectiesPlan,
  driver: string,
): AanbodCorrectiesBackup {
  const updated = <T extends { action: string }>(entries: readonly T[]) =>
    entries.filter((entry) => entry.action === 'update');

  // A service changed by its copy and by its duration is one entry with both fields.
  const services = new Map<string, AanbodCorrectiesBackup['services']['updated'][number]>();
  const keep = (row: object | null, slug: string, fields: string[]) => {
    const id = (row as { id?: string } | null)?.id;
    if (!row || !id || fields.length === 0) return;
    const known = services.get(id);
    if (known) known.fields = [...new Set([...known.fields, ...fields])];
    else services.set(id, { id, slug, row: toJson(row), fields });
  };
  for (const entry of updated(plan.services))
    keep(entry.row, entry.slug, Object.keys(entry.writes));
  for (const entry of updated(plan.durations)) {
    keep(entry.row, entry.row?.slug ?? entry.label, ['durationMinutes']);
  }

  const packages = updated(plan.packages);
  return aanbodCorrectiesBackupSchema.parse({
    kind: 'aanbod-correcties-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    locale: plan.locale,
    driver,
    providerMode: plan.providerMode,
    pages: updated(plan.pages).flatMap((page) =>
      page.row ? [{ row: toJson(page.row), blocks: page.blocks.map(toJson) }] : [],
    ),
    menu:
      plan.menu.action === 'update'
        ? { items: (plan.menu.before as unknown[] | null) ?? null }
        : null,
    settings: updated(plan.settings).map((setting) => ({
      key: setting.key,
      existed: setting.existed,
      value: setting.before,
    })),
    location:
      plan.location.action === 'update' && plan.location.row
        ? {
            id: plan.location.row.id,
            addressLines: plan.location.row.addressLines,
            postalCode: plan.location.row.postalCode,
            city: plan.location.row.city,
            country: plan.location.row.country,
          }
        : null,
    offerings: updated(plan.offerings).flatMap((offering) =>
      offering.row
        ? [
            {
              id: offering.row.id,
              slug: offering.slug,
              row: toJson(offering.row),
              fields: Object.keys(offering.writes),
            },
          ]
        : [],
    ),
    variants: packages
      .filter((entry) => entry.variant !== 'exists')
      .map((entry) => ({
        offeringId: entry.offeringId,
        audience: 'youth-package',
        existed: entry.thirdBefore !== null,
        serviceId: entry.thirdBefore?.serviceId ?? null,
        priceCents: entry.thirdBefore?.priceCents ?? null,
      })),
    services: {
      updated: [...services.values()],
      created: packages.flatMap((entry) =>
        entry.service.kind === 'create' ? [{ slug: entry.service.facts.slug }] : [],
      ),
    },
    subscriptions: {
      providerId: plan.provider.provider?.id ?? null,
      removed: plan.provider.rows.map((row) => ({
        providerId: row.providerId,
        serviceId: row.serviceId,
        locationId: row.locationId,
      })),
      created: packages.flatMap((entry) => {
        const { service } = entry;
        return service.kind === 'existing'
          ? entry.subscribe.map((target) => ({
              providerId: target.providerId,
              serviceId: service.id,
            }))
          : [];
      }),
    },
    guards: plan.guards,
  });
}

export async function readCorrectiesBackup(file: string): Promise<AanbodCorrectiesBackup> {
  const { readFile } = await import('node:fs/promises');
  return aanbodCorrectiesBackupSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}
