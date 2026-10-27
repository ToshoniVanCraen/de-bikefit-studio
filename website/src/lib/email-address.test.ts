import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './email-address';

describe('normalizeEmail', () => {
  it('trims the address and puts it in lower case', () => {
    expect(normalizeEmail(' Toshoni@Gmail.COM ')).toBe('toshoni@gmail.com');
    expect(normalizeEmail('\tAnna.De.Smet+Fiets@Example.BE\n')).toBe(
      'anna.de.smet+fiets@example.be',
    );
  });

  it('changes nothing else: inner characters stay, even when the address is not valid', () => {
    expect(normalizeEmail('a b@c')).toBe('a b@c');
    expect(normalizeEmail('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('  Iemand@Example.com ');
    expect(normalizeEmail(once)).toBe(once);
  });
});
