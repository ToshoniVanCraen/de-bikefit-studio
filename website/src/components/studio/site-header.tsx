import type { StudioChrome } from '@/lib/studio/site';
import { PRIMARY_CTA } from '@/lib/studio/site';
import { StudioNavBar } from './nav-bar';

/**
 * The sticky header (24 Nov 2026 redesign, design `.header`): 92px on the page
 * colour with a hairline under it; logo, main menu and the "Afspraak maken"
 * button, a "Menu" panel at 1080px and below (`nav-bar.tsx`).
 *
 * The prototype's utility bar above it (city, phone, hours) was removed at
 * Toshoni's request (13 Oct 2026); the footer still shows the phone number,
 * place and hours from `cms_site_settings.contact`.
 */
export function StudioSiteHeader({ chrome }: { chrome: StudioChrome }) {
  const { settings, mainNav } = chrome;

  return (
    <header className="studio-header">
      <StudioNavBar items={mainNav} cta={PRIMARY_CTA} siteName={settings.site.name} />
    </header>
  );
}
