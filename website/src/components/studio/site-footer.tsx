import { Cookie } from 'lucide-react';
import type { NavigationItem } from '@/lib/cms/blocks';
import { LEGAL_LINKS } from '@/lib/studio/legal';
import type { StudioChrome } from '@/lib/studio/site';
import { studioMeasurementId } from './analytics';
import { ConsentSettingsLink } from './consent-banner';
import { StudioLink } from './link';
import { StudioLogo } from './logo';

/**
 * The burgundy footer from `prototype/index.html`.
 *
 * The brand column shows the lockup in its inverted colours (the cream mark
 * and the wordmark in the display face, `./logo.tsx`): the same text and
 * meaning for assistive technology as the header.
 *
 * Columns come from the `footer` menu's `group` field, in the order the editor
 * arranged them. The contact column is not a menu: it is rendered from
 * `cms_site_settings.contact`, and every line is omitted when its value is
 * empty (no street address or e-mail is on record yet).
 *
 * The legal row under the bottom bar is not a menu either, so it exists on
 * every deployment whatever the menu rows say: hard links to the privacy
 * statement and the terms, skipped when the footer menu already links the
 * same path (the seed's "Juridisch" group). The row is left out when empty.
 *
 * The bottom bar (19 Oct 2026) carries two icons on the right, vertically
 * centred: Instagram, when the organisation's `sameAs` profiles hold an
 * instagram.com URL (Instellingen → Organisatie), and the cookie control,
 * which reopens the consent banner — only where analytics can load at all
 * (same guard as the banner), otherwise there is no choice to make.
 *
 * The company identity line (Qarakter BV, registered office, BTW, RPR) and
 * the "city · hours" note in the bottom bar were removed at Toshoni's request
 * (review 13 Oct 2026). The identity stays on `/privacy` and
 * `/algemene-voorwaarden`, linked from every page, and in `LEGAL_IDENTITY`
 * for the e-mails; the public e-mail address is in the contact column.
 */
export function StudioSiteFooter({ chrome }: { chrome: StudioChrome }) {
  const { settings, footerNav } = chrome;
  const { contact, site } = settings;
  const groups = groupItems(footerNav);
  const year = new Date().getFullYear();

  const menuHrefs = new Set(
    footerNav
      .flatMap((item) => [item.href, ...item.children.map((child) => child.href)])
      .map(pathKey),
  );
  const legalLinks = [
    { label: 'Privacyverklaring', href: LEGAL_LINKS.privacy },
    { label: 'Algemene voorwaarden', href: LEGAL_LINKS.terms },
  ].filter((link) => !menuHrefs.has(pathKey(link.href)));
  const showCookies = studioMeasurementId(settings) !== null;
  const instagramUrl = instagramProfile(settings.organization.sameAs);

  return (
    <footer className="studio-footer">
      <div className="studio-footer__grid">
        <div className="studio-footer__col studio-footer__brand">
          <StudioLogo siteName={site.name} tone="dark" />
          {site.mission ? <p>{site.mission}</p> : null}
        </div>

        {groups.map((group) => (
          <div className="studio-footer__col" key={group.name}>
            <h2>{group.name}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <StudioLink href={item.href} external={item.external}>
                    {item.label}
                  </StudioLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="studio-footer__col">
          <h2>Contact</h2>
          <ul>
            {contact.phoneLabel && contact.phoneHref ? (
              <li>
                <a href={contact.phoneHref}>{contact.phoneLabel}</a>
              </li>
            ) : null}
            {contact.email ? (
              <li>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
            ) : null}
            {contact.addressLines.filter(Boolean).map((line) => (
              <li key={line}>{line}</li>
            ))}
            {contact.postalCode || contact.city ? (
              <li>{[contact.postalCode, contact.city].filter(Boolean).join(' ')}</li>
            ) : null}
            {contact.website ? <li>{contact.website}</li> : null}
            {contact.hours ? <li>{contact.hours}</li> : null}
          </ul>
        </div>
      </div>

      <div className="studio-footer__bottom">
        <span>
          &copy; {year} {site.name}
        </span>
        {instagramUrl || showCookies ? (
          <span className="studio-footer__icons">
            {instagramUrl ? (
              <a
                href={instagramUrl}
                className="studio-footer__icon"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${site.name} op Instagram (opent in een nieuw tabblad)`}
              >
                <InstagramGlyph />
              </a>
            ) : null}
            {showCookies ? (
              <ConsentSettingsLink className="studio-footer__icon studio-footer__cookies">
                <Cookie aria-hidden="true" />
                <span className="sr-only">Cookie-instellingen</span>
              </ConsentSettingsLink>
            ) : null}
          </span>
        ) : null}
      </div>

      {legalLinks.length > 0 ? (
        <div className="studio-footer__bottom studio-footer__legal">
          <ul className="studio-footer__legal-links">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <StudioLink href={link.href}>{link.label}</StudioLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </footer>
  );
}

/** Lucide carries no brand icons any more; the glyph is the usual rounded square, lens and dot. */
function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The first instagram.com profile among the organisation's `sameAs` URLs, or null. */
export function instagramProfile(sameAs: readonly string[]): string | null {
  for (const raw of sameAs) {
    const value = raw.trim();
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && /(^|\.)instagram\.com$/i.test(url.hostname)) return value;
    } catch {
      // Not a URL: ignored, as the JSON-LD does.
    }
  }
  return null;
}

/** `/privacy/` and `/privacy` count as the same destination. */
function pathKey(href: string): string {
  return href.trim().replace(/\/+$/, '') || '/';
}

type FooterGroup = { name: string; items: NavigationItem[] };

/** Keeps the editor's order; ungrouped items land under the site name. */
function groupItems(items: NavigationItem[]): FooterGroup[] {
  const groups: FooterGroup[] = [];
  for (const item of items) {
    const name = item.group.trim() || 'Studio';
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.items.push(item);
    else groups.push({ name, items: [item] });
  }
  return groups;
}
