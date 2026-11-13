import { ForbiddenException } from '@nestjs/common';
import { ProductsController } from './products.controller';

describe('ProductsController.create role gate', () => {
  const build = () => {
    const tx = {
      product: { create: jest.fn().mockResolvedValue({ id: 'P1', name: 'N' }) },
      userOwnedProduct: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      product: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    return { controller: new ProductsController(prisma), tx };
  };

  it.each(['admin', 'manager', 'engineer'])('allows %s and grants ownership', async (baseRole) => {
    const { controller, tx } = build();
    await controller.create({ id: 'P1', name: 'N' }, { baseRole, employeeId: 'E1' });
    expect(tx.userOwnedProduct.create).toHaveBeenCalledWith({
      data: { employeeId: 'E1', productId: 'P1' },
    });
  });

  it('rejects technician', async () => {
    const { controller } = build();
    await expect(
      controller.create({ id: 'P1', name: 'N' }, { baseRole: 'technician', employeeId: 'T1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
