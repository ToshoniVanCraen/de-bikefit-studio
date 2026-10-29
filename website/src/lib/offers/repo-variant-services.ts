import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsServices, type CmsUserPublic } from '@/db/cms-schema';
import { slugify } from '@/lib/booking/format';
import { locationExists } from '@/lib/booking/repo-shared';
import { recordAudit } from '@/lib/cms/auth';
import type { RepoResult } from '@/lib/cms/repo';
import { OFFER_CATEGORIES } from './catalogue';
import type { VariantServiceInput } from './offering';
import { AUDIENCE_LABELS, audienceRank, type OfferingAudience } from './offering-audience';
import type { OfferingContent } from './offering-content';

/**
 * The booking service (`cms_services`) behind one variant of a directly
 * booked offering, split from `./repo.ts` (past the file-size limit) like
 * `./repo-addons.ts`. Called by `writeOffering()` after its permission check;
 * never on its own from a page or an action.
 *
 * Name, label, description, duration, buffer and location follow the
 * offering and are rewritten on every save; slug, price display and existing
 * bookings never are. A split offering has two services (Volwassene, Jeugd –
 * eenmalig), their order following the audiences. No service asks for a
 * guardian since 29 Oct 2026 (Toshoni): every save writes `requires_guardian`
 * false.
 */

/** The audience part of a new service's slug: `<offering slug>-volwassene`, `-jeugd`. */
const AUDIENCE_SLUGS: Record<OfferingAudience, string> = {
  all: '',
  adult: 'volwassene',
  youth: 'jeugd',
};

/** A service slug no other service in the locale uses: the base, else `-2`, `-3`, … */
async function freeServiceSlug(db: CmsDatabase, locale: string, base: string): Promise<string> {
  const taken = new Set(
    (
      await db
        .select({ slug: cmsServices.slug })
        .from(cmsServices)
        .where(eq(cmsServices.locale, locale))
    ).map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('no free service slug');
}

export type ServiceSyncContext = {
  db: CmsDatabase;
  actor: CmsUserPublic;
  locale: string;
  content: OfferingContent;
  direct: boolean;
};

/**
 * The `cms_services` row of one variant: created on the first save with
 * service facts, updated afterwards (by id, so bookings and subscriptions
 * keep pointing at it). Returns the service id, or the existing one unchanged
 * when no facts were given (an enquiry keeps whatever it had).
 */
export async function syncVariantService(
  context: ServiceSyncContext,
  audience: OfferingAudience,
  existingServiceId: string | null,
  service: VariantServiceInput | null,
): Promise<RepoResult<string | null>> {
  const { db, actor, locale, content, direct } = context;
  if (!service) return { ok: true, data: existingServiceId };
  if (!(await locationExists(service.locationId))) {
    return { ok: false, message: 'Deze locatie bestaat niet.' };
  }

  const label = AUDIENCE_LABELS[audience];
  const shared = {
    name: label ? `${content.title} – ${label}` : content.title,
    choiceLabel: label,
    description: content.summary,
    durationMinutes: service.durationMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    locationId: service.locationId,
    requiresGuardian: false,
    // A block of 10 000 per category, three slots per offering (one per audience of a split one).
    sortOrder:
      OFFER_CATEGORIES.indexOf(content.category) * 10_000 +
      content.sortOrder * 3 +
      audienceRank(audience),
    updatedAt: new Date(),
  };

  if (existingServiceId) {
    const [existing] = await db
      .select({ id: cmsServices.id, isActive: cmsServices.isActive })
      .from(cmsServices)
      .where(and(eq(cmsServices.id, existingServiceId), eq(cmsServices.locale, locale)))
      .limit(1);
    if (!existing) return { ok: false, message: 'Een gekozen dienst bestaat niet (meer).' };
    await db
      .update(cmsServices)
      .set({ ...shared, isActive: direct ? true : existing.isActive })
      .where(eq(cmsServices.id, existing.id));
    return { ok: true, data: existing.id };
  }

  const base = slugify(
    AUDIENCE_SLUGS[audience] ? `${content.slug}-${AUDIENCE_SLUGS[audience]}` : content.slug,
  );
  const slug = await freeServiceSlug(db, locale, base || 'dienst');
  const [created] = await db
    .insert(cmsServices)
    .values({
      ...shared,
      locale,
      slug,
      priceCents: null,
      showPrice: false,
      isActive: true,
      createdBy: actor.id,
    })
    .returning({ id: cmsServices.id });
  await recordAudit(db, actor, {
    action: 'service.create',
    entityType: 'cms_service',
    entityId: created.id,
    summary: `${shared.name} (via Aanbod)`,
  });
  return { ok: true, data: created.id };
}
