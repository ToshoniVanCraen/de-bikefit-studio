import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { features, siteUrl } from '@/lib/env';
import { StagingGateBanner } from '@/components/staging-gate/banner';

/**
 * Root document shell.
 *
 * It deliberately renders **no** header, footer or `<main>`: the app now hosts
 * two different sites on one deployment.
 *
 *  - `/` and every CMS page → the Dutch De Bikefit Studio site, whose chrome
 *    lives in `src/app/(studio)/layout.tsx`.
 *  - `/shop`, `/checkout`, `/account`, `/blog`, `/policies`, `/sign-in`,
 *    `/sign-up`, `/webshop` → the Qarakter webshop, whose chrome lives in
 *    `src/components/shell/webshop-chrome.tsx` and is mounted by each of those
 *    groups' own layouts.
 *  - `/admin` → the CMS admin, which brings its own layout.
 *
 * Unchanged from before: both fonts are still loaded here (Barlow Condensed is
 * the Studio's display face *and* the webshop's `font-display`, Inter is the
 * body face of both), and `ClerkProvider` is still mounted exactly when Clerk
 * is configured, so the webshop's auth behaviour is identical.
 *
 * `lang` is now `nl`, because the site at the root of this origin is Dutch.
 */

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const barlow = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
});

// The studio's emphasis voice (hero line, lead, quotes): one italic face only,
// so the other weights do not ship an italic file nobody uses.
const barlowItalic = Barlow_Condensed({
  subsets: ['latin'],
  weight: '800',
  style: 'italic',
  variable: '--font-barlow-italic',
  display: 'swap',
});

// Auth UI is only mounted once Clerk is configured, so the app runs key-free.
const hasClerk = features.clerkUi;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  /**
   * No `template` here on purpose. Studio pages build their own title from
   * `seo.titleTemplate` and emit it as `title.absolute`, and each webshop group
   * layout declares its own `%s · Qarakter` template. A template at the root
   * would append the site name a second time to any segment that only sets a
   * `default` (which is how `/webshop` ended up as
   * "Qarakter — Boutique Bike Store · De Bikefit Studio").
   */
  title: 'De Bikefit Studio',
  description:
    'Fiets met comfort. Professionele bikefit in Ninove, voor jonge fietsers, wielertoeristen, recreanten, pendelaars en gezinnen.',
  // Icons: `src/app/favicon.ico`, `icon.svg` and `apple-icon.png` (Next's file
  // conventions; generated from `public/brand/` by `npm run brand:icons`).
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The studio's wine (`--color-ds-wine-700`, 24 Nov 2026 redesign).
  themeColor: '#8a2337',
};

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="nl"
      className={`${inter.variable} ${barlow.variable} ${barlowItalic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Staging host only, client-side; renders nothing anywhere else (docs/staging-gate.md §3). */}
        <StagingGateBanner />
        {children}
      </body>
    </html>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const shell = <RootShell>{children}</RootShell>;
  return hasClerk ? <ClerkProvider>{shell}</ClerkProvider> : shell;
}
