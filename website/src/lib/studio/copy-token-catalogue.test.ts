import { describe, expect, it } from 'vitest';
import { COPY_TOKEN_HELP } from './copy-token-catalogue';
import { FACT_TOKENS, hasCopyTokens, parseCopyToken } from './copy-tokens';

/** The text between the braces of a typed token. */
const bodyOf = (token: string) => token.replace(/^\{\{\s*|\s*\}\}$/g, '');

describe('the help for the copy tokens', () => {
  it('every example is a token the engine recognises', () => {
    for (const entry of COPY_TOKEN_HELP) {
      expect(hasCopyTokens(entry.example), entry.example).toBe(true);
      expect(parseCopyToken(bodyOf(entry.example)), entry.example).not.toBeNull();
    }
  });

  it('explains every fact token, each once', () => {
    const explained = COPY_TOKEN_HELP.map((entry) => bodyOf(entry.token)).filter((body) =>
      (FACT_TOKENS as readonly string[]).includes(body),
    );
    expect([...explained].sort()).toEqual([...FACT_TOKENS].sort());
  });

  it('explains the three data tokens, in their two forms', () => {
    const kinds = COPY_TOKEN_HELP.map((entry) => parseCopyToken(bodyOf(entry.example)));
    expect(kinds.filter((kind) => kind?.kind === 'duration')).toHaveLength(1);
    expect(kinds.filter((kind) => kind?.kind === 'price')).toHaveLength(2);
    expect(kinds.filter((kind) => kind?.kind === 'extra')).toHaveLength(2);
    expect(kinds.filter((kind) => kind?.kind === 'price' && kind.audience === null)).toHaveLength(
      1,
    );
    expect(kinds.filter((kind) => kind?.kind === 'extra' && kind.choice === null)).toHaveLength(1);
  });

  it('is one short line per token, in Dutch, without a full stop', () => {
    for (const entry of COPY_TOKEN_HELP) {
      expect(entry.description.length, entry.token).toBeGreaterThan(10);
      expect(entry.description.length, entry.token).toBeLessThan(160);
      expect(entry.description, entry.token).not.toMatch(/\.$/);
    }
  });
});
