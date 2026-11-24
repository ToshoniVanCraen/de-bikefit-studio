import type { CSSProperties } from 'react';
import { focusPosition } from '@/lib/studio/photo-focus';
import { StudioImage, hasImage } from '../studio-image';
import { SectionHeading, sectionClass } from './section';
import type { BlockProps } from './types';

type Photo = BlockProps<'photoStrip'>['data']['images'][number];

/**
 * `photoStrip` — photos without a text section around them, in three layouts:
 *
 *  - `strip`    side by side, the first wider, the caption over the bottom left
 *               corner, a slow zoom on hover (no zoom for reduced motion)
 *  - `gallery`  optional eyebrow and title, then equal photos
 *  - `wide`     one full-bleed band: the first picture only, as a real image
 *               with its alt text (an `<img>` in a `<figure>`, not a CSS
 *               background, so assistive technology and crawlers see it)
 *
 * An image slot without a picture is skipped; a block without any renders
 * nothing. `focus` reaches the CSS as the custom property `--photo-focus`,
 * and only after `focusPosition()` has checked it is two percentages.
 */
export function PhotoStripBlock({ data, anchor, headingLevel, locale }: BlockProps<'photoStrip'>) {
  const photos = data.images.filter((photo) => hasImage(photo.image));
  if (photos.length === 0) return null;
  const idAttr = anchor ? { id: anchor } : {};

  if (data.layout === 'wide') {
    return (
      <section className="studio-photos studio-photos--wide" {...idAttr}>
        <figure className="studio-photos__figure" style={focusStyle(photos[0])}>
          <StudioImage image={photos[0].image} locale={locale} sizes="100vw" />
        </figure>
      </section>
    );
  }

  const sizes =
    data.layout === 'gallery' ? '(max-width: 720px) 100vw, 33vw' : '(max-width: 720px) 100vw, 40vw';

  return (
    <section
      className={`${sectionClass(data.variant)} studio-photos studio-photos--${data.layout}`}
      {...idAttr}
    >
      <div className="studio-section__inner">
        {data.eyebrow || data.title ? (
          <div className="studio-photos__head">
            {data.eyebrow ? <p className="studio-eyebrow">{data.eyebrow}</p> : null}
            {data.title ? <SectionHeading level={headingLevel}>{data.title}</SectionHeading> : null}
          </div>
        ) : null}
        <div className="studio-photos__grid" data-count={photos.length}>
          {photos.map((photo, index) => (
            <figure
              key={`${photo.caption}-${index}`}
              className={`studio-photos__figure${photo.caption ? ' studio-photos__figure--captioned' : ''}`}
              style={focusStyle(photo)}
            >
              <StudioImage image={photo.image} locale={locale} sizes={sizes} />
              {photo.caption ? (
                <figcaption className="studio-photos__caption">{photo.caption}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function focusStyle(photo: Photo): CSSProperties | undefined {
  const position = focusPosition(photo.focus);
  return position ? ({ '--photo-focus': position } as CSSProperties) : undefined;
}
