# De Bikefit Studio — design system

Plain HTML + CSS, no build step. `prototype/styles.css` is only an entry point:
it loads the web fonts, then three cascade layers.

```
@layer tokens, base, components;   /* later layers win, specificity-free */
tokens.css      all raw values          (the only file with literals)
base.css        reset, element defaults, .ds-* primitives
components.css  every component rule    (all values via var(--ds-*))
```

> The `@layer` statement sits **after** the `@import`s on purpose: Chrome drops
> any `@import` that follows a `@layer` statement which itself follows an
> `@import`, which silently disables the whole system.

## Source of truth

**Since 24 Nov 2026:** the design export Toshoni delivered for the site redesign
(a static HTML site; its `styles.css` holds the whole look). Lighter and warmer
than the first system: a near-white page, cream bands, wine as the one accent,
real photographs instead of decoration, square 1px-bordered controls,
Barlow Condensed upper case for every heading. The live site
(`website/src/app/globals.css`) implements these tokens; this file is the
documented reference and is kept in step with it.

**Before (13 Oct 2026):** the brand banner `WhatsApp Image 2026-09-22 at 21.45.35.jpeg`
(sha256 `1e48e4ed415a9eda30b31aff4036f8f13b7716f3469c895f7ec8ef11082d9c0b`,
994×343): burgundy ground, cream condensed-800 wordmark, spaced-caps strapline,
italic tagline, bold URL, and a thick ring cropped off the right edge. Its
burgundy / bone / cream primitives stay in `tokens.css` as the legacy tier: the
admin still paints with them.

## Palette (24 Nov 2026)

| Primitive | Value | Design name | Role |
| --- | --- | --- | --- |
| `--ds-blush-25` | `#fdfbfb` | `--bg` | page ground, header |
| `--ds-blush-100` | `#f6e4e7` | `--cream` | light sections, hero, page hero, cream callout |
| `--ds-blush-50` | `#fff6f7` | `--sand` | text and the light button on wine |
| `--ds-blush-200` | `#f3d3d9` | footer text | footer copy on wine-deep |
| `--ds-blush-300` | `#e8cdd2` | `--line` | hairlines, card edges, image placeholder |
| `--ds-cocoa-900` | `#2a161b` | `--ink` | text, the 1px rule above contact and offer groups |
| `--ds-cocoa-600` | `#6e565b` | `--muted` | secondary text, eyebrows, labels |
| `--ds-wine-700` | `#8a2337` | `--wine` | primary button, dark sections, callout, accents, emphasis line |
| `--ds-wine-800` | `#6f1a2b` | `--wine-deep` | footer, button hover |
| `--ds-white` | `#ffffff` | card white | cards, tiles, steps, forms |

| Semantic token | Points at | Used by |
| --- | --- | --- |
| `--ds-color-bg` | blush-25 | `body`, header, menu panel |
| `--ds-color-surface` | blush-100 | `.section--gray` (= cream), hero, page hero, ghost button hover |
| `--ds-color-surface-alt` | blush-300 | photo placeholders |
| `--ds-color-surface-card` (new) | white | `.card`, `.step`, facts, forms |
| `--ds-color-surface-raised` / `-hover` | white / blush-50 | raised panels |
| `--ds-color-surface-inverse` | wine-700 | `.section--dark`, `.callout` |
| `--ds-color-surface-inverse-raised` / `-hover` | wine-800 / wine lifted 6% | panels on wine |
| `--ds-color-surface-footer` | wine-800 | footer |
| `--ds-color-fg` / `-muted` / `-subtle` | cocoa-900 / cocoa-600 / cocoa-600 | text on light |
| `--ds-color-fg-inverse` / `-soft` / `-muted` / `-subtle` | blush-50 / blush-100 / blush-200 / blush-100 | text on wine |
| `--ds-color-fg-on-photo` (new) | white | captions on photos (with `--ds-text-shadow-on-photo`) |
| `--ds-color-border` | blush-300 | hairlines, ghost button edge |
| `--ds-color-border-strong` | line mixed 55% toward muted (3:1) | form controls |
| `--ds-color-border-card` (new) | line at 80% | card edge |
| `--ds-color-border-hairline` (new) | line at 50% | header underline |
| `--ds-color-rule` (new) | cocoa-900 | contact grid, offer groups |
| `--ds-color-border-inverse` / `-strong` / `-subtle` | sand at 45% / sand at 25% / cream at 40% | edges on wine |
| `--ds-color-border-footer` | footer text at 25% | footer bottom bar |
| `--ds-color-accent` / `-hover`, `--ds-color-interactive` / `-hover` | wine-700 / wine-800 | buttons, links, rules, numbers, quotes |
| `--ds-color-interactive-inverse` / `-hover` / `-fg` | blush-50 / white / wine-700 | the light button on wine |
| `--ds-color-ghost-on-dark-hover` (new) | white at 6% | outline-light button hover |
| `--ds-overlay-hero` / `-hero-narrow` (new) | cream gradients | landing hero veil (left to right; vertical at ≤720px) |
| `--ds-overlay-callout` (new) | wine gradient | callout over a photo |

Contrast (WCAG AA for body text): ink 16:1 and muted 6.4:1 on the page, muted
5.5:1 on cream; sand 8.3:1, cream 7.2:1 and footer text 6.4:1 on wine, footer
text 8.1:1 on wine-deep; `--ds-color-border-strong` 3:1 against white.

## Typography — hierarchy levels

Barlow Condensed (display) + Inter (body), via `next/font` on the site; Barlow
Condensed italic 800 is its own face (`--ds-font-display-italic`). Body Inter
16px / 1.6. Every `h1`–`h3` is Barlow Condensed upper case at line-height 1.

1. **Hero** — 800, `clamp(56px, 8vw, 104px)`, line-height .95, -0.01em; the
   emphasis line (`em`) on its own line in italic 800 wine. Page hero
   `clamp(48px, 6.5vw, 88px)`.
2. **Section heading** — 700, `clamp(40px, 5vw, 60px)`; `.h2`
   `clamp(36px, 4.5vw, 54px)`; split heading 40px; callout 42px 800 (34px at
   ≤720px); closing line 36px 800.
3. **Card and tile headings** — tile 26px 800, step 24px 800, card 21px 700,
   FAQ question 24px 700.
4. **Italic voice** — Barlow Condensed italic 800 upper case in wine: the lead
   line (28px), the pull quote (24px, with a 3px wine rule), the hero emphasis.
5. **Eyebrow** — 13px, 0.14em, upper case, muted, over a 1px rule in its own
   colour with 14px between rule and text, 22px below.
6. **Buttons, nav, link-arrow** — Barlow 600 upper case, 0.08em (button 16px,
   nav 14px, link-arrow 14px / 0.1em).

## Spacing & layout

`--ds-space-3xs … 5xl` map onto a px scale (4 → 100). The design's `.wrap` is
1240px including 32px gutters (20px at ≤720px), so the content column
(`--ds-container-max`) is 1176px; prose 760px. Sections 110px block (72px at
≤720px); header 92px; landing hero at least 620px; page hero at least 520px;
callout 72px (56px for the closing line). Breakpoints: 1080px (menu panel,
two-column grids) and 720px (single column). Everything is square:
`--ds-radius-control` is 0.

## The ring motif (retired on the site, 24 Nov 2026)

The first system's only decoration: a thick circular outline cropped off the
top-right edge, a pseudo-element on `.hero__media`, `.page-head`, `.callout`
and `.split__visual`. The redesign replaced it with photographs; the live site
no longer draws it. The prototype's `components.css` still does, so its tokens
(`--ds-ring-*`) remain here.

## Component inventory

| Component | Classes / modifiers |
| --- | --- |
| Utility bar | `.utility-bar`, `__inner` |
| Header / nav | `.site-header`, `.nav`, `__logo`, `__menu` (`a.active`), `__cta` |
| Buttons | `.btn` + `--primary`, `--outline`, `--ghost`, `--ghost-on-dark`, `--dark`; `.btn__arrow` |
| Hero | `.hero`, `__media` (ring), `__content`, `__eyebrow`, `__title` (`em`), `__sub`, `__actions` |
| Section | `.section` + `--dark`, `--gray`; `__inner`, `__eyebrow`, `__title`, `__lede` |
| Feature grid | `.feature-grid`, `.feature`, `__num`, `__title`, `__body` |
| Split | `.split` + `--reverse`; `.split__visual` + `--alt` (ring) |
| Callout | `.callout` (ring), `__inner`, `__title` |
| Steps | `.steps`, `.step`, `__num`, `__title`, `__body` |
| Audience | `.audience`, `.audience__card` |
| FAQ | `.faq`, `__item`, `__q`, `__a` |
| Footer | `.site-footer`, `.footer__grid`, `__col`, `__brand`, `__bottom` |
| Page head | `.page-head` (ring), `__inner`, `__crumb`, `__title`, `__lede` |
| Rich text | `.rich` + `--invert` (h2/h3/p/ul/blockquote) |
| Primitives | `.ds-container`, `.ds-eyebrow`, `.ds-display`, `.ds-heading`, `.ds-lede`, `.ds-tagline`, `.ds-wordmark`, `.ds-ring`, `.ds-stack-lg` |

### On the live site (`website/src/app/globals.css`, 24 Nov 2026)

| Component | Classes / modifiers |
| --- | --- |
| Buttons | `.studio-btn` + `--primary` (wine), `--ghost` (hairline; turns outline-light on `.studio-section--dark` and the wine callout), `--outline` (wine edge), `--light` = `--dark` (sand on wine), `--outline-light` = `--ghost-on-dark`; `.studio-btn__arrow`; `.studio-link-arrow` |
| Header | `.studio-header`, `.studio-nav`, `__logo`, `__panel` (`data-open`), `__menu`, `__cta`, `__toggle` ("Menu", ≤1080px) |
| Logo | `.studio-logo` + `--light` / `--dark`, `__mark` (40px), `__name`, `__kind` |
| Hero | `.studio-hero`, `__photo` (photo + cream veil), `__content`, `__copy`, `__eyebrow`, `__title` (`em`), `__sub`, `__actions` |
| Page hero | `.studio-pagehero` + `--image`, `__inner`, `__copy`, `__crumbs`, `__title` (`em`), `__intro`, `__actions`, `__media` (component `page-hero.tsx`) |
| Section | `.studio-section` + `--gray` (= `--cream`), `--dark`; `__inner`, `__title`, `__lede`; `.studio-h2`; `.studio-eyebrow` |
| Split | `.studio-split` + `--reverse`, `--quote` (team look); `__copy`, `__title`, `__visual`; `.studio-ticks`, `.studio-quote` |
| Tiles | `.studio-feature-grid`, `.studio-feature`, `__num`, `__title`, `__body` |
| Steps | `.studio-steps`, `.studio-step`, `__num`, `__title`, `__body` |
| Cards | `.studio-cards`, `.studio-card` + `--featured`, `__title`, `__body`, `__meta` (tag), `__media` |
| Callout | `.studio-callout` + `--gray` / `--cream`, `--final`; `__inner`, `__title`, `__body`, `__actions`, `__display` |
| FAQ | `.studio-faq`, `__item`, `__q`, `__a` (`details/summary`, plus and minus) |
| Contact | `.studio-contact`, `__label`, `__value` |
| Prose | `.studio-rich` + `--invert`, `p.lead` / `.studio-lead`; `.studio-facts` |
| Breadcrumb | `.studio-breadcrumb` (inside the page hero, or `.studio-breadcrumb-bar`) |
| Footer | `.studio-footer`, `__grid`, `__col`, `__brand`, `__bottom`, `__site`, `__icons`, `__legal` |

`logo.svg` is dark ink on light, so it stays in the header only. The burgundy
footer uses the CSS wordmark `.ds-wordmark` with the same text as the image's
`alt`, so nothing is lost for assistive tech. The SVG itself is unmodified.

## Rules

- **Tiering.** `tokens.css` holds every literal. `base.css` and
  `components.css` reference semantic tokens (`--ds-color-*`, `--ds-space-*`,
  `--ds-text-*`), or a primitive `--ds-scale-*` / `--ds-width-*` for a genuine
  one-off. Check with:
  `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" base.css components.css ../styles.css`
  — it must print nothing.
- **Adding a token.** Add the raw value to the primitive tier, then point a
  semantic token at it. Never reference a primitive colour from a component.
- **Adding a component.** Append a block to `components.css` with a comment
  naming its surface, reuse the `.ds-*` primitives in the markup, and add it to
  the table above. If two components end up sharing a declaration block, promote
  it to a `base.css` primitive instead.
- **Changing the brand.** Recolouring the site is a single edit to the wine /
  cocoa / blush primitives (here and in `website/src/app/globals.css`); nothing
  downstream needs to change. The legacy burgundy / cream / bone primitives
  belong to the admin.
