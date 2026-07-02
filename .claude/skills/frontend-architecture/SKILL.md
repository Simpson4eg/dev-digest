---
name: frontend-architecture
description: "Frontend UI architecture & code organization for React + Next.js App Router. Use when deciding WHERE code should live: folder/file structure, component decomposition boundaries, and placement of constants, utils/helpers, business logic, types, and API/services. Focuses on structure & organization — not in-component runtime patterns (see react-best-practices) or Next.js feature APIs (see next-best-practices)."
version: 1.0.0
---

# Frontend UI Architecture & Code Organization

How to **structure and organize** a React + Next.js (App Router) codebase: where
files live, how to split modules, and where each kind of code belongs. This skill
answers "where does this go?" — not "how do I write this component?".

For rationale and full source list, see [README.md](README.md). For concrete
good/bad layouts, see [examples.md](examples.md).

## Scope — read this first

**Use this skill for:** folder/file structure, feature boundaries, module
decomposition, and placement of constants / utils / helpers / business logic /
types / API code; file & folder naming; server-vs-client placement decisions.

**Do NOT use this skill for (use the sibling skill instead):**
- In-component patterns — hooks rules, derived state, memoization, keys,
  conditional rendering → **react-best-practices**
- Next.js runtime features — RSC serialization, metadata, image/font, route
  handlers, hydration → **next-best-practices**
- Type-level structuring of shared types → **typescript-expert**

When a topic overlaps (e.g. "where do custom hooks live" vs "how to write one"),
this skill owns **location & boundaries**; the sibling owns **internals**.

## Severity Levels

Each rule is tagged for consuming agents:
- **CRITICAL** — breaks scalability/maintainability; will force a painful refactor
- **HIGH** — causes friction, coupling, or growth problems
- **MEDIUM** — hurts consistency or readability

---

## Core Architecture Principles (CRITICAL)

- **Group by feature, not by file type.** Organize around business capabilities
  (`features/reviews/`) instead of technical buckets (`all-components/`,
  `all-hooks/`). Group by what code *does*, not what it *is*.
- **Unidirectional dependency flow:** `shared → features → app/pages`. Shared code
  never imports from features; features never import from app; features avoid
  importing each other. Enforce with ESLint import rules where possible.
- **Colocate first, extract later.** Keep a component/hook/util next to its only
  consumer. Promote it to a shared folder **only when a second feature needs it** —
  not preemptively.
- **No cross-feature imports.** If two features need the same code, it belongs in
  `shared`/`lib`, not in one feature reaching into another.

## React Folder Structure (HIGH)

Baseline `src/` layout:
- `app/` or `pages/` — routing/entry composition only
- `features/<feature>/` — self-contained: `components/`, `hooks/`, `api/`,
  `utils/`, `types/`, `constants.ts`
- `components/` — shared, reusable presentational components (incl. `components/ui/`)
- `hooks/` — shared cross-feature hooks
- `lib/` — framework-agnostic business logic, clients, services
- `utils/` — shared pure helpers
- `assets/`, `layouts/`, `styles/`

Rules:
- Don't nest deeper than ~2 levels inside a feature — deeper nesting signals a
  missing sub-feature or premature structure.
- A folder earns an `index.ts` barrel only at a real public boundary (a feature's
  public API). Avoid barrels that just re-export everything (they hurt
  tree-shaking and create import cycles).

## Next.js App Router Architecture (HIGH)

- **`app/` is for routing only.** Don't accumulate non-route code there.
- **Route groups `(group)`** organize routes and share layouts **without**
  affecting the URL. Use them to separate sections (e.g. `(marketing)`,
  `(dashboard)`).
- **Private folders `_folder`** colocate route-specific code (`_components`,
  `_lib`) without creating a route segment. Prefer this for code used by one route.
- **`lib/` holds data access & business logic** (DB queries, API clients,
  domain logic) so Server Components stay thin and testable. Don't inline data
  access in `page.tsx`.
- **Server-first placement.** Keep the tree as Server Components by default; push
  `'use client'` down to the **interactive leaf**. A `'use client'` at the top of
  `page.tsx`/`layout.tsx` is an architecture smell — it client-renders the subtree.
  (For *why*/RSC mechanics, see next-best-practices.)
- Colocate a route's `page`, `_components`, tests, and styles together; promote to
  top-level `components/`/`lib/` only on reuse.

## Component Decomposition — where the boundaries go (HIGH)

This skill owns *when to split and along what seam*, not internal component code.

- Split by **single responsibility**, but **not prematurely** — a growing
  component is cheaper to maintain than the wrong abstraction. Split when there's
  real pain, not "just in case".
- Split seams worth extracting: repeated list-item markup, a self-contained
  "box/section", or a JSX chunk that depends on exactly one data object.
- An abstraction with a single consumer is premature — inline it until a second
  caller appears.
- A reusable component/hook must take its variability as **props/params**; one with
  hardcoded field names is not reusable.

## Where Each Kind of Code Lives (CRITICAL)

- **Constants:** extract magic strings/numbers into dedicated files —
  `constants.ts` (per feature) or `constants/` (shared). Compile-time constants
  `UPPER_SNAKE_CASE`; runtime-initialized values `camelCase`.
- **Utils/helpers:** pure, framework-agnostic functions go in `utils/` (or `lib/`).
  Feature-local helper → feature `utils/`; reused across features → shared `utils/`.
  Avoid one giant `utils.ts` — split into logical files (`date.ts`, `format.ts`).
- **Business logic:** keep it **framework-agnostic** (plain functions, testable
  without React) in `lib/`. A custom hook is the **bridge** between that logic and
  the component — the component renders, the hook wires.
- **API / data access:** in `features/<f>/api/` or `lib/` — never inside component
  bodies. UI components receive data via props/hooks.
- **Types:** colocate feature types in the feature; shared contracts in a shared
  location. (In this repo, Zod contracts live in `server/src/vendor/shared`.)

## Naming Conventions (MEDIUM)

- **Components:** `PascalCase`; filename matches the component name.
- **Hooks:** `useCamelCase`.
- **Utilities:** `camelCase`, prefixed `get/set/is/has/should/use` where it reads well.
- **Constants files:** descriptive name, e.g. `review.constants.ts`.
- **Folders/non-component files:** consistent `kebab-case` (pick one convention
  per repo and hold it).
- Avoid generic names (`Item`, `Card`, `Container`, `data`, `utils2`) — the name
  must state the role.

## Anti-Patterns Checklist

- Organizing top-level folders by type (`components/`, `hooks/`, `utils/`) as the
  *only* axis in a large app → switch to feature-based. (CRITICAL)
- Features importing each other directly. (CRITICAL)
- Extracting shared abstractions before a second consumer exists. (HIGH)
- Data access / fetch logic inside component bodies. (HIGH)
- `'use client'` at the top of a route just to use one interactive widget. (HIGH)
- A single ballooning `utils.ts`. (MEDIUM)
- Magic strings/numbers scattered instead of named constants. (MEDIUM)
