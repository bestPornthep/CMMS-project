import { Asset, DraftPmType, MasterPlanVersionSnapshot, NewPmTypeDetail, PendingMasterPlanChange, PMTask, ProposedMasterPlanState } from '../models/pm.model';
import { normalizeFrequency } from './pm-frequency.util';

// Test double for the backend's Master Plan endpoints, for component specs that drive the UI through
// the real MasterPlanService. It keeps the rules the UI depends on (one open card per machine,
// edits that net out are dropped, approve applies the card) and nothing else; the real rules are
// covered by the backend tests. Nothing here reaches the network.

export interface FakeBackend {
  assets: Asset[];
  tasks: PMTask[];
}

export function createMasterPlanApiFake(backend: FakeBackend, currentUserId: () => string) {
  const changes: PendingMasterPlanChange[] = [];
  const drafts = new Map<string, DraftPmType[]>();
  const versions: MasterPlanVersionSnapshot[] = [];
  let seq = 0;

  const asset = (id: string) => backend.assets.find(a => a.id === id)!;
  const draftsOf = (id: string) => drafts.get(id) ?? [];
  const sameType = (a: string, b: string) => normalizeFrequency(a) === normalizeFrequency(b);
  const live = <T>(value: T): T => structuredClone(value);

  // Drops what repeats the machine's live state, so edits that net out leave nothing to approve.
  const netOut = (state: ProposedMasterPlanState, id: string): ProposedMasterPlanState => {
    const a = asset(id);
    const next: ProposedMasterPlanState = { ...state };
    if (next.setActive !== undefined && next.setActive === (a.isActive !== false)) delete next.setActive;
    if (next.editFields) {
      const edits = Object.entries(next.editFields).filter(([k, v]) => (a as any)[k] !== v);
      if (edits.length) next.editFields = Object.fromEntries(edits); else delete next.editFields;
    }
    for (const key of ['addPmTypes', 'removePmTypes'] as const) {
      if (!next[key]?.length) delete next[key];
    }
    return next;
  };

  const merge = (a: ProposedMasterPlanState, b: ProposedMasterPlanState): ProposedMasterPlanState => {
    const union = (x?: string[], y?: string[]) => [...new Set([...(x ?? []), ...(y ?? [])])];
    return {
      ...a, ...b,
      editFields: { ...a.editFields, ...b.editFields },
      addPmTypes: union(a.addPmTypes, b.addPmTypes),
      removePmTypes: union(a.removePmTypes, b.removePmTypes),
      newPmTypeDetails: { ...a.newPmTypeDetails, ...b.newPmTypeDetails },
    };
  };

  const apply = (c: PendingMasterPlanChange) => {
    const a = asset(c.assetId);
    const s = c.proposedState;
    const cancel = (match: (t: PMTask) => boolean, reason: string) => {
      for (const t of backend.tasks) {
        if (t.assetId === a.id && t.status !== 'Done' && t.status !== 'Cancelled' && match(t)) {
          t.status = 'Cancelled'; t.cancelledReason = reason; t.cancelledAt = new Date();
        }
      }
    };
    if (s.editFields) Object.assign(a, s.editFields);
    if (s.setActive !== undefined) {
      a.isActive = s.setActive;
      if (!s.setActive) cancel(() => true, 'Machine deactivated');
    }
    for (const f of s.removePmTypes ?? []) cancel(t => sameType(t.frequency, f), 'PM type removed');
    for (const f of s.addPmTypes ?? []) {
      const d = s.newPmTypeDetails?.[f];
      backend.tasks.push({
        id: `PM-${a.id}-${f}-${++seq}`, assetId: a.id, title: d?.title ?? `${f} PM`, description: d?.description ?? '',
        frequency: f, nextDueDate: d?.startDate ?? new Date(), estimatedHours: d?.estimatedHours ?? 1, status: 'Pending',
        productId: a.location, department: a.department, partsRequired: d?.partsRequired, checklist: d?.checklist?.map(i => ({ ...i, done: false })),
      });
    }
    if (s.addToPlan) { a.isInMasterPlan = true; drafts.delete(a.id); }
  };

  return {
    listMasterPlanChanges: async () => live(changes).reverse(),

    submitMasterPlanChange: async (body: { assetId: string; proposedState: ProposedMasterPlanState; note: string }) => {
      const id = body.assetId;
      let proposed = body.proposedState;
      if (proposed.addToPlan) {
        const list = draftsOf(id);
        proposed = {
          addToPlan: true, addPmTypes: list.map(d => d.frequency),
          newPmTypeDetails: Object.fromEntries(list.map(d => [d.frequency, d.detail])),
        };
      }
      const open = changes.find(c => c.assetId === id && c.status === 'pending');
      const merged = netOut(open ? merge(open.proposedState, proposed) : proposed, id);
      const empty = !merged.addToPlan && merged.setActive === undefined && !merged.editFields && !merged.addPmTypes && !merged.removePmTypes;
      if (empty) {
        if (open) changes.splice(changes.indexOf(open), 1);
        return { dropped: true as const };
      }
      const entry = { timestamp: new Date(), by: currentUserId(), note: body.note };
      if (open) {
        Object.assign(open, { proposedState: merged, note: body.note, history: [...open.history, entry] });
        return live(open);
      }
      const card: PendingMasterPlanChange = {
        id: `C-${++seq}`, assetId: id, assetName: asset(id).name, department: asset(id).department, proposedState: merged,
        submittedBy: currentUserId(), submittedAt: new Date(), note: body.note, history: [entry], status: 'pending',
      };
      changes.push(card);
      return live(card);
    },

    approveMasterPlanChanges: async (ids: string[]) => {
      const results = ids.map(id => {
        const c = changes.find(x => x.id === id && x.status === 'pending');
        if (!c) return { id, ok: false, error: 'Request is not pending.' };
        const machine = backend.assets.find(a => a.id === c.assetId);
        if (!machine) return { id, ok: false, error: `Machine not found.` };
        apply(c);
        Object.assign(c, { status: 'approved', resolvedBy: currentUserId(), resolvedAt: new Date() });
        return { id, ok: true };
      });
      if (!results.some(r => r.ok)) return { results };
      const revision = { id: `V-${++seq}`, label: String.fromCharCode(65 + versions.length) };
      versions.push({ ...revision, createdAt: new Date(), assets: live(backend.assets) });
      return { revision, results };
    },

    rejectMasterPlanChange: async (id: string, reason: string) => {
      const c = changes.find(x => x.id === id && x.status === 'pending')!;
      Object.assign(c, { status: 'rejected', rejectReason: reason, resolvedBy: currentUserId(), resolvedAt: new Date() });
      return live(c);
    },

    withdrawMasterPlanChange: async (id: string) => {
      changes.splice(changes.findIndex(c => c.id === id), 1);
    },

    getMasterPlanVersions: async () => live(versions),

    getDraftPmTypes: async (assetId: string) => live(draftsOf(assetId)),

    saveDraftPmType: async (assetId: string, frequency: string, detail: NewPmTypeDetail): Promise<DraftPmType> => {
      const saved = { frequency, detail: live(detail) };
      drafts.set(assetId, [...draftsOf(assetId).filter(d => !sameType(d.frequency, frequency)), saved]);
      return live(saved);
    },

    deleteDraftPmType: async (assetId: string, frequency: string) => {
      drafts.set(assetId, draftsOf(assetId).filter(d => !sameType(d.frequency, frequency)));
    },

    updateAsset: async (id: string, patch: Partial<Asset>) => {
      Object.assign(asset(id), patch);
      return live(asset(id));
    },
  };
}
