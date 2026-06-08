# AssetIntel CMMS — Backend API

NestJS REST API for the AssetIntel CMMS frontend.

---

## Running the Server

```bash
npm install
npm run start:dev
```

Server starts at **`http://localhost:3000`**

---

## Network Access

The server binds to `0.0.0.0` and has CORS open to all origins (`*`).

| Access from | URL |
|---|---|
| This machine | `http://localhost:3000` |
| **Same LAN (other devices)** | **`http://10.144.15.76:3000`** |

> **Frontend team:** Point your `environment.ts` → `apiUrl` at `http://10.144.15.76:3000` to test from another device on the same network.

---

## Base URL

All endpoints are prefixed with `/api/v1`.

```
http://10.144.15.76:3000/api/v1
```

---

## Authentication

Login returns a JWT. Pass it as a Bearer token on all subsequent requests.

```
POST /api/v1/auth/login
{ "employeeId": "MGR001", "password": "mgr123" }

→ { "token": "eyJ...", "refreshToken": "RT-...", "user": { ... } }
```

All other endpoints require:
```
Authorization: Bearer <token>
```

---

## Test Credentials

### Admin
| Employee ID | Password | Role | Department |
|-------------|----------|------|------------|
| `ADM001` | `adm123` | Admin | All |

### Manager
| Employee ID | Password | Role | Department |
|-------------|----------|------|------------|
| `MGR001` | `mgr123` | Manager | All |
| `MGR002` | `mgr123` | Manager | All |
| `MGR003` | `mgr123` | Manager | All |

### Engineer (password `eng123` for all)
| Employee ID | Department | Owned Products |
|-------------|-----------|----------------|
| `ENG-TST-1` | Test | CUST-001, CUST-002 |
| `ENG-TST-2` | Test | CUST-003, CUST-004 |
| `ENG-MEC-1` | Mechanic | CUST-002, CUST-004 |
| `ENG-MFG-1` | Manufacturing | CUST-003, CUST-001 |
| `ENG-MTN-1` | Maintenance | CUST-005, CUST-001 |
| `ENG-FAC-1` | Facility | CUST-006, CUST-001 |

### Technician (password `tech123` for all)
| Employee ID | Department |
|-------------|-----------|
| `TECH-TST-1` | Test |
| `TECH-TST-2` | Test |
| `TECH-MEC-1` | Mechanic |
| `TECH-MFG-1` | Manufacturing |
| `TECH-MTN-1` | Maintenance |
| `TECH-FAC-1` | Facility |

> Full list: 1 admin, 3 managers, 15 engineers (3 per dept), 20 technicians (4 per dept)

---

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/auth/login` | — | Returns JWT |
| `POST` | `/auth/logout` | ✅ | |
| `GET` | `/auth/me` | ✅ | Current user |
| `POST` | `/auth/refresh` | — | Rotate access token |
| `GET` | `/users` | ✅ | `?role=technician&department=Test` |
| `GET` | `/users/:id` | ✅ | |
| `PATCH` | `/users/:id` | ✅ Admin only | |
| `GET` | `/products` | ✅ | |
| `GET` | `/assets` | ✅ | `?location=CUST-001&department=Test` |
| `GET` | `/pm-tasks` | ✅ | `?status=Pending&department=Test&productId=CUST-001` |
| `POST` | `/pm-tasks` | ✅ | |
| `PUT` | `/pm-tasks/:id` | ✅ | |
| `DELETE` | `/pm-tasks/:id` | ✅ Admin only | |
| `GET` | `/templates` | ✅ | `?department=Test` |
| `POST` | `/templates` | ✅ | |
| `DELETE` | `/templates/:id` | ✅ | |
| `GET` | `/delegations` | ✅ | `?status=active` |
| `POST` | `/delegations` | ✅ | |
| `PATCH` | `/delegations/:id/revoke` | ✅ | |
| `GET` | `/audit-logs` | ✅ Engineer/Manager | `?type=security&from=2025-01-01` |

---

## Error Format

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Product access denied for CUST-003"
}
```

| Code | Meaning |
|------|---------|
| `400` | Validation error / bad input |
| `401` | Missing or expired token |
| `403` | Insufficient role/permission |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate template name) |
