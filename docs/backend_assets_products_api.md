# Backend API Requirements for On-the-Fly Asset & Product Creation

The frontend has been updated to allow users to type *new* Products and Assets directly into the "Create PM" form. If an unrecognized Product or Asset is typed, the frontend will automatically invoke the following new API endpoints before submitting the PM Task. 

Please implement these two endpoints on the backend:

### 1. Create Product
**Endpoint:** `POST /api/v1/products`
**Description:** Registers a new product. The frontend uses the same typed string for both the ID and the Name.
**Request Body:**
```json
{
  "id": "string",
  "name": "string"
}
```
**Response:** `201 Created`
**Important Logic:** Since user permissions are scoped by Product ownership, the backend must ensure that the user who creates this Product is automatically granted ownership/access to it (or it is added to their `ownedProducts`), so they can immediately see it in their accessible lists.

---

### 2. Create Asset
**Endpoint:** `POST /api/v1/assets`
**Description:** Registers a new asset. The frontend uses the same typed string for both the ID and the Name.
**Request Body:**
```json
{
  "id": "string",
  "name": "string",
  "location": "string", // This is the Product ID
  "department": "string" // The selected Department
}
```
**Response:** `201 Created`

**Note:** If these endpoints fail, the frontend will abort the PM Task creation and show an error alert.
