# PM Template & Audit Log API Requirements

The frontend has been updated to allow users to overwrite existing checklist templates and track those modifications (and deletions) via the Audit Log. 

The backend team needs to implement the following REST endpoints to support this functionality.

---

## 1. Update Existing Template

**Endpoint:** `PUT /api/v1/templates/:id`  
**Description:** Completely overwrites an existing template's data (specifically the checklist items). 

### Request Parameters
- `id` (URL Parameter): The `id` (UUID) of the template to update.

### Request Body
```json
{
  "id": "e44d32...",
  "name": "Daily Checklist",
  "department": "Facility",
  "checklist": [
    { "text": "Check machine oil levels", "requiresPhoto": false },
    { "text": "Clean main filter", "requiresPhoto": true }
  ]
}
```

### Response
**Success (200 OK)**
Returns the fully updated template object.

---

### Implementation Notes for Backend Team
- **Template Updates:** If `PUT /api/v1/templates/:id` returns a `404 Not Found` or `500 Server Error`, the frontend will block the save and alert the user that the backend is not ready. 
- **Validation:** When updating a template, ensure that the `department` of the template still matches the `department` of the user making the request (unless they are an admin).
- **Audit Logging:** The frontend does NOT send an explicit request to log the update. Just like you already do for the `DELETE /api/v1/templates/:id` route, please ensure the backend automatically writes a "Template Updated" entry to the `audit_logs` table internally when the `PUT` request completes.
