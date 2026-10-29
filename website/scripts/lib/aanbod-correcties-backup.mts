/**
 * The JSON backup of `npm run cms:patch-aanbod-correcties`, written FIRST: no
 * backup, no write. It holds every row the apply touches, as it is now, and
 * names what the apply creates, so `--restore <file>` returns the database to
 * exactly that: the pages (row and draft blocks, which also brings back the
 * published snapshot), the main menu, the settings, the location, the changed
 * columns of the offerings and the services (the guardian rule among them), and
 * Toshoni's subscriptions (none when `--staging-retain-toshoni` kept him).
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
  version: z.literal(2),
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
  services: z.object({
    updated: z.array(
      z.object({ id: z.string(), slug: z.string(), row: rowSchema, fields: z.array(z.string()) }),
    ),
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

  // A service changed by its copy, guardian rule and duration is one entry with those fields.
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
  for (const entry of updated(plan.guardians))
    keep(entry.row, entry.row.slug, ['requiresGuardian']);
  for (const entry of updated(plan.durations)) {
    keep(entry.row, entry.row?.slug ?? entry.label, ['durationMinutes']);
  }

  return aanbodCorrectiesBackupSchema.parse({
    kind: 'aanbod-correcties-backup',
    version: 2,
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
    services: { updated: [...services.values()] },
    subscriptions: {
      providerId: plan.provider.provider?.id ?? null,
      removed: plan.provider.rows.map((row) => ({
        providerId: row.providerId,
        serviceId: row.serviceId,
        locationId: row.locationId,
      })),
    },
    guards: plan.guards,
  });
}

export async function readCorrectiesBackup(file: string): Promise<AanbodCorrectiesBackup> {
  const { readFile } = await import('node:fs/promises');
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'kind' in raw &&
    raw.kind === 'aanbod-correcties-backup' &&
    'version' in raw &&
    raw.version === 1
  ) {
    throw new Error(
      '27 Oct correction backup v1 requires the ef1ef63 restore code; this build only restores revised v2 backups',
    );
  }
  return aanbodCorrectiesBackupSchema.parse(raw);
}
