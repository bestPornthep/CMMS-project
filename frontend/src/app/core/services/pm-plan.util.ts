import { Asset, PMTask } from '../models/pm.model';

// Absent flag = in plan, so machines that never went through the Send flow (every backend machine
// today) keep showing on the Master Plan exactly as before.
export function isAssetInMasterPlan(asset: Pick<Asset, 'isInMasterPlan'>): boolean {
  return asset.isInMasterPlan !== false;
}

// Combines a fresh backend load with what this browser session already knows. A data load also runs
// after every login, so machines created here and plan status decided here must survive it.
//  - Backend machines: the backend's fields win. Plan status is the backend's own value if it ever
//    sends one, otherwise "already in plan this session" or the demo seed "has at least one task".
//  - Machines that exist only in this session are kept unless the backend now returns the same id.
export function mergeLoadedAssets(loaded: Asset[], previous: Asset[], tasks: PMTask[]): Asset[] {
  const previousById = new Map(previous.map(a => [a.id, a]));
  const idsWithTasks = new Set(tasks.map(t => t.assetId));
  const loadedIds = new Set(loaded.map(a => a.id));

  const merged = loaded.map(a => ({
    ...a,
    isInMasterPlan: a.isInMasterPlan ?? (previousById.get(a.id)?.isInMasterPlan === true || idsWithTasks.has(a.id))
  }));
  const localOnly = previous.filter(a => a.isLocalOnly && !loadedIds.has(a.id));
  return [...merged, ...localOnly];
}
