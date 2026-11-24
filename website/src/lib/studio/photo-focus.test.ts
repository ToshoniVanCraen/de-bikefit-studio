import { describe, expect, it } from 'vitest';
import { FOCUS_PATTERN, focusPosition } from './photo-focus';

describe('photo focus', () => {
  it('accepts an empty value and a pair of percentages', () => {
    for (const ok of ['', '50% 55%', '0% 0%', '100% 100%', '12.5% 80%']) {
      expect(FOCUS_PATTERN.test(ok), ok).toBe(true);
    }
  });

  it('rejects anything that is not a pair of percentages up to 100', () => {
    for (const bad of [
      '50%',
      '50 55',
      '101% 50%',
      'center',
      '50% 55%;',
      'url(x) 50%',
      '50% 55% 10%',
      '-5% 10%',
      ' 50% 55%',
    ]) {
      expect(FOCUS_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it('gives the object-position of a valid focus and nothing for the rest', () => {
    expect(focusPosition('50% 55%')).toBe('50% 55%');
    expect(focusPosition('  50% 55% ')).toBe('50% 55%');
    expect(focusPosition('')).toBeUndefined();
    expect(focusPosition(null)).toBeUndefined();
    expect(focusPosition('left top')).toBeUndefined();
  });
});
