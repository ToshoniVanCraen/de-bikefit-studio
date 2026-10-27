import type { BlockInstance } from '@/lib/cms/blocks';
import { sectionAnchors, visibleBlocks } from '@/lib/studio/blocks';
import { resolveCopy } from '@/lib/studio/copy-token-lookup';
import type { StudioLocale } from '@/lib/studio/locale';
import { AudienceBlock } from './audience';
import { BookingBlock } from './booking';
import { ContactBlock } from './contact';
import { CtaBlock } from './cta';
import { FaqBlock } from './faq';
import { GiftVoucherBlock } from './gift-voucher';
import { HeroBlock } from './hero';
import { ImageTextBlock } from './image-text';
import { LocationBlock } from './location';
import { OfferCatalogueBlock } from './offer-catalogue';
import { PricingBlock } from './pricing';
import { ProcessBlock } from './process';
import { RichTextBlock } from './rich-text';
import type { HeadingLevel } from './section';
import { ServicesBlock } from './services';
import { TeamBlock } from './team';
import { TestimonialBlock } from './testimonial';
import type { BlockPageContext } from './types';

/**
 * Maps `published_snapshot.blocks` onto components — the only place the public
 * site decides what a block looks like.
 *
 * Three invariants it enforces for the whole page:
 *
 *  1. **One `<h1>`.** The first hero owns it; if a page has no hero (the
 *     gift voucher page is a single `giftVoucher` block), the first visible
 *     section does. Every other section heading is an `<h2>`.
 *  2. **Placeholders never reach a visitor.** `visibleBlocks()` drops the
 *     `pricing` and `testimonial` blocks while `isPlaceholder` is set.
 *  3. **Stable anchors.** `sectionAnchors()` gives each section a readable
 *     `id` (`#werkwijze`, `#vragen`) that navigation can deep link to.
 *  4. **Copy tokens are resolved.** Every string of every block (titles, rich
 *     text under `html`, link labels and `href`s, FAQ answers) is passed
 *     through the copy tokens (`{{duur:…}}`, `{{prijs:…}}`, `{{extra:…}}`,
 *     `{{telefoon}}`, `{{adres}}`, `{{bedrijf}}`, `{{opvolging:…}}`, …;
 *     `copy-tokens.ts`) against the request's lookup, built once from the
 *     cached readers (`copy-token-lookup.ts`). A block that renders its own
 *     data from another source (booking, catalogue) resolves that source too.
 *     A page without a token never reads the lookup's sources.
 *
 * The switch is exhaustive over the registry: adding a block type there makes
 * this file fail to typecheck until a renderer exists for it.
 */
export async function BlockRenderer({
  blocks,
  locale,
  page,
}: {
  blocks: readonly BlockInstance[];
  locale: StudioLocale;
  page: BlockPageContext;
}) {
  const anchors = sectionAnchors(blocks);
  const visible = await resolveCopy(visibleBlocks(blocks), locale);
  const headingOwner = visible.find((block) => block.type === 'hero')?.id ?? visible[0]?.id;

  return (
    <>
      {visible.map((block) => (
        <StudioBlock
          key={block.id}
          block={block}
          anchor={anchors.get(block.id)}
          headingLevel={block.id === headingOwner ? 1 : 2}
          locale={locale}
          page={page}
        />
      ))}
    </>
  );
}

function StudioBlock({
  block,
  anchor,
  headingLevel,
  locale,
  page,
}: {
  block: BlockInstance;
  anchor?: string;
  headingLevel: HeadingLevel;
  locale: StudioLocale;
  page: BlockPageContext;
}) {
  const common = { anchor, headingLevel, locale, page };

  switch (block.type) {
    case 'hero':
      return <HeroBlock data={block.data} {...common} />;
    case 'richText':
      return <RichTextBlock data={block.data} {...common} />;
    case 'services':
      return <ServicesBlock data={block.data} {...common} />;
    case 'process':
      return <ProcessBlock data={block.data} {...common} />;
    case 'audience':
      return <AudienceBlock data={block.data} {...common} />;
    case 'faq':
      return <FaqBlock data={block.data} {...common} />;
    case 'cta':
      return <CtaBlock data={block.data} {...common} />;
    case 'imageText':
      return <ImageTextBlock data={block.data} {...common} />;
    case 'pricing':
      return <PricingBlock data={block.data} {...common} />;
    case 'contact':
      return <ContactBlock data={block.data} {...common} />;
    case 'testimonial':
      return <TestimonialBlock data={block.data} {...common} />;
    case 'booking':
      return <BookingBlock data={block.data} {...common} />;
    case 'offerCatalogue':
      return <OfferCatalogueBlock data={block.data} {...common} />;
    case 'giftVoucher':
      return <GiftVoucherBlock data={block.data} {...common} />;
    case 'team':
      return <TeamBlock data={block.data} {...common} />;
    case 'location':
      return <LocationBlock data={block.data} {...common} />;
    default: {
      // Exhaustiveness guard: a new registry type lands here as a type error.
      const exhaustive: never = block;
      void exhaustive;
      return null;
    }
  }
}
