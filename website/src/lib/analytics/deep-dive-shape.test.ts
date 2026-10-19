import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  compactNumber,
  delta,
  eachDay,
  fillDays,
  formatDelta,
  formatRate,
  formatSeconds,
  ga4DateToYmd,
  labelIndices,
  linePath,
  nearestIndex,
  niceMax,
  parsePeriod,
  previousRange,
  share,
  xAt,
  yAt,
  type ChartBox,
} from './deep-dive-shape';

const BOX: ChartBox = { width: 100, height: 60, top: 10, right: 10, bottom: 10, left: 10 };

describe('periods and ranges', () => {
  it('accepts 7, 28 and 90 days and falls back to 28', () => {
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod(['90'])).toBe(90);
    expect(parsePeriod('14')).toBe(28);
    expect(parsePeriod(undefined)).toBe(28);
  });

  it('lists every day of a range and the period before it', () => {
    expect(eachDay('2026-10-28', '2026-11-02')).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(previousRange({ start: '2026-10-12', end: '2026-10-18' })).toEqual({
      start: '2026-10-05',
      end: '2026-10-11',
    });
  });

  it('fills the days GA4 did not report with 0, in order', () => {
    const series = fillDays({ start: '2026-10-01', end: '2026-10-03' }, { '2026-10-02': 5 });
    expect(series).toEqual([
      { date: '2026-10-01', value: 0 },
      { date: '2026-10-02', value: 5 },
      { date: '2026-10-03', value: 0 },
    ]);
    expect(ga4DateToYmd('20261019')).toBe('2026-10-19');
    expect(ga4DateToYmd('2026-10-19')).toBe('2026-10-19');
  });
});

describe('deltas and formats', () => {
  it('signs and rounds the change against the previous period', () => {
    expect(delta(125, 100)).toEqual({ percent: 25, direction: 'up' });
    expect(delta(97, 100)).toEqual({ percent: -3, direction: 'down' });
    expect(delta(100, 100)).toEqual({ percent: 0, direction: 'flat' });
    expect(delta(10, 0)).toEqual({ percent: null, direction: 'up' });
    expect(delta(0, 0)).toEqual({ percent: null, direction: 'flat' });
  });

  it('formats for nl-BE', () => {
    expect(formatDelta(delta(125, 100))).toBe('+25 %');
    expect(formatDelta(delta(97, 100))).toBe('−3 %');
    expect(formatDelta(delta(10, 0))).toBe('—');
    expect(compactNumber(1284)).toBe('1.284');
    expect(compactNumber(12_900)).toMatch(/12,9/);
    expect(formatRate(0.6234)).toBe('62 %');
    expect(formatSeconds(92)).toBe('1 min 32 s');
    expect(formatSeconds(45)).toBe('45 s');
    expect(share(25, 200)).toBe(12.5);
    expect(share(1, 0)).toBe(0);
  });
});

describe('chart geometry', () => {
  it('picks a clean axis maximum and ticks', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(42)).toBe(50);
    expect(niceMax(500)).toBe(500);
    expect(niceMax(501)).toBe(1000);
    expect(axisTicks(20)).toEqual([0, 5, 10, 15, 20]);
  });

  it('places points inside the box, baseline at the bottom', () => {
    expect(xAt(0, 3, BOX)).toBe(10);
    expect(xAt(2, 3, BOX)).toBe(90);
    expect(xAt(0, 1, BOX)).toBe(50);
    expect(yAt(0, 10, BOX)).toBe(50);
    expect(yAt(10, 10, BOX)).toBe(10);
    expect(linePath([0, 5, 10], 10, BOX)).toBe('M10.0 50.0 L50.0 30.0 L90.0 10.0');
    expect(linePath([3], 10, BOX)).toBe('');
  });

  it('labels every day of a week and about seven days of longer periods', () => {
    expect(labelIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelIndices(28)).toEqual([0, 5, 10, 15, 20, 27]);
    expect(labelIndices(90)).toEqual([0, 15, 30, 45, 60, 75, 89]);
    expect(labelIndices(0)).toEqual([]);
  });

  it('snaps the crosshair to the nearest day', () => {
    expect(nearestIndex(10, 5, BOX)).toBe(0);
    expect(nearestIndex(90, 5, BOX)).toBe(4);
    expect(nearestIndex(52, 5, BOX)).toBe(2);
    expect(nearestIndex(-100, 5, BOX)).toBe(0);
    expect(nearestIndex(50, 1, BOX)).toBe(0);
  });
});
