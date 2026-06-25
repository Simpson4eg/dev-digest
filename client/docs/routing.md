# Routing (App Router)

Pages live under `src/app/`. Next.js App Router conventions apply:
`page.tsx` · `layout.tsx` · `loading.tsx` · `error.tsx` · `not-found.tsx`.

## Route-private components: `_components/`

Anything under a folder prefixed with `_` is excluded from the routing tree.
Feature components colocated with a route go here:

```
src/app/pulls/[id]/
  page.tsx
  _components/
    FindingsTab/
      FindingsTab.tsx
      FindingsTab.test.tsx
    DiffTab/
      DiffTab.tsx
      DiffTab.test.tsx
```

- One folder per component, `PascalCase`.
- Test file beside the component, same base name (`Foo.test.tsx`).
- Don't promote a `_components/` component to `src/components/` until it has
  more than one route consumer.

## Server vs Client

- **Default to Server Components.** They render on the server, ship zero JS,
  and can use `getTranslations`, `headers()`, `cookies()`, …
- **Add `'use client'`** only when you need React hooks, browser APIs, or event
  handlers.
- Pass plain data (not class instances) across the Server → Client boundary.

## Loading + errors

- `loading.tsx` is the Suspense fallback for the segment.
- `error.tsx` catches render errors and must be a Client Component.
- For data errors (TanStack Query), handle in-component — `error.tsx` is for
  thrown render errors.

## Layouts

Layouts (`layout.tsx`) wrap segments and persist across navigation. App-shell
chrome (nav, breadcrumbs) lives in the root layout via
`src/components/app-shell`.

## See also

- `specs/route-map.md` — концретні маршрути і які endpoints вони викликають
- `docs/state-management.md` — як хуки під'єднуються до сторінок
- `CLAUDE.md` — alias `@/*`, layout
