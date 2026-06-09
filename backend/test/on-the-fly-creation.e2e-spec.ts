import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('On-the-Fly Creation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let engineerToken: string;
  let technicianToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Login as Engineer (ENG-TST-1 / eng123)
    const engLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ employeeId: 'ENG-TST-1', password: 'eng123' })
      .expect(200);
    engineerToken = engLogin.body.token;

    // Login as Technician (TECH-TST-1 / tech123)
    const techLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ employeeId: 'TECH-TST-1', password: 'tech123' })
      .expect(200);
    technicianToken = techLogin.body.token;
  });

  afterAll(async () => {
    // Cleanup the database created test records
    try {
      await prisma.auditLog.deleteMany({
        where: {
          productId: {
            in: ['CUST-E2E-TEST-PRODUCT', 'CUST-E2E-TEST-ASSET-LOC'],
          },
        },
      });
      await prisma.asset.deleteMany({
        where: {
          id: { in: ['AST-E2E-TEST-1', 'AST-E2E-TEST-CONFLICT'] },
        },
      });
      await prisma.userOwnedProduct.deleteMany({
        where: {
          productId: 'CUST-E2E-TEST-PRODUCT',
        },
      });
      await prisma.product.deleteMany({
        where: {
          id: 'CUST-E2E-TEST-PRODUCT',
        },
      });
    } catch (err) {
      console.error('Failed to cleanup E2E data', err);
    }
    await app.close();
  });

  describe('POST /api/v1/products', () => {
    it('should forbid technician from creating product', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({ id: 'CUST-E2E-TEST-PRODUCT', name: 'E2E Test Product' })
        .expect(403);
    });

    it('should allow engineer to create a product and grant automatic ownership', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ id: 'CUST-E2E-TEST-PRODUCT', name: 'E2E Test Product' })
        .expect(201);

      expect(res.body.id).toBe('CUST-E2E-TEST-PRODUCT');
      expect(res.body.name).toBe('E2E Test Product');

      // Verify that user profile me endpoint returns the product in ownedProducts
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);

      expect(meRes.body.ownedProducts).toContain('CUST-E2E-TEST-PRODUCT');
    });

    it('should throw 409 Conflict if creating product that already exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          id: 'CUST-E2E-TEST-PRODUCT',
          name: 'Duplicate E2E Test Product',
        })
        .expect(409);
    });
  });

  describe('POST /api/v1/assets', () => {
    it('should forbid technician from creating asset', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          id: 'AST-E2E-TEST-1',
          name: 'E2E Test Asset',
          location: 'CUST-E2E-TEST-PRODUCT',
          department: 'Test',
        })
        .expect(403);
    });

    it('should throw 400 Bad Request if department does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          id: 'AST-E2E-TEST-1',
          name: 'E2E Test Asset',
          location: 'CUST-E2E-TEST-PRODUCT',
          department: 'NonExistentDept',
        })
        .expect(400);
    });

    it('should throw 404 Not Found if location product does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          id: 'AST-E2E-TEST-1',
          name: 'E2E Test Asset',
          location: 'CUST-NON-EXISTENT',
          department: 'Test',
        })
        .expect(404);
    });

    it('should throw 403 Forbidden if user tries to create asset in a product they do not own', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          id: 'AST-E2E-TEST-1',
          name: 'E2E Test Asset',
          location: 'CUST-005',
          department: 'Test',
        })
        .expect(403);
    });

    it('should allow engineer to create asset for an owned product', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          id: 'AST-E2E-TEST-1',
          name: 'E2E Test Asset',
          location: 'CUST-E2E-TEST-PRODUCT',
          department: 'Test',
        })
        .expect(201);

      expect(res.body.id).toBe('AST-E2E-TEST-1');
      expect(res.body.name).toBe('E2E Test Asset');
      expect(res.body.location).toBe('CUST-E2E-TEST-PRODUCT');
      expect(res.body.department).toBe('Test');
    });

    it('should throw 409 Conflict if creating asset that already exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          id: 'AST-E2E-TEST-1',
          name: 'Duplicate E2E Test Asset',
          location: 'CUST-E2E-TEST-PRODUCT',
          department: 'Test',
        })
        .expect(409);
    });
  });
});
