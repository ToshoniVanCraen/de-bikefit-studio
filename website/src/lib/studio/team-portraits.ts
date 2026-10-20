import { emptyImage, type CmsImageRef } from '@/lib/cms/block-primitives';

import manifest from './team-portraits.json';

/**
 * Real portraits of team members (`public/images/team/`), one per person,
 * imported with the person's consent by `scripts/team-portrait.mts`, which
 * records the file and its provenance in `team-portraits.json`. A person
 * without a file yields an empty ref, so the `team` block shows the initials
 * instead of pointing at a missing image. Generated images never come through
 * here (`docs/editorial-images.md`).
 */

export const TEAM_PORTRAIT_DIR = '/images/team';

export type TeamPortraitPerson = keyof typeof manifest.portraits;

export const TEAM_PORTRAIT_PERSONS = Object.keys(manifest.portraits) as TeamPortraitPerson[];

/** The frame of `.studio-team__portrait` (`src/app/studio-aanbod.css`). */
export const PORTRAIT_FRAME = { width: 4, height: 5 } as const;

export type CropWindow = { left: number; top: number; width: number; height: number };

/**
 * The largest 4:5 window inside a `width`×`height` picture whose centre is as
 * close to `focus` (fractions of the picture, 0–1) as the edges allow. Used by
 * `scripts/team-portrait.mts`; pure, tested in `team-portraits.test.ts`.
 */
export function portraitCropWindow(
  width: number,
  height: number,
  focus: { x: number; y: number },
): CropWindow {
  const ratio = PORTRAIT_FRAME.width / PORTRAIT_FRAME.height;
  let cropWidth = width;
  let cropHeight = Math.round(width / ratio);
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.round(height * ratio);
  }
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  return {
    left: clamp(Math.round(focus.x * width - cropWidth / 2), width - cropWidth),
    top: clamp(Math.round(focus.y * height - cropHeight / 2), height - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}

export function teamPortrait(person: TeamPortraitPerson): CmsImageRef {
  const entry = manifest.portraits[person] as { file: string | null; alt: string };
  if (!entry.file) return { ...emptyImage };
  return {
    mediaId: null,
    url: `${TEAM_PORTRAIT_DIR}/${entry.file}`,
    alt: entry.alt,
    decorative: false,
  };
}
