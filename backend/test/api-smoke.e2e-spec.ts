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
  const createdUserId = `E2E-SMOKE-USR-${Date.now()}`;
  let createdTaskId = '';
  let createdSeriesId = '';
  let createdScheduleTaskId = '';
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
      await prisma.userOwnedProduct.deleteMany({ where: { employeeId: createdUserId } });
      await prisma.user.deleteMany({ where: { employeeId: createdUserId } });
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

    // Coverage for docs/backend_profile_config_users.html: admin-only user
    // creation, isActive lifecycle, and login rejection for deactivated
    // accounts.
    describe('Profile Config user management (backend_profile_config_users)', () => {
      it('POST /api/v1/users forbids non-admin', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${engineerToken}`)
          .send({
            employeeId: createdUserId,
            name: 'E2E Smoke User',
            initials: 'ES',
            baseRole: 'technician',
            roleLabel: 'Technician',
            department: 'Test',
            password: 'smoke-pass-123',
          })
          .expect(403);
      });

      it('POST /api/v1/users creates a new account, active by default', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            employeeId: createdUserId,
            name: 'E2E Smoke User',
            initials: 'ES',
            baseRole: 'technician',
            roleLabel: 'Technician',
            department: 'Test',
            password: 'smoke-pass-123',
            permissions: ['pm.record.view'],
          })
          .expect(201);
        expect(res.body.employeeId).toBe(createdUserId);
        expect(res.body.isActive).toBe(true);
      });

      it('POST /api/v1/users 409s on a duplicate employeeId', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            employeeId: createdUserId,
            name: 'Duplicate',
            initials: 'DP',
            baseRole: 'technician',
            roleLabel: 'Technician',
            department: 'Test',
            password: 'smoke-pass-123',
          })
          .expect(409);
      });

      it('the new user can log in while active', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ employeeId: createdUserId, password: 'smoke-pass-123' })
          .expect(200);
      });

      it('PATCH /api/v1/users/:id deactivates the account', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/users/${createdUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isActive: false })
          .expect(200);
        expect(res.body.isActive).toBe(false);
      });

      it('login is rejected for a deactivated account', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ employeeId: createdUserId, password: 'smoke-pass-123' })
          .expect(401);
      });

      it('GET /api/v1/users still returns the deactivated account with isActive: false', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/users?department=Test')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        const created = res.body.find((u: any) => u.employeeId === createdUserId);
        expect(created?.isActive).toBe(false);
      });
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

    // Coverage for docs/backend_checklist_value_record.html: the whitelist
    // ValidationPipe must not silently strip requiresValue off checklist items.
    it('POST /api/v1/pm-tasks preserves checklist requiresValue', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pm-tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Smoke RequiresValue Task',
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(Date.now() + 86400000).toISOString(),
          estimatedHours: 1,
          checklist: [{ text: 'Record reading', requiresValue: true, requiresPhoto: false }],
        })
        .expect(201);
      expect(res.body.checklist[0].requiresValue).toBe(true);
      await prisma.pmTask.deleteMany({ where: { id: res.body.id } });
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

    // Regression coverage for the technician-visibility bug: a technician
    // with no owned/delegated products must still see (and only see) tasks
    // assigned directly to them, via both GET /pm-tasks and GET /pm-tasks/:id.
    describe('Technician visibility (regression)', () => {
      it('assigns the task to TECH-TST-1', async () => {
        const res = await request(app.getHttpServer())
          .put(`/api/v1/pm-tasks/${createdTaskId}`)
          .set('Authorization', `Bearer ${engineerToken}`)
          .send({ assignedTo: 'TECH-TST-1' })
          .expect(200);
        expect(res.body.assignedTo).toBe('TECH-TST-1');
      });

      it('GET /api/v1/pm-tasks includes a task assigned to the requesting technician', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/pm-tasks')
          .set('Authorization', `Bearer ${technicianToken}`)
          .expect(200);
        expect(res.body.some((t: any) => t.id === createdTaskId)).toBe(true);
      });

      it('GET /api/v1/pm-tasks/:id allows the assigned technician to fetch their own task', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/pm-tasks/${createdTaskId}`)
          .set('Authorization', `Bearer ${technicianToken}`)
          .expect(200);
        expect(res.body.id).toBe(createdTaskId);
      });

      it('GET /api/v1/pm-tasks/:id forbids a technician the task is not assigned to', async () => {
        const otherLogin = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ employeeId: 'TECH-TST-2', password: 'tech123' })
          .expect(200);
        await request(app.getHttpServer())
          .get(`/api/v1/pm-tasks/${createdTaskId}`)
          .set('Authorization', `Bearer ${(otherLogin.body as LoginResponse).token}`)
          .expect(403);
      });
    });

    // Coverage for docs/backend_pm_create_start_date.html.
    it('POST /api/v1/pm-tasks/schedule rejects a startDate in the past', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/pm-tasks/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Smoke Backdated Schedule',
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          estimatedHours: 1,
          startDate: new Date(Date.now() - 7 * 86400000).toISOString(),
        })
        .expect(400);
    });

    it('POST /api/v1/pm-tasks/schedule honors a user-chosen future startDate as task #1\'s exact due date', async () => {
      const startDate = new Date(Date.now() + 10 * 86400000);
      const res = await request(app.getHttpServer())
        .post('/api/v1/pm-tasks/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Smoke Start-Date Schedule',
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          estimatedHours: 1,
          startDate: startDate.toISOString(),
        })
        .expect(201);
      expect(res.body[0].nextDueDate.slice(0, 10)).toBe(startDate.toISOString().slice(0, 10));

      await prisma.pmTask.deleteMany({ where: { scheduleId: res.body[0].scheduleId } });
      await prisma.pmSchedule.deleteMany({ where: { id: res.body[0].scheduleId } });
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
      // Per docs/backend_pm_create_start_date.html: task #1 is now the anchor
      // date itself (today, since no startDate was sent), task #2 is +6mo.
      expect(res.body.length).toBe(2);
      createdSeriesId = res.body[0].scheduleId;
      createdScheduleTaskId = res.body[0].id;
      expect(createdSeriesId).toMatch(/^SCH-/);
    });

    // Regression coverage for the recurring-assignment change request:
    // assigning one occurrence of a series must persist to PmSchedule and
    // backfill not-yet-started siblings, without touching siblings that are
    // already active under a (hypothetically) different technician.
    describe('Recurring assignment persistence (change request)', () => {
      let pendingSiblingId = '';
      let inProgressSiblingId = '';

      beforeAll(async () => {
        const pendingSibling = await prisma.pmTask.create({
          data: {
            id: `E2E-SMOKE-SIB-PEND-${Date.now()}`,
            title: 'E2E Smoke Sibling (Pending)',
            scheduleId: createdSeriesId,
            frequency: '6 month(s)',
            assetId: 'THC-P1-01',
            productId: 'CUST-001',
            department: 'Test',
            nextDueDate: new Date(Date.now() + 30 * 86400000),
            estimatedHours: 1,
            status: 'Pending',
          },
        });
        pendingSiblingId = pendingSibling.id;

        const inProgressSibling = await prisma.pmTask.create({
          data: {
            id: `E2E-SMOKE-SIB-INPR-${Date.now()}`,
            title: 'E2E Smoke Sibling (In Progress)',
            scheduleId: createdSeriesId,
            frequency: '6 month(s)',
            assetId: 'THC-P1-01',
            productId: 'CUST-001',
            department: 'Test',
            nextDueDate: new Date(Date.now() + 30 * 86400000),
            estimatedHours: 1,
            status: 'In Progress',
            assignedTo: 'TECH-TST-2',
          },
        });
        inProgressSiblingId = inProgressSibling.id;
      });

      it('PUT /api/v1/pm-tasks/:id assigning one occurrence sets PmSchedule.assignedTo and backfills Pending siblings', async () => {
        const res = await request(app.getHttpServer())
          .put(`/api/v1/pm-tasks/${createdScheduleTaskId}`)
          .set('Authorization', `Bearer ${engineerToken}`)
          .send({ assignedTo: 'TECH-TST-1' })
          .expect(200);
        expect(res.body.assignedTo).toBe('TECH-TST-1');

        const schedule = await prisma.pmSchedule.findUnique({ where: { id: createdSeriesId } });
        expect(schedule?.assignedTo).toBe('TECH-TST-1');

        const pendingSibling = await prisma.pmTask.findUnique({ where: { id: pendingSiblingId } });
        expect(pendingSibling?.assignedTo).toBe('TECH-TST-1');
      });

      it('does not backfill a sibling that is already In Progress under a different technician', async () => {
        const inProgressSibling = await prisma.pmTask.findUnique({ where: { id: inProgressSiblingId } });
        expect(inProgressSibling?.assignedTo).toBe('TECH-TST-2');
      });
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

  // Coverage for docs/backend_pm_reassign_api.html: dedicated reassign
  // endpoint with series cascade, fully self-contained fixture + cleanup.
  describe('PM Task Reassignment (Series Cascade) (backend_pm_reassign_api)', () => {
    const reassignSeriesId = `E2E-SMOKE-REASSIGN-SCH-${Date.now()}`;
    let primaryTaskId = '';
    let pendingSiblingId = '';
    let doneSiblingId = '';

    beforeAll(async () => {
      await prisma.pmSchedule.create({
        data: {
          id: reassignSeriesId,
          title: 'E2E Smoke Reassign Schedule',
          frequency: '6 month(s)',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          estimatedHours: 1,
          assignedTo: 'TECH-TST-2',
          createdBy: 'ADM001',
        },
      });

      const primary = await prisma.pmTask.create({
        data: {
          id: `E2E-SMOKE-REASSIGN-PRIMARY-${Date.now()}`,
          title: 'E2E Smoke Reassign Primary',
          scheduleId: reassignSeriesId,
          frequency: '6 month(s)',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(),
          estimatedHours: 1,
          status: 'In Progress',
          assignedTo: 'TECH-TST-2',
        },
      });
      primaryTaskId = primary.id;

      const pendingSibling = await prisma.pmTask.create({
        data: {
          id: `E2E-SMOKE-REASSIGN-PEND-${Date.now()}`,
          title: 'E2E Smoke Reassign Pending Sibling',
          scheduleId: reassignSeriesId,
          frequency: '6 month(s)',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(Date.now() + 180 * 86400000),
          estimatedHours: 1,
          status: 'Pending',
          assignedTo: 'TECH-TST-2',
        },
      });
      pendingSiblingId = pendingSibling.id;

      const doneSibling = await prisma.pmTask.create({
        data: {
          id: `E2E-SMOKE-REASSIGN-DONE-${Date.now()}`,
          title: 'E2E Smoke Reassign Done Sibling',
          scheduleId: reassignSeriesId,
          frequency: '6 month(s)',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(Date.now() - 180 * 86400000),
          estimatedHours: 1,
          status: 'Done',
          assignedTo: 'TECH-TST-2',
        },
      });
      doneSiblingId = doneSibling.id;
    });

    afterAll(async () => {
      await prisma.pmTask.deleteMany({ where: { scheduleId: reassignSeriesId } });
      await prisma.pmSchedule.deleteMany({ where: { id: reassignSeriesId } });
    });

    it('forbids reassigning a Pending task (use Assign instead)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${pendingSiblingId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: 'TECH-TST-1' })
        .expect(403);
    });

    it('forbids reassigning a Done task', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${doneSiblingId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: 'TECH-TST-1' })
        .expect(403);
    });

    it('forbids a technician with no assign delegation', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${primaryTaskId}/reassign`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({ assignedTo: 'TECH-TST-1' })
        .expect(403);
    });

    it('rejects reassigning to the technician already assigned', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${primaryTaskId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: 'TECH-TST-2' })
        .expect(400);
    });

    it('reassigns the primary task, cascades to Pending siblings, updates PmSchedule, and increments reassignCount', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${primaryTaskId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: 'TECH-TST-1' })
        .expect(200);
      expect(res.body.assignedTo).toBe('TECH-TST-1');
      expect(res.body.reassignCount).toBe(1);

      const pendingSibling = await prisma.pmTask.findUnique({ where: { id: pendingSiblingId } });
      expect(pendingSibling?.assignedTo).toBe('TECH-TST-1');
      expect(pendingSibling?.reassignCount).toBe(1);

      const doneSibling = await prisma.pmTask.findUnique({ where: { id: doneSiblingId } });
      expect(doneSibling?.assignedTo).toBe('TECH-TST-2'); // untouched, already Done

      const schedule = await prisma.pmSchedule.findUnique({ where: { id: reassignSeriesId } });
      expect(schedule?.assignedTo).toBe('TECH-TST-1');
    });
  });

  // Coverage for docs/backend_pm_rolling_due_dates.html: approving a task in
  // a series recalculates the remaining Pending siblings' due dates anchored
  // off the actual approval time.
  describe('Rolling Due Dates on Approval (backend_pm_rolling_due_dates)', () => {
    const rollingSeriesId = `E2E-SMOKE-ROLLING-SCH-${Date.now()}`;
    let approvingTaskId = '';
    let sibling1Id = ''; // originally due soonest
    let sibling2Id = ''; // originally due later

    beforeAll(async () => {
      await prisma.pmSchedule.create({
        data: {
          id: rollingSeriesId,
          title: 'E2E Smoke Rolling Schedule',
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          estimatedHours: 1,
          createdBy: 'ADM001',
        },
      });

      const approving = await prisma.pmTask.create({
        data: {
          id: `E2E-SMOKE-ROLLING-APR-${Date.now()}`,
          title: 'E2E Smoke Rolling Approving Task',
          scheduleId: rollingSeriesId,
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(),
          estimatedHours: 1,
          status: 'Pending Approval',
          assignedTo: 'TECH-TST-1',
        },
      });
      approvingTaskId = approving.id;

      const s1 = await prisma.pmTask.create({
        data: {
          id: `E2E-SMOKE-ROLLING-S1-${Date.now()}`,
          title: 'E2E Smoke Rolling Sibling 1',
          scheduleId: rollingSeriesId,
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(Date.now() + 30 * 86400000),
          estimatedHours: 1,
          status: 'Pending',
        },
      });
      sibling1Id = s1.id;

      const s2 = await prisma.pmTask.create({
        data: {
          id: `E2E-SMOKE-ROLLING-S2-${Date.now()}`,
          title: 'E2E Smoke Rolling Sibling 2',
          scheduleId: rollingSeriesId,
          frequency: 'Monthly',
          assetId: 'THC-P1-01',
          productId: 'CUST-001',
          department: 'Test',
          nextDueDate: new Date(Date.now() + 60 * 86400000),
          estimatedHours: 1,
          status: 'Pending',
        },
      });
      sibling2Id = s2.id;
    });

    afterAll(async () => {
      await prisma.pmTask.deleteMany({ where: { scheduleId: rollingSeriesId } });
      await prisma.pmSchedule.deleteMany({ where: { id: rollingSeriesId } });
    });

    it('approving a task recalculates remaining Pending siblings anchored off approvedAt', async () => {
      const approvedAt = new Date();
      const res = await request(app.getHttpServer())
        .put(`/api/v1/pm-tasks/${approvingTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Done', approvedBy: 'ADM001', approvedAt: approvedAt.toISOString() })
        .expect(200);
      expect(res.body.status).toBe('Done');

      const s1 = await prisma.pmTask.findUnique({ where: { id: sibling1Id } });
      const s2 = await prisma.pmTask.findUnique({ where: { id: sibling2Id } });

      const expectedS1 = new Date(approvedAt);
      expectedS1.setMonth(expectedS1.getMonth() + 1);
      const expectedS2 = new Date(approvedAt);
      expectedS2.setMonth(expectedS2.getMonth() + 2);

      // Day-granularity comparison avoids ms-level drift between the
      // approvedAt sent and the server's own Date parsing.
      expect(s1?.nextDueDate.toISOString().slice(0, 10)).toBe(expectedS1.toISOString().slice(0, 10));
      expect(s2?.nextDueDate.toISOString().slice(0, 10)).toBe(expectedS2.toISOString().slice(0, 10));
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
