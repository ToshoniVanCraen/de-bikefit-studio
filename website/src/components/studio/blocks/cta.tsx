import { StudioButtonLink, splitArrow } from '../link';
import { StudioImage, hasImage } from '../studio-image';
import { SectionHeading } from './section';
import type { BlockProps } from './types';

/**
 * `cta` — the call-to-action band ("Comfort is een keuze. Maak ze.").
 *
 * `accent` and `dark` are the same wine ground; `gray` is the cream band
 * (`.callout--cream` in the design). The buttons flip with the ground: on wine
 * the light button and the outlined light one, on cream the primary and the
 * ghost one, so the label keeps its contrast.
 *
 * Two looks derive from the data, so blocks stored before they existed render
 * in the new design without an edit:
 *
 *  - photo: a wine band with an `image` gets the picture behind a wine gradient
 *    (the picture is a background, so it is decorative and has no alt text);
 *    a `gray` band ignores the image, because the gradient is wine
 *  - compact: `size` `compact`, or `auto` with no `body` (a closing line),
 *    gives the slim band with the larger line
 */
export function CtaBlock({ data, anchor, headingLevel, locale }: BlockProps<'cta'>) {
  const onLight = data.variant === 'gray';
  const photo = !onLight && hasImage(data.image);
  const compact = data.size === 'compact' || (data.size === 'auto' && !data.body.trim());
  const className = [
    'studio-callout',
    onLight ? 'studio-callout--gray' : '',
    photo ? 'studio-callout--photo' : '',
    compact ? 'studio-callout--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={className} {...(anchor ? { id: anchor } : {})}>
      {photo ? (
        <div className="studio-callout__photo">
          <StudioImage image={{ ...data.image, decorative: true }} locale={locale} sizes="100vw" />
        </div>
      ) : null}
      <div className="studio-callout__inner">
        <div>
          <SectionHeading level={headingLevel} className="studio-callout__title">
            {data.title}
          </SectionHeading>
          {data.body ? <p className="studio-callout__body">{data.body}</p> : null}
        </div>
        {data.primaryCta || data.secondaryCta ? (
          <div className="studio-callout__actions">
            {data.primaryCta ? (
              <StudioButtonLink
                href={data.primaryCta.href}
                external={data.primaryCta.external}
                variant={onLight ? 'primary' : 'light'}
              >
                {splitArrow(data.primaryCta.label)}
              </StudioButtonLink>
            ) : null}
            {data.secondaryCta ? (
              <StudioButtonLink
                href={data.secondaryCta.href}
                external={data.secondaryCta.external}
                variant={onLight ? 'ghost' : 'outline-light'}
                arrow={false}
              >
                {splitArrow(data.secondaryCta.label)}
              </StudioButtonLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
