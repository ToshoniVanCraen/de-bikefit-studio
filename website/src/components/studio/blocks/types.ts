import type { BlockTypeData } from '@/lib/cms/blocks';
import type { StudioLocale } from '@/lib/studio/locale';
import type { PageHeroCrumb } from '../page-hero';
import type { HeadingLevel } from './section';

/**
 * What a block may know about the page it sits on. Kept small on purpose:
 * the page's own slug (the catalogue decides from it whether prices show)
 * and the validated `?dienst=` value, which only the booking block reads.
 */
export type BlockPageContext = {
  /** CMS slug of the page ('' = home). */
  slug: string;
  /** `?dienst=` after `parseServiceParam()`; `null` when absent or invalid. */
  requestedService: string | null;
  /** `?extra=` (an extra's slug) after `parseServiceParam()`; only the booking block reads it. */
  requestedExtra?: string | null;
  /**
   * The visible breadcrumb of a nested page, set by `page-view.tsx` only when
   * the page opens on a `hero` page head, which then prints it above its
   * eyebrow (24 Nov 2026 redesign). Absent everywhere else.
   */
  crumbs?: readonly PageHeroCrumb[];
};

/** Every block renderer takes the same five things. */
export type BlockProps<K extends keyof BlockTypeData> = {
  data: BlockTypeData[K];
  /** Stable `id` for deep links, or undefined for sections that get none. */
  anchor?: string;
  /** 1 only for the block that owns the page's single `<h1>`. */
  headingLevel: HeadingLevel;
  locale: StudioLocale;
  page: BlockPageContext;
};
