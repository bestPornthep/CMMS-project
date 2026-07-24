import { Controller, Get, Post, Body, Query, UseGuards, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';

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
      },
    });
  }
}
