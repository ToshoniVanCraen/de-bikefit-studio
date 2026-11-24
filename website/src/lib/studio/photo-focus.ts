/**
 * The focus point of a photo in the `photoStrip` block: an `object-position`
 * such as "50% 55%" (x then y, each 0 to 100). Plain module, no I/O: the block
 * schema validates with {@link FOCUS_PATTERN}, the renderer reads the value
 * through {@link focusPosition}, so what reaches a style attribute is always a
 * pair of numbers and nothing an editor could smuggle a CSS value into.
 */

const PERCENT = '(?:100(?:\\.0+)?|\\d{1,2}(?:\\.\\d+)?)%';

/** Empty (centred) or two percentages: "50% 55%". */
export const FOCUS_PATTERN = new RegExp(`^(?:|${PERCENT} ${PERCENT})$`);

export const FOCUS_HINT = 'Gebruik twee percentages, bijvoorbeeld 50% 55%, of laat het veld leeg.';

/** The CSS `object-position` for a stored focus, or `undefined` for empty or invalid input. */
export function focusPosition(value: string | null | undefined): string | undefined {
  const text = (value ?? '').trim();
  if (!text || !FOCUS_PATTERN.test(text)) return undefined;
  return text;
}
