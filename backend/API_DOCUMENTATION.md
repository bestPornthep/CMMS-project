# AssetIntel CMMS — API Reference Guide

This document provides a simple, structured reference for all backend endpoints available in the **AssetIntel CMMS** system.

---

## 1. Authentication & Security

Most endpoints require a JSON Web Token (JWT) sent via the HTTP `Authorization` header.

* **Format**: `Authorization: Bearer <your_jwt_token>`
* **Token Lifetime**: Configured via the `JWT_SECRET` setting on the backend.

> [!NOTE]
> All endpoints require authentication (JWT Bearer Token) unless marked as **[Public]**.

---

## 2. API Endpoints

### 🔑 Authentication (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | **[Public]** | Authenticate using employee ID and password. Returns access token. |
| `POST` | `/api/v1/auth/logout` | JWT | Invalidate the active session. |
| `GET` | `/api/v1/auth/me` | JWT | Retrieve profile details of the currently authenticated user. |
| `POST` | `/api/v1/auth/refresh` | **[Public]** | Refresh the authentication session. |

#### Request Payload: `POST /api/v1/auth/login`
```json
{
  "employeeId": "EMP123",
  "password": "your_secure_password"
}
```

#### Response: `POST /api/v1/auth/login`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 👤 Users (`/api/v1/users`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | JWT | Get all users. Optional query filters: `role`, `department`. |
| `GET` | `/api/v1/users/{id}` | JWT | Get detailed profile of a single user by ID. |
| `PATCH` | `/api/v1/users/{id}` | JWT | Update user details (e.g., department, role). |

---

### 📦 Products (`/api/v1/products`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | JWT | Get a list of all products. |
| `POST` | `/api/v1/products` | JWT | Create a new product. |

#### Request Payload: `POST /api/v1/products`
```json
{
  "id": "PROD-100",
  "name": "Industrial Compressor v2"
}
```

---

### ⚙️ Assets (`/api/v1/assets`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/assets` | JWT | Get list of assets. Optional query filters: `location`, `department`. |
| `POST` | `/api/v1/assets` | JWT | Create a new asset. |

#### Request Payload: `POST /api/v1/assets`
```json
{
  "id": "AST-202",
  "name": "Main Compressor Valve",
  "location": "PROD-100",
  "department": "Maintenance"
}
```

---

### 📋 Preventive Maintenance Tasks (`/api/v1/pm-tasks`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/pm-tasks` | JWT | Get PM tasks. Query filters: `status`, `department`, `productId`, `assignedTo`. |
| `POST` | `/api/v1/pm-tasks` | JWT | Create a new PM task. |
| `GET` | `/api/v1/pm-tasks/{id}` | JWT | Get specific PM task by ID. |
| `PUT` | `/api/v1/pm-tasks/{id}` | JWT | Update an existing PM task. |
| `DELETE` | `/api/v1/pm-tasks/{id}` | JWT | Delete a PM task. |

#### Request Payload: `POST /api/v1/pm-tasks`
```json
{
  "title": "Monthly Valve Inspection",
  "description": "Inspect and lubricate the main compressor valve.",
  "frequency": "Monthly",
  "assetId": "AST-202",
  "productId": "PROD-100",
  "department": "Maintenance",
  "nextDueDate": "2026-07-09T00:00:00.000Z",
  "estimatedHours": 1.5,
  "status": "Pending",
  "checklist": [
    {
      "text": "Clean valve casing",
      "requiresPhoto": false
    },
    {
      "text": "Lubricate joints",
      "requiresPhoto": true
    }
  ],
  "partsRequired": ["Lubricant Type A"],
  "assignedTo": "EMP123"
}
```

---

### 📄 Templates (`/api/v1/templates`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/templates` | JWT | Get templates. Optional query filter: `department`. |
| `POST` | `/api/v1/templates` | JWT | Create a new task template. |
| `DELETE` | `/api/v1/templates` | JWT | Delete template by name and department (via query params). |
| `DELETE` | `/api/v1/templates/{id}` | JWT | Delete template by unique template ID. |

---

### 🤝 Delegations (`/api/v1/delegations`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/delegations` | JWT | List delegations. Optional query filter: `status`. |
| `POST` | `/api/v1/delegations` | JWT | Delegate responsibilities/tasks to another user. |
| `PATCH` | `/api/v1/delegations/{id}/revoke` | JWT | Revoke an active delegation. |

---

### 🕵️ Audit Logs (`/api/v1/audit-logs`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/audit-logs` | JWT | Retrieve audit trail logs. Optional filters: `type`, `from`, `actorId`. |

---

## 3. Interactive Documentation & Postman

If the backend server is running locally (default port `3000`), you can access these formats:

* **Interactive Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
* **OpenAPI Raw Specification**: [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json)
* **Offline HTML**: Open [api-docs.html](file:///C:/dev/CMMS-project/backend/api-docs.html) in your browser.
* **Postman Import**: Import the automatically-generated `swagger.json` from the backend root directory into Postman to instantly populate collections.
