import { getSiteSettings } from '@/lib/cms/content';
import { formatPrice } from '@/lib/booking/format';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';
import { editorialImage } from '@/lib/studio/editorial-images';
import { GiftVoucherForm } from '../gift-voucher/order-form';
import { PageHero } from '../page-hero';
import { StudioImage, hasImage } from '../studio-image';
import type { BlockProps } from './types';

/**
 * `giftVoucher` — the "Cadeaubon" page at `/cadeaubon` (redesign of 24 Nov
 * 2026): a page hero (it owns the `<h1>`) with the eyebrow, title, intro and a
 * photograph, then two columns: the order form with its suggested amounts on
 * the left, a cream side panel on the right (photograph, a short title, the
 * amounts in a sentence and the one-line validity, "Een cadeaubon is een jaar
 * geldig na aankoop", Toshoni, 27 Oct 2026).
 *
 * The photographs are fixed editorial slots and the side title is a default in
 * code: the block has no fields for them yet. The side text is built from the
 * block's own amounts, so it never states a figure the editor did not set.
 *
 * The form posts to a server action that e-mails the studio; there is no
 * payment, invoice or voucher code on the site. The phone number from
 * Instellingen → Contact is the fallback whenever the request cannot be sent;
 * if that is empty, the legal identity's number (as on the error pages), so the
 * visitor always gets a working way out besides e-mail.
 */

const HERO_SLOT = 'muur-ronse-duo' as const;
const SIDE_SLOT = 'jonge-fietser' as const;
const SIDE_TITLE = 'Geef fietsplezier cadeau';

/** "Kies een cadeaubon van € 75, € 150 of € 275, of een bedrag naar keuze." */
function sideText(amounts: readonly { cents: number }[]): string {
  const labels = amounts.map((amount) => formatPrice(amount.cents));
  if (labels.length === 0) return 'Kies zelf het bedrag van je cadeaubon.';
  const list =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} of ${labels.at(-1)}`;
  return `Kies een cadeaubon van ${list}, of een bedrag naar keuze.`;
}

export async function GiftVoucherBlock({
  data,
  anchor,
  headingLevel,
  locale,
}: BlockProps<'giftVoucher'>) {
  const settings = await getSiteSettings(locale);
  const hasPhone = Boolean(settings.contact.phoneLabel && settings.contact.phoneHref);
  const { phoneLabel, phoneHref } = hasPhone ? settings.contact : LEGAL_IDENTITY;
  const innerHeading = headingLevel === 1 ? 'h2' : 'h3';
  const sideImage = editorialImage(SIDE_SLOT);

  return (
    <>
      <PageHero
        eyebrow={data.eyebrow}
        title={data.title}
        headingLevel={headingLevel}
        intro={data.intro}
        image={editorialImage(HERO_SLOT)}
        locale={locale}
      />

      <section className="studio-section" {...(anchor ? { id: anchor } : {})}>
        <div className="studio-section__inner">
          <div className="studio-offer-detail">
            <GiftVoucherForm
              formTitle={data.formTitle}
              sentTitle={data.sentTitle}
              sentText={data.sentText}
              validityNote={data.validityNote}
              amounts={data.amounts}
              headingTag={innerHeading}
              phoneLabel={phoneLabel}
              phoneHref={phoneHref}
            />
            <aside className="studio-offer-side" aria-label="In het kort">
              {hasImage(sideImage) ? (
                <div className="studio-offer-side__image">
                  <StudioImage
                    image={sideImage}
                    locale={locale}
                    sizes="(max-width: 1080px) 100vw, 33vw"
                  />
                </div>
              ) : null}
              <h2 className="studio-offer-side__title">{SIDE_TITLE}</h2>
              <p className="studio-voucher__side-text">{sideText(data.amounts)}</p>
              {data.validityNote ? <p className="studio-offer__note">{data.validityNote}</p> : null}
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
