import { groupFaqItems } from '@/lib/studio/faq-groups';
import { StudioSection } from './section';
import type { BlockProps } from './types';

/**
 * `faq` — "Veelgestelde vragen".
 *
 * Both shapes keep the question in a heading, so the list is navigable by
 * heading in a screen reader and every answer stays in the HTML (an answer
 * hidden behind JavaScript is an answer a crawler never sees). `collapsible`
 * uses `<details>`/`<summary>`, which needs no JavaScript at all; `openFirst`
 * starts the first question of the list open.
 *
 * Groups (`group`, `groupAnchor`): consecutive questions with the same group
 * text sit under one heading with an id (`#beginners`). The heading is one
 * level below the section title (`h2` when the section has no title of its
 * own) and the questions one level below the heading. Questions without a
 * group render as before.
 *
 * Whatever is rendered here is exactly what `faqJsonLd()` emits when
 * `emitStructuredData` is on — the two can never drift, because both read the
 * same `data.items`, and grouping never adds or drops a question.
 */
export function FaqBlock({ data, anchor, headingLevel }: BlockProps<'faq'>) {
  const sections = groupFaqItems(data.items);
  const GroupHeading = headingLevel === 1 || !data.title ? 'h2' : 'h3';
  const groupedQuestion = GroupHeading === 'h2' ? 'h3' : 'h4';

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
        <div className="studio-faq">
          {sections.map((section, sectionIndex) => {
            const Question = section.heading ? groupedQuestion : 'h3';
            return (
              <div key={`${section.heading}-${sectionIndex}`} className="studio-faq__section">
                {section.heading ? (
                  <GroupHeading
                    className="studio-faq__group"
                    {...(section.id ? { id: section.id } : {})}
                  >
                    {section.heading}
                  </GroupHeading>
                ) : null}
                {section.items.map(({ item, index }) =>
                  data.collapsible ? (
                    <details
                      className="studio-faq__item"
                      key={`${item.question}-${index}`}
                      {...(data.openFirst && index === 0 ? { open: true } : {})}
                    >
                      <summary className="studio-faq__summary">
                        <Question className="studio-faq__q">{item.question}</Question>
                      </summary>
                      <p className="studio-faq__a">{item.answer}</p>
                    </details>
                  ) : (
                    <div className="studio-faq__item" key={`${item.question}-${index}`}>
                      <Question className="studio-faq__q">{item.question}</Question>
                      <p className="studio-faq__a">{item.answer}</p>
                    </div>
                  ),
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </StudioSection>
  );
}
