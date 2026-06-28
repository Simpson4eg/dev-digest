# Onion Architecture — References and Sources

All sources used to build this skill, organized by category.

---

## Original Concept

### Jeffrey Palermo — The Onion Architecture (2008)
- **Part 1**: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- **Part 2**: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- **Part 3**: https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
- **Part 4**: https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
- The original series that coined the term. Key tenets: inner layers define interfaces; outer layers implement them; coupling is toward the center; the DB is not the center of the application.

---

## Architecture Theory and Deep Dives

### Herberto Graça — The Software Architecture Chronicles
- **Onion Architecture**: https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85
- Part of a larger series on Clean, Hexagonal, Onion, and Ports & Adapters — explains the genealogy of these related patterns and how they differ.

### NDepend Blog — Onion Architecture: Going Beyond Layers
- **URL**: https://blog.ndepend.com/onion-architecture-layers/
- Explains the conceptual difference between traditional layered architecture and Onion Architecture, with emphasis on the dependency inversion principle.

### Allegro Tech — Onion Architecture
- **URL**: https://blog.allegro.tech/2023/02/onion-architecture.html
- Production-grade perspective from a large engineering team. Covers trade-offs and how the pattern scales in practice.

### Stack & System — Onion Architecture: Structuring Your Software Around the Core
- **URL**: https://stackandsystem.com/series/software-architecture-fundamentals/30-onion-architecture

### Marco Lenzo — The Onion Architecture Explained
- **URL**: https://marcolenzo.eu/the-onion-architecture-explained/

### Medium — Basic Rules for Effective Onion Architecture
- **URL**: https://medium.com/layhill-l-tech/basic-rules-for-effective-onion-architecture-a32af1f3b469

### Dani Jug — Unfolding Infrastructure in the Onion Architecture
- **URL**: https://dgrudzynskyi.github.io/dev-blog/architecture/2020/12/18/unfolding-infrastructure-in-onion-architecture.html
- Focuses specifically on where different infrastructure concerns land within the rings.

---

## Related Patterns

### Hexagonal Architecture (Ports & Adapters) — Generalist Programmer
- **URL**: https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide
- Companion to Onion Architecture. Hexagonal uses the terms "ports" (interfaces) and "adapters" (implementations) which map directly to Onion's Ring 1 interfaces and Ring 3 implementations.

### Clean Architecture — Generalist Programmer
- **URL**: https://generalistprogrammer.com/tutorials/clean-architecture-complete-guide
- Robert C. Martin's take on the same core ideas. The article compares Clean vs Onion vs Hexagonal and clarifies the overlaps.

### Understanding Modern Architectural Patterns — Medium
- **URL**: https://medium.com/@vikasgoel53/understanding-modern-software-architectural-patterns-clean-hexagonal-onion-and-plugin-06c559a2b211

---

## Node.js / TypeScript Implementations

### Remo Jansen — Implementing SOLID and Onion Architecture in Node.js with TypeScript
- **DEV Community**: https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- **Blog version**: http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs
- The most cited Node.js + TypeScript walkthrough. Uses InversifyJS for DI.

### Remo Jansen — Enforce Clean Architecture in TypeScript with `fresh-onion`
- **URL**: https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi
- Tooling to statically enforce layer boundaries at CI time using import analysis.

### André Bazaglia — Clean Architecture with TypeScript: DDD, Onion
- **URL**: https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- Walks through mapping DDD concepts (aggregates, entities, value objects) to Onion rings.

### Khalil Stemmler — Clean Node.js Architecture
- **URL**: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/

### Khalil Stemmler — Better Software Design with Application Layer Use Cases
- **URL**: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/
- Explains why use cases belong in Ring 2 and how they differ from domain services and repository methods.

### Melzar — Node.js / Express Onion Architecture Boilerplate (TypeScript)
- **GitHub**: https://github.com/Melzar/onion-architecture-boilerplate
- Reference implementation. OOP variant with Express.

### 256Taras — Fastify + TypeScript + Drizzle Starter Kit (DDD Lite + Clean Architecture)
- **GitHub**: https://github.com/256Taras/fastify-typescript-drizzle-starter-kit
- Modern starter kit built with Fastify 5, Drizzle ORM, and native TypeScript. Applies DDD Lite and Clean Architecture Lite — lightweight by default, structured to scale.

---

## Framework Integration

### Setting Up Drizzle ORM with Fastify in an NX Monorepo
- **Medium**: https://medium.com/@tomas.gabrs/setting-up-drizzle-orm-with-fastify-in-an-nx-monorepo-fdd34229254c

### Fastify API with Postgres and Drizzle ORM
- **DEV Community**: https://dev.to/vladimirvovk/fastify-api-with-postgres-and-drizzle-orm-a7j

### Drizzle ORM Official Docs
- **URL**: https://orm.drizzle.team/

---

## GitHub Topic Collections

- **onion-architecture (TypeScript)**: https://github.com/topics/onion-architecture?l=typescript
- **clean-architecture (TypeScript)**: https://github.com/topics/clean-architecture?l=typescript

---

*Last updated: June 2026.*
