import { Controller, Get, Patch, Param, Body, Query, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import * as bcrypt from 'bcrypt';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAll(@Query('role') role?: string, @Query('department') department?: string) {
    const where: any = {};
    if (role) {
      where.baseRole = role;
    }
    if (department) {
      where.department = department;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: { ownedProducts: true },
    });

    const now = new Date();
    const delegations = await this.prisma.delegation.findMany({
      where: {
        status: 'active',
        validUntil: { gt: now },
      },
    });

    return users.map((u) => {
      const userDelegations = delegations
        .filter((d) => d.granteeId === u.employeeId)
        .map((d) => ({
          id: d.id,
          productId: d.productId,
          status: d.status as 'active' | 'revoked',
          permissions: typeof d.permissions === 'string' ? JSON.parse(d.permissions) : d.permissions,
          validUntil: d.validUntil,
        }));

      return {
        employeeId: u.employeeId,
        name: u.name,
        initials: u.initials,
        baseRole: u.baseRole,
        roleLabel: u.roleLabel,
        department: u.department,
        ownedProducts: u.ownedProducts.map((op) => op.productId),
        delegatedProducts: userDelegations,
        permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions,
      };
    });
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({
      where: { employeeId: id },
      include: { ownedProducts: true },
    });

    if (!u) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const now = new Date();
    const delegations = await this.prisma.delegation.findMany({
      where: {
        granteeId: id,
        status: 'active',
        validUntil: { gt: now },
      },
    });

    return {
      employeeId: u.employeeId,
      name: u.name,
      initials: u.initials,
      baseRole: u.baseRole,
      roleLabel: u.roleLabel,
      department: u.department,
      ownedProducts: u.ownedProducts.map((op) => op.productId),
      delegatedProducts: delegations.map((d) => ({
        id: d.id,
        productId: d.productId,
        status: d.status as 'active' | 'revoked',
        permissions: typeof d.permissions === 'string' ? JSON.parse(d.permissions) : d.permissions,
        validUntil: d.validUntil,
      })),
      permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: any) {
    if (actor.baseRole !== 'admin') {
      throw new ForbiddenException('Admin only');
    }

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.initials !== undefined) data.initials = body.initials;
    if (body.baseRole !== undefined) data.baseRole = body.baseRole;
    if (body.roleLabel !== undefined) data.roleLabel = body.roleLabel;
    if (body.department !== undefined) data.department = body.department;
    if (body.permissions !== undefined) data.permissions = JSON.stringify(body.permissions);

    if (body.password !== undefined && body.password !== '') {
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }

    await this.prisma.user.update({
      where: { employeeId: id },
      data,
    });

    if (body.ownedProducts !== undefined) {
      await this.prisma.userOwnedProduct.deleteMany({ where: { employeeId: id } });
      for (const p of body.ownedProducts) {
        await this.prisma.userOwnedProduct.create({
          data: { employeeId: id, productId: p },
        });
      }
    }

    return this.getOne(id);
  }
}
