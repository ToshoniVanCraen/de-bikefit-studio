import Image from 'next/image';

/**
 * The brand lockup (17 Oct 2026, `public/brand/`, `docs/brand-assets.md`): the
 * stamp with the cyclist next to the wordmark "De Bikefit / Studio".
 *
 * The supplied SVG lockups set their wordmark as `<text>` in Bebas Neue /
 * Oswald / Impact, fonts a visitor's browser may not have, so the site renders
 * the mark as the image and the two lines as HTML in its own display face
 * (Barlow, `--ds-font-display`). Since the 24 Nov 2026 redesign: a 40px mark,
 * "De Bikefit" in 800 at 20px over "Studio" in italic 11px with wide
 * tracking. `tone="light"` is the burgundy stamp on a light ground (header);
 * `tone="dark"` the cream stamp on wine (footer, admin). The text is the
 * accessible name; the image is decorative.
 */
export function StudioLogo({
  siteName,
  tone,
  priority = false,
}: {
  siteName: string;
  tone: 'light' | 'dark';
  /** Preload the mark (the header's logo is above the fold). */
  priority?: boolean;
}) {
  const [first, ...rest] = splitName(siteName);
  return (
    <span className={`studio-logo studio-logo--${tone}`}>
      <Image
        src={
          tone === 'dark'
            ? '/brand/debikefitstudiologo-mark-inverted.svg'
            : '/brand/debikefitstudiologo-mark.svg'
        }
        alt=""
        width={40}
        height={40}
        priority={priority}
        className="studio-logo__mark"
      />
      <span className="studio-logo__text">
        <span className="studio-logo__name">{first}</span>
        {rest.length > 0 ? <span className="studio-logo__kind">{rest.join(' ')}</span> : null}
      </span>
    </span>
  );
}

/** "De Bikefit Studio" → ["De Bikefit", "Studio"]; any other name keeps its last word on the second line. */
export function splitName(siteName: string): string[] {
  const words = siteName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words;
  return [words.slice(0, -1).join(' '), words[words.length - 1]];
}
