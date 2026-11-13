import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { applyAssetUpdate, AssetUpdate } from './asset-lifecycle';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/assets')
export class AssetsController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async getAll(@Query('location') location?: string, @Query('department') department?: string) {
    const where: any = {};
    if (location) {
      where.location = location;
    }
    if (department) {
      where.department = department;
    }
    return this.prisma.asset.findMany({
      where,
      orderBy: { id: 'asc' },
    });
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    const hasPermission =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer' ||
      user.delegatedProducts?.some((dp: any) => dp.productId === body.location && dp.permissions.includes('pm.create.submit'));

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permission to create assets');
    }

    await this.cmms.checkProductOwnership(user, body.location, 'pm.create.submit');

    const product = await this.prisma.product.findUnique({
      where: { id: body.location },
    });
    if (!product) {
      throw new BadRequestException(`Product (location) ${body.location} not found`);
    }

    const existingAsset = await this.prisma.asset.findUnique({
      where: { id: body.id },
    });
    if (existingAsset) {
      throw new ConflictException(`Asset with ID ${body.id} already exists`);
    }

    return this.prisma.asset.create({
      data: {
        id: body.id,
        name: body.name,
        location: body.location,
        department: body.department,
        workCenter: body.workCenter ?? null,
        isActive: true,
        isInMasterPlan: false,
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    if (body.id !== undefined && body.id !== id) {
      throw new BadRequestException('Machine id is immutable');
    }
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }

    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }

    const targetLocation: string = body.location ?? asset.location;
    for (const productId of new Set([asset.location, targetLocation])) {
      this.assertCanManageAssets(user, productId);
      await this.cmms.checkProductOwnership(user, productId, 'pm.create.submit');
    }
    if (targetLocation !== asset.location) {
      const product = await this.prisma.product.findUnique({ where: { id: targetLocation } });
      if (!product) {
        throw new BadRequestException(`Product (location) ${targetLocation} not found`);
      }
    }

    const fields: AssetUpdate['fields'] = {};
    for (const field of ['name', 'department', 'location', 'workCenter'] as const) {
      if (body[field] !== undefined && body[field] !== asset[field]) {
        fields[field] = body[field];
      }
    }
    const activeChanged = body.isActive !== undefined && body.isActive !== asset.isActive;
    const fieldsChanged = Object.keys(fields).length > 0;
    if (!fieldsChanged && !activeChanged) {
      return asset;
    }

    const updated = await this.prisma.$transaction((tx) =>
      applyAssetUpdate(tx, id, { fields, isActive: activeChanged ? body.isActive : undefined }, new Date()),
    );

    const actor = { id: user.employeeId, name: user.name };
    const target = { id: updated.id, name: updated.name, isUser: false };
    if (fieldsChanged) {
      await this.cmms.logAction('Machine Updated', actor, target, updated.location, 'data', updated.department);
    }
    if (activeChanged) {
      await this.cmms.logAction(
        body.isActive ? 'Machine Reactivated' : 'Machine Deactivated',
        actor,
        target,
        updated.location,
        'data',
        updated.department,
      );
    }
    return updated;
  }

  private assertCanManageAssets(user: any, productId: string) {
    const hasPermission =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer' ||
      user.delegatedProducts?.some((dp: any) => dp.productId === productId && dp.permissions.includes('pm.create.submit'));
    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permission to manage assets');
    }
  }
}
