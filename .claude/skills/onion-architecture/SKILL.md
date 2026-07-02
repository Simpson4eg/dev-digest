---
name: onion-architecture
description: "Onion Architecture for Node.js / TypeScript backends. Use when creating feature modules, adding adapters, reviewing backend structure, or deciding where new code belongs. Enforces the inward dependency rule, layer boundaries, and separation between Domain, Application, Infrastructure, and Presentation."
---

# Onion Architecture — Node.js / TypeScript Backend

Modern backend structure guide (2025). For code examples, see [examples.md](examples.md). For sources, see [references.md](references.md).

## Severity Levels

- **CRITICAL** — Violates the inward dependency rule; corrupts testability and replaceability
- **HIGH** — Breaks layer boundaries; causes coupling that's painful to undo
- **MEDIUM** — Hurts maintainability or forces unnecessary test complexity

---

## The Core Law (CRITICAL)

> **Dependencies point inward only.** Outer rings import from inner rings. Inner rings never import from outer rings.

Break this rule and the architecture collapses into a tightly coupled mess. Every file placement and every import is a decision about which ring the code belongs to.

---

## The 4 Rings

```
┌────────────────────────────────────────────────────────────┐
│  Ring 4 · Presentation                                     │
│  HTTP routes · controllers · CLI handlers · WebSocket      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Ring 3 · Infrastructure                             │  │
│  │  Repository impls · external adapters · DB client    │  │
│  │  framework config · Composition Root (DI)            │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Ring 2 · Application Services                 │  │  │
│  │  │  Use cases · orchestration · application DTOs  │  │  │
│  │  │  ┌──────────────────────────────────────────┐  │  │  │
│  │  │  │  Ring 1 · Domain Core                    │  │  │  │
│  │  │  │  Entities · value objects · port          │  │  │  │
│  │  │  │  interfaces · domain contracts (Zod)      │  │  │  │
│  │  │  └──────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## What Lives Where

### Ring 1 — Domain Core

The stable center. Zero external dependencies — no framework, no ORM, no HTTP lib.

- **Entities** and **value objects** — pure TypeScript classes or plain objects expressing business concepts
- **Port interfaces** — TypeScript `interface` definitions for every external dependency (DB, external APIs, file system, LLM, messaging). These are the "contracts the infrastructure must fulfill"
- **Domain contracts / schemas** — Zod schemas that define valid domain data shapes; shared between layers
- **Domain errors** — typed error classes for business rule violations

Allowed imports: nothing except the TypeScript standard library and peer domain types.

### Ring 2 — Application Services

Orchestrates the domain. Knows WHAT to do, delegates HOW to the infrastructure through port interfaces.

- **Use cases / application services** — one service per feature area (e.g., `ReviewService`, `UserService`). Each method = one business operation
- **Application DTOs** — input/output shapes for use cases, distinct from DB row types
- **Orchestration logic** — sequencing: load entity → apply domain logic → persist → emit event

Allowed imports: Ring 1 only.
Forbidden: framework types (`Request`, `Response`, `FastifyInstance`), ORM types (`$inferSelect`), concrete adapter classes.

### Ring 3 — Infrastructure

Implements the port interfaces defined in Ring 1. Everything that touches the outside world lives here.

- **Repository implementations** — classes that implement repository port interfaces using the ORM/DB client
- **External adapter implementations** — HTTP clients, LLM providers, file system, email, message brokers
- **DB schema and client** — ORM schema definitions (`schema.ts`), migrations, DB connection
- **Composition Root / DI Container** — the **only** place where concrete implementations are instantiated and wired to the port interfaces they fulfill (see below)
- **Framework configuration** — Fastify plugin registration, middleware setup, error handlers

Allowed imports: Ring 1, Ring 2.

### Ring 4 — Presentation

Converts external signals (HTTP, WebSocket, CLI) into application service calls and formats results for the caller.

- **HTTP route handlers** — validate input via schema → call service method → serialize response
- **Controllers** — thin: no business logic, no DB access
- **Request/response serialization** — transform application DTOs to API response shapes

Allowed imports: Ring 1, Ring 2.
Forbidden: direct imports of Ring 3 concrete classes. Infrastructure must arrive via constructor injection / DI container.

---

## Dependency Matrix

| From ↓ / To → | Ring 1 Core | Ring 2 App | Ring 3 Infra | Ring 4 HTTP |
|---------------|:-----------:|:----------:|:------------:|:-----------:|
| Ring 1 Core   | ✅          | ❌         | ❌           | ❌          |
| Ring 2 App    | ✅          | ✅         | ❌           | ❌          |
| Ring 3 Infra  | ✅          | ✅         | ✅           | ❌          |
| Ring 4 HTTP   | ✅          | ✅         | ❌ (via DI)  | ✅          |

---

## Composition Root — The Wiring Point (HIGH)

The Composition Root is the single place in Ring 3 where the whole object graph is assembled. It is the **only** place where `new ConcreteAdapter()` is called.

- One composition root per application (typically `container.ts`, `app.ts`, or `bootstrap.ts`)
- It reads config and secrets, constructs concrete implementations, and passes them as port interfaces to services
- Services receive their dependencies through their constructor — never by calling `new` on a concrete class themselves
- Tests replace Ring 3 implementations by passing mock implementations of the port interfaces at construction time, without touching the service code

---

## Framework-Specific Rules

### Fastify (Ring 4)

- Route handlers are pure Ring 4: validate → call service → serialize. No DB, no business logic inside
- Use a schema-first type provider (e.g., `fastify-type-provider-zod`) so Zod schemas from Ring 1 drive both request validation and response serialization
- Register plugins (cors, helmet, rate-limit) **before** route modules so all routes inherit them
- Each feature registers as a Fastify plugin (encapsulated scope) — one plugin per feature module
- Never call `new ServiceClass(db)` inside a route — the service arrives via the request context or closure from the composition root

### Drizzle ORM (Ring 3)

- Schema definitions (`schema.ts`) live in Ring 3 — they are an infrastructure concern, not a domain concern
- `$inferSelect` / `$inferInsert` types are Ring 3 types — they must NOT leak into Ring 2 services or Ring 4 routes
- Repository methods convert DB rows to application DTOs before returning — the service receives a DTO, never a raw ORM row
- All query logic (joins, filters, pagination) lives in the repository, not in the service
- Transactions are orchestrated by the repository; the service passes a callback or uses a unit-of-work interface

### Zod Contracts (Ring 1)

- Port interface schemas (request/response shapes shared between backend and client) live in Ring 1
- Do not define new public contract types inside a feature module — they belong in the shared contracts layer
- Zod schemas in Ring 1 validate at the system boundary (HTTP input); inner layers trust already-validated types
- Never re-parse inside a service a value already validated at the route level

### Repository Pattern (Ring 3)

- Port interface (Ring 1): `interface UserRepository { findById(id: string): Promise<User | null>; save(user: User): Promise<void>; }`
- Implementation (Ring 3): `class DrizzleUserRepository implements UserRepository { ... }`
- The service depends on `UserRepository` (the interface), never on `DrizzleUserRepository` (the class)
- Naming: `<Entity>Repository` for the interface, `<ORM><Entity>Repository` or `<Entity>RepositoryImpl` for the impl

---

## Cross-Module Rules (HIGH)

- Module A's service must not import Module B's repository — inter-module data flows through shared port interfaces or through the application service layer
- Shared domain entities (used by multiple modules) live in Ring 1, not inside any single module
- Shared application-level state (e.g., a multi-module aggregate view) is accessed through a shared service, not by cross-importing repositories
- Circular imports between modules are always a design smell — introduce a shared interface in Ring 1 to break the cycle

---

## Anti-Pattern Catalog

### Fat Route Handler (CRITICAL)

Business logic, DB queries, or conditional branching inside a route handler.

**Fix**: Extract to a service method. The route should fit in ~10 lines.

### Leaking DB Row Type (HIGH)

`$inferSelect` from Drizzle (or equivalent ORM row type) used in a service method signature or returned from a service.

**Fix**: Repository returns an application DTO. Add an explicit mapping function inside the repository.

### Direct Adapter Instantiation in Service (HIGH)

`new AnthropicProvider(key)` or `new PgRepository(db)` called inside a service constructor or method body.

**Fix**: Accept the port interface via constructor. Wire the concrete class in the Composition Root.

### Cross-Module Repository Import (HIGH)

`import { OrderRepository } from '../orders/repository'` inside the `payments` service.

**Fix**: Depend on an `OrderPort` interface defined in Ring 1, injected through the DI container.

### Business Logic in Repository (HIGH)

`if / switch / strategy-selection` inside a repository method — the repository decides which business rule to apply.

**Fix**: The service drives logic; the repository executes a single well-named query.

### Infrastructure Type in Ring 2 (HIGH)

A service method accepts or returns `FastifyRequest`, `DrizzleClient`, or any framework-specific type.

**Fix**: Define a plain TypeScript type or interface in Ring 1 for what the service needs.

### God Service (MEDIUM)

One service class that handles 10+ unrelated operations and accumulates hundreds of lines.

**Fix**: Split by bounded context. Each use case cohesive enough to be tested in isolation.

### Bypassing DI with Module-Level Singletons (MEDIUM)

```ts
// top of service.ts
const db = createDrizzleClient(process.env.DATABASE_URL);
```

**Fix**: DB client is created once in the Composition Root and injected.

### Validate Late (MEDIUM)

Parsing user input with `Schema.parse()` deep inside a service method instead of at the HTTP boundary.

**Fix**: Validate at Ring 4 (route level). Ring 2 trusts already-validated data.

---

## New Feature Module Checklist

Before writing code, decide: **which ring does each piece belong to?**

```
[ ] Ring 1: Define the domain entity/value object (plain TypeScript type or class)
[ ] Ring 1: Define port interface(s) the feature needs (repository, external service, etc.)
[ ] Ring 1: Add Zod contract schemas for any new API shapes if cross-cutting
[ ] Ring 2: Write the application service — depends only on port interfaces
[ ] Ring 2: Define application DTOs (input + output of the service)
[ ] Ring 3: Implement the repository (port interface → Drizzle/Postgres)
[ ] Ring 3: Map DB rows to DTOs inside the repository, not in the service
[ ] Ring 3: Register the concrete implementation in the Composition Root
[ ] Ring 4: Write the route handler — schema validation → service call → serialize
[ ] Ring 4: Register the route as a Fastify plugin in the module index
[ ] Tests: Inject mock port interface implementations, never mock the DB driver directly
[ ] Check: No inner ring file imports from an outer ring file
[ ] Check: No cross-module repository imports
```
