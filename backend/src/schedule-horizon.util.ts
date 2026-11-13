import { addFrequency } from './frequency.util';

// Dates that still need to exist so a schedule has tasks up to one year ahead.
// `anchor` is the latest nextDueDate across ALL of the schedule's tasks (any
// status, including Done and Cancelled) so a cancelled occurrence is never
// regenerated and re-running the job is a no-op.
export function computeMissingDates(
  frequency: string,
  anchor: Date | null,
  now: Date,
  maxPerRun = 365,
): Date[] {
  const horizon = new Date(now);
  horizon.setFullYear(horizon.getFullYear() + 1);

  const dates: Date[] = [];
  let current = anchor ?? now;
  while (dates.length < maxPerRun) {
    const next = addFrequency(current, frequency);
    if (next.getTime() <= current.getTime()) break;
    if (next >= horizon) break;
    dates.push(next);
    current = next;
  }
  return dates;
}
