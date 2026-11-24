import { StudioButtonLink, splitArrow } from '../link';
import { PageHero } from '../page-hero';
import { StudioImage, hasImage } from '../studio-image';
import { SectionHeading } from './section';
import type { BlockProps } from './types';

/**
 * `hero` — two shapes, one block (24 Nov 2026 redesign):
 *
 *  - `variant: 'full'`     the landing hero (design `index.html .hero`): cream,
 *                          the block's photo as a cover on the right under a
 *                          cream veil from the left, the copy at most 600px.
 *  - `variant: 'pageHead'` the page hero on subpages (design `.page-hero`),
 *                          rendered by the shared `PageHero`: copy left, the
 *                          photo filling the right column. On a nested page
 *                          that opens on it, the breadcrumb (`page.crumbs`)
 *                          sits above the eyebrow.
 *
 * `titleEmphasis` is the second line of the title, "Meer plezier. *Op jouw
 * fiets.*": its own line, italic, in wine.
 *
 * The veil is a pseudo-element on `.studio-hero__photo`, invisible to screen
 * readers. Without a photo the hero is a plain cream band.
 */
export function HeroBlock({ data, anchor, headingLevel, locale, page }: BlockProps<'hero'>) {
  const actions =
    data.primaryCta || data.secondaryCta ? (
      <>
        {data.primaryCta ? (
          <StudioButtonLink
            href={data.primaryCta.href}
            external={data.primaryCta.external}
            variant="primary"
          >
            {splitArrow(data.primaryCta.label)}
          </StudioButtonLink>
        ) : null}
        {data.secondaryCta ? (
          <StudioButtonLink
            href={data.secondaryCta.href}
            external={data.secondaryCta.external}
            variant="ghost"
            arrow={false}
          >
            {splitArrow(data.secondaryCta.label)}
          </StudioButtonLink>
        ) : null}
      </>
    ) : null;

  if (data.variant === 'pageHead') {
    return (
      <PageHero
        anchor={anchor}
        headingLevel={headingLevel}
        crumbs={headingLevel === 1 ? page.crumbs : undefined}
        eyebrow={data.eyebrow}
        title={data.title}
        titleEmphasis={data.titleEmphasis}
        intro={data.subtitle}
        actions={actions}
        image={data.image}
        locale={locale}
      />
    );
  }

  const withImage = hasImage(data.image);

  return (
    <section className="studio-hero" {...(anchor ? { id: anchor } : {})}>
      {withImage ? (
        <div className="studio-hero__photo">
          <StudioImage image={data.image} locale={locale} sizes="100vw" priority />
        </div>
      ) : null}
      <div className="studio-hero__content">
        <div className="studio-hero__copy">
          {data.eyebrow ? <p className="studio-hero__eyebrow">{data.eyebrow}</p> : null}
          <SectionHeading level={headingLevel} className="studio-hero__title">
            {data.title}
            {data.titleEmphasis ? (
              <>
                {' '}
                <em>{data.titleEmphasis}</em>
              </>
            ) : null}
          </SectionHeading>
          {data.subtitle ? <p className="studio-hero__sub">{data.subtitle}</p> : null}
          {actions ? <div className="studio-hero__actions">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
