# Frontend Architecture — Examples (good vs bad)

Concrete layouts and placement decisions. Pairs with [SKILL.md](SKILL.md).

## 1. Feature-based vs type-based structure

### ❌ Bad — organized by file type (doesn't scale)

```
src/
  components/   # 200 files from every feature mixed together
  hooks/        # useReviewDiff next to useLoginForm next to ...
  utils/
  pages/
```

Finding everything for one feature means hopping across four folders.

### ✅ Good — organized by feature, shared code promoted

```
src/
  app/                      # routing/entry only
  features/
    reviews/
      components/
      hooks/
      api/
      utils/
      review.constants.ts
      types.ts
    auth/
      components/
      hooks/
      api/
  components/               # shared, reusable (incl. ui/)
    ui/
  hooks/                    # shared cross-feature hooks
  lib/                      # framework-agnostic logic, clients
  utils/                    # shared pure helpers
```

## 2. Dependency direction

```
shared (components/, hooks/, lib/, utils/)
   │  (allowed)
   ▼
features/*            ──✗──►  features/* (NOT allowed: cross-feature import)
   │  (allowed)
   ▼
app/ , pages/
```

- ✅ `features/reviews` imports from `lib/` and `components/ui`
- ❌ `features/reviews` imports from `features/auth` → move shared bit to `lib/`
- ❌ `lib/` imports from `features/reviews` → wrong direction

## 3. Next.js App Router — route groups & private folders

### ✅ Good

```
app/
  (marketing)/            # route group: shares a layout, no URL segment
    layout.tsx
    page.tsx              # "/"
  (dashboard)/
    layout.tsx
    reviews/
      page.tsx            # "/reviews"
      _components/        # private: colocated, not a route
        ReviewList.tsx
      _lib/
        get-reviews.ts    # data access for this route
lib/
  db.ts                   # shared data access / business logic
```

- `(marketing)` / `(dashboard)` group routes without changing the URL.
- `_components` / `_lib` colocate route-only code without creating routes.

## 4. Server-vs-client placement

### ❌ Bad — client boundary at the top

```tsx
// app/(dashboard)/reviews/page.tsx
'use client'                 // ⛔ whole subtree becomes client-rendered
export default function Page() { /* fetches in useEffect... */ }
```

### ✅ Good — server by default, client at the leaf

```tsx
// app/(dashboard)/reviews/page.tsx  (Server Component)
import { getReviews } from './_lib/get-reviews'
import { ReviewList } from './_components/ReviewList'
import { LikeButton } from './_components/LikeButton'

export default async function Page() {
  const reviews = await getReviews()       // data access in lib, not inline UI
  return <ReviewList reviews={reviews} />   // server-rendered list
}
```

```tsx
// app/(dashboard)/reviews/_components/LikeButton.tsx
'use client'                                // ⛔→✅ client only where interactive
export function LikeButton() { /* onClick ... */ }
```

## 5. Where code lives — placement decisions

### ❌ Bad — everything inside the component

```tsx
function ReviewCard({ review }) {
  const STATUS_LABEL = review.status === 'open' ? 'Open' : 'Closed' // magic
  const score = (review.findings * 0.7 + review.severity * 0.3)     // business logic
  fetch(`/api/reviews/${review.id}`)                                // data access in UI
  return <div>{STATUS_LABEL} — {score}</div>
}
```

### ✅ Good — constants / logic / data access extracted

```ts
// features/reviews/review.constants.ts
export const STATUS_LABELS = { open: 'Open', closed: 'Closed' } as const

// lib/review-score.ts  (framework-agnostic, unit-testable without React)
export function computeReviewScore(findings: number, severity: number) {
  return findings * 0.7 + severity * 0.3
}

// features/reviews/api/get-review.ts
export const getReview = (id: string) => apiClient.get(`/reviews/${id}`)

// features/reviews/hooks/useReview.ts  (the bridge)
export function useReview(id: string) {
  return useApiQuery(['review', id], () => getReview(id))
}
```

```tsx
// features/reviews/components/ReviewCard.tsx  (renders only)
import { STATUS_LABELS } from '../review.constants'
import { computeReviewScore } from '@/lib/review-score'

function ReviewCard({ review }: { review: Review }) {
  const score = computeReviewScore(review.findings, review.severity)
  return <div>{STATUS_LABELS[review.status]} — {score}</div>
}
```

## 6. When to split a component

| Situation | Decision |
|-----------|----------|
| 300-line component, one job, no pain | ✅ Leave it — don't split for line count alone |
| Same list-item markup repeated 3× | ✅ Extract `ReviewListItem` |
| JSX chunk depends on exactly one object | ✅ Extract a component taking that object as a prop |
| Extracting a wrapper with a single consumer "for reuse" | ❌ Premature — inline it |
| "Reusable" hook with hardcoded field names | ❌ Not reusable — parameterize or keep local |
