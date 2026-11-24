import type { Metadata } from 'next';
import { StudioButtonLink } from '@/components/studio/link';
import { PageHero } from '@/components/studio/page-hero';
import { defaultLocale } from '@/lib/studio/locale';

/**
 * Application-level 404, rendered inside the bare root layout.
 *
 * Almost every unknown URL is claimed by the Studio catch-all
 * (`src/app/(studio)/[...slug]/page.tsx`), which renders the richer
 * `(studio)/not-found.tsx` with the full site chrome. This file is the
 * fallback for a `notFound()` thrown inside a route that has no closer
 * boundary — a missing product or blog post, for instance — so it offers a way
 * back into both sites. It wears the studio's page hero (24 Nov 2026 redesign):
 * a cream band, the title, one line and two buttons.
 */
export const metadata: Metadata = {
  title: { absolute: 'Pagina niet gevonden · De Bikefit Studio' },
  robots: { index: false, follow: false },
};

export default function RootNotFound() {
  return (
    <div className="studio-root flex min-h-full flex-1 flex-col">
      <PageHero
        className="studio-pagehero--notfound"
        eyebrow="Foutmelding 404"
        title="Pagina niet gevonden"
        intro="Deze pagina bestaat niet (meer)."
        locale={defaultLocale}
        actions={
          <>
            <StudioButtonLink href="/" variant="primary">
              De Bikefit Studio: homepagina
            </StudioButtonLink>
            <StudioButtonLink href="/shop" variant="ghost" arrow={false}>
              Qarakter webshop
            </StudioButtonLink>
          </>
        }
      />
    </div>
  );
}
