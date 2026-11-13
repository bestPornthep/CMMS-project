import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CmmsService, PmDefinition } from './cmms.service';
import { applyAssetUpdate, retirePmType } from './asset-lifecycle';
import { normalizeFrequency } from './frequency.util';
import {
  describeDiff,
  EditableAssetFields,
  isEmptyDiff,
  mergeProposedState,
  NewPmTypeDetail,
  ProposedMasterPlanState,
  reconcileMasterPlanChange,
  stripEmpty,
  versionLabel,
} from './masterplan.util';

const OPEN_TASK_STATUSES_EXCLUDED = ['Done', 'Cancelled'];
const TX_OPTIONS = { timeout: 120000, maxWait: 10000 };
const EDITABLE_KEYS = ['name', 'department', 'location', 'workCenter'] as const;

// Control-flow signal for a per-machine approval that cannot proceed; becomes the per-id error.
class ApprovalSkip extends Error {}

export interface MasterPlanUser {
  baseRole: string;
  employeeId: string;
  name: string;
  department?: string;
  ownedProducts?: string[];
  permissions?: string[];
}

@Injectable()
export class MasterplanService {
  private readonly logger = new Logger(MasterplanService.name);
  // Approvals run one batch at a time so version labels (A, B, C…) are handed out in order.
  private approveChain: Promise<unknown> = Promise.resolve();

  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  // ── Permissions ──────────────────────────────────────────────────────────
  canApprove(user: MasterPlanUser): boolean {
    return user.baseRole === 'admin' || user.baseRole === 'manager' || !!user.permissions?.includes('pm.masterplan.approve');
  }

  private assertCanSubmit(user: MasterPlanUser) {
    if (!['admin', 'manager', 'engineer'].includes(user.baseRole)) {
      throw new ForbiddenException('Insufficient permission to propose PM Master Plan changes');
    }
  }

  private assertCanRead(user: MasterPlanUser) {
    if (!['admin', 'manager', 'engineer'].includes(user.baseRole)) {
      throw new ForbiddenException('Insufficient permission to view the PM Master Plan');
    }
  }

  private assertCanApprove(user: MasterPlanUser) {
    if (!this.canApprove(user)) throw new ForbiddenException('Insufficient permission to approve PM Master Plan changes');
  }

  // ── Queries ──────────────────────────────────────────────────────────────
  async list(user: MasterPlanUser, status?: string, assetId?: string) {
    this.assertCanRead(user);
    const where: Prisma.MasterPlanChangeWhereInput = {};
    if (status) where.status = status;
    if (assetId) where.assetId = assetId;
    const rows = await this.prisma.masterPlanChange.findMany({ where, orderBy: { submittedAt: 'desc' } });

    if (user.baseRole !== 'engineer') return rows.map((r) => this.toCard(r));

    // An engineer sees cards for their department or for machines in products they own.
    const owned = user.ownedProducts ?? [];
    const assets = await this.prisma.asset.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.assetId))] } } });
    const location = new Map(assets.map((a) => [a.id, a.location]));
    return rows
      .filter((r) => r.department === user.department || owned.includes('*') || owned.includes(location.get(r.assetId) ?? ''))
      .map((r) => this.toCard(r));
  }

  async versions(user: MasterPlanUser) {
    this.assertCanRead(user);
    const rows = await this.prisma.masterPlanVersion.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((v) => ({ id: v.id, label: v.label, createdAt: v.createdAt, assets: JSON.parse(v.assets) }));
  }

  // ── Submit / merge ───────────────────────────────────────────────────────
  async submit(user: MasterPlanUser, dto: { assetId?: string; proposedState?: ProposedMasterPlanState; note?: string }) {
    this.assertCanSubmit(user);
    if (!dto?.assetId) throw new BadRequestException('assetId is required');
    const note = (dto.note ?? '').trim();
    if (!note) throw new BadRequestException('A note describing this change is required.');
    const incoming = this.sanitizeState(dto.proposedState);

    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException(`Asset ${dto.assetId} not found`);
    const existing = await this.prisma.masterPlanChange.findFirst({ where: { assetId: asset.id, status: 'pending' } });

    let existingState: ProposedMasterPlanState = existing ? JSON.parse(existing.proposedState) : {};
    let change: ProposedMasterPlanState;

    if (incoming.addToPlan) {
      change = await this.buildSendState(asset, existing);
    } else {
      if (!asset.isInMasterPlan) {
        throw new ConflictException('This machine is not in the Master Plan yet, so its changes apply directly and need no approval.');
      }
      if (incoming.editFields?.location && incoming.editFields.location !== asset.location) {
        const product = await this.prisma.product.findUnique({ where: { id: incoming.editFields.location } });
        if (!product) throw new BadRequestException(`Product (location) ${incoming.editFields.location} not found`);
      }
      ({ change, existingState } = await this.prepareAdds(asset.id, incoming, existingState));
    }

    const merged = stripEmpty(mergeProposedState(existingState, change));
    const diff = reconcileMasterPlanChange({
      proposed: merged,
      currentAssetInPlan: asset.isInMasterPlan,
      currentAssetActive: asset.isActive,
      currentActiveFrequencies: await this.activeFrequencies(this.prisma, asset.id),
      currentAssetFields: asset,
    });

    if (isEmptyDiff(diff)) {
      if (existing) await this.prisma.masterPlanChange.deleteMany({ where: { id: existing.id, status: 'pending' } });
      return { dropped: true };
    }

    const entry = { timestamp: new Date().toISOString(), by: user.employeeId, note };
    if (existing) {
      const history = [...JSON.parse(existing.history), entry];
      const updated = await this.prisma.masterPlanChange.update({
        where: { id: existing.id },
        data: { proposedState: JSON.stringify(merged), note, history: JSON.stringify(history) },
      });
      return this.toCard(updated);
    }

    try {
      const created = await this.prisma.masterPlanChange.create({
        data: {
          id: `MPC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          assetId: asset.id,
          assetName: asset.name,
          department: asset.department,
          proposedState: JSON.stringify(merged),
          submittedBy: user.employeeId,
          submittedAt: new Date(),
          note,
          history: JSON.stringify([entry]),
          status: 'pending',
        },
      });
      return this.toCard(created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Another request for this machine was just submitted. Reload and try again.');
      }
      throw err;
    }
  }

  // A Send adds a not-in-plan machine; the PM types come from its drafts, never from the client.
  private async buildSendState(asset: { id: string; isInMasterPlan: boolean; isActive: boolean }, existing: unknown) {
    if (asset.isInMasterPlan) throw new ConflictException('This machine is already in the Master Plan.');
    if (existing) throw new ConflictException('This machine is already waiting for approval.');
    if (!asset.isActive) throw new ConflictException('Reactivate this machine before sending it to the Master Plan.');
    const drafts = await this.prisma.draftPmType.findMany({ where: { assetId: asset.id } });
    if (drafts.length === 0) throw new ConflictException('Define at least one PM type before sending this machine to the Master Plan.');
    return {
      addToPlan: true,
      addPmTypes: drafts.map((d) => d.frequency),
      newPmTypeDetails: Object.fromEntries(drafts.map((d) => [d.frequency, JSON.parse(d.detail) as NewPmTypeDetail])),
    } as ProposedMasterPlanState;
  }

  // Validates requested PM type additions and turns "add back a type that is pending removal"
  // into just cancelling that removal.
  private async prepareAdds(assetId: string, incoming: ProposedMasterPlanState, existingState: ProposedMasterPlanState) {
    const adds = incoming.addPmTypes ?? [];
    const pendingAdds = new Set((existingState.addPmTypes ?? []).map(normalizeFrequency));
    const pendingRemoves = new Set((existingState.removePmTypes ?? []).map(normalizeFrequency));
    const cancelledRemovals = new Set<string>();
    const realAdds: string[] = [];

    for (const freq of adds) {
      const key = normalizeFrequency(freq);
      if (pendingRemoves.has(key)) {
        cancelledRemovals.add(key);
        continue;
      }
      if (!incoming.newPmTypeDetails?.[freq]?.title?.trim()) {
        throw new BadRequestException(`PM type details with a title are required to add ${freq}`);
      }
      if (pendingAdds.has(key)) {
        throw new ConflictException(`A ${freq} PM is already waiting for approval on this machine.`);
      }
      await this.cmms.assertPmTypeAvailable(this.prisma, assetId, freq);
      realAdds.push(freq);
    }

    const change: ProposedMasterPlanState = { ...incoming, addPmTypes: realAdds };
    const kept = new Set(realAdds);
    if (change.newPmTypeDetails) {
      change.newPmTypeDetails = Object.fromEntries(Object.entries(change.newPmTypeDetails).filter(([f]) => kept.has(f)));
    }
    const base: ProposedMasterPlanState = {
      ...existingState,
      removePmTypes: (existingState.removePmTypes ?? []).filter((f) => !cancelledRemovals.has(normalizeFrequency(f))),
    };
    return { change, existingState: base };
  }

  private sanitizeState(raw: ProposedMasterPlanState | undefined): ProposedMasterPlanState {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('proposedState is required');
    const state: ProposedMasterPlanState = {};
    if (raw.addToPlan === true) state.addToPlan = true;
    if (typeof raw.setActive === 'boolean') state.setActive = raw.setActive;
    if (raw.editFields && typeof raw.editFields === 'object') {
      const fields: EditableAssetFields = {};
      for (const key of EDITABLE_KEYS) {
        const value = raw.editFields[key];
        if (value === undefined) continue;
        if (typeof value !== 'string') throw new BadRequestException(`${key} must be a string`);
        if (key !== 'workCenter' && !value.trim()) throw new BadRequestException(`${key} cannot be blank`);
        fields[key] = value.trim();
      }
      if (Object.keys(fields).length > 0) state.editFields = fields;
    }
    for (const key of ['addPmTypes', 'removePmTypes'] as const) {
      const list = raw[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.some((f) => typeof f !== 'string' || !f.trim())) {
        throw new BadRequestException(`${key} must be a list of frequency labels`);
      }
      if (list.length > 0) state[key] = list.map((f) => f.trim());
    }
    if (raw.newPmTypeDetails && typeof raw.newPmTypeDetails === 'object') {
      state.newPmTypeDetails = Object.fromEntries(
        Object.entries(raw.newPmTypeDetails).map(([f, d]) => [f.trim(), d]),
      );
    }
    if (Object.keys(stripEmpty(state)).length === 0) {
      throw new BadRequestException('proposedState has no changes');
    }
    return state;
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  approve(user: MasterPlanUser, ids: string[]) {
    this.assertCanApprove(user);
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('ids must be a non-empty list of request ids');
    }
    const run = this.approveChain.then(() => this.approveBatch(user, [...new Set(ids)]));
    this.approveChain = run.catch(() => undefined);
    return run;
  }

  private async approveBatch(user: MasterPlanUser, ids: string[]) {
    const label = versionLabel(await this.prisma.masterPlanVersion.count());
    const now = new Date();
    const results: { id: string; ok: boolean; error?: string }[] = [];
    let anyChanged = false;

    for (const id of ids) {
      try {
        const outcome = await this.prisma.$transaction((tx) => this.approveOne(tx, user, id, now), TX_OPTIONS);
        results.push({ id, ok: true });
        if (outcome.lines.length > 0) {
          anyChanged = true;
          await this.cmms.logAction(
            'Approved PM Master Plan',
            { id: user.employeeId, name: user.name },
            { id, name: `Rev ${label} · ${outcome.asset.id}`, isUser: false },
            outcome.asset.location,
            'data',
            outcome.asset.department,
            outcome.lines,
          );
        }
      } catch (err) {
        results.push({ id, ok: false, error: this.errorMessage(err) });
        if (!(err instanceof ApprovalSkip) && !(err instanceof HttpException)) {
          this.logger.error(`Approving master plan change ${id} failed`, (err as Error)?.stack);
        }
      }
    }

    const revision = anyChanged ? await this.saveVersion(label, now) : undefined;
    return { ...(revision && { revision }), results };
  }

  private async approveOne(tx: Prisma.TransactionClient, user: MasterPlanUser, id: string, now: Date) {
    // The claim is the first statement, so two approvers cannot both apply one card.
    const claim = await tx.masterPlanChange.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'approved', resolvedBy: user.employeeId, resolvedAt: now },
    });
    if (claim.count === 0) {
      const exists = await tx.masterPlanChange.findUnique({ where: { id } });
      throw new ApprovalSkip(exists ? 'Already resolved.' : 'Request not found.');
    }
    const card = (await tx.masterPlanChange.findUnique({ where: { id } }))!;
    const state: ProposedMasterPlanState = JSON.parse(card.proposedState);
    const asset = await tx.asset.findUnique({ where: { id: card.assetId } });
    if (!asset) throw new ApprovalSkip('Asset not found.');

    const diff = reconcileMasterPlanChange({
      proposed: state,
      currentAssetInPlan: asset.isInMasterPlan,
      currentAssetActive: asset.isActive,
      currentActiveFrequencies: await this.activeFrequencies(tx, asset.id),
      currentAssetFields: asset,
    });

    const finalActive = diff.setAssetActive ?? asset.isActive;
    if (diff.addFrequencies.length > 0 && !finalActive) {
      throw new ApprovalSkip('This machine is inactive. Reactivate it before adding PM types.');
    }
    if (diff.editFields?.location && diff.editFields.location !== asset.location) {
      const product = await tx.product.findUnique({ where: { id: diff.editFields.location } });
      if (!product) throw new ApprovalSkip(`Product (location) ${diff.editFields.location} not found.`);
    }

    const needsAssetWrite = diff.setInPlan || diff.setAssetActive !== undefined || diff.editFields;
    const updated = needsAssetWrite
      ? await applyAssetUpdate(
          tx,
          asset.id,
          { fields: diff.editFields, isActive: diff.setAssetActive, isInMasterPlan: diff.setInPlan ? true : undefined },
          now,
        )
      : asset;

    for (const freq of diff.removeFrequencies) {
      await retirePmType(tx, asset.id, freq, now);
    }
    for (const freq of diff.addFrequencies) {
      const detail = this.detailFor(state, freq);
      // Dev-seed cards carry no details: nothing to create, the PM is defined separately later.
      if (!detail) continue;
      await this.createPm(tx, updated, freq, detail, card.submittedBy, now);
    }
    if (state.addToPlan) await tx.draftPmType.deleteMany({ where: { assetId: asset.id } });

    return { asset: updated, lines: describeDiff(diff) };
  }

  private detailFor(state: ProposedMasterPlanState, freq: string): NewPmTypeDetail | undefined {
    const key = normalizeFrequency(freq);
    const entry = Object.entries(state.newPmTypeDetails ?? {}).find(([f]) => normalizeFrequency(f) === key);
    return entry?.[1];
  }

  private async createPm(
    tx: Prisma.TransactionClient,
    asset: { id: string; location: string; department: string },
    frequency: string,
    detail: NewPmTypeDetail,
    createdBy: string,
    now: Date,
  ) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const requested = detail.startDate ? new Date(detail.startDate) : today;
    const def: PmDefinition = {
      title: detail.title,
      description: detail.description,
      frequency,
      assetId: asset.id,
      productId: asset.location,
      department: asset.department,
      estimatedHours: detail.estimatedHours ?? 0,
      checklist: detail.checklist,
      partsRequired: detail.partsRequired,
      createdBy,
      // A start date that passed while the card waited is moved to today.
      startDate: Number.isNaN(requested.getTime()) || requested < today ? today : requested,
    };
    if (detail.isRecurring === false) return this.cmms.createStandalonePmInTx(tx, def);
    return this.cmms.createScheduleInTx(tx, def, `SCH-${Date.now()}-${Math.floor(Math.random() * 100000)}`);
  }

  // Frequencies the machine currently runs: active schedules plus open one-off tasks.
  private async activeFrequencies(db: Prisma.TransactionClient, assetId: string): Promise<string[]> {
    const schedules = await db.pmSchedule.findMany({ where: { assetId, isActive: true } });
    const oneOffs = await db.pmTask.findMany({
      where: { assetId, scheduleId: null, status: { notIn: OPEN_TASK_STATUSES_EXCLUDED } },
    });
    return [...schedules.map((s) => s.frequency), ...oneOffs.map((t) => t.frequency)];
  }

  private async saveVersion(label: string, now: Date) {
    const assets = await this.prisma.asset.findMany({ orderBy: { id: 'asc' } });
    let current = label;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await this.prisma.masterPlanVersion.create({
          data: { id: `MPV-${Date.now()}`, label: current, createdAt: now, assets: JSON.stringify(assets) },
        });
        return { id: row.id, label: row.label };
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        current = versionLabel(await this.prisma.masterPlanVersion.count());
      }
    }
    return undefined;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof ApprovalSkip) return err.message;
    if (err instanceof HttpException) {
      const body = err.getResponse() as any;
      return (typeof body === 'string' ? body : body?.message) ?? err.message;
    }
    return 'Approval failed. Please try again.';
  }

  // ── Reject / withdraw ────────────────────────────────────────────────────
  async reject(user: MasterPlanUser, id: string, reason?: string) {
    this.assertCanApprove(user);
    const text = (reason ?? '').trim();
    if (!text) throw new BadRequestException('A reason is required to reject a request.');

    const card = await this.prisma.masterPlanChange.findUnique({ where: { id } });
    if (!card) throw new NotFoundException(`Request ${id} not found`);

    const now = new Date();
    const claim = await this.prisma.masterPlanChange.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'rejected', resolvedBy: user.employeeId, resolvedAt: now, rejectReason: text },
    });
    if (claim.count === 0) throw new ConflictException('This request was already resolved.');

    const asset = await this.prisma.asset.findUnique({ where: { id: card.assetId } });
    await this.cmms.logAction(
      'Rejected PM Master Plan',
      { id: user.employeeId, name: user.name },
      { id: card.id, name: card.assetId, isUser: false },
      asset?.location ?? null,
      'data',
      card.department,
      [`Rejected: ${text}`],
    );
    return this.toCard((await this.prisma.masterPlanChange.findUnique({ where: { id } }))!);
  }

  async withdraw(user: MasterPlanUser, id: string) {
    const card = await this.prisma.masterPlanChange.findUnique({ where: { id } });
    if (!card) throw new NotFoundException(`Request ${id} not found`);
    if (card.submittedBy !== user.employeeId && !this.canApprove(user)) {
      throw new ForbiddenException('Only the sender or an approver can withdraw this request');
    }
    const removed = await this.prisma.masterPlanChange.deleteMany({ where: { id, status: 'pending' } });
    if (removed.count === 0) throw new ConflictException('This request is no longer pending.');
  }

  // ── Mapping ──────────────────────────────────────────────────────────────
  private toCard(row: {
    id: string;
    assetId: string;
    assetName: string;
    department: string;
    proposedState: string;
    submittedBy: string;
    submittedAt: Date;
    note: string;
    history: string;
    status: string;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    rejectReason: string | null;
  }) {
    return {
      id: row.id,
      assetId: row.assetId,
      assetName: row.assetName,
      department: row.department,
      proposedState: JSON.parse(row.proposedState),
      submittedBy: row.submittedBy,
      submittedAt: row.submittedAt,
      note: row.note,
      history: JSON.parse(row.history),
      status: row.status,
      ...(row.resolvedBy && { resolvedBy: row.resolvedBy }),
      ...(row.resolvedAt && { resolvedAt: row.resolvedAt }),
      ...(row.rejectReason && { rejectReason: row.rejectReason }),
    };
  }
}
