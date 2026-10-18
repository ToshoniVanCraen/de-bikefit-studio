import { describe, expect, it } from 'vitest';

import { GATE_COPY } from '@/lib/staging-gate/form-state';

import { gateReasonMessage } from './login-reason';

describe('gateReasonMessage', () => {
  it('maps the two reasons the gate sets to Max’s copy', () => {
    expect(gateReasonMessage('verlopen')).toBe(GATE_COPY.expired);
    expect(gateReasonMessage('afgemeld')).toBe(GATE_COPY.loggedOut);
  });

  it('ignores everything else', () => {
    for (const value of [
      undefined,
      null,
      '',
      'Verlopen',
      ' verlopen',
      'verlopen ',
      'onbekend',
      '<script>alert(1)</script>',
      ['verlopen'],
      ['verlopen', 'afgemeld'],
      42,
      'toString',
      '__proto__',
    ]) {
      expect(gateReasonMessage(value)).toBeNull();
    }
  });
});
