# Backend Specification: PM Schedules & Full API Gap Audit

This document covers:
1. The active bug blocking PM Schedule generation
2. A full audit of every frontend page's API usage vs. real backend endpoints
3. All missing/incomplete backend endpoints the frontend currently depends on

---

## 0. 🔴 Active Bug: `POST /api/v1/pm-tasks/schedule` Returns 404

**Reported:** 2026-07-07
**Symptom:** User clicks "Generate PM Schedule" (recurring mode) → _"Failed to generate PM schedule. Please try again."_

**Root cause:** The frontend calls `POST /api/v1/pm-tasks/schedule`. The backend source code (`src/pm-tasks.controller.ts` L265) has `@Post('schedule')` defined correctly. **However the running backend process was built from an older build that does NOT have this endpoint yet.** NestJS returns `404 Cannot POST /api/v1/pm-tasks/schedule`.

**Fix (no code change required):**
```bash
npm run build
# then restart the backend process / PM2 / service
```

---

## 1. Full Frontend → Backend API Audit

### Endpoints called by the frontend

| Method | URL | Frontend caller | Backend status |
|--------|-----|-----------------|---------------|
| `POST` | `/api/v1/auth/login` | `auth.service.ts` | ✅ Exists |
| `POST` | `/api/v1/auth/logout` | `auth.service.ts` | ✅ Exists |
| `GET` | `/api/v1/auth/me` | `auth.service.ts` | ✅ Exists |
| `POST` | `/api/v1/auth/refresh` | (token refresh) | ✅ Exists |
| `GET` | `/api/v1/users` | `auth.service.ts` | ✅ Exists |
| `PATCH` | `/api/v1/users/:id` | (admin settings) | ✅ Exists |
| `GET` | `/api/v1/assets` | `pm.service.ts loadData()` | ✅ Exists |
| `POST` | `/api/v1/assets` | `pm.service.ts createAsset()` | ❌ **MISSING — see Section 2.1** |
| `POST` | `/api/v1/products` | `pm.service.ts createProduct()` | ❌ **MISSING — see Section 2.2** |
| `GET` | `/api/v1/pm-tasks` | `pm.service.ts loadData()` | ✅ Exists |
| `POST` | `/api/v1/pm-tasks` | `pm.service.ts addPmTask()` | ✅ Exists |
| `PUT` | `/api/v1/pm-tasks/:id` | `pm.service.ts updateTask()` | ✅ Exists |
| `DELETE` | `/api/v1/pm-tasks/:id` | `pm.service.ts deleteTask()` | ✅ Exists (admin only) |
| `POST` | `/api/v1/pm-tasks/schedule` | `pm.service.ts addPmSchedule()` | ⚠️ In source, stale build (Section 0) |
| `PUT` | `/api/v1/pm-tasks/schedule/:id` | `pm.service.ts updatePmSchedule()` | ⚠️ In source, stale build (Section 0) |
| `GET` | `/api/v1/templates` | `pm.service.ts loadData()` | ✅ Exists |
| `POST` | `/api/v1/templates` | `pm.service.ts saveTemplate()` | ✅ Exists |
| `PUT` | `/api/v1/templates/:id` | `pm.service.ts updateTemplate()` | ✅ Exists |
| `DELETE` | `/api/v1/templates/:id` | `pm.service.ts deleteTemplate()` | ✅ Exists |
| `POST` | `/api/v1/delegations` | `auth.service.ts grantDelegation()` | ✅ Exists |
| `PATCH` | `/api/v1/delegations/:id/revoke` | `auth.service.ts revokeDelegation()` | ✅ Exists |
| `GET` | `/api/v1/audit-logs` | `pm-audit.component.ts` | ✅ Exists |

---

## 2. Missing Backend Endpoints

### 2.1 🔴 `POST /api/v1/assets` — Create new Asset

**Called from:** `pm-create.component.ts` → `pmService.createAsset()` → `api.createAsset()`
**Triggered when:** User types a new Asset ID in the PM Create form that doesn't exist in the DB yet.

**Request body:**
```json
{
  "id": "string",
  "name": "string",
  "location": "string (productId)",
  "department": "string"
}
```

**Required backend behavior:**
1. Validate requesting user has `pm.create.submit` permission for `location` (productId).
2. Validate `location` exists in `cmms_products`.
3. Return `409 Conflict` if `id` already exists.
4. Insert row into `cmms_assets`.
5. Return the created asset.

**Currently:** `assets.controller.ts` only has `@Get()`. No `@Post()` — frontend gets `404`.

---

### 2.2 🔴 `POST /api/v1/products` — Create new Product

**Called from:** `pm-create.component.ts` → `pmService.createProduct()` → `api.createProduct()`
**Triggered when:** User types a new Product ID that doesn't exist in the DB yet.

**Request body:**
```json
{
  "id": "string",
  "name": "string"
}
```

**Required backend behavior:**
1. Restrict to `admin` or `manager` only.
2. Return `409 Conflict` if `id` already exists.
3. Insert row into `cmms_products`.

**Currently:** `products.controller.ts` — verify if `@Post()` exists. Frontend call likely returns `404`.

---

### 2.3 🟡 Tech Debt: `scheduleId` Column Missing on `cmms_pm_tasks`

**Impact:** All pages that group recurring tasks by series rely on regex parsing `[SeriesID: xxx]` embedded in the `description` field. This is fragile and pollutes descriptions.

**Affected pages / locations:**
- `pm-assign.component.ts` — L58, L90, L321, L385
- `pm-record.component.ts` — L129
- `pm-calendar.component.ts` — L140, L145, L165, L173
- `pm-create.component.ts` — embeds `[SeriesID:]` at creation time (`pm-tasks.controller.ts` L289)

**Fix:** Add `scheduleId` column — minimal change, no new endpoints needed:

**`prisma/schema.prisma`** — `PmTask` model:
```prisma
scheduleId  String?  @map("schedule_id")
```

**`src/dto/create-pm-task.dto.ts`:**
```typescript
@IsOptional()
@IsString()
scheduleId?: string;
```

**`src/pm-tasks.controller.ts`** — `create()` method:
```typescript
scheduleId: body.scheduleId || null,   // ADD to createTaskWithRetry call
```

**`src/pm-tasks.controller.ts`** — `update()` method, inside `data: any = {}` block:
```typescript
if (body.scheduleId !== undefined) data.scheduleId = body.scheduleId;  // ADD
```

Then run:
```bash
npx prisma migrate dev --name add_schedule_id
```

Once deployed, the frontend will send `scheduleId` on every task in a series and stop embedding `[SeriesID:]` in descriptions.

---

## 3. Existing Cron Jobs (Already Implemented — No Action Needed)

`scheduler.service.ts` already runs two hourly jobs:
- **`expireDelegations`** — marks expired delegations as `revoked`, writes audit log
- **`markOverdueTasks`** — marks `Pending` tasks whose `nextDueDate < now` as `Overdue`

---

## 4. Phase 2: Full Schedule Model (Future)

### New Model: `cmms_pm_schedules`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30) PK` | e.g. `SCH-FAC-0001` |
| `title` | `VARCHAR(200) NOT NULL` | |
| `description` | `NVARCHAR(MAX)` | |
| `frequency` | `VARCHAR(50) NOT NULL` | `Daily`, `Weekly`, `Monthly`, `Yearly`, or `N unit` |
| `asset_id` | `VARCHAR(30) NOT NULL FK` | |
| `product_id` | `VARCHAR(20) NOT NULL FK` | |
| `department` | `VARCHAR(50) NOT NULL` | |
| `estimated_hours` | `DECIMAL(5,2) NOT NULL` | |
| `checklist` | `NVARCHAR(MAX) DEFAULT '[]'` | |
| `parts_required` | `NVARCHAR(MAX) DEFAULT '[]'` | |
| `assigned_to` | `VARCHAR(20) FK` | Default assignee for generated tasks |
| `created_by` | `VARCHAR(20) FK` | |
| `created_at` | `DATETIME DEFAULT NOW()` | |
| `updated_at` | `DATETIME DEFAULT NOW()` | |

### `POST /api/v1/pm-schedules`
Creates a schedule and generates PM Tasks 1 year in advance.
1. Insert into `cmms_pm_schedules`.
2. Calculate dates from `startDate` up to 1 year.
3. Batch insert into `cmms_pm_tasks` with `schedule_id` set.
4. Return the created schedule.

### `PUT /api/v1/pm-schedules/:id`
Updates schedule and cascades to future pending tasks.
1. Update `cmms_pm_schedules`.
2. Find all `cmms_pm_tasks` where `schedule_id = :id` AND `status = 'Pending'`.
3. Update matching tasks with new `checklist`, `description`, `assigned_to`.

### `DELETE /api/v1/pm-schedules/:id`
Deletes schedule and cleans up pending tasks.
1. Delete all `cmms_pm_tasks` where `schedule_id = :id` AND `status = 'Pending'`.
2. Delete `cmms_pm_schedules` row.
3. Tasks in non-pending status remain (historical record).

### Top-Up Cron Job
Add to `scheduler.service.ts` — runs nightly. For each active `cmms_pm_schedule`, ensure there is always a rolling 1-year buffer of tasks in `cmms_pm_tasks`.

---

## 5. Priority Order for Backend Team

| Priority | Item |
|----------|------|
| 🔴 P0 | **Rebuild & redeploy** backend so `POST /api/v1/pm-tasks/schedule` works (Section 0) |
| 🔴 P1 | **Add `POST /api/v1/assets`** in `assets.controller.ts` (Section 2.1) |
| 🔴 P1 | **Add `POST /api/v1/products`** in `products.controller.ts` (Section 2.2) |
| 🟡 P2 | **Add `scheduleId` column** to `cmms_pm_tasks` via migration (Section 2.3) |
| 🟢 P3 | Build full `cmms_pm_schedules` model and CRUD endpoints (Section 4) |
