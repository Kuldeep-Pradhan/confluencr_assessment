# Verification record

The final local verification was run on October 28, 2026 with Node.js 24.19, Docker Desktop PostgreSQL 17 Alpine, the separate `transaction_ledger_test` database, and the checked-in scripts.

## Commands

```text
npm run db:up
npm run lint
npm run docs:validate
npm test
npm run build
npm run migrate:prod
npm audit --audit-level=low
```

## Results

- `npm run lint`: passed (`tsc --noEmit` for source and test configurations).
- `npm run docs:validate`: passed; Swagger Parser validates `docs/openapi.yaml` as OpenAPI 3.1.
- `npm test`: passed with 100 tests across unit, integration, transfer, and OpenAPI contract suites.
- `npm run build`: passed; TypeScript output plus migrations and docs were copied to `dist`.
- `npm audit --audit-level=low`: passed with zero known vulnerabilities at the final dependency set.

## Behaviour covered

- Account zero-balance creation, server-controlled fields, UUIDv4, timestamp and name validation.
- Balance reads, malformed/missing account handling, exact decimal arithmetic and overflow.
- Credit/debit atomicity, insufficient funds, duplicate references, same-reference cross-account behaviour, exhausted-debit retries.
- Concurrent duplicate requests, concurrent credits, concurrent debits without overdraft.
- Real PostgreSQL failure injected after balance mutation; rollback verified for account transactions.
- Transaction history filtering, empty filters, pagination defaults and validation, empty/out-of-range totals, latest-first deterministic sorting.
- API and SQL ledger immutability; reconciliation against credit/debit sums.
- Successful transfers, self/missing account validation, insufficient source, duplicate transfer, derived-reference collision, concurrent duplicate transfers, globally unique transfer references, opposing transfers with ordered locks, concurrent overdraft prevention, destination overflow, and rollback on audit-insert failure.
- Health/readiness, database outage response, request IDs, centralized errors, CORS, rate limiting, malformed JSON, body-size and content-type protections.
- Swagger UI/spec serving; request/response examples and live success/error responses validated against the published OpenAPI schemas.

The integration database is deliberately persistent and no test truncates production-style test data. Test names and references that must be unique are generated or use UUIDs. Failure-injection triggers/functions are removed in `finally` blocks.
