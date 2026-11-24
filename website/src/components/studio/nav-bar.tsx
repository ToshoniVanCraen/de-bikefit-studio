'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavigationItem } from '@/lib/cms/blocks';
import { StudioLink, splitArrow } from './link';
import { StudioLogo } from './logo';

/**
 * Primary navigation (24 Nov 2026 redesign, design `.header`).
 *
 * Wide screens: logo, the row of links (the active one wine and underlined,
 * `aria-current="page"`) and the "Afspraak maken" button.
 * ≤1080px: the links and the button give way to a bordered "Menu" button, a
 * disclosure that owns `aria-expanded` and `aria-controls` and opens the links
 * as a panel under the header, with the button at the bottom of the panel so
 * it stays reachable. The panel closes on Escape and on following any link
 * in it (an in-page anchor included).
 *
 * The links are in the DOM at every width (CSS hides them), so they are always
 * crawlable and degrade to a plain list if hydration never happens. The CTA
 * is rendered twice (beside the menu, inside the panel); CSS shows exactly one.
 */
export function StudioNavBar({
  items,
  cta,
  siteName,
}: {
  items: NavigationItem[];
  cta: { label: string; href: string };
  siteName: string;
}) {
  const panelId = useId();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function isActive(href: string): boolean {
    if (!href.startsWith('/')) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const ctaLink = (
    <StudioLink href={cta.href} className="studio-btn studio-btn--primary studio-nav__cta">
      {splitArrow(cta.label)}
      <span className="studio-btn__arrow" aria-hidden="true">
        &rarr;
      </span>
    </StudioLink>
  );

  return (
    <nav className="studio-nav" aria-label="Hoofdnavigatie">
      <Link href="/" className="studio-nav__logo" aria-label={`${siteName}: naar de homepagina`}>
        <StudioLogo siteName={siteName} tone="light" priority />
      </Link>

      {/* Following a link — including an in-page anchor, which does not change
          the route — has done what the panel was opened for, so it closes.
          The handler sits on the panel rather than on every item so it also
          covers links an editor adds later. */}
      <div
        className="studio-nav__panel"
        id={panelId}
        data-open={open ? 'true' : 'false'}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        <ul className="studio-nav__menu">
          {items.map((item) => (
            <li key={`${item.href}-${item.label}`}>
              <StudioLink
                href={item.href}
                external={item.external}
                {...(isActive(item.href) ? { 'aria-current': 'page' as const } : {})}
              >
                {item.label}
              </StudioLink>
            </li>
          ))}
        </ul>
        {ctaLink}
      </div>

      {ctaLink}

      <button
        type="button"
        className="studio-nav__toggle"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Menu
      </button>
    </nav>
  );
}
