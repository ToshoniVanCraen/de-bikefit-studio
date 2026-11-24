import { initialsFor } from '@/lib/studio/initials';
import type { CmsLink } from '@/lib/cms/blocks';
import { StudioButtonLink, splitArrow } from '../link';
import { StudioImage, hasImage } from '../studio-image';
import { StudioSection } from './section';
import type { BlockProps } from './types';

/**
 * `team` — one founder row per person: portrait (3:4) on the left, then the
 * name as a large display heading, the role in the accent colour and the bio
 * paragraphs.
 *
 * With several members the rows repeat, the portrait alternating left and
 * right on wide screens (stacked, portrait first, under 720px). The optional
 * block `cta` is one button row: under the bio when there is one member,
 * under the whole list when there are several.
 *
 * Without a real portrait the row shows the person's initials in the brand
 * palette; a generated image is never used as somebody's portrait. The
 * initials are decorative (the name is right beside them), so they are hidden
 * from assistive technology. `internalNote` is for editors and never rendered.
 *
 * Names are `<h3>` under the section title, and `<h2>` when the section has no
 * title of its own (the profiles follow "Ons team" directly) or owns the
 * page's `<h1>`.
 */
export function TeamBlock({ data, anchor, headingLevel, locale }: BlockProps<'team'>) {
  const NameHeading = headingLevel === 1 || !data.title ? 'h2' : 'h3';
  const single = data.members.length === 1;

  return (
    <StudioSection
      variant={data.variant}
      anchor={anchor}
      eyebrow={data.eyebrow}
      title={data.title}
      lede={data.lede}
      headingLevel={headingLevel}
    >
      {data.members.length > 0 ? (
        <>
          <ul className="studio-founders">
            {data.members.map((member, index) => (
              <li
                key={`${member.name}-${index}`}
                className={`studio-founder${index % 2 === 1 ? ' studio-founder--flip' : ''}`}
              >
                <div className="studio-founder__portrait">
                  {hasImage(member.image) ? (
                    <StudioImage
                      image={member.image}
                      locale={locale}
                      sizes="(max-width: 720px) 100vw, 40vw"
                    />
                  ) : (
                    <span className="studio-founder__initials" aria-hidden="true">
                      {initialsFor(member.name)}
                    </span>
                  )}
                </div>
                <div>
                  <NameHeading className="studio-founder__name">{member.name}</NameHeading>
                  {member.role ? <p className="studio-founder__role">{member.role}</p> : null}
                  {member.bio.filter(Boolean).map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="studio-founder__bio">
                      {paragraph}
                    </p>
                  ))}
                  {single && data.cta ? <TeamCta cta={data.cta} /> : null}
                </div>
              </li>
            ))}
          </ul>
          {!single && data.cta ? <TeamCta cta={data.cta} below /> : null}
        </>
      ) : null}
    </StudioSection>
  );
}

function TeamCta({ cta, below = false }: { cta: CmsLink; below?: boolean }) {
  return (
    <div className={`studio-founder__actions${below ? ' studio-founders__actions' : ''}`}>
      <StudioButtonLink href={cta.href} external={cta.external} variant="primary">
        {splitArrow(cta.label)}
      </StudioButtonLink>
    </div>
  );
}
