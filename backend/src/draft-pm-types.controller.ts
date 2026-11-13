import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { normalizeFrequency } from './frequency.util';
import { NewPmTypeDetail } from './masterplan.util';

// PM types defined on a machine that is not in the Master Plan yet. They create no schedule or
// task until the machine is approved into the plan (see MasterplanService).
@UseGuards(JwtAuthGuard)
@Controller('api/v1/assets/:assetId/draft-pm-types')
export class DraftPmTypesController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async list(@Param('assetId') assetId: string, @CurrentUser() user: any) {
    await this.loadAsset(assetId, user);
    const rows = await this.prisma.draftPmType.findMany({ where: { assetId }, orderBy: { updatedAt: 'asc' } });
    return rows.map((r) => ({ frequency: r.frequency, detail: JSON.parse(r.detail) }));
  }

  @Put(':frequency')
  async save(
    @Param('assetId') assetId: string,
    @Param('frequency') frequency: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    const asset = await this.loadAsset(assetId, user);
    const label = (frequency ?? '').trim();
    if (!label) throw new BadRequestException('frequency is required');
    const detail = this.sanitizeDetail(body);

    if (asset.isInMasterPlan) {
      throw new ConflictException('This machine is already in the Master Plan. Create the PM for it instead.');
    }
    const openSend = await this.prisma.masterPlanChange.findFirst({ where: { assetId, status: 'pending' } });
    if (openSend) {
      throw new ConflictException('This machine is waiting for approval. Withdraw the request to change its PM types.');
    }
    // A machine can hold live PMs from before it was tracked in the plan; the same unique rule applies.
    await this.cmms.assertPmTypeAvailable(this.prisma, assetId, label);

    const normalized = normalizeFrequency(label);
    const data = { frequency: label, detail: JSON.stringify(detail), updatedBy: user.employeeId, updatedAt: new Date() };
    await this.prisma.draftPmType.upsert({
      where: { assetId_normalizedFrequency: { assetId, normalizedFrequency: normalized } },
      create: { assetId, normalizedFrequency: normalized, ...data },
      update: data,
    });
    return { frequency: label, detail };
  }

  @Delete(':frequency')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('assetId') assetId: string, @Param('frequency') frequency: string, @CurrentUser() user: any) {
    await this.loadAsset(assetId, user);
    const openSend = await this.prisma.masterPlanChange.findFirst({ where: { assetId, status: 'pending' } });
    if (openSend) {
      throw new ConflictException('This machine is waiting for approval. Withdraw the request to change its PM types.');
    }
    const removed = await this.prisma.draftPmType.deleteMany({
      where: { assetId, normalizedFrequency: normalizeFrequency(frequency) },
    });
    if (removed.count === 0) throw new NotFoundException(`No draft ${frequency} PM type on ${assetId}`);
  }

  private async loadAsset(assetId: string, user: any) {
    if (!['admin', 'manager', 'engineer'].includes(user.baseRole)) {
      throw new ForbiddenException('Insufficient permission to manage draft PM types');
    }
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
    await this.cmms.checkProductOwnership(user, asset.location, 'pm.create.submit');
    return asset;
  }

  private sanitizeDetail(body: NewPmTypeDetail): NewPmTypeDetail {
    if (!body || typeof body.title !== 'string' || !body.title.trim()) {
      throw new BadRequestException('title is required');
    }
    if (body.estimatedHours !== undefined && (typeof body.estimatedHours !== 'number' || body.estimatedHours < 0)) {
      throw new BadRequestException('estimatedHours must be a non-negative number');
    }
    if (body.partsRequired !== undefined && !Array.isArray(body.partsRequired)) {
      throw new BadRequestException('partsRequired must be a list');
    }
    if (body.checklist !== undefined && !Array.isArray(body.checklist)) {
      throw new BadRequestException('checklist must be a list');
    }
    if (body.startDate !== undefined && Number.isNaN(new Date(body.startDate).getTime())) {
      throw new BadRequestException('startDate is not a valid date');
    }
    const detail: NewPmTypeDetail = { title: body.title.trim() };
    if (body.description !== undefined) detail.description = body.description;
    if (body.estimatedHours !== undefined) detail.estimatedHours = body.estimatedHours;
    if (body.partsRequired !== undefined) detail.partsRequired = body.partsRequired;
    if (body.checklist !== undefined) detail.checklist = body.checklist;
    if (body.startDate !== undefined) detail.startDate = body.startDate;
    if (body.isRecurring !== undefined) detail.isRecurring = body.isRecurring;
    return detail;
  }
}
