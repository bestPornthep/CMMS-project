export interface Asset {
  id: string;
  name: string;
  department: string; // renamed from 'type' — matches domain language and backend schema
  location: string;   // = productId (customer/site code)
  workCenter?: string; // factory work center code — backend not yet sending/accepting this field
  isActive?: boolean;  // defaults to true when absent (pre-existing assets, backend not yet sending this field)
  // Set whenever isActive flips to false; cleared on reactivate. Backend does not send/accept
  // this field yet (see docs/backend_fixes_needed_combined.html#masterplan) — needed so PM Master Plan
  // can tell "deactivated this year" (still show with cutoff) from "deactivated a past year"
  // (exclude entirely).
  deactivatedAt?: Date;
  // Frontend-only plan status (see docs/backend_fixes_needed_combined.html#masterplan). Absent means
  // "in the Master Plan", so machines from a backend that does not send this field behave as before.
  isInMasterPlan?: boolean;
  // Frontend-only: the machine exists just in this browser session and must never be sent to the backend.
  isLocalOnly?: boolean;
}

export type PMTaskStatus = 'Pending' | 'In Progress' | 'Pending Approval' | 'Done' | 'Overdue' | 'Cancelled';
export type PMTaskFrequency = string; // 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | custom

export interface Template {
  id?: string;
  name: string;
  department: string;
  isDefault?: boolean;
  checklist: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[];
  createdBy?: string;
}

export interface PMSchedule {
  id: string;
  title: string;
  description: string;
  frequency: PMTaskFrequency;
  assetId: string;
  productId?: string;
  department?: string;
  startDate?: Date; // exact due date of the first occurrence; later ones are startDate + N×frequency
  estimatedHours: number;
  checklist?: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[];
  partsRequired?: string[];
  assignedTo?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean; // defaults to true when absent; false = paused (machine deactivated), no new tasks generated
}

export interface PMTask {
  id: string;
  title: string;
  description: string;
  frequency: PMTaskFrequency;
  assetId: string;
  nextDueDate: Date;
  estimatedHours: number;
  actualHours?: number;
  status: PMTaskStatus;
  scheduleId?: string;

  productId?: string;
  department?: string;
  checklist?: { text: string; done: boolean; requiresPhoto?: boolean; photoUrl?: string; requiresValue?: boolean; value?: string }[];
  partsRequired?: string[];

  // Execution details
  assignedTo?: string;
  assignedAt?: Date;
  assignedBy?: string;
  reassignCount?: number; // how many times this task has been reassigned to a different technician
  completedBy?: string;
  completedAt?: Date;
  recordNotes?: string;
  partsUsed?: string[];

  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;

  // Set when a task is auto-cancelled because its machine was deactivated — history is kept, not deleted.
  cancelledReason?: string;
  cancelledAt?: Date;

  // Frontend-only: an in-memory task created when a PM type is approved into the Master Plan, so the
  // grid has marks to draw. Never sent to the backend; pmTasks() excludes it, planTasks() includes it.
  isPreview?: boolean;

  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type Role = 'technician' | 'engineer' | 'manager' | 'admin';

export interface DelegatedProduct {
  id?: string;
  productId: string;
  status: 'active' | 'revoked';
  permissions: string[];
  validUntil?: Date;
}

export interface User {
  employeeId: string;
  name: string;
  initials: string;
  baseRole: Role;
  roleLabel: string;
  department: string;
  ownedProducts: string[];
  delegatedProducts: DelegatedProduct[];
  permissions: string[];
  isActive?: boolean; // defaults to true when absent (pre-existing users, backend not yet sending this field)
}

export interface NewUserPayload {
  employeeId: string;
  name: string;
  initials: string;
  baseRole: Role;
  roleLabel: string;
  department: string;
  password: string;
  ownedProducts: string[];
  permissions: string[];
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  actor: { name: string; id: string };
  target: { name: string; id: string; isUser: boolean } | null;
  product: string;
  type: 'security' | 'system' | 'data';
  changes?: string[]; // human-readable diff lines, e.g. checklist item add/remove — only present for actions that support it
}

// ── PM Master Plan approval workflow ──────────────────────────────────────
// Backend has no support for any of this yet — see docs/backend_fixes_needed_combined.html#masterplan.
// All state lives client-side only (PmService signals) until that's built.

export type MasterPlanChangeType = 'add-machine' | 'edit-machine' | 'deactivate-machine' | 'reactivate-machine' | 'add-pm-type' | 'remove-pm-type';

// One PM type of a machine as the Manage Machines detail window lists it (derived, never stored).
export interface PmTypeSummary {
  frequency: string;
  title: string;
  // live = saved or approved into the plan; draft = on a machine that is not in the plan;
  // waiting-add / waiting-remove = a change that waits for approval.
  state: 'live' | 'draft' | 'waiting-add' | 'waiting-remove';
  isRecurring?: boolean; // undefined = not known
  firstDue?: Date;       // first due date (draft / waiting add) or next open due date (live)
  estimatedHours?: number;
  description?: string;
  parts: string[];
  checklist: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[];
}

// Net desired end-state for one machine's pending card — always the merged/reduced result of
// every edit made to it so far, never a log of operations (see handoff: reconcile-not-replay).
export interface ProposedMasterPlanState {
  // true = Send to Master Plan: add this Not-in-plan machine to the plan, with addPmTypes/newPmTypeDetails
  // holding a snapshot of its draft PM types.
  addToPlan?: boolean;
  setActive?: boolean; // true = reactivate, false = deactivate, undefined = no change
  editFields?: { name?: string; department?: string; location?: string; workCenter?: string };
  addPmTypes?: string[];    // frequency labels to add, e.g. 'Monthly'
  removePmTypes?: string[]; // frequency labels to remove (isActive:false + cascade-cancel)
  // Keyed by frequency label in addPmTypes. Filled by Create PM; absent for dev-seed cards, where the
  // approval modal shows a "defined separately after approval" caption instead of fabricated detail
  // (see docs/backend_fixes_needed_combined.html#masterplan).
  newPmTypeDetails?: Record<string, NewPmTypeDetail>;
}

export interface NewPmTypeDetail {
  title: string;
  description?: string;
  estimatedHours?: number;
  partsRequired?: string[];
  checklist?: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[];
  startDate?: Date;     // first due date; approval creates the real PM from this
  isRecurring?: boolean; // false = one-off task, otherwise a recurring schedule
}

// A PM type defined on a machine that is not in the Master Plan yet. In memory only; it creates no
// tasks until the machine is approved into the plan.
export interface DraftPmType {
  frequency: string;
  detail: NewPmTypeDetail;
}

export interface MasterPlanEditHistoryEntry {
  timestamp: Date;
  by: string; // employeeId
  note: string;
}

export interface PendingMasterPlanChange {
  id: string;
  assetId: string;
  assetName: string;
  department: string;
  proposedState: ProposedMasterPlanState;
  submittedBy: string;
  submittedAt: Date;
  note: string; // latest/merged note shown by default
  history: MasterPlanEditHistoryEntry[]; // full edit trail, opt-in "View edit history (N)"
  status: 'pending' | 'approved' | 'rejected';
  resolvedBy?: string;
  resolvedAt?: Date;
  rejectReason?: string;
}

// Snapshot of "which machines were active" at the moment a batch of changes was approved —
// browsing history means picking a version, not replaying events. Only covers Asset active
// state for now — there is no local PMSchedule store to snapshot which PM types were active
// per machine (see docs/backend_fixes_needed_combined.html#masterplan).
export interface MasterPlanVersionSnapshot {
  id: string;
  label: string; // 'A', 'B', 'C', ...
  createdAt: Date;
  assets: Asset[];
}

// Backend migration helpers
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}