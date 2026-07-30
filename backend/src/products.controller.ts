import { Controller, Get, Post, Body, UseGuards, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/products')
export class ProductsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAll() {
    return this.prisma.product.findMany({
      orderBy: { id: 'asc' },
    });
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (user.baseRole !== 'admin' && user.baseRole !== 'manager') {
      throw new ForbiddenException('Only admin or manager can create products');
    }

    const existing = await this.prisma.product.findUnique({
      where: { id: body.id },
    });
    if (existing) {
      throw new ConflictException(`Product with ID ${body.id} already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          id: body.id,
          name: body.name,
        },
      });

      await tx.userOwnedProduct.create({
        data: {
          employeeId: user.employeeId,
          productId: product.id,
        },
      });

      return product;
    });
  }
}
