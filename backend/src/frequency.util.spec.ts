import { addFrequency, normalizeFrequency, periodCode } from './frequency.util';

describe('normalizeFrequency', () => {
  it('lowercases and trims presets', () => {
    expect(normalizeFrequency('  Monthly ')).toBe('monthly');
  });

  it.each([
    ['1 day(s)', 'daily'],
    ['7 day(s)', 'weekly'],
    ['1 week(s)', 'weekly'],
    ['1 month(s)', 'monthly'],
    ['3 month(s)', 'quarterly'],
    ['12 month(s)', 'yearly'],
    ['1 Year(s)', 'yearly'],
  ])('treats custom %s as the %s preset', (label, expected) => {
    expect(normalizeFrequency(label)).toBe(expected);
  });

  it('keeps non-preset custom durations distinct', () => {
    expect(normalizeFrequency('2 Week(s)')).toBe('2 week(s)');
  });
});

describe('periodCode', () => {
  it.each([
    ['Daily', '1d'],
    ['Weekly', '1w'],
    ['Monthly', '1m'],
    ['Quarterly', '3m'],
    ['Yearly', '1y'],
    ['1 month(s)', '1m'],
    ['3 month(s)', '3m'],
    ['4 hour(s)', '4h'],
    ['10 day(s)', '10d'],
    ['2 week(s)', '2w'],
    ['6 month(s)', '6m'],
    ['2 Year(s)', '2y'],
  ])('%s -> %s', (label, code) => {
    expect(periodCode(label)).toBe(code);
  });
});

describe('addFrequency', () => {
  const base = () => new Date(2026, 0, 31, 8, 0, 0);

  it('adds presets', () => {
    expect(addFrequency(base(), 'Daily').getDate()).toBe(1);
    expect(addFrequency(base(), 'Weekly').getDate()).toBe(7);
  });

  it('adds hour(s), day(s), month(s), Year(s)', () => {
    expect(addFrequency(base(), '4 hour(s)').getHours()).toBe(12);
    expect(addFrequency(base(), '10 day(s)').getDate()).toBe(10);
    expect(addFrequency(new Date(2026, 0, 15), '2 month(s)').getMonth()).toBe(2);
    expect(addFrequency(base(), '2 Year(s)').getFullYear()).toBe(2028);
  });

  it('adds week(s) (previously fell back to monthly)', () => {
    const d = addFrequency(new Date(2026, 0, 1), '2 week(s)');
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('does not mutate the input', () => {
    const input = base();
    addFrequency(input, 'Weekly');
    expect(input.getTime()).toBe(base().getTime());
  });

  it('falls back to monthly for unknown labels', () => {
    expect(addFrequency(new Date(2026, 0, 15), 'whatever').getMonth()).toBe(1);
  });
});
