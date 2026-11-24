import { StudioButtonLink, splitArrow } from '../link';
import { SectionHeading } from './section';
import type { BlockProps } from './types';

/**
 * `welcome` — "Nieuw op de fiets?": the cream band for people who ride little
 * or not at all. Copy and two buttons on the left, white check-mark rows on
 * the right; stacked under 1080px.
 *
 * The title's second line (`titleEmphasis`) is set apart in italic accent like
 * the hero's. The band owns the cream ground itself (it is not a variant): it
 * reuses the shared section shell (`studio-section--gray`) for ground, gutter
 * and heading colours.
 */
export function WelcomeBlock({ data, anchor, headingLevel }: BlockProps<'welcome'>) {
  const paragraphs = data.body.split(/\n{2,}/).filter((text) => text.trim());

  return (
    <section
      className="studio-section studio-section--gray studio-welcome"
      {...(anchor ? { id: anchor } : {})}
    >
      <div className="studio-section__inner studio-welcome__grid">
        <div>
          {data.eyebrow ? <p className="studio-eyebrow">{data.eyebrow}</p> : null}
          <SectionHeading level={headingLevel} className="studio-welcome__title">
            {data.title}
            {data.titleEmphasis ? (
              <>
                {' '}
                <em>{data.titleEmphasis}</em>
              </>
            ) : null}
          </SectionHeading>
          {paragraphs.map((text, index) => (
            <p key={index} className="studio-welcome__body">
              {text}
            </p>
          ))}
          {data.primaryCta || data.secondaryCta ? (
            <div className="studio-welcome__actions">
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
            </div>
          ) : null}
        </div>
        <ul className="studio-welcome__list">
          {data.items.map((item, index) => (
            <li key={`${item.title}-${index}`} className="studio-welcome__item">
              <strong className="studio-welcome__item-title">{item.title}</strong>
              {item.body ? <span className="studio-welcome__item-body">{item.body}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
