import { StudioButtonLink, splitArrow } from '../link';
import { StudioImage, hasImage } from '../studio-image';
import { SectionHeading, sectionClass } from './section';
import type { BlockProps } from './types';

/**
 * `imageText` — photo and copy side by side (design `.split`, 24 Nov 2026).
 *
 *  - With a photo: the split, photo 4/5 beside the copy. `imagePosition:
 *    'left'` reverses the columns with CSS `order`, so the copy stays first in
 *    the DOM and in the reading and tab order at every width. A block with a
 *    quote takes the team look (design `.team-split`): wider copy, a muted
 *    paragraph and the quote as an italic wine line with a rule.
 *  - Without a photo: the copy alone as prose (design `.prose`), the quote as
 *    the italic wine lead line. The decorative panel of the first design is
 *    gone.
 *
 * Bullets are the "ticks" list (a short rule before each line).
 */
export function ImageTextBlock({ data, anchor, headingLevel, locale }: BlockProps<'imageText'>) {
  const dark = data.variant === 'dark';
  const withImage = hasImage(data.image);
  const reverse = data.imagePosition === 'left';
  const quoteLook = withImage && data.quote !== '';

  const copy = (
    <>
      {data.eyebrow ? <p className="studio-eyebrow">{data.eyebrow}</p> : null}
      {data.title ? (
        <SectionHeading
          level={headingLevel}
          className={withImage ? 'studio-split__title' : 'studio-h2'}
        >
          {data.title}
        </SectionHeading>
      ) : null}
      {data.paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {data.bullets.length > 0 ? (
        <ul className="studio-ticks">
          {data.bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {data.quote ? (
        <blockquote className={withImage ? 'studio-quote' : 'studio-lead'}>
          {data.quote}
          {data.quoteAttribution ? (
            <footer>
              <cite>{data.quoteAttribution}</cite>
            </footer>
          ) : null}
        </blockquote>
      ) : null}
      {data.facts.length > 0 ? (
        <div className="studio-facts">
          {data.facts.map((fact, index) => (
            <div key={index}>
              <span>{fact.label}</span>
              <span>{fact.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {data.cta ? (
        <p className="studio-stack">
          <StudioButtonLink
            href={data.cta.href}
            external={data.cta.external}
            variant={quoteLook && !dark ? 'primary' : dark ? 'outline-light' : 'ghost'}
          >
            {splitArrow(data.cta.label)}
          </StudioButtonLink>
        </p>
      ) : null}
    </>
  );

  return (
    <section className={sectionClass(data.variant)} {...(anchor ? { id: anchor } : {})}>
      <div className="studio-section__inner">
        {withImage ? (
          <div
            className={[
              'studio-split',
              reverse ? 'studio-split--reverse' : '',
              quoteLook ? 'studio-split--quote' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="studio-split__copy">{copy}</div>
            <div className="studio-split__visual">
              <StudioImage image={data.image} locale={locale} />
            </div>
          </div>
        ) : (
          <div className={`studio-rich${dark ? ' studio-rich--invert' : ''}`}>{copy}</div>
        )}
      </div>
    </section>
  );
}
