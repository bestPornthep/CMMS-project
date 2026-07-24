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
- Global/shared state lives in injectable services (`pm.service.ts`, `auth.service.ts`). Local component state uses component-level signals.
- `APP_INITIALIZER` preloads auth + PM data — do not reload what's already been loaded.

## Styling

- Use **Tailwind v4 utility classes** for layout, spacing, and responsive design.
- Use the **CSS design token variables** defined in `frontend/src/styles.scss` for colors, typography, and effects (e.g. `var(--color-primary)`, `var(--surface-card)`).
- Do not add hardcoded hex/rgb colors. Always use design tokens or Tailwind classes.
- Component-scoped styles go in a `.scss` file alongside the component. Keep them minimal.

## Services

- `api.service.ts` — thin REST client only. No business logic here.
- `pm.service.ts` — PM domain state and business-guarded actions.
- `auth.service.ts` — session state, permission checks, delegation management.
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
- Run `npx tsc --noEmit` from `frontend/` to verify types before considering work done.
