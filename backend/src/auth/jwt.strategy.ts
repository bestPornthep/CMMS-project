import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'assetintel_very_secret_key_12345',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { employeeId: payload.sub },
      include: { ownedProducts: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const now = new Date();
    const delegations = await this.prisma.delegation.findMany({
      where: {
        granteeId: user.employeeId,
        status: 'active',
        validUntil: { gt: now },
      },
    });

    const parsedDelegations = delegations.map((d) => ({
      id: d.id,
      productId: d.productId,
      status: d.status as 'active' | 'revoked',
      permissions:
        typeof d.permissions === 'string'
          ? JSON.parse(d.permissions)
          : d.permissions,
      validUntil: d.validUntil,
    }));

    return {
      employeeId: user.employeeId,
      name: user.name,
      initials: user.initials,
      baseRole: user.baseRole,
      roleLabel: user.roleLabel,
      department: user.department,
      ownedProducts: user.ownedProducts.map((op) => op.productId),
      delegatedProducts: parsedDelegations,
      permissions:
        typeof user.permissions === 'string'
          ? JSON.parse(user.permissions)
          : user.permissions,
    };
  }
}
