# NOTES.md — Architectural Decisions & Production Engineering

## 1. System Architecture: Layered Monorepo

We adopted a **strict layered monorepo architecture** that cleanly separates concerns while keeping the developer experience unified:

```text
community-wallet/
├── backend/          # Express API, Prisma ORM, Services, Middleware
├── frontend/         # React 18, Vite, Zustand, SSE Client
├── tests/            # Unit, Integration, Concurrency Jest Suites
├── .github/          # GitHub Actions CI Workflow
├── README.md         # Deployment & Getting Started Guide
├── NOTES.md          # Architectural decisions & design rationale
└── REVIEW.md         # Legacy security review & vulnerability audit
```

### Architectural Layering
- **Routes Layer (`routes/`):** Pure HTTP routing, path parameters, and route-level middleware attachment.
- **Middleware Layer (`middleware/`):** JWT authentication, role verification (RBAC), rate limiting, idempotency interceptors, double-click guards, and centralized error handling.
- **Controller Layer (`controllers/`):** Request validation, payload extraction, HTTP response status code mapping.
- **Service Layer (`services/`):** Core business logic, transaction orchestration, database mutations, and domain invariants.
- **Persistence Layer (`prisma/`):** Strongly typed models, schema migrations, and raw query optimizations for concurrency locking.

This architecture ensures that the service layer is decoupled from HTTP transports, allowing identical services to be invoked from web requests, CLI scripts, background workers, or automated test runners.

---

## 2. Database Selection: PostgreSQL & Decimal Precision

### Why PostgreSQL?
1. **ACID Transactions:** Full atomicity across multi-row wallet and ledger updates.
2. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`):** Critical for preventing race conditions and double-spending under high concurrency.
3. **Interactive Transactions:** Prisma interactive transactions (`prisma.$transaction(async (tx) => { ... })`) run against PostgreSQL with configurable timeout and isolation levels.
4. **JSON Support:** Native `jsonb` storage for flexible ledger metadata (e.g., counterparty mobile, transfer notes).

### Exact Decimal Math
Floating-point arithmetic (`0.1 + 0.2 === 0.30000000000000004`) causes financial inaccuracies. We enforce `Decimal(20, 2)` across all balance, pending, and transfer tables in Prisma:
- Strict validation regex: `/^\d+(\.\d{1,2})?$/`.
- Negative balances and zero-transfers rejected at the validation layer.
- Amounts parsed and serialized as exact strings or Prisma `Decimal` instances to preserve monetary precision.

---

## 3. Concurrency Strategy & Race Condition Prevention

### The Problem
When 20 concurrent transfer requests of ₹10 arrive simultaneously for a wallet containing ₹100, a naive `findUnique` followed by `update` suffers from a **Time-of-Check to Time-of-Use (TOCTOU)** race condition. Both threads read balance as ₹100, calculate ₹90, and write back, allowing 20 transfers (₹200 spent) from a ₹100 balance.

### The Solution: Pessimistic Row Locking
In [`wallet.service.js`](backend/src/services/wallet.service.js):
1. **Interactive Transaction:** Open a dedicated transaction.
2. **Row Lock:** Acquire an exclusive lock on the sender's wallet row:
   ```sql
   SELECT id, balance, pending FROM "wallets" WHERE "userId" = $1 FOR UPDATE;
   ```
3. **Re-Read In-Transaction:** Read the locked, authoritative balance inside the transaction.
4. **Invariant Check:** Verify `availableBalance >= transferAmount`. If insufficient, immediately fail and rollback without mutating state.
5. **Atomic Update:** Deduct from sender, credit receiver, record double-entry ledger entries, and save transfer record.
6. **Deadlock Prevention:** When transferring between two wallets, locks are acquired in consistent order (by user ID sort) to prevent circular wait deadlocks.

**Verified Result:** In our 20-thread concurrency test (`concurrent.transfer.test.js`), exactly 10 transfers succeed (₹100 / ₹10), exactly 10 fail with `400 Bad Request` ("Insufficient available balance"), and the final wallet balance is exactly ₹0.00.

---

## 4. Double-Entry Append-Only Ledger

### Fundamental Financial Invariant
$$\sum (\text{Ledger Entries}) \equiv \text{Wallet Balance}$$

1. **Atomic Dual-Entry:** Every point movement writes a corresponding `LedgerEntry` inside the exact same database transaction:
   - **Sender:** `TRANSFER_OUT` (`-amount`), recording `balanceAfter`.
   - **Receiver:** `TRANSFER_IN` (`+amount`), recording `balanceAfter`.
2. **Append-Only Immutability:** No `UPDATE` or `DELETE` queries are ever permitted on `ledger_entries`. Adjustments or reversals are represented as new debit or credit rows.
3. **Reconciliation Audit:** An automated check computes `SUM(amount)` grouped by user and asserts equality with `wallets.balance`. In our test suite, this invariant holds true across sequential, batch, and concurrent stress tests.

---

## 5. Strict Idempotency Mechanism

Financial networks experience retries due to network drops, client timeouts, or aggressive user double-clicks.

### Two-Tier Protection
1. **Application Middleware (`middleware/idempotency.js`):**
   - Intercepts requests bearing an `Idempotency-Key` header.
   - Checks `idempotency_records` table (`userId`, `idempotencyKey`).
   - If a cached record exists, returns the identical HTTP status and cached JSON response without executing business logic or moving funds.
2. **Database Constraint:**
   - The `transfers` table enforces a unique constraint: `@@unique([senderId, idempotencyKey])`.
   - In parallel race conditions with identical idempotency keys, one transaction commits the unique key; the rival transaction hits the constraint, is rolled back safely, and returns the original response.

---

## 6. Strict Role-Based Access Control (RBAC)

### Permission Matrix

| Endpoint | Required Permission | Violation Response |
| :--- | :--- | :--- |
| `POST /admin/credits/bulk` | `role === 'ADMIN'` | **403 Forbidden** (`"Admin privileges required"`) |
| `GET /groups/:gid/wallet` | Group Member or Leader | **403 Forbidden** (`"You are not a member of this group"`) |
| `POST /groups/:gid/withdrawals` | Group Member or Leader | **403 Forbidden** (`"You are not a member of this group"`) |
| `POST /groups/:gid/withdrawals/:id/approve` | **Group `LEADER` only** | **403 Forbidden** (`"Only group leaders can approve"`) |
| `POST /groups/:gid/withdrawals/:id/reject` | **Group `LEADER` only** | **403 Forbidden** (`"Only group leaders can reject"`) |
| `PATCH /me/roles` | **Reviewer Sandbox accounts only** | **403 Forbidden** (`"Role switching is restricted to Reviewer Sandbox accounts"`) |

### Reviewer Sandbox Security
- In a production banking app, an exposed role-switching API is a severe vulnerability.
- To provide reviewers an effortless demonstration experience without compromising safety, we built the **Reviewer Sandbox**:
  - The database flags accounts with `isDemoAccount: true`.
  - Only the 3 seeded demo accounts (`9000000001`, `9000000002`, `9000000003`) are permitted to call `PATCH /me/roles`.
  - Any newly registered user through the registration wizard is initialized with `role = 'USER'`, `isAdmin = false`, and `isDemoAccount = false`. Calling `PATCH /me/roles` returns `403 Forbidden`.

---

## 7. Real-Time Balance Synchronization (Server-Sent Events)

### Why Server-Sent Events (SSE) over WebSockets?
- **Unidirectional Requirement:** The server only needs to push balance changes and notifications to the client; client mutations happen via standard REST POST/PATCH calls.
- **HTTP Compatibility:** Works seamlessly over standard HTTP/2, requires no special proxy configuration, and handles auto-reconnection natively via the browser `EventSource` API.
- **Implementation:**
  - Backed by an in-memory Node.js `EventEmitter` (`utils/eventBus.js`).
  - When transfers, admin bulk credits, or group withdrawal approvals settle, an event is emitted: `eventBus.emit('wallet:update', { userId, ... })`.
  - The client connection (`GET /wallet/stream`) receives a JSON payload and automatically refreshes balance cards and displays live toast notifications.

---

## 8. Group Wallets, Multi-Sig Earmarks & Lazy Expiry

### Financial Earmarking
When a member requests a withdrawal of ₹100 from a Group Wallet:
- The ₹100 is not immediately removed; it is **earmarked** by incrementing `group_wallets.pending`.
- Available group balance: `available = balance - pending`.
- Subsequent withdrawal requests that exceed available funds are rejected with `400 Bad Request`.

### Approval / Rejection Lifecycle
- **Approve:** Decrements `group_wallets.balance` and `group_wallets.pending`, writes ledger entry, credits member's personal wallet, and marks withdrawal `APPROVED`.
- **Reject:** Decrements `group_wallets.pending`, freeing the earmarked funds back to available balance.

### Lazy Expiry
Rather than maintaining an expensive cron worker polling expired rows every second:
- Each withdrawal has an `expiresAt` timestamp (default 24h).
- Whenever any user or leader interacts with the withdrawal (or during list queries), an expiry check evaluates:
  ```javascript
  if (withdrawal.status === 'PENDING_APPROVAL' && withdrawal.expiresAt < new Date()) {
    // Release earmark and update status to EXPIRED
  }
  ```
- This guarantees zero background lock contention while ensuring expired withdrawals can never be approved.

---

## 9. Fault-Tolerant Notification Dispatch

### Fire-and-Forget Architecture
- External notification webhooks (SMS, push services) are inherently flaky.
- Financial transactions **must never fail or roll back** due to third-party notification outages.
- After the database transaction commits, notification is triggered asynchronously:
  - Dispatched with a strict **2-second timeout** (`AbortController`).
  - If the notify server is offline or returns an error, the ledger entry's `notifyStatus` is updated to `FAILED`.
  - The user's balance and transfer records remain valid and intact.

---

## 10. Tradeoffs & Future Roadmap (Next 1-Day Improvements)

1. **Redis Distributed Locking & Caching:**
   - For multi-instance horizontal scaling, transition from PostgreSQL row-level locks and Node.js EventEmitters to Redis distributed locks (`Redlock`) and Redis Pub/Sub.
2. **Refresh Token Rotation:**
   - Implement short-lived access tokens (15m) paired with rotating refresh tokens stored in HTTP-only cookies and backed by a revocation list.
3. **SMS Provider Integration:**
   - Replace demo OTP `123456` with real SMS gateway integrations (Twilio, AWS SNS, MSG91) with per-mobile rate limiting.
4. **End-to-End Test Suite:**
   - Add automated browser tests with Playwright covering the full registration, transfer, and group approval flow.
