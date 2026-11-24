import { StudioLink, splitArrow } from '../link';
import { SectionHeading, sectionClass } from './section';
import type { BlockProps } from './types';

/**
 * `chooser` — "Keuzehulp": two to four cards, each one link as a whole.
 *
 * The whole card is the anchor (`StudioLink`, so internal paths, `tel:` and
 * external URLs all work), the heading inside it is the card's title. The
 * arrow after the link label is decoration. `BlockRenderer` has already
 * resolved copy tokens in every string, `href` and `linkLabel` included, so
 * `{{telefoon-href}}` has become a `tel:` link by the time it gets here.
 *
 * The anchor (`#keuzehulp`) comes from `ANCHOR_BY_TYPE`; other pages link to it.
 */
export function ChooserBlock({ data, anchor, headingLevel }: BlockProps<'chooser'>) {
  const CardHeading = headingLevel === 1 || !data.title ? 'h2' : 'h3';
  const count = Math.min(Math.max(data.choices.length, 2), 4);

  return (
    <section
      className={`${sectionClass(data.variant)} studio-chooser`}
      {...(anchor ? { id: anchor } : {})}
    >
      <div className="studio-section__inner">
        {data.eyebrow ? <p className="studio-eyebrow">{data.eyebrow}</p> : null}
        {data.title ? <SectionHeading level={headingLevel}>{data.title}</SectionHeading> : null}
        {data.lede ? <p className="studio-section__lede">{data.lede}</p> : null}
        <div className={`studio-chooser__grid studio-chooser__grid--${count}`}>
          {data.choices.map((choice, index) => (
            <StudioLink
              key={`${choice.title}-${index}`}
              href={choice.href}
              className={`studio-choice${choice.featured ? ' studio-choice--featured' : ''}`}
            >
              {choice.label ? <span className="studio-choice__label">{choice.label}</span> : null}
              <CardHeading className="studio-choice__title">{choice.title}</CardHeading>
              {choice.body ? <p className="studio-choice__body">{choice.body}</p> : null}
              {choice.linkLabel ? (
                <span className="studio-choice__link">
                  {splitArrow(choice.linkLabel)} <span aria-hidden="true">&rarr;</span>
                </span>
              ) : null}
            </StudioLink>
          ))}
        </div>
      </div>
    </section>
  );
}
