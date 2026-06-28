# frontend-architecture

**Version:** 1.0.0 · **Scope:** Frontend · **Stack:** React 19 + Next.js 15 (App Router)

Meta and sources for the `frontend-architecture` skill. The skill rules live in
[SKILL.md](SKILL.md); good/bad layouts in [examples.md](examples.md).

## Focus

Frontend **UI architecture & code organization** — the "where does this go?"
layer. It answers questions of structure and placement, not runtime behavior:

- Folder & file structure (feature-based, unidirectional dependencies, colocation)
- Next.js App Router architecture (route groups, private folders, `lib/`,
  server-vs-client placement)
- Component decomposition boundaries (when/where to split — not how to write internals)
- Where each kind of code belongs: constants, utils/helpers, business logic,
  types, API/services
- File & folder naming conventions

## When to use

- Setting up or restructuring a React/Next.js project's folders
- Deciding where a new component / hook / util / constant / piece of business
  logic should live
- Reviewing a PR for architectural drift (cross-feature imports, fat `page.tsx`,
  data access in components, premature abstractions)
- Splitting a growing module along the right seam

## When NOT to use (and what to use instead)

This skill deliberately avoids overlap with existing skills. It owns **location &
boundaries**; the siblings own **internals**.

| Question | Use |
|----------|-----|
| Where should this code live / how is the project structured? | **frontend-architecture** (this) |
| How do I write this component/hook? (derived state, memoization, keys, effects) | **react-best-practices** |
| Next.js runtime features (RSC serialization, metadata, image/font, route handlers, hydration) | **next-best-practices** |
| Structuring/sharing TypeScript types at the type level | **typescript-expert** |
| Testing the structure I built | **react-testing-library** |

Rule of thumb: if the answer changes the **file tree or where a symbol is
defined**, it's this skill. If it changes **code inside a function/component**,
it's a sibling skill.

## Sources

All references used to build this skill, grouped by topic.

### Foundation — official React docs
- [Thinking in React](https://react.dev/learn/thinking-in-react)
- [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure)
- [Rules of React](https://react.dev/reference/rules)
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

### React folder structure
- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [bulletproof-react (repo)](https://github.com/alan2207/bulletproof-react)
- [Robin Wieruch — React Folder Structure Best Practices (2026)](https://www.robinwieruch.de/react-folder-structure/)
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards)
- [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/)
- [Netguru — Professional React Project Structure 2025](https://www.netguru.com/blog/react-project-structure)
- [DEV — Recommended Folder Structure for React 2025](https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc)
- [Asrul Kadir — Why feature-based is best](https://asrulkadir.medium.com/3-folder-structures-in-react-ive-used-and-why-feature-based-is-my-favorite-e1af7c8e91ec)
- [Web Dev Simplified — How To Structure React Projects](https://blog.webdevsimplified.com/2022-07/react-folder-structure/)
- [React (legacy) — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html)

### Next.js (App Router) architecture
- [Next.js Docs — Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js Docs — Project Organization & Colocation](https://nextjs.org/docs/13/app/building-your-application/routing/colocation)
- [Next.js Colocation Template (live example)](https://next-colocation-template.vercel.app/)
- [freeCodeCamp — Reusable Architecture for Large Next.js Apps](https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/)
- [Inside the App Router — Best Practices for File & Directory Structure (2025)](https://medium.com/better-dev-nextjs-react/inside-the-app-router-best-practices-for-next-js-file-and-directory-structure-2025-edition-ed6bc14a8da3)
- [Next.js 16 App Router Folder Structure Best Practices](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure)
- [Next.js 15 Project Structure: Full-Stack Guide (2026)](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)
- [Wisp — Ultimate Guide to Organizing Your Next.js 15 Project Structure](https://www.wisp.blog/blog/the-ultimate-guide-to-organizing-your-nextjs-15-project-structure)
- [DEV — Best Practices for Organizing Next.js 15 (2025)](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji)
- [The Next.js 15 App Router Project Structure That Scales](https://dev.to/krunal_groovy/the-nextjs-15-app-router-project-structure-that-scales-with-examples-47ha)
- [Level Up — Scalable Next.js 15 App Router Project Structure](https://levelup.gitconnected.com/how-to-set-up-a-scalable-next-js-15-app-router-project-structure-pro-tips-3c42778cd737)
- [Thiraphat — Mastering Next.js App Router: Structuring Your Application](https://thiraphat-ps-dev.medium.com/mastering-next-js-app-router-best-practices-for-structuring-your-application-3f8cf0c76580)
- [Magic UI — Next.js project structure](https://magicui.design/blog/next-js-project-structure)

### Component decomposition / composition
- [Kent C. Dodds — When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)
- [Developer Way — React components composition: how to get it right](https://www.developerway.com/posts/components-composition-how-to-get-it-right)
- [David Tang — Techniques for decomposing React components](https://medium.com/dailyjs/techniques-for-decomposing-react-components-e8a1081ef5da)
- [Six Pillars of Component Architecture](https://medium.com/@abbas-roholamin/splitting-a-ui-into-components-in-react-six-pillars-of-component-architecture-04538e542ce5)
- [Splitting Components in React (Thiraphat)](https://thiraphat-ps-dev.medium.com/splitting-components-in-react-a-path-to-cleaner-and-more-maintainable-code-f0828eca627c)
- [João Forja — Guideline from the 70's on how to split components](https://joaoforja.com/blog/guideline-on-how-to-decompose-a-react-component)

### Container/Presentational vs hooks
- [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
- [Presentational vs Container — Still Relevant in 2025?](https://mirrorcodex.com/presentational-vs-container-components/)
- [TSH — Container-presentational pattern in React](https://tsh.io/blog/container-presentational-pattern-react)
- [Smart vs Dumb Components — Still Relevant in 2025?](https://medium.com/@lakshaykapoor08/smart-and-dumb-components-still-relevant-in-2025-e8ebfb1934bd)

### Business logic separation
- [Profy.dev — Clean React Architecture (Part 6): Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [Israel — Separating Business Logic from UI Components in React 18](https://medium.com/design-bootcamp/separating-%EF%B8%8F-business-logic-from-ui-components-in-react-18-aa1775b3caba)
- [Where to Write Business Logic in React (Filippo Rivolta)](https://medium.com/@rivoltafilippo/where-to-write-business-logic-in-react-separation-of-concers-for-frontend-interviews-59283b5d4b27)
- [Arek Nawo — Separation of concerns with custom React hooks](https://areknawo.com/separation-of-concerns-with-custom-react-hooks/)
- [ixorasolution — React Separation of Concerns: A Practical Guide](https://ixorasolution.com/blog/separation-of-concerns-in-react/)

### Constants, naming, utils/helpers
- [Sufle — Naming Conventions in React for Clean & Scalable Code](https://www.sufle.io/blog/naming-conventions-in-react)
- [Nooruddin Lakhani — React Naming Conventions Best Practices](https://medium.com/@nooruddinlakhani/react-best-practices-and-guidelines-for-naming-conventions-9e0c452eef29)
- [Rajitha — Naming Conventions Best Practices in React](https://rajithasanjayamal.medium.com/naming-conventions-best-practices-in-react-37624d020288)
- [WebDevTutor — TypeScript React File Naming Conventions](https://www.webdevtutor.net/blog/typescript-react-file-naming-conventions)
- [React Naming Conventions Simplified (GitHub gist)](https://gist.github.com/kamauwashington/4396ea26537e0abd94ac7409998870e9)
- [Business Compass — Naming Conventions and Coding Standards](https://knowledge.businesscompassllc.com/react-naming-conventions-and-coding-standards-best-practices-for-scalable-frontend-development/)

### Best-practices roundups (cross-check)
- [DZone — Production-Grade React Project Structure](https://dzone.com/articles/production-grade-react-project-structure)
- [DEV — bulletproof-react is a hidden treasure of React best practices](https://dev.to/meijin/bulletproof-react-is-a-hidden-treasure-of-react-best-practices-3m19)
- [Priyen Mehta — React Best Practices for Folder Structure & System Design](https://javascript.plainenglish.io/react-best-practices-for-folder-structure-system-design-architecture-8fc2f09e3fff)
- [Differenz — React project structure best practices](https://www.differenzsystem.com/blog/react-project-structure/)

## Changelog

- **1.0.0** — Initial release. Architecture & organization rules for React +
  Next.js App Router, sourced from the references above.
