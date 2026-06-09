import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './auth/current-user.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { CmmsService } from './cmms.service';

@ApiTags('Products')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/products')
export class ProductsController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async getAll() {
    return this.prisma.product.findMany({
      orderBy: { id: 'asc' },
    });
  }

  @Post()
  async create(@Body() body: CreateProductDto, @CurrentUser() user: any) {
    if (user.baseRole === 'technician') {
      throw new ForbiddenException(
        'Technicians are not allowed to create products',
      );
    }

    const existing = await this.prisma.product.findUnique({
      where: { id: body.id },
    });
    if (existing) {
      throw new ConflictException(
        `Product with ID '${body.id}' already exists`,
      );
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: {
          id: body.id,
          name: body.name,
        },
      });

      await tx.userOwnedProduct.create({
        data: {
          employeeId: user.employeeId,
          productId: newProduct.id,
        },
      });

      return newProduct;
    });

    await this.cmms.logAction(
      'Created Product',
      { id: user.employeeId, name: user.name },
      { id: product.id, name: product.name, isUser: false },
      product.id,
      'system',
    );

    return product;
  }
}
