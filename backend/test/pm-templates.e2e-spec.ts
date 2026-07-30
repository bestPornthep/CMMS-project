import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

interface LoginResponse {
  token: string;
}

interface TemplateResponse {
  id: string;
  name: string;
  department: string;
  checklist: unknown[];
}

describe('PM Templates Update & Audit Log (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let engineerTestToken: string;
  let engineerMechToken: string;
  let technicianToken: string;
  let testTemplateId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Login as Admin (ADM001 / adm123)
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ employeeId: 'ADM001', password: 'adm123' })
      .expect(200);
    adminToken = (adminLogin.body as LoginResponse).token;

    // Login as Test Engineer (ENG-TST-1 / eng123)
    const engTestLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ employeeId: 'ENG-TST-1', password: 'eng123' })
      .expect(200);
    engineerTestToken = (engTestLogin.body as LoginResponse).token;

    // Login as Mechanic Engineer (ENG-MEC-1 / eng123)
    const engMechLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ employeeId: 'ENG-MEC-1', password: 'eng123' })
      .expect(200);
    engineerMechToken = (engMechLogin.body as LoginResponse).token;

    // Login as Technician (TECH-TST-1 / tech123)
    const techLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ employeeId: 'TECH-TST-1', password: 'tech123' })
      .expect(200);
    technicianToken = (techLogin.body as LoginResponse).token;
  });

  beforeEach(async () => {
    // Delete any existing test template to start clean
    await prisma.template.deleteMany({
      where: {
        name: {
          in: [
            'E2E Temp Template',
            'E2E Temp Template Updated',
            'Admin Updated Template',
          ],
        },
      },
    });

    // Create a seed template for testing PUT /api/v1/templates/:id
    const template = await prisma.template.create({
      data: {
        name: 'E2E Temp Template',
        department: 'Test',
        checklist: JSON.stringify([
          { text: 'Check machine oil levels', requiresPhoto: false },
        ]),
        createdBy: 'ENG-TST-1',
      },
    });
    testTemplateId = template.id;
  });

  afterAll(async () => {
    // Clean up E2E templates and related audit logs
    try {
      await prisma.template.deleteMany({
        where: {
          name: {
            in: [
              'E2E Temp Template',
              'E2E Temp Template Updated',
              'Admin Updated Template',
            ],
          },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          action: 'Template Updated',
        },
      });
    } catch (err) {
      console.error('Failed to cleanup E2E data', err);
    }
    await app.close();
  });

  describe('PUT /api/v1/templates/:id', () => {
    it('should completely overwrite checklist items and create audit log when updated by authorized department engineer', async () => {
      const updatedChecklist = [
        { text: 'Check machine oil levels', requiresPhoto: false },
        { text: 'Clean main filter', requiresPhoto: true },
      ];

      const res = await request(app.getHttpServer())
        .put(`/api/v1/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${engineerTestToken}`)
        .send({
          id: testTemplateId,
          name: 'E2E Temp Template Updated',
          department: 'Test',
          checklist: updatedChecklist,
        })
        .expect(200);

      const resBody = res.body as TemplateResponse;
      expect(resBody.id).toBe(testTemplateId);
      expect(resBody.name).toBe('E2E Temp Template Updated');
      expect(resBody.department).toBe('Test');
      expect(resBody.checklist).toEqual(updatedChecklist);

      // Verify DB change
      const dbTemplate = await prisma.template.findUnique({
        where: { id: testTemplateId },
      });
      expect(dbTemplate).toBeTruthy();
      expect(dbTemplate!.name).toBe('E2E Temp Template Updated');
      expect(JSON.parse(dbTemplate!.checklist) as unknown).toEqual(
        updatedChecklist,
      );

      // Verify Audit Log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'Template Updated',
          targetId: testTemplateId,
        },
      });
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].actorId).toBe('ENG-TST-1');
      expect(auditLogs[0].actorName).toBe('Eng Test A');
      expect(auditLogs[0].targetName).toBe('E2E Temp Template Updated');
      expect(auditLogs[0].productId).toBe('Test Shared Asset');
      expect(auditLogs[0].type).toBe('system');
    });

    it('should throw 403 Forbidden for a technician', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          id: testTemplateId,
          name: 'E2E Temp Template Updated',
          department: 'Test',
          checklist: [],
        })
        .expect(403);
    });

    it('should throw 403 Forbidden when engineer from other department tries to update the template', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${engineerMechToken}`)
        .send({
          id: testTemplateId,
          name: 'E2E Temp Template Updated',
          department: 'Test',
          checklist: [],
        })
        .expect(403);
    });

    it('should throw 403 Forbidden when engineer tries to change the template department to another department', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${engineerTestToken}`)
        .send({
          id: testTemplateId,
          name: 'E2E Temp Template Updated',
          department: 'Mechanic',
          checklist: [],
        })
        .expect(403);
    });

    it('should allow admin to update template in another department and modify the department', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: testTemplateId,
          name: 'Admin Updated Template',
          department: 'Mechanic',
          checklist: [{ text: 'Admin checked', requiresPhoto: false }],
        })
        .expect(200);

      const resBody = res.body as TemplateResponse;
      expect(resBody.department).toBe('Mechanic');

      // Verify DB change
      const dbTemplate = await prisma.template.findUnique({
        where: { id: testTemplateId },
      });
      expect(dbTemplate!.department).toBe('Mechanic');
    });

    it('should throw 404 Not Found if template does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .put(`/api/v1/templates/${nonExistentId}`)
        .set('Authorization', `Bearer ${engineerTestToken}`)
        .send({
          id: nonExistentId,
          name: 'Non Existent',
          department: 'Test',
          checklist: [],
        })
        .expect(404);
    });
  });
});
