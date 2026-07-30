import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

interface LoginResponse {
  token: string;
  refreshToken: string;
  user: { employeeId: string };
}

/**
 * Full API smoke test: exercises every controller/endpoint in the backend at
 * least once against the real dev DB (KETL_Tester), using clearly-tagged
 * `E2E-SMOKE-*` test data that is cleaned up in afterAll. Complements
 * pm-templates.e2e-spec.ts, which already gives full CRUD + auth-matrix
 * coverage for PUT /api/v1/templates/:id specifically.
 */
describe('Full API Smoke Test (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminRefreshToken: string;
  let engineerToken: string; // ENG-TST-1 (Test dept, owns CUST-001/CUST-002)
  let technicianToken: string; // TECH-TST-1 (Test dept)

  const testAssetId = `E2E-SMOKE-AST-${Date.now()}`;
  const testProductId = `E2E-SMOKE-PROD-${Date.now()}`;
  let createdTaskId = '';
  let createdSeriesId = '';
  let createdDelegationId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const login = async (employeeId: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ employeeId, password })
        .expect(200);
      return res.body as LoginResponse;
    };

    const adminLogin = await login('ADM001', 'adm123');
    adminToken = adminLogin.token;
    adminRefreshToken = adminLogin.refreshToken;
    engineerToken = (await login('ENG-TST-1', 'eng123')).token;
    technicianToken = (await login('TECH-TST-1', 'tech123')).token;
  });

  afterAll(async () => {
    try {
      if (createdTaskId) {
        await prisma.pmTask.deleteMany({ where: { id: createdTaskId } });
      }
      if (createdSeriesId) {
        await prisma.pmTask.deleteMany({ where: { scheduleId: createdSeriesId } });
        await prisma.pmSchedule.deleteMany({ where: { id: createdSeriesId } });
      }
      if (createdDelegationId) {
        await prisma.delegation.deleteMany({ where: { id: createdDelegationId } });
      }
      await prisma.asset.deleteMany({ where: { id: testAssetId } });
      await prisma.userOwnedProduct.deleteMany({ where: { productId: testProductId } });
      await prisma.product.deleteMany({ where: { id: testProductId } });
      await prisma.auditLog.deleteMany({
        where: { productId: { in: [testAssetId, testProductId, 'CUST-001'] }, action: 'Delegated Product Access' },
      });
    } catch (err) {
      console.error('Failed to cleanup smoke-test data', err);
    }
    await app.close();
  });

  describe('Auth', () => {
    it('POST /api/v1/auth/login rejects invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ employeeId: 'ADM001', password: 'wrong-password' })
        .expect(401);
    });

    it('GET /api/v1/auth/me returns the current user for a valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.employeeId).toBe('ADM001');
    });

    it('GET /api/v1/auth/me rejects requests with no token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('POST /api/v1/auth/refresh returns a new token for a valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: adminRefreshToken })
        .expect(200);
      expect(res.body.token).toBeDefined();
    });

    it('POST /api/v1/auth/logout invalidates the refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: adminRefreshToken })
        .expect(401);
    });
  });

  describe('Users', () => {
    it('GET /api/v1/users filters by role and department', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?role=engineer&department=Test')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((u: any) => u.baseRole === 'engineer' && u.department === 'Test')).toBe(true);
    });

    it('GET /api/v1/users/:id returns a single user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/ENG-TST-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.employeeId).toBe('ENG-TST-1');
    });

    it('GET /api/v1/users/:id returns 404 for an unknown user', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/NOBODY-999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('PATCH /api/v1/users/:id allows admin (no-op update) and forbids non-admin', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/TECH-TST-4')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ initials: 'T4' })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/api/v1/users/TECH-TST-4')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ initials: 'T4' })
        .expect(403);
    });
  });

  describe('Products', () => {
    it('GET /api/v1/products lists products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/v1/products forbids non-admin/manager', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ id: testProductId, name: 'E2E Smoke Product' })
        .expect(403);
    });

    it('POST /api/v1/products creates a product and grants creator ownership (T2)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: testProductId, name: 'E2E Smoke Product' })
        .expect(201);
      expect(res.body.id).toBe(testProductId);

      const owned = await prisma.userOwnedProduct.findFirst({
        where: { productId: testProductId, employeeId: 'ADM001' },
      });
      expect(owned).not.toBeNull();
    });

    it('POST /api/v1/products rejects a duplicate id', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ id: testProductId, name: 'Duplicate' })
        .expect(409);
    });
  });

  describe('Assets', () => {
    it('GET /api/v1/assets filters by location and department', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assets?location=CUST-001&department=Test')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((a: any) => a.location === 'CUST-001' && a.department === 'Test')).toBe(true);
    });

    it('POST /api/v1/assets forbids a technician', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({ id: testAssetId, name: 'E2E Smoke Asset', location: 'CUST-001', department: 'Test' })
        .expect(403);
    });

    it('POST /api/v1/assets creates an asset for an owned product', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ id: testAssetId, name: 'E2E Smoke Asset', location: 'CUST-001', department: 'Test' })
        .expect(201);
      expect(res.body.id).toBe(testAssetId);
    });
  });

  describe('PM Tasks', () => {
    it('POST /api/v1/pm-tasks creates a task', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pm-tasks')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          title: 'E2E Smoke PM Task',
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(Date.now() + 86400000).toISOString(),
          estimatedHours: 1,
        })
        .expect(201);
      createdTaskId = res.body.id;
      expect(createdTaskId).toMatch(/^PM-TES-\d+$/);
    });

    it('GET /api/v1/pm-tasks lists tasks scoped to the current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pm-tasks?productId=CUST-001')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);
      expect(res.body.some((t: any) => t.id === createdTaskId)).toBe(true);
    });

    it('GET /api/v1/pm-tasks/:id returns a single task', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/pm-tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);
      expect(res.body.id).toBe(createdTaskId);
    });

    it('PUT /api/v1/pm-tasks/:id updates a task', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ status: 'In Progress' })
        .expect(200);
      expect(res.body.status).toBe('In Progress');
    });

    it('POST /api/v1/pm-tasks/schedule creates a PmSchedule row plus its task(s) (T4)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pm-tasks/schedule')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({
          title: 'E2E Smoke Schedule',
          frequency: '6 month(s)',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          estimatedHours: 1,
        })
        .expect(201);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      createdSeriesId = res.body[0].scheduleId;
      expect(createdSeriesId).toMatch(/^SCH-/);
    });

    it('PUT /api/v1/pm-tasks/schedule/:seriesId updates the whole series (T4)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/schedule/${createdSeriesId}`)
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ assignedTo: 'TECH-TST-1' })
        .expect(200);
      expect(res.body.every((t: any) => t.assignedTo === 'TECH-TST-1')).toBe(true);
    });

    it('DELETE /api/v1/pm-tasks/:id forbids non-admin', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/pm-tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(403);
    });

    it('DELETE /api/v1/pm-tasks/:id allows admin', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/pm-tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
      createdTaskId = ''; // already deleted; skip afterAll cleanup
    });
  });

  describe('Templates (light coverage — full CRUD covered in pm-templates.e2e-spec.ts)', () => {
    it('GET /api/v1/templates scopes results by department for non-admin roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);
      expect(res.body.every((t: any) => t.department === 'Test')).toBe(true);
    });
  });

  describe('Delegations', () => {
    it('GET /api/v1/delegations forbids technicians', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/delegations')
        .set('Authorization', `Bearer ${technicianToken}`)
        .expect(403);
    });

    it('POST /api/v1/delegations creates a delegation (engineer -> technician, same dept)', async () => {
      const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/api/v1/delegations')
        .set('Authorization', `Bearer ${engineerToken}`)
        .send({ targetIds: ['TECH-TST-1'], products: ['CUST-001'], validUntil })
        .expect(201);
      expect(res.body.length).toBe(1);
      createdDelegationId = res.body[0].id;
    });

    it('GET /api/v1/delegations lists the created delegation for its grantor', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/delegations?status=active')
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(200);
      expect(res.body.some((d: any) => d.employeeId === 'TECH-TST-1')).toBe(true);
    });

    it('PATCH /api/v1/delegations/:id/revoke revokes the delegation', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/delegations/${createdDelegationId}/revoke`)
        .set('Authorization', `Bearer ${engineerToken}`)
        .expect(204);
      createdDelegationId = ''; // already revoked; skip afterAll cleanup
    });
  });

  describe('Audit Logs (T3)', () => {
    it('GET /api/v1/audit-logs forbids technicians', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${technicianToken}`)
        .expect(403);
    });

    it('GET /api/v1/audit-logs allows admin and returns entries', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/audit-logs?department=Test&type=security filters correctly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs?department=Test&type=security')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.some((l: any) => l.action === 'Delegated Product Access')).toBe(true);
    });
  });
});
