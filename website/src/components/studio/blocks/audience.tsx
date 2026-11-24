import { StudioImage, hasImage } from '../studio-image';
import { StudioSection } from './section';
import type { BlockProps } from './types';

/**
 * `audience` — "Voor wie is dit?".
 *
 * Two looks from one set of data. When at least one item has a picture the
 * block is a grid of photo tiles (white card, picture, number in the accent
 * colour, title, text; three columns). Without any picture it is a grid of
 * plain tiles (a wine rule, number, title, text; as many columns as items up
 * to four, three beyond that), which is how a block stored before the pictures
 * existed renders.
 *
 * The number is its own small line above the heading, so a screen reader reads
 * the heading as the title. Without a section title (the tiles follow the page
 * head directly, as on `/voor-wie`) the tile headings move up to `<h2>`, so the
 * outline never skips a level.
 */
export function AudienceBlock({ data, anchor, headingLevel, locale }: BlockProps<'audience'>) {
  const TileHeading = headingLevel === 1 || !data.title ? 'h2' : 'h3';
  const photos = data.items.some((item) => hasImage(item.image));
  const columns = data.items.length > 4 ? 3 : Math.max(data.items.length, 1);

  return (
    <StudioSection
      variant={data.variant}
      anchor={anchor}
      eyebrow={data.eyebrow}
      title={data.title}
      lede={data.lede}
      headingLevel={headingLevel}
    >
      {data.items.length > 0 ? (
        <div className={`studio-tiles studio-tiles--cols-${photos ? 3 : columns}`}>
          {data.items.map((item, index) =>
            photos ? (
              <article key={`${item.title}-${index}`} className="studio-photo-tile">
                {hasImage(item.image) ? (
                  <div className="studio-photo-tile__media">
                    <StudioImage
                      image={item.image}
                      locale={locale}
                      sizes="(max-width: 720px) 100vw, 33vw"
                    />
                  </div>
                ) : null}
                <div className="studio-photo-tile__body">
                  {item.number ? (
                    <small className="studio-photo-tile__num">{item.number}</small>
                  ) : null}
                  <TileHeading className="studio-photo-tile__title">{item.title}</TileHeading>
                  {item.body ? <p className="studio-photo-tile__text">{item.body}</p> : null}
                </div>
              </article>
            ) : (
              <article
                key={`${item.title}-${index}`}
                className={`studio-tile${item.featured ? ' studio-tile--featured' : ''}`}
              >
                {item.number ? <small className="studio-tile__num">{item.number}</small> : null}
                <TileHeading className="studio-tile__title">{item.title}</TileHeading>
                {item.body ? <p className="studio-tile__body">{item.body}</p> : null}
              </article>
            ),
          )}
        </div>
      ) : null}
    </StudioSection>
  );
}
