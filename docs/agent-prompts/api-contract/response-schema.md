---
name: response-schema
type: convention
description: Detect changes to the shape of API responses — field types, nullability, required/optional status.
---

# response-schema

Flag any diff that changes the **type, nullability, or presence** of fields in an API response body, including nested objects, arrays, and enums.

## Rule

Report as `WARNING` (possibly `CRITICAL` for type widening to `null`) when the diff:
- Changes a field's type (e.g. `string` → `number`, `string` → `string | null`)
- Removes `required` from a previously mandatory field (now returns `undefined` sometimes)
- Adds a new **required** field to a request body with no default (breaks old callers)
- Changes enum values (adds/removes members that callers may switch on)
- Changes array element shape (callers iterating the array break)

Always cite the Zod/TypeScript schema file and line where the change occurred.

## BAD — field type changed from string to number

```diff
 const UserSchema = z.object({
-  age: z.string(),
+  age: z.number(),
 });
```

Any caller that called `.slice()` or `.toUpperCase()` on `age` now throws at runtime.

## GOOD — additive field, old type kept

```diff
 const UserSchema = z.object({
   age: z.string(),               // kept for compat
+  age_int: z.number().optional(), // new typed field
 });
```

Old callers keep working; new callers use `age_int`.

## BAD — optional field became nullable without notice

```diff
-  email: z.string().optional(),
+  email: z.string().nullable(),
```

Callers that called `email.toUpperCase()` without a null check now throw.

## GOOD — nullability documented and callers notified

Add a CHANGELOG entry + migration note, bump minor version, and announce the change in the API contract doc.
