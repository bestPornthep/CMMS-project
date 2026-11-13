import { normalizeFrequency } from './frequency.util';

export interface NewPmTypeDetail {
  title: string;
  description?: string;
  estimatedHours?: number;
  partsRequired?: string[];
  checklist?: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[];
  startDate?: string | Date;
  isRecurring?: boolean;
}

export interface EditableAssetFields {
  name?: string;
  department?: string;
  location?: string;
  workCenter?: string;
}

// Net desired end-state of one machine's pending card (never a log of operations).
export interface ProposedMasterPlanState {
  addToPlan?: boolean;
  setActive?: boolean;
  editFields?: EditableAssetFields;
  addPmTypes?: string[];
  removePmTypes?: string[];
  newPmTypeDetails?: Record<string, NewPmTypeDetail>;
}

export interface ReconcileInput {
  proposed: ProposedMasterPlanState;
  currentAssetInPlan: boolean;
  currentAssetActive: boolean;
  currentActiveFrequencies: string[];
  currentAssetFields?: { name: string; department: string; location: string; workCenter?: string | null };
}

export interface ReconcileResult {
  setInPlan?: true;
  setAssetActive?: boolean;
  addFrequencies: string[];
  removeFrequencies: string[];
  editFields?: EditableAssetFields;
}

const EDITABLE_KEYS = ['name', 'department', 'location', 'workCenter'] as const;

// Compares a card's net proposed state with the ACTUAL current state and returns only the delta to
// apply. Never replay history: this is what makes approve idempotent and duplicate-proof.
export function reconcileMasterPlanChange(input: ReconcileInput): ReconcileResult {
  const { proposed, currentAssetInPlan, currentAssetActive, currentActiveFrequencies, currentAssetFields } = input;
  const activeSet = new Set(currentActiveFrequencies.map(normalizeFrequency));

  const addFrequencies = uniqueByFrequency((proposed.addPmTypes || []).filter(f => !activeSet.has(normalizeFrequency(f))));
  const removeFrequencies = uniqueByFrequency((proposed.removePmTypes || []).filter(f => activeSet.has(normalizeFrequency(f))));

  const result: ReconcileResult = { addFrequencies, removeFrequencies };
  if (proposed.setActive !== undefined && proposed.setActive !== currentAssetActive) {
    result.setAssetActive = proposed.setActive;
  }
  if (proposed.editFields && currentAssetFields) {
    const diff: EditableAssetFields = {};
    for (const key of EDITABLE_KEYS) {
      const value = proposed.editFields[key];
      if (value === undefined) continue;
      if (value.trim() !== (currentAssetFields[key] || '').trim()) diff[key] = value;
    }
    if (Object.keys(diff).length > 0) result.editFields = diff;
  }
  if (proposed.addToPlan === true && !currentAssetInPlan) result.setInPlan = true;
  return result;
}

export function isEmptyDiff(diff: ReconcileResult): boolean {
  return !diff.setInPlan
    && diff.setAssetActive === undefined
    && !diff.editFields
    && diff.addFrequencies.length === 0
    && diff.removeFrequencies.length === 0;
}

// Folds a new submission into the card's existing state. Contradicting edits collapse to the
// latest intent (add-then-remove-then-add nets out to just "add").
export function mergeProposedState(existing: ProposedMasterPlanState, incoming: ProposedMasterPlanState): ProposedMasterPlanState {
  const merged: ProposedMasterPlanState = { ...existing };
  if (incoming.addToPlan !== undefined) merged.addToPlan = incoming.addToPlan || merged.addToPlan;
  if (incoming.setActive !== undefined) merged.setActive = incoming.setActive;
  if (incoming.editFields) merged.editFields = { ...(merged.editFields || {}), ...incoming.editFields };

  if (incoming.addPmTypes?.length) {
    const adding = new Set(incoming.addPmTypes.map(normalizeFrequency));
    merged.removePmTypes = (merged.removePmTypes || []).filter(f => !adding.has(normalizeFrequency(f)));
    merged.addPmTypes = uniqueByFrequency([...(merged.addPmTypes || []), ...incoming.addPmTypes]);
  }
  if (incoming.removePmTypes?.length) {
    const removing = new Set(incoming.removePmTypes.map(normalizeFrequency));
    merged.addPmTypes = (merged.addPmTypes || []).filter(f => !removing.has(normalizeFrequency(f)));
    merged.removePmTypes = uniqueByFrequency([...(merged.removePmTypes || []), ...incoming.removePmTypes]);
  }
  if (incoming.newPmTypeDetails) {
    merged.newPmTypeDetails = { ...(merged.newPmTypeDetails || {}), ...incoming.newPmTypeDetails };
  }
  if (merged.newPmTypeDetails) {
    const kept = new Set((merged.addPmTypes || []).map(normalizeFrequency));
    merged.newPmTypeDetails = Object.fromEntries(
      Object.entries(merged.newPmTypeDetails).filter(([f]) => kept.has(normalizeFrequency(f)))
    );
  }
  return stripEmpty(merged);
}

// Drops empty arrays/objects so a stored card only carries what it actually asks for.
export function stripEmpty(state: ProposedMasterPlanState): ProposedMasterPlanState {
  const out: ProposedMasterPlanState = { ...state };
  if (!out.addPmTypes?.length) delete out.addPmTypes;
  if (!out.removePmTypes?.length) delete out.removePmTypes;
  if (!out.editFields || Object.keys(out.editFields).length === 0) delete out.editFields;
  if (!out.newPmTypeDetails || Object.keys(out.newPmTypeDetails).length === 0) delete out.newPmTypeDetails;
  if (!out.addToPlan) delete out.addToPlan;
  return out;
}

export function describeDiff(diff: ReconcileResult): string[] {
  const lines: string[] = [];
  if (diff.setInPlan) lines.push('Added machine to Master Plan');
  if (diff.setAssetActive === false) lines.push('Deactivated machine');
  if (diff.setAssetActive === true) lines.push('Reactivated machine');
  if (diff.editFields?.name) lines.push(`Renamed to "${diff.editFields.name}"`);
  if (diff.editFields?.department) lines.push(`Changed department to ${diff.editFields.department}`);
  if (diff.editFields?.location) lines.push(`Changed customer to ${diff.editFields.location}`);
  if (diff.editFields?.workCenter) lines.push(`Changed work center to ${diff.editFields.workCenter}`);
  for (const f of diff.addFrequencies) lines.push(`Added ${f} PM`);
  for (const f of diff.removeFrequencies) lines.push(`Removed ${f} PM`);
  return lines;
}

const VERSION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function versionLabel(existingCount: number): string {
  return VERSION_LETTERS[existingCount] ?? `V${existingCount + 1}`;
}

function uniqueByFrequency(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter(f => {
    const key = normalizeFrequency(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
