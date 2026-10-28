# Requirement mapping and confirmed implementation decisions

## Source of requirements

The five-page `Full Stack Developer Assessment.pdf` was locally text-extracted and reviewed together with all sections of `implementation_plan.md`. The original documents are retained. The assessment defines four mandatory API operations and an optional atomic transfer, without prescribing exact routes or currency representation. The supplied plan provides those contracts.

| Assessment requirement | Implementation | Verification |
| --- | --- | --- |
| Unique account ID, required name, initial zero balance, generated timestamp, no client balance | Strict account schema; DB defaults; account repository only inserts name | Account and validation tests |
| Credit/debit rules, sufficient balance | Locked account row, exact BigInt comparison, SQL arithmetic | Credit/debit and concurrent-overdraft tests |
| Duplicate reference within account; reusable across accounts | Composite `uq_account_reference` constraint, duplicate-first checks, centralized database error translation | Retry, changed-payload, exhausted-debit and concurrent-duplicate tests |
| Current balance, missing account errors | Balance service, UUID validation, `NotFoundError` | Balance and missing/malformed account tests |
| History type filtering, pagination, latest-first order | Count + page on one repeatable-read snapshot; `created_at DESC, id DESC` | Filter, empty/out-of-range, invalid query and equal-timestamp tests |
| Immutable ledger, balance consistent with valid transactions | No mutation routes/repository methods; immutable SQL triggers; atomic balance/ledger writes | API/SQL mutation rejection and exact SQL reconciliation |
| Atomicity and rollback | Single PoolClient transaction helper; guaranteed release; discard on failed rollback | Real SQL failure injection after balance update and final transfer audit insert; lifecycle tests |
| Proper validation, meaningful consistent errors | Zod body/UUID/query schemas, BaseError subclasses, one central middleware | HTTP status/envelope, malformed JSON, size/media, rate-limit and outage tests |
| Bonus transfer; never partial | Ordered account locks, two balance updates, two entries, immutable audit record | Successful, failed, duplicate, concurrent and opposing-transfer tests |
| Local execution, source, README, API docs, assumptions | Docker Compose, environment example, migration/build scripts, Swagger, README | Docker startup, compiled-service smoke tests, OpenAPI/examples/response contract tests |

## Explicit user confirmations

1. **Keep TypeScript.** `src/app.ts` is the only runtime logger/error import and wiring point and compiles to `dist/app.js`. Share dependencies explicitly rather than using global variables or importing the logger/error constructors in every file.
2. **Include the optional transfer after mandatory tests pass.** All 82 mandatory/unit tests passed against Docker PostgreSQL before transfer implementation began.
3. **Transfer length limits:** reference IDs at most 96 characters, descriptions at most 440. This leaves room for `-out`/`-in` and the longer 60-character `Transfer from account <uuid>: ` prefix, without expanding the plan's transaction columns.
4. **Git author:** configured locally for this repository using the name/email supplied by the user. No global Git identity changes.

## Plan-aligned choices and implementation refinements

- Node/TypeScript/Express/native `pg`; strict NodeNext ESM. Express 4 runtime and matching Express 4 types. Zod was upgraded to a patched version after the original dependency audit reported a high-severity advisory.
- Monetary request cap is the plan's `999999999999.99`; actual `NUMERIC(15,2)` storage supports balances up to `9999999999999.99`. These are different limits. Overflow is explicitly rejected with 422, not rounded or returned as an opaque database error.
- Amounts are decimal strings; SQL `NUMERIC` and BigInt cents are exact. Names/descriptions/references are trimmed; identifiers are UUIDv4 and normalized to lowercase.
- Duplicate reference checks precede funds checks so an exhausted debit retry still returns the mandated duplicate response. The unique constraint protects storage even if different transactions race.
- A single repeatable-read snapshot strengthens the plan's coordinated history count/data queries under concurrent writes. Pagination defaults/maxima follow the plan, with a finite integer page bound to avoid unsafe/infinite offsets.
- Migrations are ordered, checksummed and advisory-locked. Applied DDL is not modified. Explicit migration commands are required before service use.
- Immutability is required through the API; SQL mutation-rejection triggers add defense in depth. Privileged DB administrators remain trusted, and balances are only reconciled automatically in tests, not by a production background reconciler.
- Logger and error classes are imported at runtime only in `app.ts`; erased type-only references preserve static typing elsewhere. Request logs omit headers/body/query values, and serialized error URLs are scrubbed. Shared runtime is also exposed through Express locals for server lifecycle and request use.
- Errors always include `details: []` unless there are field issues. Unknown/internal errors and database causes are not exposed even in development. Extra 413/415/429/503 statuses describe explicit infrastructure failures consistently.
- Transfer audit references are globally unique as the plan specifies; regular transaction references remain account-scoped. Derived-reference collisions reject the complete transfer.
- PostgreSQL 17 in Docker Desktop publishes only `127.0.0.1:5433`; the test DB is separate and tests do not destroy ledger records. Credentials in `.env.example` are local placeholders.
- Five business endpoints, three operational JSON endpoints and two documentation endpoints. No account editing/deletion or ledger mutation endpoints were added.

## Scope boundaries and operational limitations

Authentication, frontends, Redis/Kafka/queues, microservices and cloud deployment are outside the supplied plan. This is a single-service local assessment implementation, not a ready-to-expose banking platform. CORS/rate limiting do not provide access control. Production needs include authentication/authorization, TLS, trusted proxy configuration, least-privilege database roles, backups and restore verification, distributed rate limiting if horizontally scaled, operational monitoring and reconciliation.

Failure before commit rolls back all statements. A dropped network connection while acknowledging commit or sending the HTTP response can leave the caller uncertain about a committed operation; this cannot be eliminated by HTTP/database transactions alone. Uniqueness prevents applying a committed reference twice; inspect history before retrying after uncertain failures. UUID tie-breaking is deterministic, not a claim of causal ordering for equal timestamps.
