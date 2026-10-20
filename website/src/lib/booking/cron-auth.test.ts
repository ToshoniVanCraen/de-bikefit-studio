import { describe, expect, it } from 'vitest';
import { authorizeCron } from './cron-auth';

const SECRET = 'a-secret-of-at-least-sixteen-chars';

describe('authorizeCron', () => {
  it('is off without a usable secret', () => {
    expect(authorizeCron(`Bearer ${SECRET}`, undefined)).toBe('disabled');
    expect(authorizeCron(`Bearer short`, 'short')).toBe('disabled');
  });

  it('accepts exactly the bearer secret and denies everything else', () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe('ok');
    expect(authorizeCron(`bearer ${SECRET}`, SECRET)).toBe('ok');
    expect(authorizeCron(`Bearer ${SECRET}x`, SECRET)).toBe('denied');
    expect(authorizeCron(SECRET, SECRET)).toBe('denied');
    expect(authorizeCron(null, SECRET)).toBe('denied');
    expect(authorizeCron('', SECRET)).toBe('denied');
  });
});
