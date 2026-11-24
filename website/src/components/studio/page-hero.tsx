import { Fragment } from 'react';
import Link from 'next/link';
import type { CmsImageRef } from '@/lib/cms/blocks';
import type { StudioLocale } from '@/lib/studio/locale';
import type { HeadingLevel } from './blocks/section';
import { StudioImage, hasImage } from './studio-image';

/**
 * The page hero of the 24 Nov 2026 redesign (design `.page-hero`): a cream
 * band with the copy on the left (breadcrumb, eyebrow, title, intro, actions)
 * and, when there is one, the photo filling the right column edge to edge in
 * height. Without a photo the copy stands alone on the cream. At 720px and
 * below the photo moves under the copy and bleeds to the viewport edges.
 *
 * Shared by the `hero` block (variant `pageHead`) and the offer detail head,
 * so every subpage opens the same way. Server component; the photo goes
 * through `StudioImage` (optimised, `priority`: it is above the fold).
 */

export type PageHeroCrumb = {
  label: string;
  /** Omit (or null) for the current page, the last crumb. */
  href?: string | null;
};

export function PageHero({
  title,
  titleEmphasis,
  eyebrow,
  intro,
  crumbs,
  actions,
  image,
  locale,
  headingLevel = 1,
  anchor,
  className,
  children,
}: {
  /** The heading text; `titleEmphasis` adds the italic wine line under it. */
  title: React.ReactNode;
  titleEmphasis?: string;
  eyebrow?: string;
  intro?: string;
  /** Home → … → current page; shown above the eyebrow when given. */
  crumbs?: readonly PageHeroCrumb[];
  /** Buttons (`StudioButtonLink`s or a form trigger), laid out in a row. */
  actions?: React.ReactNode;
  image?: CmsImageRef | null;
  locale: StudioLocale;
  headingLevel?: HeadingLevel;
  anchor?: string;
  /** Extra classes on the `<section>` (a modifier of the caller's own). */
  className?: string;
  /** Anything else for the copy column, between the intro and the actions. */
  children?: React.ReactNode;
}) {
  const withImage = image ? hasImage(image) : false;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const classes = ['studio-pagehero', withImage ? 'studio-pagehero--image' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} {...(anchor ? { id: anchor } : {})}>
      <div className="studio-pagehero__inner">
        <div className="studio-pagehero__copy">
          {crumbs && crumbs.length > 0 ? (
            <StudioBreadcrumb crumbs={crumbs} className="studio-pagehero__crumbs" />
          ) : null}
          {eyebrow ? <p className="studio-eyebrow">{eyebrow}</p> : null}
          <Heading className="studio-pagehero__title">
            {title}
            {titleEmphasis ? (
              <>
                {' '}
                <em>{titleEmphasis}</em>
              </>
            ) : null}
          </Heading>
          {intro ? <p className="studio-pagehero__intro">{intro}</p> : null}
          {children}
          {actions ? <div className="studio-pagehero__actions">{actions}</div> : null}
        </div>
        {withImage && image ? (
          <div className="studio-pagehero__media">
            <StudioImage
              image={image}
              locale={locale}
              sizes="(max-width: 720px) 100vw, 50vw"
              priority
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The visible breadcrumb (design `.crumbs`): "Home / Aanbod / Voetanalyse".
 * The separators are decoration; the last crumb is the current page.
 */
export function StudioBreadcrumb({
  crumbs,
  className,
}: {
  crumbs: readonly PageHeroCrumb[];
  className?: string;
}) {
  return (
    <nav className={className} aria-label="Kruimelpad">
      <ol className="studio-breadcrumb">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${crumb.href ?? 'current'}-${index}`}>
            {index > 0 ? <li aria-hidden="true">/</li> : null}
            <li {...(crumb.href ? {} : { 'aria-current': 'page' as const })}>
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
