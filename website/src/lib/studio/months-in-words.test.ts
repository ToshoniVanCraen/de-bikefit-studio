import { describe, expect, it } from 'vitest';
import { monthsInWords } from './months-in-words';

describe('monthsInWords', () => {
  it('writes the three known lengths in words', () => {
    expect(monthsInWords(6)).toBe('zes maanden');
    expect(monthsInWords(12)).toBe('een jaar');
    expect(monthsInWords(24)).toBe('twee jaar');
  });

  it('writes any other length as a number of months', () => {
    expect(monthsInWords(3)).toBe('3 maanden');
    expect(monthsInWords(9)).toBe('9 maanden');
    expect(monthsInWords(18)).toBe('18 maanden');
    expect(monthsInWords(36)).toBe('36 maanden');
  });

  it('keeps the singular of one month', () => {
    expect(monthsInWords(1)).toBe('1 maand');
  });
});
