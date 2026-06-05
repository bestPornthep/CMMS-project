# AssetIntel CMMS — Backend Specification

> Complete backend contract for the frontend `ApiService` stubs.
> Every method in [api.service.ts](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/core/services/api.service.ts) maps 1:1 to a REST endpoint below.

---

## Database Schema (PostgreSQL)

### `departments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PK` | |
| `name` | `VARCHAR(50) UNIQUE` | `Facility`, `Mechanic`, `Manufacturing`, `Maintenance`, `Test` |

### `products` (customers / sites)
| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(20) PK` | e.g. `CUST-001` |
| `name` | `VARCHAR(100)` | e.g. `Precision Tech Co` |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `employee_id` | `VARCHAR(20) PK` | e.g. `ENG-TST-1` |
| `name` | `VARCHAR(100) NOT NULL` | |
| `initials` | `VARCHAR(5) NOT NULL` | |
| `password_hash` | `VARCHAR(255) NOT NULL` | bcrypt |
| `base_role` | `ENUM('admin','manager','engineer','technician') NOT NULL` | |
| `role_label` | `VARCHAR(50) NOT NULL` | display label e.g. `Senior Engineer` |
| `department` | `VARCHAR(50) NOT NULL` | FK → departments.name, or `All` for admin/manager |
| `permissions` | `JSONB DEFAULT '[]'` | explicit permission overrides |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP DEFAULT NOW()` | |

### `user_owned_products`
| Column | Type | Notes |
|--------|------|-------|
| `employee_id` | `VARCHAR(20) FK → users` | |
| `product_id` | `VARCHAR(20) FK → products` | or `*` for wildcard |
| | `PK (employee_id, product_id)` | |

### `assets`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30) PK` | e.g. `CH-P1-01` |
| `name` | `VARCHAR(100) NOT NULL` | |
| `department` | `VARCHAR(50) NOT NULL` | FK → departments.name |
| `location` | `VARCHAR(20) NOT NULL FK → products` | = product_id |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

### `pm_tasks`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30) PK` | e.g. `PM-FAC-0001` — auto-generated |
| `title` | `VARCHAR(200) NOT NULL` | |
| `description` | `TEXT` | |
| `frequency` | `VARCHAR(50) NOT NULL` | `Daily` / `Weekly` / `Monthly` / `Quarterly` / `Yearly` / custom string |
| `asset_id` | `VARCHAR(30) NOT NULL FK → assets` | |
| `product_id` | `VARCHAR(20) NOT NULL FK → products` | |
| `department` | `VARCHAR(50) NOT NULL` | |
| `next_due_date` | `TIMESTAMP NOT NULL` | |
| `estimated_hours` | `DECIMAL(5,2) NOT NULL` | |
| `actual_hours` | `DECIMAL(5,2)` | nullable |
| `status` | `ENUM('Pending','In Progress','Pending Approval','Done','Overdue') DEFAULT 'Pending'` | |
| `checklist` | `JSONB DEFAULT '[]'` | `[{text, done, requiresPhoto?, photoUrl?}]` |
| `parts_required` | `JSONB DEFAULT '[]'` | `string[]` |
| `parts_used` | `JSONB DEFAULT '[]'` | `string[]` |
| `record_notes` | `TEXT` | structured note format with `[Type\|timestamp]:` prefixes |
| `assigned_to` | `VARCHAR(20) FK → users` | nullable |
| `assigned_at` | `TIMESTAMP` | nullable |
| `assigned_by` | `VARCHAR(20) FK → users` | nullable |
| `completed_by` | `VARCHAR(20) FK → users` | nullable |
| `completed_at` | `TIMESTAMP` | nullable |
| `approved_by` | `VARCHAR(20) FK → users` | nullable |
| `approved_at` | `TIMESTAMP` | nullable |
| `rejected_by` | `VARCHAR(20) FK → users` | nullable |
| `rejected_at` | `TIMESTAMP` | nullable |
| `created_by` | `VARCHAR(20) FK → users` | nullable |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP DEFAULT NOW()` | auto-update on every write |

### `templates`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | |
| `name` | `VARCHAR(100) NOT NULL` | |
| `department` | `VARCHAR(50) NOT NULL` | |
| `checklist` | `JSONB NOT NULL` | `[{text, requiresPhoto?}]` |
| `created_by` | `VARCHAR(20) FK → users` | |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP DEFAULT NOW()` | |
| | `UNIQUE (name, department)` | prevents duplicate names per dept |

### `delegations`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | e.g. `DEL-xxxx` |
| `grantor_id` | `VARCHAR(20) NOT NULL FK → users` | who granted |
| `grantee_id` | `VARCHAR(20) NOT NULL FK → users` | who received |
| `product_id` | `VARCHAR(20) NOT NULL FK → products` | |
| `permissions` | `JSONB NOT NULL` | `string[]` of permission keys |
| `status` | `ENUM('active','revoked') DEFAULT 'active'` | |
| `valid_until` | `TIMESTAMP NOT NULL` | auto-revoke after this |
| `granted_at` | `TIMESTAMP DEFAULT NOW()` | |

### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PK` | auto-increment |
| `action` | `VARCHAR(200) NOT NULL` | |
| `actor_id` | `VARCHAR(20) NOT NULL FK → users` | |
| `actor_name` | `VARCHAR(100) NOT NULL` | denormalized for fast reads |
| `target_id` | `VARCHAR(50)` | nullable — user or resource id |
| `target_name` | `VARCHAR(100)` | nullable |
| `target_is_user` | `BOOLEAN DEFAULT false` | |
| `product_id` | `VARCHAR(20)` | nullable |
| `type` | `ENUM('security','system','data') NOT NULL` | |
| `timestamp` | `TIMESTAMP DEFAULT NOW()` | indexed |

---

## REST API Endpoints

Base URL: `${environment.apiUrl}/api/v1`

### Authentication

| Method | Path | Request Body | Response | Notes |
|--------|------|-------------|----------|-------|
| `POST` | `/auth/login` | `{ employeeId: string, password: string }` | `{ token: string, refreshToken: string, user: User }` | JWT access (8h) + refresh (7d) |
| `POST` | `/auth/logout` | — | `204 No Content` | Blacklist token server-side |
| `GET` | `/auth/me` | — | `User` | Decode from JWT, return fresh user data |
| `POST` | `/auth/refresh` | `{ refreshToken: string }` | `{ token: string }` | Rotate access token |

### Users

| Method | Path | Query | Response | Permission |
|--------|------|-------|----------|------------|
| `GET` | `/users` | `?role=technician&department=Test` | `User[]` | Any authenticated |
| `GET` | `/users/:id` | — | `User` | Any authenticated |
| `PATCH` | `/users/:id` | — | `User` | `admin` only |

### Products

| Method | Path | Query | Response | Permission |
|--------|------|-------|----------|------------|
| `GET` | `/products` | — | `Product[]` | Any authenticated |

### Assets

| Method | Path | Query | Response | Permission |
|--------|------|-------|----------|------------|
| `GET` | `/assets` | `?location=CUST-001&department=Test` | `Asset[]` | Any authenticated |

### PM Tasks

| Method | Path | Body / Query | Response | Permission |
|--------|------|-------------|----------|------------|
| `GET` | `/pm-tasks` | `?status=Pending&department=Test&productId=CUST-001&assignedTo=TECH-TST-1` | `PMTask[]` | Scoped by role |
| `POST` | `/pm-tasks` | `Omit<PMTask, 'id'>` | `PMTask` | `pm.create.submit` + product ownership check |
| `PUT` | `/pm-tasks/:id` | `PMTask` | `PMTask` | `pm.assign.submit` or `pm.record.submit` |
| `DELETE` | `/pm-tasks/:id` | — | `204` | `admin` only |

> [!IMPORTANT]
> **Backend MUST validate on `POST /pm-tasks`:**
> 1. `asset.location === body.productId`
> 2. `asset.department === body.department`
> 3. User has product ownership or delegation for `body.productId`

### Templates

| Method | Path | Body / Query | Response | Permission |
|--------|------|-------------|----------|------------|
| `GET` | `/templates` | `?department=Test` | `Template[]` | Scoped by department |
| `POST` | `/templates` | `{ name, department, checklist }` | `Template` | `pm.create.submit` + same dept check |
| `DELETE` | `/templates/:id` | — | `204` | Same department only |

### Delegations

| Method | Path | Body | Response | Permission |
|--------|------|------|----------|------------|
| `GET` | `/delegations` | `?status=active` | `Delegation[]` | `engineer`, `manager`, `admin` |
| `POST` | `/delegations` | `{ targetIds: string[], products: string[], validUntil: Date }` | `Delegation[]` | `pm.permission.delegate` |
| `PATCH` | `/delegations/:id/revoke` | — | `204` | `pm.permission.revoke` |

### Audit Logs

| Method | Path | Query | Response | Permission |
|--------|------|-------|----------|------------|
| `GET` | `/audit-logs` | `?type=security&from=2025-01-01&actorId=ENG-TST-1` | `AuditLog[]` | `pm.audit.view` |

---

## ApiService → Endpoint Mapping

Exact mapping from [api.service.ts](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/core/services/api.service.ts) stub methods to REST calls:

| ApiService Method | HTTP Call |
|------------------|-----------|
| `getAssets()` | `GET /api/v1/assets` |
| `getTasks()` | `GET /api/v1/pm-tasks` |
| `createTask(task)` | `POST /api/v1/pm-tasks` |
| `updateTask(task)` | `PUT /api/v1/pm-tasks/${task.id}` |
| `deleteTask(id)` | `DELETE /api/v1/pm-tasks/${id}` |
| `getTemplates()` | `GET /api/v1/templates` |
| `createTemplate(tpl)` | `POST /api/v1/templates` |
| `deleteTemplate(name, dept)` | `DELETE /api/v1/templates/${id}` |
| `verifyLogin(id, pwd)` | `POST /api/v1/auth/login` |
| `getUser(id)` | `GET /api/v1/users/${id}` |
| `getAllUsers()` | `GET /api/v1/users` |
| `updateUser(id, patch)` | `PATCH /api/v1/users/${id}` |
| `getAuditLogs(userId, role, dept)` | `GET /api/v1/audit-logs` |

---

## Authentication — JWT

```
POST /api/v1/auth/login
Request:  { "employeeId": "ENG-TST-1", "password": "eng123" }
Response: { "token": "eyJ...", "refreshToken": "...", "user": { ... } }

All subsequent requests:
Authorization: Bearer <token>
```

**Access token payload:**
```json
{
  "sub": "ENG-TST-1",
  "role": "engineer",
  "department": "Test",
  "ownedProducts": ["CUST-001", "CUST-002"],
  "iat": 1717564800,
  "exp": 1717593600
}
```

**Refresh token:** opaque, stored in `refresh_tokens` table, 7-day expiry.

---

## Standard Error Response

All errors return:
```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Product access denied for CUST-003"
}
```

| HTTP Code | When |
|-----------|------|
| `400` | Validation error, missing fields |
| `401` | No token / expired token |
| `403` | Permission denied (valid token, insufficient role/scope) |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate template name + department) |

---

## RBAC — Permission Matrix

| Permission | Technician | Engineer | Manager | Admin |
|-----------|-----------|---------|---------|-------|
| `pm.dashboard.view` | ✅ | ✅ | ✅ | ✅ |
| `pm.create.view` | ❌ | ✅ | ✅ | ✅ |
| `pm.create.submit` | ❌ | ✅ (own products) | ✅ | ✅ |
| `pm.assign.view` | ❌ | ✅ | ✅ | ✅ |
| `pm.assign.submit` | ❌ | ✅ (own products) | ✅ | ✅ |
| `pm.record.view` | ✅ (assigned only) | ✅ | ✅ | ✅ |
| `pm.record.submit` | ✅ (assigned only) | ✅ (approve) | ✅ | ✅ |
| `pm.calendar.view` | ✅ | ✅ | ✅ | ✅ |
| `pm.reports.view` | ❌ | ✅ | ✅ | ✅ |
| `pm.reports.export` | ❌ | ✅ | ✅ | ✅ |
| `pm.audit.view` | ❌ | ✅ | ✅ | ❌ |
| `pm.permission.delegate` | ❌ | ✅ (own dept techs only) | ✅ | ✅ |
| `pm.permission.revoke` | ❌ | ✅ | ✅ | ✅ |
| `system.user.manage` | ❌ | ❌ | ❌ | ✅ |
| `system.role.manage` | ❌ | ❌ | ❌ | ✅ |
| `system.product.manage` | ❌ | ❌ | ❌ | ✅ |

> Technicians can temporarily gain `pm.create.*`, `pm.assign.*`, `pm.record.*`, `pm.calendar.view` via an active `Delegation`.

---

## Delegation Business Rules

1. **Engineers** can delegate to technicians **in the same department** only
2. **Managers/Admins** can delegate to anyone
3. **Technicians** cannot delegate (unless they themselves hold a delegation with `pm.permission.delegate`)
4. **Max duration**: 365 days
5. **Auto-expire**: backend cron checks `valid_until` and sets `status = 'revoked'`
6. **Conflict check**: reject if grantee already has an active delegation for the same product

---

## Frontend → Backend Connection Steps

When the backend is ready:

### 1. Add environment config
```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'
};
```

### 2. Add HttpClient to app
```ts
// src/app/app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    // ...existing providers
  ]
};
```

### 3. Create auth interceptor
```ts
// src/app/core/interceptors/auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('assetintel_auth');
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
```

### 4. Replace ApiService method bodies
```ts
// BEFORE (stub):
getTasks(): Promise<PMTask[]> {
  return Promise.resolve(this.tasks.map(t => ({ ...t })));
}

// AFTER (real):
private http = inject(HttpClient);
getTasks(): Promise<PMTask[]> {
  return firstValueFrom(this.http.get<PMTask[]>(`${environment.apiUrl}/api/v1/pm-tasks`));
}
```

### 5. Update AuthService.login()
```ts
// Store JWT token instead of user object
async login(employeeId: string, password: string): Promise<boolean> {
  const res = await firstValueFrom(
    this.http.post<{ token: string; user: User }>(`${environment.apiUrl}/api/v1/auth/login`, { employeeId, password })
  );
  localStorage.setItem(AUTH_KEY, res.token);
  this.currentUserSignal.set(res.user);
  return true;
}
```

---

## Recommended Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | **Node.js 20 LTS + TypeScript 5** | Same language as frontend |
| Framework | **NestJS 10** | Decorator-based, matches Angular patterns |
| ORM | **Prisma 5** | Type-safe queries, auto-migrations |
| Database | **PostgreSQL 16** | JSONB for checklist/parts/permissions |
| Auth | **@nestjs/jwt + passport-jwt** | Stateless JWT |
| Validation | **class-validator + class-transformer** | DTO validation via decorators |
| File storage | **S3 / MinIO** | For checklist photo uploads |
| Task scheduler | **@nestjs/schedule** | Cron for delegation auto-expiry + overdue status |
| API docs | **@nestjs/swagger** | Auto-generate OpenAPI spec |

---

## Prisma Schema (Reference)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  admin
  manager
  engineer
  technician
}

enum TaskStatus {
  Pending
  InProgress       @map("In Progress")
  PendingApproval  @map("Pending Approval")
  Done
  Overdue
}

enum DelegationStatus {
  active
  revoked
}

enum AuditType {
  security
  system
  data
}

model Department {
  id   Int    @id @default(autoincrement())
  name String @unique
  @@map("departments")
}

model Product {
  id        String   @id
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  @@map("products")
}

model User {
  employeeId   String   @id @map("employee_id")
  name         String
  initials     String
  passwordHash String   @map("password_hash")
  baseRole     Role     @map("base_role")
  roleLabel    String   @map("role_label")
  department   String
  permissions  Json     @default("[]")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  ownedProducts UserOwnedProduct[]
  @@map("users")
}

model UserOwnedProduct {
  employeeId String @map("employee_id")
  productId  String @map("product_id")
  user       User   @relation(fields: [employeeId], references: [employeeId])

  @@id([employeeId, productId])
  @@map("user_owned_products")
}

model Asset {
  id         String   @id
  name       String
  department String
  location   String
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("assets")
}

model PmTask {
  id             String     @id
  title          String
  description    String?
  frequency      String
  assetId        String     @map("asset_id")
  productId      String     @map("product_id")
  department     String
  nextDueDate    DateTime   @map("next_due_date")
  estimatedHours Decimal    @map("estimated_hours") @db.Decimal(5, 2)
  actualHours    Decimal?   @map("actual_hours") @db.Decimal(5, 2)
  status         TaskStatus @default(Pending)
  checklist      Json       @default("[]")
  partsRequired  Json       @default("[]") @map("parts_required")
  partsUsed      Json       @default("[]") @map("parts_used")
  recordNotes    String?    @map("record_notes")
  assignedTo     String?    @map("assigned_to")
  assignedAt     DateTime?  @map("assigned_at")
  assignedBy     String?    @map("assigned_by")
  completedBy    String?    @map("completed_by")
  completedAt    DateTime?  @map("completed_at")
  approvedBy     String?    @map("approved_by")
  approvedAt     DateTime?  @map("approved_at")
  rejectedBy     String?    @map("rejected_by")
  rejectedAt     DateTime?  @map("rejected_at")
  createdBy      String?    @map("created_by")
  createdAt      DateTime   @default(now()) @map("created_at")
  updatedAt      DateTime   @updatedAt @map("updated_at")
  @@map("pm_tasks")
}

model Template {
  id         String   @id @default(uuid())
  name       String
  department String
  checklist  Json
  createdBy  String?  @map("created_by")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([name, department])
  @@map("templates")
}

model Delegation {
  id          String           @id @default(uuid())
  grantorId   String           @map("grantor_id")
  granteeId   String           @map("grantee_id")
  productId   String           @map("product_id")
  permissions Json
  status      DelegationStatus @default(active)
  validUntil  DateTime         @map("valid_until")
  grantedAt   DateTime         @default(now()) @map("granted_at")
  @@map("delegations")
}

model AuditLog {
  id           Int       @id @default(autoincrement())
  action       String
  actorId      String    @map("actor_id")
  actorName    String    @map("actor_name")
  targetId     String?   @map("target_id")
  targetName   String?   @map("target_name")
  targetIsUser Boolean   @default(false) @map("target_is_user")
  productId    String?   @map("product_id")
  type         AuditType
  timestamp    DateTime  @default(now())
  @@map("audit_logs")
}
```
