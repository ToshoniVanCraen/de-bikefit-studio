/**
 * What every entity of the `cms:patch-aanbod-correcties` plan has in common:
 * `update` (the dry run prints `~`), `none` (`=`) or `blocked` (`!`), with the
 * changes it would make and the reasons it is blocked. Plain types, no I/O.
 */
export type Action = 'update' | 'none' | 'blocked';

export type Planned = { action: Action; changes: string[]; blockers: string[] };

/** Blockers win; else any change makes it an update. */
export const statusOf = (blockers: readonly string[], changes: readonly string[]): Action =>
  blockers.length > 0 ? 'blocked' : changes.length > 0 ? 'update' : 'none';
