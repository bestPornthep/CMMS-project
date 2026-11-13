import { generateOccurrenceDates } from './pm-preview-occurrences.util';

// Local-calendar "YYYY-MM-DD" so assertions do not depend on the machine's timezone.
const ymd = (dates: Date[]) => dates.map(d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

const TODAY = new Date(2026, 9, 26, 9, 30); // 26 Oct 2026

describe('generateOccurrenceDates', () => {
  describe('recurring presets (first due + N × frequency, through 31 Dec of the first due date\'s year)', () => {
    it('Weekly from Mon 2 Nov 2026 gives 9 weekly dates', () => {
      const dates = generateOccurrenceDates({ frequency: 'Weekly', firstDue: new Date(2026, 10, 2) }, TODAY);
      expect(ymd(dates)).toEqual([
        '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30',
        '2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28'
      ]);
    });

    it('Weekly from 1 Jan 2026 gives 53 dates, the last on 31 Dec', () => {
      const dates = generateOccurrenceDates({ frequency: 'Weekly', firstDue: new Date(2026, 0, 1) }, TODAY);
      expect(dates).toHaveLength(53);
      expect(ymd(dates).at(-1)).toBe('2026-12-31');
    });

    it('Monthly from 15 Jan 2026 gives one date per month', () => {
      const dates = generateOccurrenceDates({ frequency: 'Monthly', firstDue: new Date(2026, 0, 15) }, TODAY);
      expect(ymd(dates)).toEqual([
        '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15',
        '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15'
      ]);
    });

    it('Quarterly from 10 Jan 2026 gives 4 dates', () => {
      const dates = generateOccurrenceDates({ frequency: 'Quarterly', firstDue: new Date(2026, 0, 10) }, TODAY);
      expect(ymd(dates)).toEqual(['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10']);
    });

    it('Yearly gives only the first date', () => {
      const dates = generateOccurrenceDates({ frequency: 'Yearly', firstDue: new Date(2026, 2, 3) }, TODAY);
      expect(ymd(dates)).toEqual(['2026-03-03']);
    });

    it('ignores case and surrounding whitespace in the frequency label', () => {
      const dates = generateOccurrenceDates({ frequency: '  quarterly ', firstDue: new Date(2026, 0, 10) }, TODAY);
      expect(dates).toHaveLength(4);
    });
  });

  describe('custom "N Unit(s)" frequencies', () => {
    it('2 Week(s) from 2 Nov 2026', () => {
      const dates = generateOccurrenceDates({ frequency: '2 Week(s)', firstDue: new Date(2026, 10, 2) }, TODAY);
      expect(ymd(dates)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']);
    });

    it('2 Month(s) from 10 Jan 2026', () => {
      const dates = generateOccurrenceDates({ frequency: '2 Month(s)', firstDue: new Date(2026, 0, 10) }, TODAY);
      expect(ymd(dates)).toEqual(['2026-01-10', '2026-03-10', '2026-05-10', '2026-07-10', '2026-09-10', '2026-11-10']);
    });

    it('3 Month(s) matches Quarterly', () => {
      const custom = generateOccurrenceDates({ frequency: '3 Month(s)', firstDue: new Date(2026, 0, 10) }, TODAY);
      const preset = generateOccurrenceDates({ frequency: 'Quarterly', firstDue: new Date(2026, 0, 10) }, TODAY);
      expect(ymd(custom)).toEqual(ymd(preset));
    });

    it('1 Year(s) gives only the first date', () => {
      const dates = generateOccurrenceDates({ frequency: '1 Year(s)', firstDue: new Date(2026, 5, 1) }, TODAY);
      expect(ymd(dates)).toEqual(['2026-06-01']);
    });
  });

  describe('frequencies that need only one task (the grid marks every week from the first)', () => {
    it.each(['Daily', '1 Day(s)', '2 Day(s)', '4 Hour(s)', '1 Hour(s)'])('%s gives a single date', frequency => {
      const dates = generateOccurrenceDates({ frequency, firstDue: new Date(2026, 10, 2) }, TODAY);
      expect(ymd(dates)).toEqual(['2026-11-02']);
    });

    it('a one-off PM gives a single date whatever the frequency', () => {
      const dates = generateOccurrenceDates({ frequency: 'Weekly', firstDue: new Date(2026, 10, 2), isRecurring: false }, TODAY);
      expect(ymd(dates)).toEqual(['2026-11-02']);
    });
  });

  describe('calendar edge cases', () => {
    it('a first due date on 31 Dec gives one date', () => {
      expect(generateOccurrenceDates({ frequency: 'Weekly', firstDue: new Date(2026, 11, 31) }, TODAY)).toHaveLength(1);
      expect(generateOccurrenceDates({ frequency: 'Monthly', firstDue: new Date(2026, 11, 31) }, TODAY)).toHaveLength(1);
    });

    it('a month-end start clamps short months and returns to the 31st without drift', () => {
      const dates = generateOccurrenceDates({ frequency: 'Monthly', firstDue: new Date(2026, 0, 31) }, TODAY);
      expect(ymd(dates)).toEqual([
        '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
        '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31'
      ]);
    });

    it('uses 29 Feb in a leap year', () => {
      const dates = generateOccurrenceDates({ frequency: 'Monthly', firstDue: new Date(2028, 0, 31) }, TODAY);
      expect(ymd(dates)[1]).toBe('2028-02-29');
      expect(ymd(dates)[2]).toBe('2028-03-31');
    });

    it('a Yearly PM starting 29 Feb gives only that date', () => {
      const dates = generateOccurrenceDates({ frequency: 'Yearly', firstDue: new Date(2028, 1, 29) }, TODAY);
      expect(ymd(dates)).toEqual(['2028-02-29']);
    });

    it('keeps the time of day of the first due date', () => {
      const dates = generateOccurrenceDates({ frequency: 'Monthly', firstDue: new Date(2026, 0, 15, 7, 45, 12) }, TODAY);
      expect(dates.every(d => d.getHours() === 7 && d.getMinutes() === 45 && d.getSeconds() === 12)).toBe(true);
    });

    it('returns ascending dates that all fall in the first due date\'s year', () => {
      const dates = generateOccurrenceDates({ frequency: 'Weekly', firstDue: new Date(2026, 5, 10) }, TODAY);
      const times = dates.map(d => d.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(dates.every(d => d.getFullYear() === 2026)).toBe(true);
    });

    it('a first due date in a past year only fills that year', () => {
      const dates = generateOccurrenceDates({ frequency: 'Monthly', firstDue: new Date(2025, 10, 5) }, TODAY);
      expect(ymd(dates)).toEqual(['2025-11-05', '2025-12-05']);
    });
  });

  describe('bad input never throws or loops', () => {
    it('falls back to today when the first due date is missing', () => {
      const dates = generateOccurrenceDates({ frequency: 'Monthly' }, TODAY);
      expect(ymd(dates)).toEqual(['2026-10-26', '2026-11-26', '2026-12-26']);
    });

    it('falls back to today when the first due date is an invalid Date', () => {
      const dates = generateOccurrenceDates({ frequency: 'Yearly', firstDue: new Date('nope') }, TODAY);
      expect(ymd(dates)).toEqual(['2026-10-26']);
    });

    it.each(['', '   ', 'Fortnightly', 'Custom', '0 Month(s)', '-1 Week(s)', 'NaN Day(s)', 'Week(s) 2'])(
      'an unparseable frequency "%s" gives a single date', frequency => {
        const dates = generateOccurrenceDates({ frequency, firstDue: new Date(2026, 10, 2) }, TODAY);
        expect(ymd(dates)).toEqual(['2026-11-02']);
      });

    it('never returns more than the hard cap, even for a huge repeat count', () => {
      const dates = generateOccurrenceDates({ frequency: '1 Week(s)', firstDue: new Date(2026, 0, 1) }, TODAY);
      expect(dates.length).toBeLessThanOrEqual(60);
      const huge = generateOccurrenceDates({ frequency: '99999999999999999999 Month(s)', firstDue: new Date(2026, 0, 1) }, TODAY);
      expect(huge).toHaveLength(1);
    });

    it('does not mutate the first due date it was given', () => {
      const first = new Date(2026, 0, 31);
      const before = first.getTime();
      generateOccurrenceDates({ frequency: 'Monthly', firstDue: first }, TODAY);
      expect(first.getTime()).toBe(before);
    });

    it('returns independent Date objects', () => {
      const dates = generateOccurrenceDates({ frequency: 'Daily', firstDue: new Date(2026, 10, 2) }, TODAY);
      dates[0].setFullYear(1999);
      const again = generateOccurrenceDates({ frequency: 'Daily', firstDue: new Date(2026, 10, 2) }, TODAY);
      expect(ymd(again)).toEqual(['2026-11-02']);
    });
  });
});
