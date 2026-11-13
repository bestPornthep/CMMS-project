export type FrequencyUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

const PRESETS: Record<string, { count: number; unit: FrequencyUnit }> = {
  daily: { count: 1, unit: 'day' },
  weekly: { count: 1, unit: 'week' },
  monthly: { count: 1, unit: 'month' },
  quarterly: { count: 3, unit: 'month' },
  yearly: { count: 1, unit: 'year' },
};

const UNIT_CODE: Record<FrequencyUnit, string> = { hour: 'h', day: 'd', week: 'w', month: 'm', year: 'y' };

// Mirrors frontend pm-frequency.util.ts so both sides agree on what counts as the same PM type.
const FREQUENCY_ALIASES: Record<string, string> = {
  '1 day(s)': 'Daily',
  '7 day(s)': 'Weekly',
  '1 week(s)': 'Weekly',
  '1 month(s)': 'Monthly',
  '3 month(s)': 'Quarterly',
  '12 month(s)': 'Yearly',
  '1 year(s)': 'Yearly',
};

export function normalizeFrequency(frequency: string): string {
  const cleaned = (frequency || '').trim().toLowerCase();
  const alias = FREQUENCY_ALIASES[cleaned];
  return (alias || cleaned).trim().toLowerCase();
}

export function parseFrequency(label: string): { count: number; unit: FrequencyUnit } | null {
  const norm = normalizeFrequency(label);
  if (PRESETS[norm]) return PRESETS[norm];
  const m = norm.match(/^(\d+)\s*(hour|day|week|month|year)/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  return { count, unit: m[2] as FrequencyUnit };
}

// Compact code used in PM task ids, e.g. Monthly -> "1m", "4 hour(s)" -> "4h".
export function periodCode(label: string): string {
  const parsed = parseFrequency(label);
  if (!parsed) return normalizeFrequency(label).replace(/[^a-z0-9]/g, '');
  return `${parsed.count}${UNIT_CODE[parsed.unit]}`;
}

// Returns a new date one period after `from`. Unknown labels advance by one month.
export function addFrequency(from: Date, label: string): Date {
  const parsed = parseFrequency(label) ?? { count: 1, unit: 'month' as FrequencyUnit };
  const d = new Date(from);
  switch (parsed.unit) {
    case 'hour':
      d.setHours(d.getHours() + parsed.count);
      break;
    case 'day':
      d.setDate(d.getDate() + parsed.count);
      break;
    case 'week':
      d.setDate(d.getDate() + parsed.count * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + parsed.count);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + parsed.count);
      break;
  }
  return d;
}
