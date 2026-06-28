# Onion Architecture — Code Examples

Good/bad TypeScript patterns for each rule in [SKILL.md](SKILL.md).

---

## Fat Route Handler

```ts
// BAD: business logic + DB query inside a route handler
fastify.post('/reviews', async (req, reply) => {
  const pull = await db.query.pulls.findFirst({ where: eq(pulls.id, req.body.prId) });
  if (!pull) return reply.code(404).send({ error: 'Not found' });
  if (pull.status === 'closed') return reply.code(422).send({ error: 'PR is closed' });
  const agents = await db.query.agents.findMany({ where: eq(agents.enabled, true) });
  const runs = await Promise.all(agents.map(a => runReview(pull, a)));
  return reply.send({ runs });
});

// GOOD: route validates + delegates, service orchestrates
fastify.post('/reviews', { schema: createReviewSchema }, async (req, reply) => {
  const result = await reviewService.startReview(req.body.workspaceId, req.body.prId);
  return reply.send(result);
});
```

---

## Leaking DB Row Type

```ts
// BAD: Drizzle $inferSelect type leaks into the service signature
import type { pulls } from '../db/schema.js';
type PullRow = typeof pulls.$inferSelect;

class ReviewService {
  async getReview(pull: PullRow) {  // Ring 3 type in Ring 2
    // ...
  }
}

// GOOD: service depends on an application DTO (plain TypeScript type)
// Ring 1 (domain contract):
export interface Pull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  status: 'open' | 'closed' | 'merged';
}

// Ring 3 (repository maps row → DTO):
class ReviewRepository {
  async getPull(id: string): Promise<Pull | null> {
    const row = await this.db.query.pulls.findFirst({ where: eq(pulls.id, id) });
    if (!row) return null;
    return { id: row.id, repoId: row.repo_id, number: row.number, title: row.title, status: row.status };
  }
}

// Ring 2 (service uses DTO):
class ReviewService {
  async getReview(pullId: string) {
    const pull = await this.repo.getPull(pullId);  // receives Pull, not a DB row
    // ...
  }
}
```

---

## Direct Adapter Instantiation in Service

```ts
// BAD: service creates its own concrete dependency
class ReviewService {
  private llm = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);  // hard-wired, untestable

  async runReview(pull: Pull) {
    return this.llm.completeStructured({ ... });
  }
}

// GOOD: service receives a port interface via constructor
// Ring 1 (port interface):
export interface LLMProvider {
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

// Ring 2 (service depends on the interface):
class ReviewService {
  constructor(
    private repo: ReviewRepository,
    private llm: LLMProvider,  // interface, not the class
  ) {}

  async runReview(pull: Pull) {
    return this.llm.completeStructured({ ... });
  }
}

// Ring 3 (Composition Root wires the concrete class):
const anthropic = new AnthropicProvider(await secrets.get('ANTHROPIC_API_KEY'));
const reviewService = new ReviewService(reviewRepository, anthropic);
```

---

## Cross-Module Repository Import

```ts
// BAD: payments module reaches into orders module internals
// src/modules/payments/service.ts
import { OrderRepository } from '../orders/repository.js';  // cross-module coupling

class PaymentService {
  constructor(private orderRepo: OrderRepository) {}
  async chargeOrder(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    // ...
  }
}

// GOOD: depend on a port interface in Ring 1
// Ring 1 (shared):
export interface OrderPort {
  findById(id: string): Promise<Order | null>;
}

// Ring 2 (payments service depends on the interface):
class PaymentService {
  constructor(private orders: OrderPort) {}
}

// Ring 3 (Composition Root provides the implementation):
const paymentService = new PaymentService(orderRepository);  // orderRepository implements OrderPort
```

---

## Business Logic in Repository

```ts
// BAD: the repository decides which query to run based on business rules
class ReviewRepository {
  async findReviews(workspaceId: string, filter: ReviewFilter) {
    if (filter.onlyFailed) {
      if (filter.agentId) {
        return this.db.query.reviews.findMany({ where: and(eq(...), eq(...), eq(...)) });
      }
      // ... more branching
    }
  }
}

// GOOD: repository has simple named queries; service composes them
class ReviewRepository {
  async findByStatus(workspaceId: string, status: ReviewStatus): Promise<Review[]> { ... }
  async findByAgent(workspaceId: string, agentId: string): Promise<Review[]> { ... }
}

class ReviewService {
  async getFailedReviewsForAgent(workspaceId: string, agentId: string) {
    const byAgent = await this.repo.findByAgent(workspaceId, agentId);
    return byAgent.filter(r => r.status === 'failed');  // logic in the service
  }
}
```

---

## Infrastructure Type in Application Service

```ts
// BAD: FastifyRequest leaks into the service (Ring 4 type in Ring 2)
import type { FastifyRequest } from 'fastify';

class UserService {
  async getProfile(req: FastifyRequest) {  // tied to Fastify forever
    const userId = req.user.id;
    return this.repo.findById(userId);
  }
}

// GOOD: service accepts plain domain types
class UserService {
  async getProfile(userId: string) {  // framework-free
    return this.repo.findById(userId);
  }
}

// Ring 4 extracts what it needs and calls the service:
fastify.get('/profile', async (req, reply) => {
  const profile = await userService.getProfile(req.user.id);
  return reply.send(profile);
});
```

---

## Bypassing DI with Module-Level Singleton

```ts
// BAD: DB client created as a module-level side effect
// src/modules/reviews/repository.ts
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);  // singleton, impossible to swap in tests

export class ReviewRepository {
  async findById(id: string) {
    return db.query.reviews.findFirst({ where: eq(reviews.id, id) });
  }
}

// GOOD: DB client injected via constructor
export class ReviewRepository {
  constructor(private db: DrizzleClient) {}

  async findById(id: string) {
    return this.db.query.reviews.findFirst({ where: eq(reviews.id, id) });
  }
}

// Composition Root (Ring 3):
const db = drizzle(config.databaseUrl);
const reviewRepository = new ReviewRepository(db);
```

---

## Validate Late

```ts
// BAD: Zod parse deep inside a service method
class RepoService {
  async importRepo(rawInput: unknown) {
    const input = ImportRepoSchema.parse(rawInput);  // validation buried in Ring 2
    // ...
  }
}

// GOOD: validate at the HTTP boundary (Ring 4), trust in Ring 2
// Ring 4 (route):
fastify.post('/repos', {
  schema: { body: ImportRepoSchema },
}, async (req, reply) => {
  // req.body is already validated and typed by fastify-type-provider-zod
  const result = await repoService.importRepo(req.body);
  return reply.send(result);
});

// Ring 2 (service accepts an already-validated type):
class RepoService {
  async importRepo(input: ImportRepoInput) {  // typed, no parse() needed
    // ...
  }
}
```

---

## Repository Interface + Implementation Split

```ts
// Ring 1 — port interface (domain/ports/user-repository.ts):
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<boolean>;
}

// Ring 3 — implementation (infrastructure/db/drizzle-user-repository.ts):
export class DrizzleUserRepository implements UserRepository {
  constructor(private db: DrizzleClient) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({ where: eq(users.id, id) });
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: typeof users.$inferSelect): User {
    return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
  }
}

// Ring 3 — Composition Root wires them:
const userRepo: UserRepository = new DrizzleUserRepository(db);
const userService = new UserService(userRepo);

// Tests — inject an in-memory stub:
const userService = new UserService(new InMemoryUserRepository());
```

---

## Drizzle Transaction via Port Interface

```ts
// BAD: transaction logic bleeds into the service (Drizzle-specific API in Ring 2)
class OrderService {
  async placeOrder(input: PlaceOrderInput) {
    await this.db.transaction(async (tx) => {  // tx is a Drizzle type — Ring 3 leak
      await tx.insert(orders).values({ ... });
      await tx.update(inventory).set({ ... });
    });
  }
}

// GOOD: define a unit-of-work port in Ring 1; service uses it
// Ring 1 (port):
export interface UnitOfWork {
  run<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T>;
}

// Ring 2 (service):
class OrderService {
  constructor(
    private orderRepo: OrderRepository,
    private inventoryRepo: InventoryRepository,
    private uow: UnitOfWork,
  ) {}

  async placeOrder(input: PlaceOrderInput) {
    await this.uow.run(async () => {
      await this.orderRepo.create(input);
      await this.inventoryRepo.decrement(input.items);
    });
  }
}
```
