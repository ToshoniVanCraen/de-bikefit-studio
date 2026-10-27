import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_LABELS,
  OFFERING_AUDIENCES,
  SPLIT_AUDIENCES,
  audienceRank,
  audiencesFor,
  baseAudienceOf,
  isAcceptedAudienceSet,
  isSplitAudience,
  isYouthAudience,
} from './offering-audience';

describe('the audiences of an offering (27 Oct 2026: Jeugd in two variants)', () => {
  it('has the single option, Volwassene and the two Jeugd variants, in display order', () => {
    expect([...OFFERING_AUDIENCES]).toEqual(['all', 'adult', 'youth', 'youth-package']);
    expect(audiencesFor('single')).toEqual(['all']);
    expect(audiencesFor('audience')).toEqual(['adult', 'youth', 'youth-package']);
    expect([...SPLIT_AUDIENCES]).toEqual(audiencesFor('audience'));
    // A copy: nobody can change the set by editing the result.
    audiencesFor('audience').pop();
    expect(audiencesFor('audience')).toHaveLength(3);
  });

  it('names the variants the way the offer page, the widget, the mails and Beheer print them', () => {
    expect(AUDIENCE_LABELS).toEqual({
      all: '',
      adult: 'Volwassene',
      youth: 'Jeugd – eenmalig',
      'youth-package': 'Jeugd – volledig pakket',
    });
    // The widget stores the label on a service (40 characters at most).
    for (const label of Object.values(AUDIENCE_LABELS))
      expect(label.length).toBeLessThanOrEqual(40);
  });

  it('prices an extra for the full Jeugd package like Jeugd: its base audience', () => {
    expect(baseAudienceOf('youth-package')).toBe('youth');
    expect(baseAudienceOf('youth')).toBe('youth');
    expect(baseAudienceOf('adult')).toBe('adult');
    expect(baseAudienceOf('all')).toBe('all');
  });

  it('knows which variants are Jeugd (a parent or guardian is the contact)', () => {
    expect(OFFERING_AUDIENCES.filter(isYouthAudience)).toEqual(['youth', 'youth-package']);
  });

  it('ranks the variants 0, 1, 2 for the order of their booking services', () => {
    expect(OFFERING_AUDIENCES.map(audienceRank)).toEqual([0, 0, 1, 2]);
  });

  it('recognises the audiences an enquiry may name; the single option is none of them', () => {
    expect(['all', 'adult', 'youth', 'youth-package', 'child', ''].filter(isSplitAudience)).toEqual(
      ['adult', 'youth', 'youth-package'],
    );
  });
});

describe('isAcceptedAudienceSet (what an offering may be saved with)', () => {
  it('accepts exactly the audiences of the mode, in order', () => {
    expect(isAcceptedAudienceSet('single', ['all'])).toBe(true);
    expect(isAcceptedAudienceSet('audience', ['adult', 'youth', 'youth-package'])).toBe(true);
    expect(isAcceptedAudienceSet('audience', ['youth', 'adult', 'youth-package'])).toBe(false);
    expect(isAcceptedAudienceSet('audience', ['adult', 'youth-package'])).toBe(false);
    expect(isAcceptedAudienceSet('audience', ['adult'])).toBe(false);
    expect(isAcceptedAudienceSet('audience', [])).toBe(false);
    expect(isAcceptedAudienceSet('audience', ['all'])).toBe(false);
    expect(isAcceptedAudienceSet('single', ['adult', 'youth', 'youth-package'])).toBe(false);
  });

  it('still accepts the pair Volwassene + Jeugd that offerings saved before 27 Oct 2026 hold', () => {
    expect(isAcceptedAudienceSet('audience', ['adult', 'youth'])).toBe(true);
    // Only for a split offering, and only in that order.
    expect(isAcceptedAudienceSet('single', ['adult', 'youth'])).toBe(false);
    expect(isAcceptedAudienceSet('audience', ['youth', 'adult'])).toBe(false);
  });
});
