import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CmmsService {
  constructor(private prisma: PrismaService) {}

  // ── PM Tasks Sequential ID (transaction + retry) ─────────────────────────
  /**
   * Generates a task ID and creates the task atomically inside a serializable
   * transaction. Retries up to MAX_RETRIES times on unique-key conflicts that
   * arise from concurrent requests racing for the same sequential ID.
   */
  async createTaskWithRetry(
    data: Omit<Prisma.PmTaskCreateInput, 'id'>,
    maxRetries = 5,
  ) {
    const deptPrefix = (data.department || 'Gen').substring(0, 3).toUpperCase();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const tasks = await tx.pmTask.findMany({
              where: { id: { startsWith: `PM-${deptPrefix}-` } },
              select: { id: true },
            });

            let maxNum = 0;
            for (const t of tasks) {
              const parts = t.id.split('-');
              if (parts.length === 3) {
                const num = parseInt(parts[2], 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
              }
            }

            const taskId = `PM-${deptPrefix}-${(maxNum + 1).toString().padStart(4, '0')}`;
            return tx.pmTask.create({ data: { ...data, id: taskId } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err: any) {
        // P2002 = unique constraint violation; P2034 = serialization failure
        const isRetryable = err?.code === 'P2002' || err?.code === 'P2034';
        if (!isRetryable || attempt === maxRetries - 1) throw err;
      }
    }
  }

  // ── Verification Helper: User has scope over Product ──────────────────────
  async checkProductOwnership(
    user: any,
    productId: string,
    permission: string,
  ) {
    if (user.baseRole === 'admin' || user.baseRole === 'manager') {
      return true;
    }

    // Check owned products
    if (
      user.ownedProducts.includes('*') ||
      user.ownedProducts.includes(productId)
    ) {
      return true;
    }

    // Check active delegations (for technicians)
    if (user.baseRole === 'technician') {
      const activeDelegation = user.delegatedProducts?.find(
        (dp: any) =>
          dp.productId === productId &&
          dp.status === 'active' &&
          dp.permissions.includes(permission),
      );
      if (activeDelegation) {
        return true;
      }
    }

    throw new ForbiddenException(`Product access denied for ${productId}`);
  }

  // ── Logging Helper ───────────────────────────────────────────────────────
  async logAction(
    action: string,
    actor: { id: string; name: string },
    target: { id?: string; name?: string; isUser: boolean } | null,
    productId: string | null,
    type: 'security' | 'system' | 'data',
  ) {
    await this.prisma.auditLog.create({
      data: {
        action,
        actorId: actor.id,
        actorName: actor.name,
        targetId: target?.id || null,
        targetName: target?.name || null,
        targetIsUser: target?.isUser || false,
        productId,
        type,
      },
    });
  }
}
