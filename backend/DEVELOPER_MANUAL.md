# AssetIntel CMMS — Backend Developer Manual

This document provides setup, run, configuration, and deployment instructions for backend developers working on the AssetIntel CMMS backend.

---

## 1. Local Development Setup

To run the NestJS server locally, follow these steps:

### Prerequisites
- Node.js (version 20 or higher is recommended)
- npm (Node Package Manager)
- Access to a Microsoft SQL Server database (configured in [.env](file:///C:/dev/CMMS-project/backend/.env))

### Installation Steps
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the required Node dependencies:
   ```bash
   npm install
   ```
3. Generate the Prisma Client to enable database access:
   ```bash
   npx prisma generate
   ```
4. Start the NestJS server in watch (development) mode:
   ```bash
   npm run start:dev
   ```
   The local server will start and bind to `http://localhost:3000`.

---

## 2. Configuration & Environment Variables

The backend application is configured using environment variables located in the [.env](file:///C:/dev/CMMS-project/backend/.env) file at the root of the backend folder.

Here is a summary of the environment variables used:

| Variable | Description | Example Value |
|---|---|---|
| `DATABASE_URL` | Prisma MSSQL connection string | `sqlserver://SQL205\PSQL205;database=KETL_Tester;...` |
| `JWT_SECRET` | Secret key used to sign JSON Web Tokens | `assetintel_very_secret_key_12345` |
| `PORT` | Port number the server listens on | `3000` |

> [!WARNING]
> Do not commit sensitive credentials to version control. Maintain environment variables securely.

---

## 3. Database Management (Prisma)

The project uses Prisma ORM to connect to a SQL Server database. The schema is defined in [schema.prisma](file:///C:/dev/CMMS-project/backend/prisma/schema.prisma).

### Common Commands
- **Generate Client**: Regenerate client classes after schema changes:
  ```bash
  npx prisma generate
  ```
- **Sync/Push Schema**: Push schema modifications to the database (without migrations):
  ```bash
  npx prisma db push
  ```
- **Database Seed**: Seed the database with initial/test users and mock data:
  ```bash
  npx prisma db seed
  ```
- **Prisma Studio**: Open a graphical editor to view/edit database tables:
  ```bash
  npx prisma studio
  ```

---

## 4. Docker Deployment

For staging and production deployment, you can run the backend service in a Docker container.

### Docker Files
- [Dockerfile](file:///C:/dev/CMMS-project/backend/Dockerfile): Multi-stage build that compiles NestJS and outputs a slim runtime image.
- [docker-compose.yml](file:///C:/dev/CMMS-project/backend/docker-compose.yml): Runs the service on port `3000` loading configuration from the local [.env](file:///C:/dev/CMMS-project/backend/.env) file.

### Deployment Commands
- **Build and Start Container**:
  ```bash
  docker compose up -d --build
  ```
- **View Container Logs**:
  ```bash
  docker compose logs -f
  ```
- **Stop Container**:
  ```bash
  docker compose down
  ```

---

## 5. Directory Structure & Key Files

- [package.json](file:///C:/dev/CMMS-project/backend/package.json): Defines npm script commands and dependencies.
- [tsconfig.json](file:///C:/dev/CMMS-project/backend/tsconfig.json): TypeScript compilation options.
- [prisma.config.ts](file:///C:/dev/CMMS-project/backend/prisma.config.ts): Configuration for Prisma schema paths and migrations.
- [main.ts](file:///C:/dev/CMMS-project/backend/src/main.ts): The application entrypoint.
- [app.module.ts](file:///C:/dev/CMMS-project/backend/src/app.module.ts): Root NestJS module [AppModule](file:///C:/dev/CMMS-project/backend/src/app.module.ts).
- [prisma.service.ts](file:///C:/dev/CMMS-project/backend/src/prisma.service.ts): Database client injection provider [PrismaService](file:///C:/dev/CMMS-project/backend/src/prisma.service.ts).

---

## 6. API Documentation & Postman Integration

The backend automatically generates interactive API documentation using OpenAPI/Swagger.

### Accessing Swagger UI & Standalone Docs
You can access the API documentation in several ways:
- **Interactive Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs) (requires backend server running)
- **OpenAPI JSON Document**: [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json) (requires backend server running)
- **Offline Standalone HTML Docs**: Open the [api-docs.html](file:///C:/dev/CMMS-project/backend/api-docs.html) file directly in any browser (works completely offline, no server running required!).

### Importing to Postman

To use the API documentation in Postman:
1. Open Postman and click **Import**.
2. Choose one of two options:
   - **File Upload**: Upload the [swagger.json](file:///C:/dev/CMMS-project/backend/swagger.json) file automatically generated in the root of the backend directory whenever the server starts/rebuilds.
   - **Link/URL**: Paste the live JSON URL: `http://localhost:3000/api/docs-json` (requires the backend server to be running).
3. Postman will automatically import all endpoints, query parameters, path variables, request bodies, and headers.

### Testing Protected Endpoints
Most endpoints require bearer JWT authentication.
1. Authenticate by making a `POST` request to `/api/v1/auth/login` with `employeeId` and `password`.
2. Copy the returned `accessToken`.
3. In Postman, go to your imported Collection, select the **Authorization** tab, set the type to **Bearer Token**, and paste your `accessToken`.
