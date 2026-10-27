import { ProposedMasterPlanState } from '../models/pm.model';

// Pure diff function: compares a pending card's net `proposedState` against the ACTUAL current
// state (not the state at submit time) and returns only the minimal delta to apply. Never replay
// a chain of historical edits — this is the guard against duplicate-creation bugs when edits
// contradict each other (e.g. add-then-remove-then-add-again) and against double-applying a
// change that already happened some other way between submit and approve.
export interface ReconcileInput {
  proposed: ProposedMasterPlanState;
  currentAssetInPlan: boolean;
  currentAssetActive: boolean;
  currentActiveFrequencies: string[]; // normalized-or-not; comparison is case/whitespace-insensitive
  currentAssetFields?: { name: string; department: string; location: string; workCenter?: string };
}

export interface ReconcileResult {
  // Only set when the request asks to add the machine to the plan and it is not in the plan yet.
  setInPlan?: true;
  // Only set when the machine's active flag actually needs to change — undefined = no-op.
  setAssetActive?: boolean;
  addFrequencies: string[];
  removeFrequencies: string[];
  // Only the fields that actually differ from current — undefined = no-op.
  editFields?: { name?: string; department?: string; location?: string; workCenter?: string };
}

function normalizeFrequency(f: string): string {
  return f.trim().toLowerCase();
}

export function reconcileMasterPlanChange(input: ReconcileInput): ReconcileResult {
  const { proposed, currentAssetInPlan, currentAssetActive, currentActiveFrequencies, currentAssetFields } = input;
  const activeSet = new Set(currentActiveFrequencies.map(normalizeFrequency));

  const addFrequencies = Array.from(new Set((proposed.addPmTypes || [])
    .filter(f => !activeSet.has(normalizeFrequency(f)))));

  // Only remove types that are both requested AND still actually active.
  const removeFrequencies = Array.from(new Set((proposed.removePmTypes || [])
    .filter(f => activeSet.has(normalizeFrequency(f)))));

  let setAssetActive: boolean | undefined;
  if (proposed.setActive !== undefined && proposed.setActive !== currentAssetActive) {
    setAssetActive = proposed.setActive;
  }

  let editFields: ReconcileResult['editFields'];
  if (proposed.editFields && currentAssetFields) {
    const diff: NonNullable<ReconcileResult['editFields']> = {};
    for (const key of ['name', 'department', 'location', 'workCenter'] as const) {
      const proposedValue = proposed.editFields[key];
      if (proposedValue === undefined) continue;
      if (proposedValue.trim() !== (currentAssetFields[key] || '').trim()) diff[key] = proposedValue;
    }
    if (Object.keys(diff).length > 0) editFields = diff;
  }

  const result: ReconcileResult = { setAssetActive, addFrequencies, removeFrequencies, editFields };
  if (proposed.addToPlan === true && !currentAssetInPlan) result.setInPlan = true;
  return result;
}
