import { getSiteSettings } from '@/lib/cms/content';
import { loadOfferCatalogue } from '@/lib/cms/offers-content';
import {
  groupBookingChoices,
  resolveBookingSelection,
  type BookingSelection,
} from '@/lib/offers/catalogue';
import type { OfferCatalogue } from '@/lib/offers/offer-catalogue';
import { resolveCopy } from '@/lib/studio/copy-token-lookup';
import { editorialImage } from '@/lib/studio/editorial-images';
import { BookingWidget } from '../booking/booking-widget';
import { BookingHeadingLevel } from '../booking/heading-level';
import { loadBookingOptions, type BookingOptions } from '../booking/load';
import { OfferEnquiry } from '../booking/offer-enquiry';
import type { BookingWidgetProps } from '../booking/types';
import { StudioButtonLink } from '../link';
import { PageHero } from '../page-hero';
import { sectionClass, StudioSection } from './section';
import type { BlockProps } from './types';

/** The photograph beside the booking page's title (redesign of 24 Nov 2026), and its eyebrow default. */
const HERO_SLOT = 'band-wisselen' as const;
const HERO_EYEBROW = 'Afspraak maken';

/**
 * `booking` — the online booking widget.
 *
 * When the block owns the page's `<h1>` (`/afspraak`) it opens with the page
 * hero of the redesign: eyebrow, the block's title as the `<h1>`, its lede, a
 * ghost button with the studio's phone number (Instellingen → Contact) and a
 * photograph; the widget sits in the section below it. Anywhere else the block
 * keeps a plain section head.
 *
 * A server component: it reads services, providers and rules through
 * `@/lib/booking/content` (cached; live availability is fetched later by the
 * widget through `availabilityAction`) and hands the client widget nothing but
 * plain, serialisable props.
 *
 * The widget asks "Bij wie?" first (a provider, or "Iedereen": the beheerder
 * assigns afterwards), then the fit; a chosen provider narrows the fits to
 * what they offer. With only one provider for the service it does not ask
 * (`provider-choice.ts`). Slots carry their location (a provider may work from
 * several places), so `locations` lists every place a slot may name.
 *
 * `?dienst=<slug>` (validated by the route, passed as `page.requestedService`)
 * is resolved here with `resolveBookingSelection()`:
 *  - an offer linked to bookable services → the widget, narrowed to those
 *    services (preselected when there is one) and naming the offer;
 *  - an offer without a bookable service → a contact prompt that names the
 *    offer (`OfferEnquiry`), never the widget with an unrelated default;
 *  - a booking-service slug → the widget with that service preselected;
 *  - an unknown slug → the normal widget with a short notice.
 *
 * Offers are the public vocabulary on the plain widget too: services that a
 * shown offering links to appear once, under that offer, as a sub-selection
 * (`groupBookingChoices()`: "Bikefit – huidige fiets" → Volwassene / Jeugd);
 * services no offer links to stay directly selectable. The chosen SERVICE is
 * what is booked, with its own duration and availability.
 *
 * Extra's (20 Oct 2026): per service the catalogue says which extras a
 * visitor may tick (`addonsByService`); `?extra=<slug>` (validated by the
 * route as `page.requestedExtra`) ticks one in advance.
 *
 * Beheer → Aanbod decides which offer links which services: a service that is
 * a variant of an offering is offered only through that offering while it is
 * shown and booked directly (`withheldServiceIds`, also enforced by the
 * booking actions), labelled "Volwassene" / "Jeugd" and priced as set there.
 *
 * It never breaks the page: when the booking tables are unreachable (e.g. the
 * migration has not run yet) or nothing is bookable, the section shows a short
 * "bel ons" fallback with the studio's phone number instead.
 *
 * The section anchor defaults to `#boeken`, which the `/afspraak` hero links to.
 */
export async function BookingBlock({
  data,
  anchor,
  headingLevel,
  locale,
  page,
}: BlockProps<'booking'>) {
  const settings = await getSiteSettings(locale);
  const { phoneLabel, phoneHref, email } = settings.contact;

  let options: BookingOptions | null = null;
  try {
    options = await loadBookingOptions(locale, data.serviceIds);
  } catch {
    // A fixed code, never the error: a failed query's message holds the SQL and its bound values.
    console.error('[booking] widget_data_unavailable');
  }

  // Cached reader; without it the widget simply lists every service on its own.
  let catalogue: OfferCatalogue | null = null;
  try {
    catalogue = await loadOfferCatalogue(locale);
  } catch {
    console.error('[booking] offer_catalogue_unavailable');
  }
  const offers = catalogue?.offers ?? [];
  if (options && catalogue) {
    const withheld = new Set(catalogue.withheldServiceIds);
    const display = catalogue.variantDisplay;
    options = {
      ...options,
      services: options.services
        .filter((service) => !withheld.has(service.id))
        .map((service) => {
          const variant = display[service.id];
          const addons = catalogue.addonsByService[service.id] ?? [];
          if (!variant) return { ...service, addons };
          return {
            ...service,
            choiceLabel: variant.label || service.choiceLabel,
            priceLabel: variant.priceLabel,
            priceCents: variant.priceCents,
            addons,
          };
        }),
    };
  }
  const selection: BookingSelection = resolveBookingSelection({
    requested: page.requestedService,
    offers,
    services: options?.services ?? [],
  });

  // `options.rules` is already resolved by the loader; the settings' own texts need it here.
  const rules = options?.rules ?? (await resolveCopy(settings.booking, locale));
  // Headings inside the section sit one level below its title.
  const innerHeading = headingLevel === 1 ? 'h2' : 'h3';
  const section = {
    variant: data.variant,
    anchor: anchor ?? 'boeken',
    eyebrow: data.eyebrow,
    headingLevel,
  };

  const ownsHeading = headingLevel === 1;
  const hero = (title: string, lede: string) => (
    <PageHero
      eyebrow={data.eyebrow || HERO_EYEBROW}
      title={title}
      headingLevel={1}
      intro={lede}
      actions={
        phoneLabel && phoneHref ? (
          <StudioButtonLink href={phoneHref} variant="ghost" arrow={false}>
            {phoneLabel}
          </StudioButtonLink>
        ) : null
      }
      image={editorialImage(HERO_SLOT)}
      locale={locale}
    />
  );

  if (selection.kind === 'offer' && selection.serviceIds.length === 0) {
    const enquiry = (
      <OfferEnquiry
        offer={selection.offer}
        phoneLabel={phoneLabel}
        phoneHref={phoneHref}
        email={email}
        titleTag={innerHeading}
      />
    );
    const enquiryTitle = 'Je afspraak aanvragen';
    return ownsHeading ? (
      <>
        {hero(enquiryTitle, '')}
        <section className={sectionClass(data.variant)} id={section.anchor}>
          <div className="studio-section__inner">{enquiry}</div>
        </section>
      </>
    ) : (
      <StudioSection {...section} eyebrow="" title={enquiryTitle}>
        {enquiry}
      </StudioSection>
    );
  }

  const title = data.title || rules.introTitle;
  const lede = data.lede || rules.introText;

  let props: BookingWidgetProps | null = null;
  if (options && options.services.length > 0) {
    let services = options.services;
    let initialServiceId: string | null = null;
    let context: BookingWidgetProps['context'] = null;
    let notice = '';

    if (selection.kind === 'offer') {
      services = selection.serviceIds
        .map((id) => options.services.find((service) => service.id === id))
        .filter((service): service is (typeof services)[number] => Boolean(service));
      initialServiceId = selection.initialServiceId;
      context = { label: selection.offer.title, href: selection.offer.path };
    } else if (selection.kind === 'service') {
      initialServiceId = selection.serviceId;
    } else if (selection.kind === 'unknown') {
      notice = 'We vonden de gekozen dienst niet terug. Kies hieronder zelf je fit.';
    }

    const offered = new Set(services.map((service) => service.id));
    // Behind an offer link, only that offer groups: a service another offer
    // also links must not appear under that other offer's title here.
    const grouping =
      selection.kind === 'offer'
        ? offers.filter((offer) => offer.slug === selection.offer.slug)
        : offers;
    props = {
      services,
      locations: options.locations,
      choices: groupBookingChoices({ offers: grouping, services }),
      providers: options.providers.filter((provider) =>
        provider.services.some((entry) => offered.has(entry.serviceId)),
      ),
      todayYmd: options.todayYmd,
      rules: {
        timezone: options.rules.timezone,
        horizonDays: options.rules.horizonDays,
        cancelUntilHours: options.rules.cancelUntilHours,
        showProviderChoice: data.showProviderChoice && options.rules.showProviderChoice,
      },
      copy: {
        successTitle: data.successTitle,
        successText: data.successText || options.rules.confirmationText,
        phoneLabel,
        phoneHref,
      },
      initialServiceId,
      initialAddonSlugs: page.requestedExtra ? [page.requestedExtra] : [],
      context,
      notice,
    };
  }

  const body = props ? (
    <BookingHeadingLevel tag={innerHeading}>
      <BookingWidget {...props} />
    </BookingHeadingLevel>
  ) : (
    <div className="studio-booking__fallback">
      <p>
        Online boeken lukt op dit moment niet.
        {phoneLabel && phoneHref ? (
          <>
            {' '}
            Bel ons op <a href={phoneHref}>{phoneLabel}</a> en we zoeken samen een moment.
          </>
        ) : (
          ' Probeer het later opnieuw.'
        )}
      </p>
    </div>
  );

  return ownsHeading ? (
    <>
      {hero(title, lede)}
      <section className={sectionClass(data.variant)} id={section.anchor}>
        <div className="studio-section__inner">{body}</div>
      </section>
    </>
  ) : (
    <StudioSection {...section} title={title} lede={lede}>
      {body}
    </StudioSection>
  );
}
