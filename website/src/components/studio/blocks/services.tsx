import { StudioLink, splitArrow } from '../link';
import { StudioImage, hasImage } from '../studio-image';
import { StudioSection } from './section';
import type { BlockProps } from './types';

/**
 * `services` — the card grid, in the two shapes of the 24 Nov 2026 design:
 *
 *  - every card carries a `label` ("01 / Houding") → the tiles of "Vier
 *    dingen, één positie" (design `.grid4 .tile`): label, heading and body
 *    under a 2px wine rule;
 *  - otherwise → white cards (design `.card`): heading, body, the duration as
 *    the small caps tag and the link as "Meer info →" at the bottom.
 *
 * `columns` only sets the *minimum* track width; the grid stays `auto-fit`, so
 * a four-column block becomes two and then one as the viewport narrows instead
 * of scrolling sideways.
 */

const MIN_TRACK: Record<number, string> = { 2: '420px', 3: '300px', 4: '240px' };

export function ServicesBlock({ data, anchor, headingLevel, locale }: BlockProps<'services'>) {
  const asTiles = data.cards.length > 0 && data.cards.every((card) => card.label.trim() !== '');
  const style = { '--studio-card-min': MIN_TRACK[data.columns] ?? '240px' } as React.CSSProperties;

  return (
    <StudioSection
      variant={data.variant}
      anchor={anchor}
      eyebrow={data.eyebrow}
      title={data.title}
      lede={data.lede}
      headingLevel={headingLevel}
    >
      {data.cards.length > 0 ? (
        <div className={asTiles ? 'studio-feature-grid' : 'studio-cards'} style={style}>
          {data.cards.map((card, index) => (
            <article
              key={`${card.title}-${index}`}
              className={asTiles ? 'studio-feature' : 'studio-card'}
            >
              {hasImage(card.image) ? (
                <div className="studio-card__media">
                  <StudioImage
                    image={card.image}
                    locale={locale}
                    sizes="(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 25vw"
                  />
                </div>
              ) : null}
              {card.label ? (
                <p className={asTiles ? 'studio-feature__num' : 'studio-card__meta'}>
                  {card.label}
                </p>
              ) : null}
              <h3 className={asTiles ? 'studio-feature__title' : 'studio-card__title'}>
                {card.title}
              </h3>
              {card.body ? (
                <p className={asTiles ? 'studio-feature__body' : 'studio-card__body'}>
                  {card.body}
                </p>
              ) : null}
              {card.duration ? <p className="studio-card__meta">{card.duration}</p> : null}
              {card.cta ? (
                <p>
                  <StudioLink
                    href={card.cta.href}
                    external={card.cta.external}
                    className="studio-link-arrow"
                  >
                    {splitArrow(card.cta.label)} <span aria-hidden="true">&rarr;</span>
                  </StudioLink>
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </StudioSection>
  );
}
