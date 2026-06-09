import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Audit Logs')
@ApiBearerAuth('JWT-auth')
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
  ) {
    if (user.baseRole !== 'engineer' && user.baseRole !== 'manager') {
      throw new ForbiddenException(
        'Only engineers and managers can view audit logs',
      );
    }

    const where: any = {};
    if (type) where.type = type;
    if (actorId) where.actorId = actorId;
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
      target: l.targetId
        ? { id: l.targetId, name: l.targetName || '', isUser: l.targetIsUser }
        : null,
      product: l.productId || '',
      type: l.type,
    }));
  }
}
