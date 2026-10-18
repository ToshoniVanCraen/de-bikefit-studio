import { getMediaBytes } from '@/lib/cms/content';
import { isStagingGateHost } from '@/lib/staging-gate/config';

/**
 * Media bytes for `storage = 'db'` items — the target of `mediaUrl()`.
 *
 * Read-only and public on production and other previews; on the exact staging
 * host the access gate requires a reviewer session or machine token before
 * this handler runs. `getMediaBytes()` refuses soft-deleted media. Uploads go
 * through a separate server action with its own origin check.
 *
 * Hardening:
 *  - `X-Content-Type-Options: nosniff` so a mislabelled upload cannot be
 *    re-interpreted as HTML;
 *  - SVG (the one format that can carry script) is served with a locked-down
 *    CSP and `sandbox`, so opening it directly executes nothing;
 *  - ids are opaque UUIDs; the long public cache is disabled on the gated host.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Next 16: route params are async.
  const { id } = await params;
  const isGatedStagingHost = isStagingGateHost(
    request.headers.get('host') ?? new URL(request.url).hostname,
  );

  const media = await getMediaBytes(id);
  if (!media)
    return new Response('Not found', {
      status: 404,
      headers: isGatedStagingHost ? { 'Cache-Control': 'no-store' } : undefined,
    });

  const headers = new Headers({
    'Content-Type': media.mimeType,
    'Content-Length': String(media.data.byteLength),
    // The same bytes are public/cacheable on production and other previews,
    // but on the exact staging host the gate must run for every fetch. Do not
    // let this route's former public cache header override proxy's no-store.
    'Cache-Control': isGatedStagingHost ? 'no-store' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (isGatedStagingHost) headers.set('X-Robots-Tag', 'noindex, nofollow');

  if (media.mimeType === 'image/svg+xml') {
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  }

  return new Response(new Uint8Array(media.data), { headers });
}
