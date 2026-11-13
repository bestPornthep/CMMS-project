import { computeMissingDates } from './schedule-horizon.util';

describe('computeMissingDates', () => {
  const now = new Date(2026, 5, 1, 0, 0, 0);
  const oneYear = new Date(2027, 5, 1, 0, 0, 0);

  it('fills a weekly schedule up to one year ahead, strictly after the anchor', () => {
    const dates = computeMissingDates('Weekly', now, now);
    expect(dates.length).toBe(52);
    expect(dates[0].getTime()).toBeGreaterThan(now.getTime());
    expect(dates.every(d => d < oneYear)).toBe(true);
  });

  it('is idempotent: re-running with the new max as anchor produces nothing', () => {
    const first = computeMissingDates('Weekly', now, now);
    const second = computeMissingDates('Weekly', first[first.length - 1], now);
    expect(second).toEqual([]);
  });

  it('generates nothing when existing tasks already reach past the horizon', () => {
    const farAnchor = new Date(2040, 0, 1);
    expect(computeMissingDates('Weekly', farAnchor, now)).toEqual([]);
  });

  it('only tops up the gap when the anchor is partway through the horizon', () => {
    const anchor = new Date(2026, 11, 1);
    const dates = computeMissingDates('Monthly', anchor, now);
    expect(dates.map(d => d.getMonth())).toEqual([0, 1, 2, 3, 4]);
    expect(dates.every(d => d > anchor)).toBe(true);
  });

  it('starts from now when the schedule has no tasks', () => {
    const dates = computeMissingDates('Monthly', null, now);
    expect(dates.length).toBe(11);
    expect(dates[0].getMonth()).toBe(6);
  });

  it('caps the number of dates produced in a single run', () => {
    const dates = computeMissingDates('1 hour(s)', now, now, 100);
    expect(dates.length).toBe(100);
  });
});
