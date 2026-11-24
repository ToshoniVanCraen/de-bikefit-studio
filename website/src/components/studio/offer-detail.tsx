import type { SiteSettings } from '@/lib/cms/blocks';
import { OFFER_ENQUIRY_ANCHOR, OFFER_ENQUIRY_CTA_LABEL } from '@/lib/offer-enquiry/input';
import { formatDuration } from '@/lib/booking/format';
import {
  OFFER_CATEGORY_LABELS,
  OFFER_INDEX_PATH,
  offerBookingHref,
  offerBookingPath,
} from '@/lib/offers/catalogue';
import type { CatalogueOfferEntry } from '@/lib/offers/offer-catalogue';
import {
  OFFERING_STATUS_LABELS,
  type OfferingStatus,
  type ResolvedVariant,
} from '@/lib/offers/offering';
import { isSplitAudience } from '@/lib/offers/offering-audience';
import { offeringCtaLabel } from '@/lib/offers/offering-content';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';
import {
  breadcrumbJsonLd,
  jsonLdDocument,
  offeringServiceJsonLd,
  webPageJsonLd,
  type BreadcrumbEntry,
} from '@/lib/studio/jsonld';
import type { StudioLocale } from '@/lib/studio/locale';
import { absoluteUrl } from '@/lib/studio/site';
import { JsonLd } from './json-ld';
import { StudioButtonLink, StudioLink } from './link';
import { OfferEnquiryForm } from './offer-enquiry-form';
import { PageHero } from './page-hero';
import { StudioImage, hasImage } from './studio-image';

/**
 * `/aanbod/<slug>` — one offering, rendered from Beheer → Aanbod (there is no
 * CMS page behind it since 17 Oct 2026): its structured data, then the same
 * template for every offering (redesign of 24 Nov 2026): a page hero with the
 * breadcrumb line, title, intro, the call to action and the photograph, then
 * two columns. Left: the Duur / Kostprijs / Boeken bar, the notes, Doel,
 * Inhoud, Mogelijke extra's and, when asked for, the enquiry form. Right: the
 * sticky side panel with the photograph, the same three facts, the action and
 * the way back.
 *
 * Duur, Kostprijs and the call to action follow the offering's settings,
 * resolved on the server (`src/lib/offers/offer-catalogue.ts`):
 *
 *  - **bookable** (direct, ≥ 1 provider): the booking button to
 *    `/afspraak?dienst=<slug>#boeken`, where only this offering's variants are
 *    offered. A variant nobody offers right now is named as such;
 *  - **unavailable** (direct, nobody offers it right now): greyed out, the
 *    button is disabled and no availability is shown or suggested; the phone
 *    number stays as the way to ask;
 *  - **addon** (an extra that is not sold alone): the button opens the booking
 *    page itself, `/afspraak#boeken` with nothing preselected (27 Oct 2026,
 *    Toshoni); the note under the facts names the offerings it goes with.
 *    Without a bookable one it is the enquiry form when the offering is set
 *    to it, else nothing to click;
 *  - **enquiry** (asked for on purpose): the button scrolls to the enquiry
 *    form, which mails the studio (`src/lib/offer-enquiry/`).
 *
 * Duur of a direct offering comes from its variants' services; Kostprijs from
 * the prices set per variant ("Prijs op aanvraag" until then).
 */
export function OfferPageView({
  entry,
  settings,
  locale,
  parentTitle,
}: {
  entry: CatalogueOfferEntry;
  settings: SiteSettings;
  locale: StudioLocale;
  /** The title of the `/aanbod` page, for the breadcrumb. */
  parentTitle: string;
}) {
  const { offer, offering, content } = entry;
  const origin = absoluteUrl('/').replace(/\/+$/, '');
  const canonical = absoluteUrl(offer.path);
  const trail: BreadcrumbEntry[] = [
    { name: 'Home', url: `${origin}/` },
    { name: parentTitle, url: absoluteUrl(OFFER_INDEX_PATH) },
    { name: content.title, url: canonical },
  ];
  const description =
    content.metaDescription.trim() || settings.seo.defaultMetaDescription.trim() || undefined;

  const graph = jsonLdDocument([
    webPageJsonLd({
      origin,
      canonical,
      locale,
      title: content.title,
      description,
      structuredDataType: 'WebPage',
      hasBreadcrumb: true,
    }),
    breadcrumbJsonLd(canonical, trail),
    offeringServiceJsonLd({ content, offering, settings, origin, canonical }),
  ]);

  const status: OfferingStatus = offering.status;
  const hasPhone = Boolean(settings.contact.phoneLabel && settings.contact.phoneHref);
  const { phoneLabel, phoneHref } = hasPhone ? settings.contact : LEGAL_IDENTITY;

  return (
    <>
      <JsonLd data={graph} />
      <OfferDetail
        entry={entry}
        locale={locale}
        status={status}
        parentTitle={parentTitle}
        phoneLabel={phoneLabel}
        phoneHref={phoneHref}
      />
    </>
  );
}

function OfferDetail({
  entry,
  locale,
  status,
  parentTitle,
  phoneLabel,
  phoneHref,
}: {
  entry: CatalogueOfferEntry;
  locale: StudioLocale;
  status: OfferingStatus;
  parentTitle: string;
  phoneLabel: string;
  phoneHref: string;
}) {
  const { offer, offering, content, addonHosts } = entry;
  const variants = offering.variants;
  // An extra that is not sold alone: its button opens the booking page when an
  // offering that lists it is bookable; the visitor picks the fit there (the
  // note under the facts names them). Without one, the enquiry form (when the
  // offering is set to it), else nothing to click.
  const hasBookableHost = status === 'addon' && addonHosts.some((host) => host.bookable);
  const showEnquiry =
    status === 'enquiry' ||
    (status === 'addon' && !hasBookableHost && offering.bookingMode === 'enquiry');
  const partlyUnavailable =
    status === 'bookable' && variants.length > 1 && variants.some((variant) => !variant.bookable);
  const withImage = hasImage(content.image);
  const eyebrow = `Aanbod · ${OFFER_CATEGORY_LABELS[content.category]}`;
  // Under the goal there is a second heading level; without a goal the lists follow the h1 directly.
  const SubHeading = content.goal ? 'h3' : 'h2';

  const action =
    status === 'bookable' ? (
      <StudioButtonLink href={offerBookingHref(content.slug)} variant="primary">
        {offeringCtaLabel(content)}
      </StudioButtonLink>
    ) : hasBookableHost ? (
      <StudioButtonLink href={offerBookingPath()} variant="primary">
        Boek je bikefit
      </StudioButtonLink>
    ) : showEnquiry ? (
      <StudioButtonLink href={`#${OFFER_ENQUIRY_ANCHOR}`} variant="primary">
        {OFFER_ENQUIRY_CTA_LABEL}
      </StudioButtonLink>
    ) : (
      // Not a link: there is nothing to book. Disabled for real, and said in words.
      <button type="button" className="studio-btn studio-btn--primary" disabled>
        {OFFERING_STATUS_LABELS.unavailable}
      </button>
    );

  const unavailableNote =
    status === 'unavailable' ? (
      <p className="studio-offer__status-note">
        Op dit moment kan niemand {content.title} online inplannen, dus je kan het nu niet online
        boeken.
        {phoneLabel && phoneHref ? (
          <>
            {' '}
            Bel ons gerust op <a href={phoneHref}>{phoneLabel}</a>.
          </>
        ) : null}
      </p>
    ) : null;

  const addonNote =
    offering.isAddon && addonHosts.length > 0 ? (
      <p className="studio-offer__status-note">
        {status === 'addon' ? 'Deze extra boek je samen met ' : 'Ook te boeken als extra bij '}
        {addonHosts.map((host, index) => (
          <span key={host.slug}>
            {index === 0 ? '' : index === addonHosts.length - 1 ? ' of ' : ', '}
            <StudioLink href={host.path}>{host.title}</StudioLink>
          </span>
        ))}
        {offering.addonOptions.length > 0
          ? ` (${offer.priceLabel})`
          : offering.addonMinutes != null
            ? ` (${formatDuration(offering.addonMinutes)} extra, ${offer.priceLabel})`
            : ''}
        .
      </p>
    ) : null;

  return (
    <>
      <PageHero
        anchor="dienst"
        eyebrow={eyebrow}
        title={content.title}
        headingLevel={1}
        intro={content.intro}
        crumbs={[
          { label: 'Home', href: '/' },
          { label: parentTitle, href: OFFER_INDEX_PATH },
          { label: content.title },
        ]}
        actions={action}
        image={content.image}
        locale={locale}
      />

      <section className="studio-section">
        <div className="studio-section__inner">
          <div
            className={`studio-offer-detail${
              status === 'unavailable' ? ' studio-offer-detail--unavailable' : ''
            }`}
          >
            <div>
              <dl className="studio-offer-facts">
                <div>
                  <dt>Duur</dt>
                  <dd>{offer.durationLabel}</dd>
                </div>
                <div>
                  <dt>Kostprijs</dt>
                  <dd>{offer.priceLabel}</dd>
                </div>
                <div>
                  <dt>Boeken</dt>
                  <dd data-offer-status={status}>{OFFERING_STATUS_LABELS[status]}</dd>
                </div>
              </dl>
              {unavailableNote}
              {addonNote}
              {partlyUnavailable ? <PartlyUnavailable variants={variants} /> : null}

              {content.goal ? (
                <>
                  <p className="studio-eyebrow">Doel</p>
                  <h2 className="studio-offer-detail__goal">{content.goal}</h2>
                </>
              ) : null}

              {content.contents.length > 0 ? (
                <>
                  <SubHeading className="studio-offer-detail__heading">Inhoud</SubHeading>
                  <ul className="studio-offer__list">
                    {content.contents.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {content.extras.length > 0 ? (
                <>
                  <SubHeading className="studio-offer-detail__heading">
                    Mogelijke extra’s
                  </SubHeading>
                  <ul className="studio-offer__list">
                    {content.extras.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                  {content.extrasNote ? (
                    <p className="studio-offer__note">{content.extrasNote}</p>
                  ) : null}
                </>
              ) : null}

              {showEnquiry ? (
                <div className="studio-offer__enquiry" id={OFFER_ENQUIRY_ANCHOR}>
                  <OfferEnquiryForm
                    offerSlug={content.slug}
                    offerTitle={content.title}
                    audiences={variants.map((variant) => variant.audience).filter(isSplitAudience)}
                    headingTag="h2"
                    phoneLabel={phoneLabel}
                    phoneHref={phoneHref}
                  />
                </div>
              ) : null}
            </div>

            <aside className="studio-offer-side" aria-label="In het kort">
              {withImage ? (
                <div className="studio-offer-side__image">
                  {/* The hero shows the same photograph with its description. */}
                  <StudioImage
                    image={{ ...content.image, decorative: true }}
                    locale={locale}
                    sizes="(max-width: 1080px) 100vw, 33vw"
                  />
                </div>
              ) : null}
              <dl>
                <dt>Duur</dt>
                <dd>{offer.durationLabel}</dd>
                <dt>Kostprijs</dt>
                <dd>{offer.priceLabel}</dd>
                <dt>Boeken</dt>
                <dd>{OFFERING_STATUS_LABELS[status]}</dd>
              </dl>
              {action}
              <p className="studio-offer__note">
                <StudioLink href={OFFER_INDEX_PATH}>&larr; Terug naar het aanbod</StudioLink>
              </p>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

/** "Jeugd: tijdelijk niet online te boeken" under a partly bookable offering. */
function PartlyUnavailable({ variants }: { variants: ResolvedVariant[] }) {
  const missing = variants.filter((variant) => !variant.bookable).map((variant) => variant.label);
  return (
    <p className="studio-offer__status-note">
      {missing.join(' en ')}: {OFFERING_STATUS_LABELS.unavailable.toLowerCase()}.
    </p>
  );
}
