import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Delegations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/delegations')
export class DelegationsController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async getAll(@CurrentUser() user: any, @Query('status') status?: string) {
    if (user.baseRole === 'technician') {
      throw new ForbiddenException('Technicians cannot view all delegations');
    }

    const now = new Date();
    const where: any = {};

    if (user.baseRole === 'engineer') {
      where.grantorId = user.employeeId;
    }

    if (status === 'active') {
      where.status = 'active';
      where.validUntil = { gt: now };
    } else if (status === 'revoked') {
      where.status = 'revoked';
    }

    const delegations = await this.prisma.delegation.findMany({
      where,
      orderBy: { grantedAt: 'desc' },
    });

    const grantees = await this.prisma.user.findMany({
      where: {
        employeeId: { in: delegations.map((d) => d.granteeId) },
      },
    });

    const grouped = new Map<string, any>();
    for (const d of delegations) {
      const grantee = grantees.find((g) => g.employeeId === d.granteeId);
      const key = `${d.granteeId}::${d.validUntil.getTime()}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: d.id,
          employeeId: d.granteeId,
          user: grantee?.name || d.granteeId,
          products: [d.productId],
          validUntil: d.validUntil,
          status: d.status,
        });
      } else {
        grouped.get(key).products.push(d.productId);
      }
    }

    return Array.from(grouped.values());
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (user.baseRole === 'technician') {
      throw new ForbiddenException('Technicians cannot delegate');
    }

    const validUntil = new Date(body.validUntil);
    const now = new Date();
    const maxDuration = 365 * 24 * 60 * 60 * 1000;
    if (validUntil.getTime() - now.getTime() > maxDuration) {
      throw new BadRequestException('Max delegation duration is 365 days');
    }

    const defaultPermissions = [
      'pm.create.view',
      'pm.create.submit',
      'pm.assign.view',
      'pm.assign.submit',
      'pm.record.view',
      'pm.record.submit',
      'pm.calendar.view',
    ];

    const results = [];

    for (const granteeId of body.targetIds) {
      const grantee = await this.prisma.user.findUnique({
        where: { employeeId: granteeId },
      });
      if (!grantee) {
        throw new NotFoundException(`User ${granteeId} not found`);
      }

      if (user.baseRole === 'engineer') {
        if (
          grantee.baseRole !== 'technician' ||
          grantee.department !== user.department
        ) {
          throw new ForbiddenException(
            'Engineers can only delegate to technicians in the same department',
          );
        }

        for (const p of body.products) {
          if (
            !user.ownedProducts.includes('*') &&
            !user.ownedProducts.includes(p)
          ) {
            throw new ForbiddenException(
              `You can only delegate products you own. Product: ${p}`,
            );
          }
        }
      }

      for (const productId of body.products) {
        const existing = await this.prisma.delegation.findFirst({
          where: {
            granteeId,
            productId,
            status: 'active',
            validUntil: { gt: now },
          },
        });
        if (existing) {
          throw new ConflictException(
            `User ${granteeId} already has an active delegation for product ${productId}`,
          );
        }

        const del = await this.prisma.delegation.create({
          data: {
            grantorId: user.employeeId,
            granteeId,
            productId,
            permissions: JSON.stringify(defaultPermissions),
            status: 'active',
            validUntil,
          },
        });

        results.push(del);

        await this.cmms.logAction(
          'Delegated Product Access',
          { id: user.employeeId, name: user.name },
          { id: grantee.employeeId, name: grantee.name, isUser: true },
          productId,
          'security',
        );
      }
    }

    return results;
  }

  @Patch(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.baseRole === 'technician') {
      throw new ForbiddenException('Technicians cannot revoke delegations');
    }

    const target = await this.prisma.delegation.findUnique({
      where: { id },
    });
    if (!target) {
      throw new NotFoundException(`Delegation ${id} not found`);
    }

    if (user.baseRole === 'engineer' && target.grantorId !== user.employeeId) {
      throw new ForbiddenException(
        'Engineers can only revoke delegations they granted',
      );
    }

    await this.prisma.delegation.updateMany({
      where: {
        granteeId: target.granteeId,
        validUntil: target.validUntil,
        status: 'active',
      },
      data: {
        status: 'revoked',
      },
    });

    const grantee = await this.prisma.user.findUnique({
      where: { employeeId: target.granteeId },
    });

    await this.cmms.logAction(
      'Revoked Product Access',
      { id: user.employeeId, name: user.name },
      {
        id: target.granteeId,
        name: grantee?.name || target.granteeId,
        isUser: true,
      },
      target.productId,
      'security',
    );
  }
}
