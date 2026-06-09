import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './auth/current-user.decorator';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CmmsService } from './cmms.service';

@ApiTags('Assets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/assets')
export class AssetsController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async getAll(
    @Query('location') location?: string,
    @Query('department') department?: string,
  ) {
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
  async create(@Body() body: CreateAssetDto, @CurrentUser() user: any) {
    if (user.baseRole === 'technician') {
      throw new ForbiddenException(
        'Technicians are not allowed to create assets',
      );
    }

    const deptExists = await this.prisma.department.findUnique({
      where: { name: body.department },
    });
    if (!deptExists) {
      throw new BadRequestException(`Invalid department '${body.department}'`);
    }

    const productExists = await this.prisma.product.findUnique({
      where: { id: body.location },
    });
    if (!productExists) {
      throw new NotFoundException(
        `Product (location) with ID '${body.location}' not found`,
      );
    }

    await this.cmms.checkProductOwnership(
      user,
      body.location,
      'pm.create.submit',
    );

    const existing = await this.prisma.asset.findUnique({
      where: { id: body.id },
    });
    if (existing) {
      throw new ConflictException(`Asset with ID '${body.id}' already exists`);
    }

    const asset = await this.prisma.asset.create({
      data: {
        id: body.id,
        name: body.name,
        location: body.location,
        department: body.department,
      },
    });

    await this.cmms.logAction(
      'Created Asset',
      { id: user.employeeId, name: user.name },
      { id: asset.id, name: asset.name, isUser: false },
      asset.location,
      'system',
    );

    return asset;
  }
}
