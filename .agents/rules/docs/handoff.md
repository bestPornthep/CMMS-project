# Handoff: RBAC + Template Management

## Completed Milestones
- **RBAC**: Strict Tech > Eng > Mgr > Adm hierarchy in `AuthService` (TDD, all tests passing).
- **UI Integrations**: Navigation hiding, department-locked dropdowns, product/template filtering by role — all wired into `pm-create`, `pm-assign`, `layout`.
- **Logout**: Sidebar footer logout button, styled to match.
- **Template Management**: `deleteTemplate` refactored from index-based to object-based matching. Global (`All`) templates protected from non-Mgr/Adm deletion. Department badge shown in manage modal.
- **Assign Dropdown Fix**: `overflow:hidden` on unassigned table wrapper changed to `overflow:visible` — dropdown menus inside table cells were being clipped.

## Key Files
- [auth.service.ts](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/core/services/auth.service.ts) — RBAC logic, `hasPermission`, `canDelegate`, `getAccessibleProducts`
- [auth.service.spec.ts](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/core/services/auth.service.spec.ts) — 5 TDD test cases
- [pm.service.ts](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/core/services/pm.service.ts) — Template CRUD, task management
- [pm-create.component.ts](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/pages/pm-create/pm-create.component.ts) — Template filtering by dept
- [pm-assign.component.html](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/src/app/pages/pm-assign/pm-assign.component.html) — Assign page with dropdown fix

## Design Standards
- See [.ai_state.md](file:///c:/Users/K90016056/OneDrive%20-%20Kimball%20Electronics/CMMS/assetintel/src/frontend/.ai_state.md) for dropdown/form/checklist styling rules.

## Blockers
- None.

## Next Steps
- Backend API integration (currently using `DEMO_USERS` mock data and `localStorage`).
- Additional PM pages (Record PM, Calendar PM) if not yet built.

## Suggested Skills
- `@token-optimization.md` — enforce terse, zero-filler output.
- `@karpathy-behavior.md` — surgical changes, simplicity first.
