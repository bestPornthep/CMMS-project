import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private refreshTokens = new Map<string, string>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(employeeId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { ownedProducts: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.employeeId,
      role: user.baseRole,
      department: user.department,
      ownedProducts: user.ownedProducts.map((op) => op.productId),
    };

    const token = this.jwtService.sign(payload);
    const refreshToken = 'RT-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    this.refreshTokens.set(user.employeeId, refreshToken);

    const now = new Date();
    const delegations = await this.prisma.delegation.findMany({
      where: {
        granteeId: user.employeeId,
        status: 'active',
        validUntil: { gt: now },
      },
    });

    const cleanUser = {
      employeeId: user.employeeId,
      name: user.name,
      initials: user.initials,
      baseRole: user.baseRole,
      roleLabel: user.roleLabel,
      department: user.department,
      ownedProducts: user.ownedProducts.map((op) => op.productId),
      delegatedProducts: delegations.map((d) => ({
        id: d.id,
        productId: d.productId,
        status: d.status as 'active' | 'revoked',
        permissions: typeof d.permissions === 'string' ? JSON.parse(d.permissions) : d.permissions,
        validUntil: d.validUntil,
      })),
      permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions,
    };

    return {
      token,
      refreshToken,
      user: cleanUser,
    };
  }

  async logout(employeeId: string) {
    this.refreshTokens.delete(employeeId);
  }

  async refresh(refreshToken: string) {
    let employeeId: string | null = null;
    for (const [empId, rt] of this.refreshTokens.entries()) {
      if (rt === refreshToken) {
        employeeId = empId;
        break;
      }
    }

    if (!employeeId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { ownedProducts: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const payload = {
      sub: user.employeeId,
      role: user.baseRole,
      department: user.department,
      ownedProducts: user.ownedProducts.map((op) => op.productId),
    };

    const token = this.jwtService.sign(payload);
    return { token };
  }
}
