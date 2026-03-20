# Lance Wallet Service

A fintech wallet service built with Node.js (TypeScript), PostgreSQL, and React. Designed with financial correctness, concurrency safety, and clean architecture as first-class priorities.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [System Architecture](#system-architecture)
3. [Data Model & Ledger Design](#data-model--ledger-design)
4. [API Reference](#api-reference)
5. [Key Design Decisions](#key-design-decisions)
6. [Security](#security)
7. [Concurrency & Financial Correctness](#concurrency--financial-correctness)
8. [Assumptions](#assumptions)
9. [Scaling to 10M Transactions/Day](#scaling-to-10m-transactionsday)

---

## Quick Start

### Option A — Docker Compose (recommended, one command)

**Prerequisites:** Docker + Docker Compose installed.

```bash
git clone <repo-url>
cd wallet-service

docker-compose up --build
```

- Frontend → http://localhost:5173
- Backend API → http://localhost:3000
- Database migrations run automatically on first boot.

---

### Option B — Local Development

**Prerequisites:** Node.js ≥ 20, PostgreSQL ≥ 14 running locally.

#### 1. Database setup

```bash
# Create the database and user
psql -U postgres <<SQL
  CREATE USER wallet_user WITH PASSWORD 'wallet_pass';
  CREATE DATABASE wallet_db OWNER wallet_user;
  GRANT ALL PRIVILEGES ON DATABASE wallet_db TO wallet_user;
SQL
```

#### 2. Backend

```bash
cd backend
cp .env.example .env        # edit DATABASE_URL, JWT_SECRET if needed
npm install
npm run migrate             # creates all tables and indexes
npm run dev                 # starts on http://localhost:3000
```

#### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # starts on http://localhost:5173
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                          │
│                    React SPA (Vite + TypeScript)                │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (proxied through Vite / Nginx)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express REST API                           │
│                    Node.js + TypeScript                         │
│                                                                 │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────────────┐   │
│  │  Routes  │→ │  Services   │→ │  DB Layer (pg Pool)       │   │
│  │          │  │             │  │                           │   │
│  │ /auth    │  │ userService │  │  withTransaction()        │   │
│  │ /users   │  │ walletSvc   │  │  query() / queryOne()     │   │
│  │ /wallet  │  │             │  │                           │   │
│  └──────────┘  └─────────────┘  └──────────────────────────┘   │
│                                                                 │
│  Middleware: helmet · cors · rate-limit · JWT auth · Zod        │
└────────────────────────────┬────────────────────────────────────┘
                             │ pg connection pool
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PostgreSQL 16                           │
│                                                                 │
│   users  ──────┐                                                │
│   wallets ─────┼──── ledger_entries  (source of truth)         │
│   transactions ┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
wallet-service/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts       # Pool setup, withTransaction(), query helpers
│   │   ├── db/
│   │   │   └── migrate.ts        # Schema definition and index creation
│   │   ├── errors/
│   │   │   └── AppError.ts       # Typed error hierarchy
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verify + generateToken
│   │   │   ├── errorHandler.ts   # Centralized error → HTTP response mapping
│   │   │   └── validate.ts       # Zod schema validation factory
│   │   ├── routes/
│   │   │   ├── auth.ts           # POST /auth/register, /auth/login
│   │   │   ├── users.ts          # POST /users, GET /users, GET /users/me
│   │   │   └── wallet.ts         # deposit, transfer, balance, transactions
│   │   ├── services/
│   │   │   ├── userService.ts    # Registration, authentication, user lookup
│   │   │   └── walletService.ts  # All financial logic
│   │   ├── types/
│   │   │   └── index.ts          # Domain interfaces + Express augmentation
│   │   ├── validators/
│   │   │   └── schemas.ts        # Zod schemas for every request shape
│   │   └── index.ts              # Express app + middleware composition
│   ├── Dockerfile
│   └── docker-entrypoint.sh
│
└── frontend/
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.tsx    # Global auth state + persistence
    │   ├── pages/
    │   │   ├── AuthPage.tsx       # Login / Register
    │   │   └── Dashboard.tsx      # Main wallet UI
    │   ├── components/
    │   │   ├── DepositPanel.tsx
    │   │   ├── TransferPanel.tsx
    │   │   └── TransactionList.tsx
    │   ├── services/
    │   │   └── api.ts             # Axios instance + typed API methods
    │   └── App.tsx                # Router + Auth-gated routes
    ├── nginx.conf
    └── Dockerfile
```

---

## Data Model & Ledger Design

The system uses a **double-entry ledger** pattern — the same model used by Stripe, Monzo, and traditional accounting systems.

### Schema

```sql
users
  id            UUID  PRIMARY KEY
  name          VARCHAR(255)
  email         VARCHAR(255)  UNIQUE
  password_hash VARCHAR(255)
  created_at    TIMESTAMPTZ

wallets
  id         UUID  PRIMARY KEY
  user_id    UUID  UNIQUE  →  users.id   (1:1 enforced)
  created_at TIMESTAMPTZ

transactions
  id             UUID  PRIMARY KEY
  type           VARCHAR   ('DEPOSIT' | 'TRANSFER')
  reference      VARCHAR   UNIQUE  -- idempotency key
  from_wallet_id UUID  →  wallets.id  (NULL for deposits)
  to_wallet_id   UUID  →  wallets.id
  amount         NUMERIC(20,2)
  status         VARCHAR   ('PENDING' | 'COMPLETED' | 'FAILED')
  created_at     TIMESTAMPTZ

ledger_entries                          ← PRIMARY SOURCE OF TRUTH
  id             UUID  PRIMARY KEY
  wallet_id      UUID  →  wallets.id
  transaction_id UUID  →  transactions.id
  entry_type     VARCHAR  ('CREDIT' | 'DEBIT')
  amount         NUMERIC(20,2)
  created_at     TIMESTAMPTZ
```

### Why double-entry ledger?

| Approach | Problem |
|---|---|
| Single `balance` column | Race conditions. Two concurrent reads both see $100. Both debit $80. Balance goes to -$60. |
| Balance column + SELECT FOR UPDATE on every read | Works but creates a serialization bottleneck on a single hot row |
| **Ledger entries (this system)** | Balance is computed, never mutated. Entries are append-only. No update contention. Full audit trail. |

### Balance derivation

```sql
SELECT
  COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END), 0)
FROM ledger_entries
WHERE wallet_id = $1
```

This runs in O(n) on the wallet's entries but is mitigated by the `idx_ledger_entries_wallet_id` index. For very active wallets at scale, a cached or materialized balance with event sourcing reconciliation is the right next step (see [Scaling](#scaling-to-10m-transactionsday)).

---

## API Reference

All endpoints return:
```json
{ "success": true, "data": { ... } }
// or
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

### Authentication

All `/wallet` and `/users` routes require:
```
Authorization: Bearer <jwt_token>
```

---

### POST /auth/register  &  POST /users

Create user + wallet atomically. Returns JWT.

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{ "name": "John Doe", "email": "john@example.com", "password": "secret123" }'
```

```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "name": "John Doe", "email": "john@example.com" },
    "wallet": { "id": "uuid", "user_id": "uuid" },
    "token": "eyJ..."
  }
}
```

---

### POST /auth/login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "john@example.com", "password": "secret123" }'
```

---

### POST /wallet/deposit

Deposit funds into the authenticated user's wallet.

Supports idempotency via `Idempotency-Key` header — safe to retry on network failure.

```bash
curl -X POST http://localhost:3000/wallet/deposit \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{ "user_id": "uuid", "amount": 5000 }'
```

---

### POST /wallet/transfer

Transfer funds to another user atomically. Sender must be the authenticated user.

```bash
curl -X POST http://localhost:3000/wallet/transfer \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{ "from_user_id": "uuid-a", "to_user_id": "uuid-b", "amount": 1000 }'
```

**Error cases:**
- `422 INSUFFICIENT_FUNDS` — sender balance too low
- `422 VALIDATION_ERROR` — invalid amount, same sender/receiver, etc.
- `409 CONFLICT` — duplicate idempotency key (returns original result)

---

### GET /wallet/:user_id/balance

```bash
curl http://localhost:3000/wallet/<user_id>/balance \
  -H "Authorization: Bearer <token>"
```

```json
{
  "success": true,
  "data": { "user_id": "...", "wallet_id": "...", "balance": 4000.00, "currency": "NGN" }
}
```

---

### GET /wallet/:user_id/transactions

Supports `?limit=50&offset=0` for pagination.

```bash
curl "http://localhost:3000/wallet/<user_id>/transactions?limit=20&offset=0" \
  -H "Authorization: Bearer <token>"
```

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "...",
        "type": "TRANSFER",
        "direction": "DEBIT",
        "amount": 1000,
        "counterparty_name": "Jane Smith",
        "created_at": "2026-03-19T10:00:00Z",
        "status": "COMPLETED"
      }
    ],
    "pagination": { "limit": 20, "offset": 0, "count": 1 }
  }
}
```

---

### GET /users

Returns all other users (for the transfer recipient picker).

---

## Key Design Decisions

### 1. Ledger as source of truth, not balance column

The balance is always **derived** by summing `ledger_entries`. This means:
- No UPDATE contention on a single balance column under concurrent load
- The full audit trail is preserved — you can reconstruct any wallet's state at any point in time
- A corrupted balance is impossible — the data is in append-only entries

### 2. Pessimistic locking with deterministic lock ordering

Transfers use `SELECT ... FOR UPDATE` inside a transaction. Locks are acquired by sorting wallet IDs alphabetically before locking. This prevents deadlocks when two concurrent transfers involve the same pair of wallets in opposite directions:

```
Concurrent: A→B and B→A
Without ordering: A→B locks A, B→A locks B → deadlock waiting on each other
With ordering:    both lock the lower UUID first → one waits, one proceeds
```

### 3. Idempotency via `reference` column

Every mutating endpoint accepts an `Idempotency-Key` header. If a transaction with that key already exists, the original result is returned without re-processing. This means clients can safely retry failed network requests — there's no risk of double-charging.

The `UNIQUE` constraint on `transactions.reference` acts as the database-level guard. Even if two requests with the same key arrive simultaneously, the database constraint ensures only one is committed.

### 4. NUMERIC(20,2) — never floats for money

`NUMERIC` is an exact arbitrary-precision type in PostgreSQL. Using `FLOAT` or `DOUBLE` for monetary amounts leads to well-known rounding errors (e.g. 0.1 + 0.2 ≠ 0.3 in IEEE 754). All amounts are validated server-side to have at most 2 decimal places.

### 5. Typed error hierarchy

A custom `AppError` class hierarchy means error handling is clean and type-safe across the entire stack. The error middleware maps error types to HTTP status codes in one place — no scattered `res.status(400).json(...)` calls throughout the codebase.

### 6. Structured service layer

No SQL in routes. Routes handle HTTP concerns (parse request, call service, format response). Services own all business logic. The `config/database.ts` module owns all DB access patterns. This layering makes the codebase testable and maintainable.

---

## Security

| Concern | Implementation |
|---|---|
| **Authentication** | JWT (HS256), 7-day expiry, `Bearer` scheme |
| **Password storage** | bcrypt with 12 salt rounds |
| **Input validation** | Zod schemas on every request body and route param |
| **Authorization** | Users can only act on their own wallet (enforced in route handlers) |
| **Idempotency** | `Idempotency-Key` header + DB unique constraint prevents double submissions |
| **Rate limiting** | `express-rate-limit` — 100 req/15 min globally |
| **HTTP headers** | `helmet` sets CSP, HSTS, X-Frame-Options, etc. |
| **Payload size** | Express body parser limited to 10KB |
| **User enumeration** | Login returns identical error for wrong email or wrong password |
| **SQL injection** | Parameterized queries exclusively — no string concatenation |

---

## Concurrency & Financial Correctness

Three failure modes are explicitly addressed:

**Race condition (TOCTOU):**
> Two requests both read balance $100, both see sufficient funds for a $80 transfer, both proceed → balance goes to -$60.

**Solution:** Balance is re-read *inside* the locked transaction. The `SELECT ... FOR UPDATE` prevents any other transaction from reading or modifying the wallet rows until the current transaction commits.

**Double spending:**
> The same transfer request is submitted twice (network retry, user double-click).

**Solution:** Client generates a UUID `Idempotency-Key` per action. The DB `UNIQUE` constraint on `transactions.reference` rejects the second insert. The service layer detects the conflict and returns the original result.

**Partial updates:**
> Transfer debits sender but crashes before crediting receiver.

**Solution:** The debit entry, credit entry, and transaction record are all written inside a single `BEGIN...COMMIT` block via `withTransaction()`. PostgreSQL guarantees atomicity — either all three writes happen or none do.

---

## Assumptions

1. **Currency:** All amounts are in Nigerian Naira (NGN). Multi-currency support would require a `currency` field on wallets and FX rate handling.

2. **One wallet per user:** The `UNIQUE` constraint on `wallets.user_id` enforces this. Multi-wallet support is a schema change only.

3. **Deposits are trust-based:** In a real system, deposits originate from a payment gateway (Paystack, Flutterwave) via webhook — not user-initiated API calls. Here, any authenticated user can deposit to their own wallet to simulate funded accounts.

4. **Amounts in base units:** The API accepts decimal amounts (e.g. `1000.50` = ₦1,000.50). An alternative approach used by some fintechs is to work in kobo (smallest unit) throughout to avoid any decimal math.

5. **No soft deletes:** Users and wallets are not deletable via the API — appropriate for a financial system where audit trails must be preserved.

6. **JWT is stateless:** There is no token revocation. A logged-out token remains valid until expiry. At scale, a Redis-backed token denylist would address this.

---

## Scaling to 10M Transactions/Day

10M transactions/day ≈ **116 transactions/second** on average, with peaks likely 3–5× that (~350–580 TPS). Here is how this architecture scales to meet that:

### Database

**Read/Write splitting**
Deploy PostgreSQL with one primary (writes) and 1–2 read replicas (reads). Balance queries and transaction history go to replicas. Writes (deposits, transfers) go to primary only.

**Partitioning**
Partition `ledger_entries` by `created_at` (monthly range partitions). This keeps active partitions small and makes archival of old data trivial. Index scans on recent data stay fast regardless of total table size.

**Materialized balance cache**
At high volume, summing all ledger entries per request becomes expensive. Introduce a `wallet_balances` table updated via a background worker (or PostgreSQL trigger) as a read-optimized projection. The ledger remains the source of truth; the materialized balance is a cache. On any discrepancy (detected by periodic reconciliation), the ledger wins.

**Connection pooling with PgBouncer**
PostgreSQL's max connections is typically 100–500. With multiple API instances each holding a pool of 20, you exhaust that fast. PgBouncer in transaction-mode pooling multiplexes thousands of app connections onto a small set of real PostgreSQL connections.

### Application Layer

**Horizontal scaling**
The API service is stateless (JWTs, no in-process session state). Run 5–10 instances behind a load balancer (AWS ALB, GCP Load Balancer). Each additional instance adds ~100 RPS capacity.

**Async processing for non-critical paths**
Transaction history emails, analytics events, fraud scoring — offload to a job queue (BullMQ + Redis, or AWS SQS). The HTTP response returns immediately; the side effects happen asynchronously.

**Idempotency key caching**
Move idempotency key checks from a DB query to a Redis `SETNX` operation. This is significantly faster and removes a DB round-trip from the hot path. TTL of 24 hours matches typical retry windows.

### Queue-based Transfer Processing

At very high volume, synchronous DB-locked transfers create contention. The alternative is a **CQRS + event-sourcing pattern**:

1. HTTP handler writes a `transfer_requested` event to a Kafka topic. Returns `202 Accepted` with a correlation ID.
2. A consumer service processes transfer events serially per wallet (using Kafka partition key = wallet ID, guaranteeing ordering).
3. Client polls `GET /transfers/:id/status` or receives a webhook when complete.

This decouples throughput from PostgreSQL write latency entirely.

### Caching

| Data | Cache | TTL |
|---|---|---|
| User profile | Redis | 5 min |
| Wallet balance | Redis | 30 sec (or event-invalidated) |
| Idempotency keys | Redis SETNX | 24 hr |
| JWT denylist | Redis SET | Token TTL |

### Infrastructure

- **API servers:** AWS ECS (Fargate) or GKE — auto-scales on CPU/request latency
- **Database:** AWS RDS PostgreSQL (Multi-AZ) + read replicas, or Aurora PostgreSQL (auto-scales storage)
- **Cache:** AWS ElastiCache (Redis Cluster Mode)
- **Queue:** AWS SQS or Kafka (MSK) for async job processing
- **CDN:** CloudFront in front of the frontend for static asset caching
- **Load balancer:** AWS ALB with sticky sessions disabled (stateless API)

### Observability

- **Metrics:** Prometheus + Grafana — track P50/P95/P99 latency per endpoint, DB query times, queue depth, error rates
- **Tracing:** OpenTelemetry with Jaeger or AWS X-Ray — trace a single transaction across API → DB → queue
- **Logging:** Structured JSON logs (Pino) shipped to CloudWatch or Datadog
- **Alerting:** PagerDuty alerts on: error rate > 1%, P99 latency > 2s, queue depth > 10k, DB replication lag > 30s
- **Reconciliation job:** A nightly cron that sums all ledger entries and verifies the accounting identity (total credits = total debits). Any discrepancy pages on-call immediately.

---

## Running Tests (if adding)

```bash
cd backend
npm test               # Jest unit + integration tests
npm run test:coverage  # Coverage report
```

> Tests are not included in this submission to stay within the time budget, but the service layer is designed to be fully unit-testable — services accept a `client` parameter (making DB injection trivial) and all external dependencies are abstracted behind interfaces.
