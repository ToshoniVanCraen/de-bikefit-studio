import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_LABELS,
  OFFERING_AUDIENCES,
  SPLIT_AUDIENCES,
  audienceRank,
  audiencesFor,
  isAcceptedAudienceSet,
  isSplitAudience,
} from './offering-audience';

describe('the audiences of an offering (29 Oct 2026: Jeugd is one variant, the one-off fit)', () => {
  it('has the single option, Volwassene and Jeugd – eenmalig, in display order', () => {
    expect([...OFFERING_AUDIENCES]).toEqual(['all', 'adult', 'youth']);
    expect(audiencesFor('single')).toEqual(['all']);
    expect(audiencesFor('audience')).toEqual(['adult', 'youth']);
    expect([...SPLIT_AUDIENCES]).toEqual(audiencesFor('audience'));
    // A copy: nobody can change the set by editing the result.
    audiencesFor('audience').pop();
    expect(audiencesFor('audience')).toHaveLength(2);
  });

  it('names the variants the way the offer page, the widget, the mails and Beheer print them', () => {
    expect(AUDIENCE_LABELS).toEqual({
      all: '',
      adult: 'Volwassene',
      youth: 'Jeugd – eenmalig',
    });
    // The widget stores the label on a service (40 characters at most).
    for (const label of Object.values(AUDIENCE_LABELS))
      expect(label.length).toBeLessThanOrEqual(40);
  });

  it('ranks the variants 0, 1 for the order of their booking services', () => {
    expect(OFFERING_AUDIENCES.map(audienceRank)).toEqual([0, 0, 1]);
  });

  it('recognises the audiences an enquiry may name; the single option is none of them', () => {
    expect(['all', 'adult', 'youth', 'child', ''].filter(isSplitAudience)).toEqual([
      'adult',
      'youth',
    ]);
  });
});

describe('isAcceptedAudienceSet (what an offering may be saved with)', () => {
  it('accepts exactly the audiences of the mode, in order', () => {
    expect(isAcceptedAudienceSet('single', ['all'])).toBe(true);
    expect(isAcceptedAudienceSet('audience', ['adult', 'youth'])).toBe(true);
    expect(isAcceptedAudienceSet('audience', ['youth', 'adult'])).toBe(false);
    expect(isAcceptedAudienceSet('audience', ['adult'])).toBe(false);
    expect(isAcceptedAudienceSet('audience', [])).toBe(false);
    expect(isAcceptedAudienceSet('audience', ['all'])).toBe(false);
    expect(isAcceptedAudienceSet('single', ['adult', 'youth'])).toBe(false);
  });
});
