# Transaction Ledger API — Confluencr Assessment

A locally runnable **Node.js + TypeScript + Express + PostgreSQL** ledger service implementing the assessment in `Full Stack Developer Assessment.pdf` and the supplied `implementation_plan.md`.

**Five business endpoints:** four mandatory endpoints plus the optional atomic transfer. Includes exact monetary arithmetic, database constraints, concurrent-operation safety, centralized structured logging/error handling, automated PostgreSQL integration tests, and Swagger/OpenAPI 3.1 documentation.

## 1. Prerequisites

- Node.js **20.19+** (tested with Node.js 24) and npm.
- **Docker Desktop**, running with Linux containers (Windows: WSL2 backend).
- Git, if cloning the repository.
- Free local ports `3000` (API) and `5433` (PostgreSQL host port).

No global PostgreSQL installation, ORM, Redis, or external service is required.

## 2. Local setup

```sh
git clone https://github.com/Kuldeep-Pradhan/confluencr_assessment.git
cd confluencr_assessment
npm ci
```

Create your local environment file:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS/Linux
cp .env.example .env
```

Start Docker Desktop, then run:

```sh
npm run db:up
npm run migrate
npm run dev
```

`db:up` waits for PostgreSQL to be healthy. On the first startup, Docker initializes `transaction_ledger` and a separate `transaction_ledger_test` database. `migrate` applies SQL migrations with checksums, a database migration lock, and atomic rollback; rerunning it safely skips applied migrations. **Do not modify applied migration files**; add a new numbered SQL migration instead.

- API: <http://localhost:3000/api/v1>
- Liveness: <http://localhost:3000/health>
- PostgreSQL readiness: <http://localhost:3000/health/ready>
- Swagger UI / interactive **Try it out**: <http://localhost:3000/api/v1/docs/>
- Swagger specification: [`docs/openapi.yaml`](docs/openapi.yaml), also served at <http://localhost:3000/api/v1/openapi.yaml>

### Connect through Docker Desktop

Open **Docker Desktop → Containers → confluencr_assessment → postgres → Exec** and run:

```sh
psql -U ledger -d transaction_ledger
```

Alternatively, from this project directory:

```sh
docker compose exec postgres psql -U ledger -d transaction_ledger
```

For a desktop SQL client, connect to host `localhost`, port `5433`, database `transaction_ledger`, user `ledger`, and the password from `.env`. PostgreSQL listens on port `5432` **inside** its container; the Node service runs on the host and uses port `5433`. Only the loopback address is published.

Useful non-destructive commands:

```sh
docker compose ps
docker compose logs postgres
npm run db:stop
```

The named volume persists database data across stops. **Do not use `docker compose down -v` unless you intentionally want to erase all ledger data.** Changing Docker database/user/password variables does not change an already initialized volume's credentials.

## 3. Environment configuration

All settings are documented in `.env.example`. `.env` is private and ignored by Git. The example credentials are **local-development placeholders**, not production secrets.

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `3000` | HTTP port, integer 1–65535 |
| `LOG_LEVEL` | `info` | Pino level: fatal/error/warn/info/debug/trace/silent |
| `POSTGRES_USER` | `ledger` | Docker initialization user |
| `POSTGRES_PASSWORD` | `ledger_local_password` | Docker initialization password; replace for non-local use |
| `POSTGRES_DB` | `transaction_ledger` | Docker initialization application database |
| `POSTGRES_PORT` | `5433` | Published host database port |
| `DATABASE_URL` | See `.env.example` | Required PostgreSQL connection URL for the service/migrations |
| `TEST_DATABASE_URL` | Same host, database `transaction_ledger_test` | Required integration-test URL; must differ from application DB and end in `_test` |
| `DB_POOL_MAX` | `20` | Maximum concurrent PostgreSQL connections, 1–100 |
| `DB_IDLE_TIMEOUT_MS` | `30000` | Idle connection timeout |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | Connection acquisition timeout |
| `DB_STATEMENT_TIMEOUT_MS` | `10000` | PostgreSQL statement timeout |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated HTTP(S) browser origins; no wildcard or URL paths |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Per-IP rate-limit window for `/api/v1` |
| `RATE_LIMIT_MAX` | `100` | Requests allowed per window, including Swagger requests |

If you change user, password, port, or database, update `DATABASE_URL` and `TEST_DATABASE_URL` consistently. Percent-encode special characters in URL credentials. The Docker initialization script creates `transaction_ledger_test`; if you choose a different test DB, create it explicitly with `psql`. Startup rejects invalid settings without printing their secret values.

## 4. Endpoints and usage

### Five business API operations

| Method | Endpoint | What it does |
| --- | --- | --- |
| `POST` | `/api/v1/accounts` | Creates an account with system-generated UUID/timestamp and balance `"0.00"` |
| `POST` | `/api/v1/accounts/:accountId/transactions` | Adds a credit or debit and updates balance atomically |
| `GET` | `/api/v1/accounts/:accountId/balance` | Gets account ID, holder name, and current committed balance |
| `GET` | `/api/v1/accounts/:accountId/transactions` | Lists immutable transactions with filtering and pagination |
| `POST` | `/api/v1/transfers` | Bonus: atomically transfers funds and creates two ledger entries plus an audit record |

There are also **three operational JSON endpoints** (`GET /health`, `GET /health/ready`, `GET /api/v1`) and **two documentation endpoints** (`GET /api/v1/docs/`, `GET /api/v1/openapi.yaml`). Liveness means the process is running; readiness executes a real database query and returns `503` on a database outage. It does not assert migrations have run.

The Swagger file describes **every request body, parameter, success body, and applicable error body**, with examples. Use Swagger UI for an OS-independent way to exercise the API.

### PowerShell end-to-end example

```powershell
$base = 'http://localhost:3000/api/v1'

$a = Invoke-RestMethod -Method Post -Uri "$base/accounts" -ContentType 'application/json' -Body (@{name='Jane Doe'} | ConvertTo-Json)
$b = Invoke-RestMethod -Method Post -Uri "$base/accounts" -ContentType 'application/json' -Body (@{name='Vendor'} | ConvertTo-Json)
$id = $a.data.id

# Credit
Invoke-RestMethod -Method Post -Uri "$base/accounts/$id/transactions" -ContentType 'application/json' -Body (@{type='credit';amount='100.50';description='Invoice payment';reference_id='REF-001'} | ConvertTo-Json)

# Debit
Invoke-RestMethod -Method Post -Uri "$base/accounts/$id/transactions" -ContentType 'application/json' -Body (@{type='debit';amount='30.25';reference_id='REF-002'} | ConvertTo-Json)

# Balance: 70.25
Invoke-RestMethod -Uri "$base/accounts/$id/balance"
Invoke-RestMethod -Uri "$base/accounts/$id/transactions?type=credit&page=1&limit=10"

# Transfer 20.00: source becomes 50.25, destination becomes 20.00
Invoke-RestMethod -Method Post -Uri "$base/transfers" -ContentType 'application/json' -Body (@{source_account_id=$id;destination_account_id=$b.data.id;amount='20.00';description='Vendor settlement';reference_id='TRF-001'} | ConvertTo-Json)
```

Use fresh reference IDs if you repeat the example. Retrying an existing reference is intentionally rejected with `409`, without a second ledger entry or balance update.

### Request validation rules

- JSON bodies only; maximum **10kb**. Unknown body fields are rejected.
- `name`: trimmed, non-empty, up to 255 characters. Clients cannot set initial balance, IDs, or timestamps.
- Account identifiers: valid UUIDv4, normalized to lowercase. Malformed → `400`; valid but absent → `404`.
- `type`: exactly `credit` or `debit`.
- `amount`: **decimal string**, positive, at most two decimal places, maximum `"999999999999.99"`. `"50"` and `"50.5"` normalize to `"50.00"` and `"50.50"`; numeric JSON amounts are rejected.
- `reference_id`: trimmed, non-empty, case-sensitive, up to 100 characters for regular transactions; unique **within the account**. The same reference may be used on another account.
- `description`: optional trimmed string, defaults to `""`, maximum 500 characters.
- History: `type=credit`, `type=debit`, omitted, or empty. `page` defaults to 1 (max 2147483647); `limit` defaults to 10 (max 100). Positive decimal integers only; repeated/unknown query parameters are rejected.
- History sort: `created_at DESC, id DESC`. Out-of-range pages are successful with `transactions: []` and accurate counts; empty history has `total_pages: 0`.
- Transfer: different existing accounts; source must have funds. Reference is globally unique and limited to **96** characters; description limited to **440**, as confirmed before development. Derived ledger references append `-out`/`-in`; description prefixes identify the counterpart account. Conflicts with a regular transaction's derived reference return `409 DUPLICATE_TRANSACTION`.
- Cumulative balance is limited to `"9999999999999.99"` by `NUMERIC(15,2)`; a credit/transfer that would exceed it returns `422 BALANCE_LIMIT_EXCEEDED` without changes.

### Response/error format

```json
{ "success": true, "data": { "account_id": "a98c8f8e-42c2-47e1-889b-82f534891bca", "name": "Jane Doe", "balance": "70.25" } }
```

```json
{ "success": false, "error": { "code": "INSUFFICIENT_FUNDS", "message": "Account has insufficient balance for this operation", "details": [] } }
```

| HTTP | Error code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid JSON/body/UUID/type/amount/pagination; validation details include field paths |
| `404` | `ACCOUNT_NOT_FOUND` / `NOT_FOUND` | Missing account / unmapped route |
| `409` | `DUPLICATE_TRANSACTION` / `DUPLICATE_TRANSFER` | Existing account reference / existing global transfer reference |
| `413` | `PAYLOAD_TOO_LARGE` | Body exceeds 10kb |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | POST must use JSON; unsupported encoding/charset |
| `422` | `INSUFFICIENT_FUNDS` / `BALANCE_LIMIT_EXCEEDED` | Overdraft or balance overflow prevented |
| `429` | `RATE_LIMIT_EXCEEDED` | Wait for the next window; inspect `Retry-After` and `RateLimit` |
| `500` | `DATABASE_ERROR` / `INTERNAL_SERVER_ERROR` | Database or unexpected failure; no secret/SQL/stack details exposed |
| `503` | `SERVICE_UNAVAILABLE` | Readiness database query failed |

For a connection interruption during commit or after commit but before the HTTP response arrives, the caller may not know whether the operation committed. Check history/reference before retrying; a committed reference is protected by uniqueness and returns `409`. A network outage cannot guarantee acknowledgement delivery.

## 5. Architecture, logger and errors

```text
Routes → Zod validation → Controllers → Services → Repositories → pg.Pool/PostgreSQL
                         ↘ centralized error middleware ↗
```

- **Single composition root:** `src/app.ts` (compiled to `dist/app.js`) is the only runtime importer of `config/logger.ts`, error classes, and the centralized error handler. The shared `{ logger, errors }` runtime is passed into factories. Request handlers can use `res.locals.logger`; application/process code uses `app.locals.runtime.logger`. There are no globals or repeated logger/error-class imports in business layers.
- **Error hierarchy:** `BaseError` → `ValidationError`, `NotFoundError`, `DbError`, `DuplicateTransactionError`, `DuplicateTransferError`, `InsufficientFundsError`, `BalanceLimitError`, and infrastructure-specific subclasses. Each layer throws the appropriate subclass; PostgreSQL constraint errors are translated centrally. All errors converge on one Express error middleware.
- **Logging:** Pino emits structured JSON to stdout, with service name, request ID, method, path, status, and duration. No request body, cookies, authorization header, or connection URL is logged. Database URLs are scrubbed from serialized errors; internal errors stay in logs rather than responses. Supply `X-Request-Id` to correlate requests (validated; generated if missing/invalid).
- **Database:** native `pg` pooling; parameterized SQL; UUIDs and timestamps generated by PostgreSQL. Monetary arithmetic happens in `NUMERIC(15,2)` SQL, with exact `BigInt` cents for comparisons, never floating-point money arithmetic.
- **Concurrency/atomicity:** one checked-out client for `BEGIN` through `COMMIT`/`ROLLBACK`; account row locks prevent lost updates/overdrafts. Transfers acquire account locks in sorted UUID order. Duplicate constraints remain the final defense against races. Failed rollbacks discard connections; clients are always released.
- **History:** a read-only repeatable-read transaction makes existence, count, and page consistent during concurrent writes.
- **Immutability:** no ledger PUT/PATCH/DELETE routes; repositories provide no ledger mutation methods; database triggers reject UPDATE/DELETE/TRUNCATE of transactions and transfer audit records. Foreign keys protect account history. A privileged administrator can bypass database protections; this is not a cryptographic tamper-proof ledger.
- **Security boundaries:** Helmet, an explicit CORS origin list, per-IP rate limiting, JSON size limit, and strict input validation. Authentication/JWT is outside the supplied plan. CORS is not authentication. Add authentication, TLS, least-privilege DB roles, durable backups, and shared rate limiting before any public/production deployment. `trust proxy` is not enabled; configure it deliberately only behind a trusted proxy.

See [`docs/decisions.md`](docs/decisions.md) for requirement mapping and confirmed design decisions. The original plan is retained unmodified for comparison.

## 6. Testing and production-style build

Start PostgreSQL before integration testing:

```sh
npm run db:up
npm run lint
npm test
npm run docs:validate
npm run build
npm run migrate:prod
npm start
```

Stop the development server before `npm start` to avoid a port conflict. The build copies migrations and Swagger files to `dist`, so compiled startup and migrations do not depend on TypeScript execution. Migrations are explicit, not automatically run on each HTTP startup.

Individual suites:

```sh
npm run test:unit
npm run test:integration
```

The Node native test runner + Supertest tests **real HTTP behavior against live PostgreSQL**. Integration tests apply migrations automatically to `TEST_DATABASE_URL`, refuse the application database, use fresh accounts/references, and do not truncate or delete ledger data. Repeated runs add fixtures only to the separate test database. Failure-injection tests create narrowly scoped temporary triggers in that DB and remove those test-created triggers in `finally` blocks. Files execute sequentially; individual concurrency tests intentionally issue simultaneous requests.

Coverage includes all business and operational endpoints, malformed inputs, insufficient funds, duplicates (including exhausted debits), same references on different accounts, concurrent credits/debits/transfers, opposing transfers/deadlock avoidance, actual database-failure rollback, ledger reconciliation, immutability, filtering/pagination/tie-breaking, rate limiting, CORS, database outage, Swagger serving, specification validation, and actual response/schema contract validation. See [`docs/testing.md`](docs/testing.md) for the final execution record.

## 7. Troubleshooting and maintenance

- **Docker engine unavailable:** open Docker Desktop and wait for Linux engine readiness; check `docker version`.
- **Database connection refused:** run `docker compose ps`, check `5433` and both URL settings; use `/health/ready`.
- **Missing relation:** run `npm run migrate` against the configured application DB.
- **Database test setup fails:** confirm the separate `_test` database exists. If a pre-existing Docker volume skipped initialization, create it with `docker compose exec postgres psql -U ledger -d postgres -c "CREATE DATABASE transaction_ledger_test;"` (only if it is absent).
- **Port in use:** change `PORT`, or change `POSTGRES_PORT` plus both DB URLs; recreate the container non-destructively with `npm run db:up`.
- **429 while experimenting:** wait for `Retry-After`, or increase `RATE_LIMIT_MAX` in your local `.env`.
- **Credentials changed but login fails:** existing volumes preserve original credentials; change credentials inside PostgreSQL deliberately, not by deleting ledger volumes.
- Keep `.env`, logs, `node_modules`, `dist`, coverage, private keys, database dumps and graph caches out of Git; `.gitignore` already covers these. Commit the lockfile, migrations, tests and `.env.example`.
- SIGINT/SIGTERM close the HTTP server and pool; fatal errors are logged and terminate rather than leaving an unhealthy process running.
