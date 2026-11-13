export type FrequencyUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

const PRESETS: Record<string, { count: number; unit: FrequencyUnit }> = {
  daily: { count: 1, unit: 'day' },
  weekly: { count: 1, unit: 'week' },
  monthly: { count: 1, unit: 'month' },
  quarterly: { count: 3, unit: 'month' },
  yearly: { count: 1, unit: 'year' },
};

// Same label grammar as the Master Plan grid: a preset, or "<N> Hour|Day|Week|Month|Year(s)".
// Anything else (including a zero or negative count) is not understood and gives null.
export function parseFrequency(label: string): { count: number; unit: FrequencyUnit } | null {
  const norm = (label || '').trim().toLowerCase();
  if (PRESETS[norm]) return PRESETS[norm];
  const m = norm.match(/^(\d+)\s*(hour|day|week|month|year)/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  return { count, unit: m[2] as FrequencyUnit };
}

// Custom durations numerically identical to a preset are treated as the same PM type for duplicate
// detection only (the label the user picked is still stored/displayed as-is) — otherwise picking
// "Custom: 1 month(s)" would silently bypass the block on an existing "Monthly" PM.
const FREQUENCY_ALIASES: Record<string, string> = {
  '1 day(s)': 'Daily',
  '7 day(s)': 'Weekly',
  '1 month(s)': 'Monthly',
  '3 month(s)': 'Quarterly',
  '12 month(s)': 'Yearly',
  '1 year(s)': 'Yearly',
};

export function normalizeFrequency(frequency: string): string {
  const cleaned = frequency.trim().toLowerCase();
  const alias = FREQUENCY_ALIASES[cleaned];
  // Lowercase non-aliased values too so e.g. "Monthly" vs "monthly" still match.
  return (alias || frequency).trim().toLowerCase();
}

const DAYS_PER_UNIT: Record<FrequencyUnit, number> = { hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };

// Rough length of one cycle in days, used only to order PM types from most to least frequent.
// Labels that are not understood sort last.
export function frequencyRank(label: string): number {
  const parsed = parseFrequency(label);
  return parsed ? parsed.count * DAYS_PER_UNIT[parsed.unit] : Number.POSITIVE_INFINITY;
}
