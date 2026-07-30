import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/audit-logs')
export class AuditLogsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAll(
    @CurrentUser() user: any,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('actorId') actorId?: string,
    @Query('department') department?: string,
  ) {
    if (user.baseRole !== 'admin' && user.baseRole !== 'engineer' && user.baseRole !== 'manager') {
      throw new ForbiddenException('Only engineers, managers, and admins can view audit logs');
    }

    const where: any = {};
    if (type) where.type = type;
    if (actorId) where.actorId = actorId;
    if (department) where.department = department;
    if (from) {
      where.timestamp = { gte: new Date(from) };
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((l) => ({
      id: `AL-${l.id}`,
      timestamp: l.timestamp,
      action: l.action,
      actor: { id: l.actorId, name: l.actorName },
      target: l.targetId ? { id: l.targetId, name: l.targetName || '', isUser: l.targetIsUser } : null,
      product: l.productId || '',
      type: l.type,
    }));
  }
}
