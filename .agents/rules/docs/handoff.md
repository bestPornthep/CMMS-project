# Handoff

## Completed Milestones
- **RBAC Implementation**: Strict Tech > Eng > Mgr > Adm hierarchy in `AuthService` (TDD-driven).
- **Product & Delegation Scoping**: Engineers restricted to owned products and same-department technician delegation.
- **Dynamic UI Integrations**: Navigation layout, `pm-create`, and `pm-assign` components actively enforce RBAC scope for dropdowns and views.
- **Template Management**: Object-based deletion, global template protection, department filtering for Eng/Tech.
- **Assign Dropdown Fix**: `overflow:visible` on table wrapper to prevent clipping of dropdown menus.
- **Delegation UUIDs**: Replaced random IDs with legacy v4 UUID approach to prevent collisions during concurrent creation.
- **Sequential PM Task IDs**: Replaced random UUIDs with `PM-{DEPT}-{xxxx}` format where `DEPT` is a 3-letter code and `xxxx` is a strictly sequential 4-digit run-number (e.g. `PM-FAC-0001`).
- **Eng Ownership Enforcement**: Implemented `canManageTask()` in `pm-assign`. Engineers are now visually restricted from seeing, reassigning, or managing work owned by other engineers in the pending and assigned task lists.
- **Create PM Asset Filtering**: Updated `availableAssets()` in `pm-create` to dynamically filter the asset dropdown list based on the user's selected product and department.
- **Strict Product-Asset Validation**: Added bi-directional validation in `pm-create` and `pm-assign` preventing users from submitting, creating, or assigning tasks with mismatched Product and Asset combinations. Changing the product resets mismatched assets, and selecting an asset strictly locks the product and department. Asset selection is globally restricted to only the user's `accessibleProducts` scope.
- **Comprehensive API Security**: Added strict server-side validation into `pm.service.ts` and `auth.service.ts` to block manual/direct API invocations of restricted actions (`addPmTask`, `updateTask`, `saveTemplate`, `deleteTemplate`, `grantDelegation`, `revokeDelegation`) depending on role scope.
- **Route-Level Security Enforcement**: Extended `authGuard` using `CanActivateChildFn` applied directly in `app.routes.ts` to actively redirect and block users attempting to manually navigate to unauthorized URL paths.

## Blockers
- None.

## Next Steps
- Backend API integration (replace `DEMO_USERS` mock data and `localStorage`).
- Build Record PM and Calendar PM pages if not yet implemented.
