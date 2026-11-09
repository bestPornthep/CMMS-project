import { Asset, DraftPmType, PendingMasterPlanChange } from '../models/pm.model';
import { isAssetInMasterPlan } from './pm-plan.util';

export interface MockMasterPlanContext {
  assets(): Asset[];
  updateAssets(fn: (assets: Asset[]) => Asset[]): void;
  activeFrequenciesForAsset(assetId: string): string[];
  draftPmTypesFor(assetId: string): DraftPmType[];
  setDraftPmTypes(assetId: string, drafts: DraftPmType[]): void;
  buildSendRequest(machine: Asset, drafts: DraftPmType[], submittedBy: string, at: Date): PendingMasterPlanChange;
}

// The requests MasterPlanService.seedMockMasterPlanChanges puts in place (see its comment).
export function buildMockMasterPlanChanges(ctx: MockMasterPlanContext): PendingMasterPlanChange[] {
  const now = new Date();
  const inPlan = ctx.assets().filter(isAssetInMasterPlan);
  const sendRequest = seedMockSendRequest(ctx, now, inPlan[0]?.location || 'CUST-001');
  const asset = inPlan[0];
  if (!asset) {
    return sendRequest ? [sendRequest] : [];
  }
  const asset2 = inPlan[1] || asset;
  const assetId = asset.id;
  const assetName = asset.name;
  const department = asset.department;
  const asset2Id = asset2.id;
  const asset2Name = asset2.name;
  const asset2Department = asset2.department;
  // Reactivate only reads as Inactive -> Active if the live asset is actually inactive — if
  // none is, flip one locally (dev-only, in-memory) so the demo is guaranteed correct rather
  // than depending on real data happening to have a deactivated machine.
  let inactiveAsset = inPlan.find(a => a.isActive === false);
  if (!inactiveAsset) {
    ctx.updateAssets(assets => assets.map(a => a.id === asset.id ? { ...a, isActive: false } : a));
    inactiveAsset = { ...asset, isActive: false };
  }
  const reactivateId = inactiveAsset.id;
  const reactivateName = inactiveAsset.name;
  const reactivateDept = inactiveAsset.department;
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // Combo card's "removed" frequency must be a real PM on this asset, or the detail modal's
  // lookup has nothing to find and falls back to "No active PM record found".
  const comboRemoveFreq = ctx.activeFrequenciesForAsset(assetId).find(f => f.toLowerCase() !== 'daily') || 'Yearly';

  const mocks: PendingMasterPlanChange[] = [
    ...(sendRequest ? [sendRequest] : []),
    // Edit — rename only
    {
      id: 'PMC-MOCK-RENAME',
      assetId,
      assetName,
      department,
      proposedState: { editFields: { name: `${assetName} (Line 2)` } },
      submittedBy: 'ENG-TST-1',
      submittedAt: now,
      note: 'Renamed to reflect new line assignment.',
      history: [{ timestamp: now, by: 'ENG-TST-1', note: 'Renamed to reflect new line assignment.' }],
      status: 'pending'
    },
    // Edit — department only
    {
      id: 'PMC-MOCK-DEPT',
      assetId: asset2Id,
      assetName: asset2Name,
      department: asset2Department,
      proposedState: { editFields: { department: 'Maintenance' } },
      submittedBy: 'ENG-FAC-1',
      submittedAt: now,
      note: 'Machine transferred from its current department to Maintenance.',
      history: [{ timestamp: now, by: 'ENG-FAC-1', note: 'Machine transferred from its current department to Maintenance.' }],
      status: 'pending'
    },
    // Edit — customer/location only
    {
      id: 'PMC-MOCK-CUSTOMER',
      assetId,
      assetName,
      department,
      proposedState: { editFields: { location: 'CUST-099' } },
      submittedBy: 'ENG-TST-1',
      submittedAt: now,
      note: 'Reassigned to a different customer site.',
      history: [{ timestamp: now, by: 'ENG-TST-1', note: 'Reassigned to a different customer site.' }],
      status: 'pending'
    },
    // Edit — work center only
    {
      id: 'PMC-MOCK-WORKCENTER',
      assetId: asset2Id,
      assetName: asset2Name,
      department: asset2Department,
      proposedState: { editFields: { workCenter: 'WC-02' } },
      submittedBy: 'ENG-TST-1',
      submittedAt: now,
      note: 'Machine physically moved to a new work center.',
      history: [{ timestamp: now, by: 'ENG-TST-1', note: 'Machine physically moved to a new work center.' }],
      status: 'pending'
    },
    // Combined multi-field edit + add/remove PM type + multi-entry edit history
    {
      id: 'PMC-MOCK-COMBO',
      assetId,
      assetName,
      department,
      proposedState: {
        editFields: { name: `${assetName} (Rev)`, department: 'Mechanic', workCenter: 'WC-10' },
        addPmTypes: ['Daily'],
        removePmTypes: [comboRemoveFreq],
        newPmTypeDetails: { Daily: { title: 'Daily Air Compressor Check', estimatedHours: 0.25, checklist: [{ text: 'Check air pressure gauge', requiresValue: true }, { text: 'Drain moisture trap', requiresPhoto: false }] } }
      },
      submittedBy: 'ENG-MEC-1',
      submittedAt: now,
      note: `Consolidated after line audit: renamed, moved department/work center, swapped ${comboRemoveFreq} for Daily checks.`,
      history: [
        { timestamp: dayAgo, by: 'ENG-MEC-1', note: 'Initial proposal: move to Mechanic dept.' },
        { timestamp: hourAgo, by: 'ENG-MEC-1', note: `Added work center + Daily/${comboRemoveFreq} PM swap.` },
        { timestamp: now, by: 'ENG-MEC-1', note: `Consolidated after line audit: renamed, moved department/work center, swapped ${comboRemoveFreq} for Daily checks.` }
      ],
      status: 'pending'
    },
    // Deactivate machine
    {
      id: 'PMC-MOCK-DEACTIVATE',
      assetId: asset2Id,
      assetName: asset2Name,
      department: asset2Department,
      proposedState: { setActive: false },
      submittedBy: 'ENG-FAC-1',
      submittedAt: now,
      note: 'Machine decommissioned, no longer in use.',
      history: [{ timestamp: now, by: 'ENG-FAC-1', note: 'Machine decommissioned, no longer in use.' }],
      status: 'pending'
    },
    // Reactivate machine
    {
      id: 'PMC-MOCK-REACTIVATE',
      assetId: reactivateId,
      assetName: reactivateName,
      department: reactivateDept,
      proposedState: { setActive: true },
      submittedBy: 'ENG-TST-1',
      submittedAt: now,
      note: 'Machine brought back into service after refurbishment.',
      history: [{ timestamp: now, by: 'ENG-TST-1', note: 'Machine brought back into service after refurbishment.' }],
      status: 'pending'
    },
    // Add PM type(s) only
    {
      id: 'PMC-MOCK-ADD-PMTYPE',
      assetId: asset2Id,
      assetName: asset2Name,
      department: asset2Department,
      proposedState: {
        addPmTypes: ['Monthly', 'Daily'],
        newPmTypeDetails: {
          Monthly: { title: 'Monthly Overhaul Inspection', estimatedHours: 2, partsRequired: ['Bearing grease', 'Belt'], checklist: [{ text: 'Inspect belt tension', requiresPhoto: true }, { text: 'Lubricate bearings', requiresPhoto: false }, { text: 'Record vibration reading', requiresValue: true }] },
          Daily: { title: 'Daily Post-Overhaul Check', estimatedHours: 0.25, checklist: [{ text: 'Listen for abnormal noise', requiresPhoto: false }] }
        }
      },
      submittedBy: 'ENG-TST-1',
      submittedAt: now,
      note: 'New Monthly and Daily PM needed after recent overhaul.',
      history: [{ timestamp: now, by: 'ENG-TST-1', note: 'New Monthly and Daily PM needed after recent overhaul.' }],
      status: 'pending'
    },
    // Remove PM type(s) only — uses frequencies that actually have a real task on this
    // machine (falls back to made-up labels if it has none) so the approval modal's PM
    // detail lookup (title/checklist/hours) has something real to show.
    {
      id: 'PMC-MOCK-REMOVE-PMTYPE',
      assetId,
      assetName,
      department,
      proposedState: { removePmTypes: ctx.activeFrequenciesForAsset(assetId).slice(0, 2).length ? ctx.activeFrequenciesForAsset(assetId).slice(0, 2) : ['Quarterly', 'Yearly'] },
      submittedBy: 'ENG-TST-1',
      submittedAt: now,
      note: 'Superseded by the new Monthly plan.',
      history: [{ timestamp: now, by: 'ENG-TST-1', note: 'Superseded by the new Monthly plan.' }],
      status: 'pending'
    },
    // Resolved — approved
    {
      id: 'PMC-MOCK-RESOLVED-APPROVED',
      assetId: asset2Id,
      assetName: asset2Name,
      department: asset2Department,
      proposedState: { editFields: { location: 'CUST-050' }, addPmTypes: ['Weekly'] },
      submittedBy: 'ENG-FAC-1',
      submittedAt: dayAgo,
      note: 'Customer reassignment plus new Weekly PM.',
      history: [{ timestamp: dayAgo, by: 'ENG-FAC-1', note: 'Customer reassignment plus new Weekly PM.' }],
      status: 'approved',
      resolvedBy: 'MGR001',
      resolvedAt: hourAgo
    },
    // Resolved — rejected
    {
      id: 'PMC-MOCK-RESOLVED-REJECTED',
      assetId,
      assetName,
      department,
      proposedState: { setActive: false },
      submittedBy: 'ENG-TST-1',
      submittedAt: dayAgo,
      note: 'Requested deactivation — machine still in active production use.',
      history: [{ timestamp: dayAgo, by: 'ENG-TST-1', note: 'Requested deactivation — machine still in active production use.' }],
      status: 'rejected',
      resolvedBy: 'MGR001',
      resolvedAt: hourAgo,
      rejectReason: 'Machine is still running production jobs daily — confirm with shift lead before resubmitting.'
    }
  ];
  return mocks;
}

// Dev-only: a Not-in-plan, local-only machine with two drafts and its open Send request, whose snapshot
// is those drafts. An earlier seed's machine and drafts are reused, so seeding never duplicates them.
function seedMockSendRequest(ctx: MockMasterPlanContext, now: Date, location: string): PendingMasterPlanChange | undefined {
  const id = 'MOCK-WAVE-SOLDER-1';
  let machine = ctx.assets().find(a => a.id === id);
  if (!machine) {
    machine = {
      id, name: 'New Wave Solder Machine', location, department: 'Manufacturing', workCenter: 'WC-MOCK-1',
      isActive: true, isInMasterPlan: false, isLocalOnly: true
    };
    const created = machine;
    ctx.updateAssets(assets => [...assets, created]);
  }
  if (isAssetInMasterPlan(machine) || machine.isActive === false) return undefined;

  if (ctx.draftPmTypesFor(id).length === 0) {
    const inDays = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    const drafts: DraftPmType[] = [
      {
        frequency: 'Weekly',
        detail: {
          title: 'Weekly Wave Solder PM', estimatedHours: 1, partsRequired: ['Flux filter'],
          checklist: [{ text: 'Check solder pot temperature', requiresValue: true }, { text: 'Inspect flux nozzle', requiresPhoto: true }, { text: 'Clean conveyor fingers', requiresPhoto: false }],
          startDate: inDays(7), isRecurring: true
        }
      },
      {
        frequency: 'Monthly',
        detail: {
          title: 'Monthly Wave Solder Overhaul', description: 'Full clean of the solder pot and conveyor.', estimatedHours: 3,
          partsRequired: ['Conveyor finger set'],
          checklist: [{ text: 'Drain and clean the solder pot', requiresPhoto: true }, { text: 'Record dross weight (kg)', requiresValue: true }],
          startDate: inDays(14), isRecurring: true
        }
      }
    ];
    ctx.setDraftPmTypes(id, drafts);
  }
  return { ...ctx.buildSendRequest(machine, ctx.draftPmTypesFor(id), 'ENG-MEC-1', now), id: 'PMC-MOCK-SEND-TO-PLAN' };
}
