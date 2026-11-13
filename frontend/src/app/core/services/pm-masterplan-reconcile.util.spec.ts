import { reconcileMasterPlanChange } from './pm-masterplan-reconcile.util';

describe('reconcileMasterPlanChange', () => {
  it('adds a PM type not yet active', () => {
    const result = reconcileMasterPlanChange({
      proposed: { addPmTypes: ['Monthly'] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: ['Weekly']
    });
    expect(result.addFrequencies).toEqual(['Monthly']);
    expect(result.removeFrequencies).toEqual([]);
    expect(result.setAssetActive).toBeUndefined();
  });

  it('does not re-add a PM type that is already active (avoids duplicate creation)', () => {
    const result = reconcileMasterPlanChange({
      proposed: { addPmTypes: ['Monthly'] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: ['Monthly', 'Weekly']
    });
    expect(result.addFrequencies).toEqual([]);
  });

  it('removes a PM type that is currently active', () => {
    const result = reconcileMasterPlanChange({
      proposed: { removePmTypes: ['Quarterly'] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: ['Quarterly', 'Monthly']
    });
    expect(result.removeFrequencies).toEqual(['Quarterly']);
  });

  it('no-ops removing a PM type that is already inactive/absent (no crash)', () => {
    const result = reconcileMasterPlanChange({
      proposed: { removePmTypes: ['Quarterly'] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: ['Monthly']
    });
    expect(result.removeFrequencies).toEqual([]);
  });

  it('collapses add-then-remove-then-add-again to a net add (reducer already merged proposedState)', () => {
    // By the time this reaches reconcile, submit-time merging has already collapsed the edit
    // chain down to net desired state — reconcile only sees the final proposedState.
    const result = reconcileMasterPlanChange({
      proposed: { addPmTypes: ['Monthly'], removePmTypes: [] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: []
    });
    expect(result.addFrequencies).toEqual(['Monthly']);
    expect(result.removeFrequencies).toEqual([]);
  });

  it('is case/whitespace-insensitive when comparing frequencies', () => {
    const result = reconcileMasterPlanChange({
      proposed: { addPmTypes: [' monthly '] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: ['Monthly'],
    });
    expect(result.addFrequencies).toEqual([]);
  });

  it('flags deactivate only when the machine is not already inactive', () => {
    const result = reconcileMasterPlanChange({
      proposed: { setActive: false },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: []
    });
    expect(result.setAssetActive).toBe(false);
  });

  it('no-ops deactivate if already deactivated by some other means', () => {
    const result = reconcileMasterPlanChange({
      proposed: { setActive: false },
      currentAssetInPlan: true,
      currentAssetActive: false,
      currentActiveFrequencies: []
    });
    expect(result.setAssetActive).toBeUndefined();
  });

  it('flags reactivate only when the machine is currently inactive', () => {
    const result = reconcileMasterPlanChange({
      proposed: { setActive: true },
      currentAssetInPlan: true,
      currentAssetActive: false,
      currentActiveFrequencies: []
    });
    expect(result.setAssetActive).toBe(true);
  });

  it('no-ops reactivate if already active by some other means', () => {
    const result = reconcileMasterPlanChange({
      proposed: { setActive: true },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: []
    });
    expect(result.setAssetActive).toBeUndefined();
  });

  it('diffs only the fields that actually changed', () => {
    const result = reconcileMasterPlanChange({
      proposed: { editFields: { name: 'New Name', department: 'Facility' } },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: [],
      currentAssetFields: { name: 'Old Name', department: 'Facility', location: 'CUST-001', workCenter: 'WC-01' }
    });
    expect(result.editFields).toEqual({ name: 'New Name' });
  });

  it('no-ops editFields entirely when every field matches current (empty delta)', () => {
    const result = reconcileMasterPlanChange({
      proposed: { editFields: { name: 'Same Name', workCenter: 'WC-01' } },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: [],
      currentAssetFields: { name: 'Same Name', department: 'Facility', location: 'CUST-001', workCenter: 'WC-01' }
    });
    expect(result.editFields).toBeUndefined();
  });

  describe('send to Master Plan (addToPlan)', () => {
    it('sets the machine in plan when requested and it is not in plan yet', () => {
      const result = reconcileMasterPlanChange({
        proposed: { addToPlan: true },
        currentAssetInPlan: false,
        currentAssetActive: true,
        currentActiveFrequencies: []
      });
      expect(result.setInPlan).toBe(true);
    });

    it('does not set it again when the machine is already in plan', () => {
      const result = reconcileMasterPlanChange({
        proposed: { addToPlan: true },
        currentAssetInPlan: true,
        currentAssetActive: true,
        currentActiveFrequencies: []
      });
      expect(result.setInPlan).toBeUndefined();
    });

    it('never sets it when the request does not ask for it, whatever the plan status', () => {
      for (const currentAssetInPlan of [true, false]) {
        const result = reconcileMasterPlanChange({
          proposed: { addPmTypes: ['Monthly'] },
          currentAssetInPlan,
          currentAssetActive: true,
          currentActiveFrequencies: []
        });
        expect(result.setInPlan).toBeUndefined();
      }
      expect(reconcileMasterPlanChange({
        proposed: { addToPlan: false },
        currentAssetInPlan: false,
        currentAssetActive: true,
        currentActiveFrequencies: []
      }).setInPlan).toBeUndefined();
    });

    it('combines with the PM types to add, keeping their labels', () => {
      const result = reconcileMasterPlanChange({
        proposed: { addToPlan: true, addPmTypes: ['Weekly', '2 Month(s)'] },
        currentAssetInPlan: false,
        currentAssetActive: true,
        currentActiveFrequencies: []
      });
      expect(result.setInPlan).toBe(true);
      expect(result.addFrequencies).toEqual(['Weekly', '2 Month(s)']);
      expect(result.removeFrequencies).toEqual([]);
      expect(result.editFields).toBeUndefined();
      expect(result.setAssetActive).toBeUndefined();
    });
  });

  it('dedupes repeated frequencies within the same proposedState array', () => {
    const result = reconcileMasterPlanChange({
      proposed: { addPmTypes: ['Monthly', 'Monthly'] },
      currentAssetInPlan: true,
      currentAssetActive: true,
      currentActiveFrequencies: []
    });
    expect(result.addFrequencies).toEqual(['Monthly']);
  });
});
