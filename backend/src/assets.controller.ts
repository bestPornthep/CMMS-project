import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/assets')
export class AssetsController {
  constructor(private prisma: PrismaService) {}

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
}
