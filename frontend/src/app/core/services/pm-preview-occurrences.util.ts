// Preview tasks exist only so the Master Plan grid has marks to draw for a PM type that was just
// approved into the plan (nothing is saved to the backend). One task per occurrence, from the first
// due date through 31 Dec of that date's year, so a Weekly PM looks like a real weekly plan.
import { parseFrequency } from './pm-frequency.util';

export interface OccurrenceInput {
  frequency: string; // preset ('Weekly') or custom ('2 Month(s)')
  firstDue?: Date | null;
  isRecurring?: boolean; // false = one-off
}

// A year has at most 53 weekly occurrences; the cap only guards against a runaway loop.
const MAX_OCCURRENCES = 60;

function addDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

// Always computed from the first due date (never from the previous occurrence), so a 31st clamped
// to 28 Feb returns to 31 Mar instead of drifting to the 28th for the rest of the year.
function addMonthsClamped(base: Date, months: number): Date {
  const result = new Date(base.getTime());
  const day = base.getDate();
  result.setDate(1);
  result.setMonth(base.getMonth() + months);
  if (!Number.isFinite(result.getTime())) return result;
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function generateOccurrenceDates(input: OccurrenceInput, today: Date = new Date()): Date[] {
  const hasFirstDue = input.firstDue instanceof Date && Number.isFinite(input.firstDue.getTime());
  const first = new Date((hasFirstDue ? input.firstDue! : today).getTime());

  if (input.isRecurring === false) return [first];

  const parsed = parseFrequency(input.frequency);
  // Daily and hourly plans mark every week from the first occurrence, so one task is enough.
  if (!parsed || parsed.unit === 'hour' || parsed.unit === 'day') return [first];

  const year = first.getFullYear();
  const dates: Date[] = [];
  for (let k = 0; k < MAX_OCCURRENCES; k++) {
    const date = parsed.unit === 'week'
      ? addDays(first, 7 * parsed.count * k)
      : addMonthsClamped(first, (parsed.unit === 'month' ? 1 : 12) * parsed.count * k);
    if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year) break;
    dates.push(date);
  }
  return dates;
}
