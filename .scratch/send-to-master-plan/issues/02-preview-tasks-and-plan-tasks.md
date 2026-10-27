# 02 โ€” Preview tasks and plan tasks

**What to build:** An in-memory store of preview tasks and a "plan tasks" view (real tasks + preview tasks) that the Master Plan page uses for its marks. A generator creates one preview task per occurrence through year-end. No other page ever sees preview tasks.

**Blocked by:** 01 โ€” Plan status foundation

**Status:** built

- [ ] The real-task view is unchanged. Assign PM, Record PM, Calendar, Dashboard, Reports and notifications never list preview tasks.
- [ ] The Master Plan marks come from plan tasks (real + preview).
- [ ] Occurrence rules: Weekly, Monthly, Quarterly, Yearly and custom "N Unit(s)" generate first due + N ร— frequency through 31 Dec of the first due date's year, at least one task. Daily and Hourly types generate one task. A one-off PM generates one task.
- [ ] Edge cases covered: first due date on 31 Dec gives one task; a month-end start (31 Jan monthly) clamps to 28/29 Feb and returns to 31 Mar with no drift; 29 Feb in a leap year; an invalid or missing first due date falls back to today; an unparseable frequency label gives one task; a zero, negative or NaN step cannot loop; a hard cap limits the number of tasks.
- [ ] Active PM types, the duplicate check and Remove PM Type consider both real and preview tasks. Removing a PM type cancels its preview tasks (kept, with Cancelled status and a reason, like real tasks).
- [ ] Preview tasks are clearly marked and never call the backend.
- [ ] Tests for the generator edge cases and for the visibility and PM-type rules; `npx tsc --noEmit` is clean.
