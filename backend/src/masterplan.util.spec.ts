import {
  describeDiff,
  isEmptyDiff,
  mergeProposedState,
  nextVersionLabel,
  reconcileMasterPlanChange,
  versionLabel,
} from './masterplan.util';

const fields = { name: 'Press 1', department: 'Maintenance', location: 'PRD-1', workCenter: 'WC-1' };

describe('reconcileMasterPlanChange', () => {
  it('skips additions that already exist (alias-insensitive) and removals that are not active', () => {
    const diff = reconcileMasterPlanChange({
      proposed: { addPmTypes: ['Monthly', 'Weekly'], removePmTypes: ['Yearly', 'Daily'] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: ['1 month(s)', 'Daily'],
      currentAssetFields: fields,
    });
    expect(diff.addFrequencies).toEqual(['Weekly']);
    expect(diff.removeFrequencies).toEqual(['Daily']);
  });

  it('only returns fields that differ and active changes that matter', () => {
    const diff = reconcileMasterPlanChange({
      proposed: { setActive: false, editFields: { name: 'Press 1', department: 'Quality' } },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: [],
      currentAssetFields: fields,
    });
    expect(diff.setAssetActive).toBe(false);
    expect(diff.editFields).toEqual({ department: 'Quality' });
  });

  it('sets setInPlan only when the machine is not in the plan', () => {
    const base = { proposed: { addToPlan: true }, currentAssetActive: true, currentActiveFrequencies: [], currentAssetFields: fields };
    expect(reconcileMasterPlanChange({ ...base, currentAssetInPlan: false }).setInPlan).toBe(true);
    expect(isEmptyDiff(reconcileMasterPlanChange({ ...base, currentAssetInPlan: true }))).toBe(true);
  });
});

describe('mergeProposedState', () => {
  it('collapses add-then-remove-then-add to a single add', () => {
    let state = mergeProposedState({}, { addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: { title: 'A' } } });
    state = mergeProposedState(state, { removePmTypes: ['Monthly'] });
    expect(state.addPmTypes).toBeUndefined();
    expect(state.newPmTypeDetails).toBeUndefined();
    expect(state.removePmTypes).toEqual(['Monthly']);
    state = mergeProposedState(state, { addPmTypes: ['monthly'], newPmTypeDetails: { monthly: { title: 'B' } } });
    expect(state.removePmTypes).toBeUndefined();
    expect(state.addPmTypes).toEqual(['monthly']);
    expect(state.newPmTypeDetails?.['monthly'].title).toBe('B');
  });

  it('merges editFields and lets setActive overwrite', () => {
    let state = mergeProposedState({ setActive: false, editFields: { name: 'X' } }, { setActive: true, editFields: { department: 'Q' } });
    expect(state).toEqual({ setActive: true, editFields: { name: 'X', department: 'Q' } });
    state = mergeProposedState(state, { editFields: { name: 'Y' } });
    expect(state.editFields).toEqual({ name: 'Y', department: 'Q' });
  });

  it('keeps addToPlan sticky', () => {
    expect(mergeProposedState({ addToPlan: true }, { setActive: true }).addToPlan).toBe(true);
  });
});

describe('describeDiff', () => {
  it('describes every kind of change in a stable order', () => {
    expect(describeDiff({
      setInPlan: true,
      setAssetActive: false,
      editFields: { name: 'N', department: 'D', location: 'L', workCenter: 'W' },
      addFrequencies: ['Monthly'],
      removeFrequencies: ['Daily'],
    })).toEqual([
      'Added machine to Master Plan',
      'Deactivated machine',
      'Renamed to "N"',
      'Changed department to D',
      'Changed customer to L',
      'Changed work center to W',
      'Added Monthly PM',
      'Removed Daily PM',
    ]);
  });
});

describe('versionLabel', () => {
  it('runs A..Z then falls back to a numbered label', () => {
    expect(versionLabel(0)).toBe('A');
    expect(versionLabel(25)).toBe('Z');
    expect(versionLabel(26)).toBe('V27');
  });
});

describe('nextVersionLabel', () => {
  it('uses the next letter by count when free', () => {
    expect(nextVersionLabel([])).toBe('A');
    expect(nextVersionLabel(['A'])).toBe('B');
  });

  it('skips labels already taken, e.g. after a version was deleted', () => {
    expect(nextVersionLabel(['B'])).toBe('C');
    expect(nextVersionLabel(['A', 'C'])).toBe('D');
  });
});
