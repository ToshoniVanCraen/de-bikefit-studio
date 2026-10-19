import { describe, expect, it } from 'vitest';
import { channelLabel, deviceLabel, placeLabel, sourceLabel } from './deep-dive-labels';

describe('deep-dive labels', () => {
  it('translates the channel groups and devices GA4 names in English', () => {
    expect(channelLabel('Organic Search')).toBe('Organisch zoeken');
    expect(channelLabel('Referral')).toBe('Verwijzing');
    expect(channelLabel('Some New Group')).toBe('Some New Group');
    expect(deviceLabel('desktop')).toBe('Computer');
    expect(deviceLabel('Mobile')).toBe('Smartphone');
  });

  it('turns placeholders into "Onbekend" and (direct) into Direct', () => {
    expect(channelLabel('(not set)')).toBe('Onbekend');
    expect(deviceLabel('')).toBe('Onbekend');
    expect(placeLabel('(not set)')).toBe('Onbekend');
    expect(placeLabel('Ninove')).toBe('Ninove');
    expect(sourceLabel('(direct)')).toBe('Direct');
    expect(sourceLabel('(other)')).toBe('Onbekend');
    expect(sourceLabel('google')).toBe('google');
  });
});
