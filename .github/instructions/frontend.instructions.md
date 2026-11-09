---
applyTo: "frontend/**"
---

# Frontend Conventions — Angular 21

## Architecture

- **Standalone components only.** Never use `NgModule`. Every component, directive, and pipe must be declared standalone.
- **Lazy-loaded routes.** Every page component is loaded via `loadComponent` in `app.routes.ts`. Never eagerly import page components.
- **No Angular Material.** The project uses Tailwind v4 + custom SCSS. Reuse existing shared components under `frontend/src/app/shared/components/`.

## State Management

- Use **Angular Signals** (`signal()`, `computed()`, `effect()`) for all reactive state — both in services and components.
- Do **not** introduce new RxJS `BehaviorSubject` or `ReplaySubject` for state. Existing ones may remain.
- Global/shared state lives in injectable services (`PmStore`, `AuthService`; see Services). Local component state uses component-level signals.
- `APP_INITIALIZER` preloads auth + PM data — do not reload what's already been loaded.

## Styling

- Use **Tailwind v4 utility classes** for layout, spacing, and responsive design.
- Use the **CSS design token variables** defined in `frontend/src/styles.scss` for colors, typography, and effects (e.g. `var(--color-primary)`, `var(--surface-card)`).
- Do not add hardcoded hex/rgb colors. Always use design tokens or Tailwind classes.
- Component-scoped styles go in a `.scss` file alongside the component. Keep them minimal.

### Component SCSS — mistakes found in the 2026-11 cleanup (do not repeat)

All components use Angular's default **emulated encapsulation**: a component's styles only match elements in *its own template*. Several pages were created by copy-pasting another page's SCSS, which left ~2,500 lines that could never match.

- **Never copy app-shell styles into a page.** Sidebar, topbar, nav, user-card, `.app`, `.main` live in `layout` + `styles.scss`. A page's `.sidebar {…}` can't reach the layout's sidebar.
- **Never copy another page's whole `.scss` as a starting point.** Write only the rules for classes in your own template. Every selector in a component SCSS should match something in that component's `.html`/`.ts`.
- **No `:root {…}` in component SCSS.** Angular compiles it to `[_ngcontent-x]:root`, which never matches. Global variables go in `styles.scss`.
- **Never write `--x: var(--x)`.** A self-referencing custom property is a CSS cycle; the browser makes it invalid and every `var(--x)` inside that element falls back to nothing (this silently broke mono fonts and card shadows on several pages).
- **Don't re-declare global tokens per page.** `--font-sans`, `--font-mono`, `--ease-*`, `--shadow-*`, `--sidebar-width` already exist globally. Only declare a page-level variable if the page genuinely needs a different value.
- **Don't re-declare the `*` reset** (`box-sizing/margin/padding`) — it's global.
- **Shared UI patterns** (dropdown `c-dropdown`, multi-select `ms-*`, modal `modal-overlay`, `data-table`) are currently copy-styled per page with small differences. Don't add another copy: reuse an existing shared component under `shared/components/`, or extract one, before styling a new instance.
- When removing a selector, first check dynamic usage: `[class.x]`, `[ngClass]`, string building like `'status-' + s`, `classList`.

### Fonts & icons

- Fonts and icons are **self-hosted** via npm (`@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`, `material-symbols`) and listed in the `styles` array of `angular.json`, before `src/styles.scss`.
- **Never add Google Fonts / any CDN `<link>` or `@import url(...)`.** The app must work on the factory network without internet access.
- Need a new weight/style? Add the matching `@fontsource/.../<weight>.css` entry to `angular.json`, don't add a CDN link.

## Services

- `api.service.ts` — thin REST client only. No business logic here.
- `pm-store.service.ts` (`PmStore`) — shared PM state: assets, real tasks, preview tasks (`assets`, `activeAssets`, `pmTasks`, `planTasks`), `loadData()` (the single load entry point, used by `APP_INITIALIZER` and login), `viewedTaskGlobal`. Write methods are for the domain services only — components read, never write.
- `template.service.ts` (`TemplateService`) — checklist templates (incl. default mock templates) and template CRUD.
- `pm-task.service.ts` (`PmTaskService`) — task CRUD, assign/reassign, cancel series, series checklist, task permission checks, technician lists.
- `master-plan.service.ts` (`MasterPlanService`) — machines, draft PM types, send/withdraw to Master Plan, submit/approve/reject, versions, local audit log. Memory-only until the backend endpoints exist. Mock seed data lives in `pm-masterplan-mock.ts`.
- `auth.service.ts` — session state, permission checks, delegation management.
- Pure helpers go in `*.util.ts` files (`pm-plan.util.ts`, `pm-frequency.util.ts`, …), not in services.
- **Dependency direction is one-way:** `MasterPlanService → PmTaskService → PmStore → TemplateService`. Never inject "upwards" (circular DI). Inject the narrowest service a component needs.
- **Don't grow a god service again.** `pm.service.ts` reached ~1,600 lines and was split. A new feature area gets its own service; if a service passes ~500 lines, split it before adding more (`master-plan.service.ts` is already ~965 — prefer extracting from it over adding to it).
- New services follow the same pattern: signals for state, inject `ApiService` for HTTP.

## Permissions

- Check permissions via `AuthService` before showing actions in the UI.
- Route-level protection is handled by `auth.guard.ts` with `data: { permission: '...' }`.
- Never hard-code role strings — use the `User` model's role and permission fields.

## Internationalization

- All user-visible strings must support EN/TH translation via `TranslationService`.
- Use `translate('key')` — never inline raw Thai or English strings directly in templates if a key exists.

## File Naming

- Components: `<name>.component.ts` / `<name>.component.html` / `<name>.component.scss`
- Services: `<name>.service.ts`
- Guards: `<name>.guard.ts`
- Models: defined in `frontend/src/app/core/models/`
- Match the folder structure of existing pages when creating new pages under `frontend/src/app/pages/<page-name>/`.

## TypeScript

- Use strict typing. No `any` unless absolutely unavoidable.
- Use the model types from `frontend/src/app/core/models/pm.model.ts` for all PM domain objects.
- Type-check from `frontend/` with **both** `npx tsc --noEmit -p tsconfig.app.json` and `npx tsc --noEmit -p tsconfig.spec.json`. Plain `npx tsc --noEmit` checks nothing (solution-style `tsconfig.json`) and will always look green.

## Lint (angular-eslint, type-aware)

- Run `npm run lint` from `frontend/` before considering work done. It must report **0 errors**.
- Existing violations of some rules are `warn` (a baseline). **New code must not add warnings** — fix them instead of adding to the pile. Never add `eslint-disable` comments to get past a rule.
- `@typescript-eslint/no-floating-promises`: `await`, `return`, or `.catch()` every Promise (e.g. `router.navigate`, `firstValueFrom`). An unhandled promise silently swallows errors.
- `@typescript-eslint/no-misused-promises` is an error: don't pass an `async` function where a void callback is expected (`forEach`, `addEventListener`, `setTimeout`, `subscribe`).
- Templates: use `@if`/`@for` (not `*ngIf`/`*ngFor`) in new or edited templates, and make clickable non-button elements keyboard-accessible (`button`, or `tabindex` + key handler).
