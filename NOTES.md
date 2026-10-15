# NOTES.md — Architectural Decisions

## 1. Architecture: Why this architecture?

I chose a **layered monorepo** architecture with clear separation: Routes → Controllers → Services → Database. Each layer has a single responsibility — routes define HTTP contracts, controllers translate HTTP to domain calls, services own business logic and transactions, and the database layer (Prisma) handles persistence. This structure makes every component independently testable and debuggable. The monorepo allows shared types and easy local development without the overhead of microservices, while the folder boundaries (backend/, frontend/, tests/) keep concerns isolated.

---

## 2. Database: Why PostgreSQL?

PostgreSQL was chosen because of its **ACID compliance and row-level locking** (`SELECT ... FOR UPDATE`), which is mandatory for the concurrency requirement. SQLite doesn't support true concurrent writers, and MySQL requires careful transaction isolation tuning. PostgreSQL's `SERIALIZABLE` isolation and native `FOR UPDATE` pessimistic locks let us guarantee that 20 concurrent transfers never result in a negative balance — a hard requirement. Prisma's TypeScript-friendly ORM layer gives us type safety and migration management on top.

---

## 3. Concurrency: Strategy in 5 lines

Every balance-modifying transaction uses `SELECT ... FOR UPDATE` (pessimistic row locking) inside a Prisma interactive transaction. When 20 requests arrive simultaneously, PostgreSQL serializes them at the wallet row — each waits for the lock. Once the lock is acquired, the balance is re-read within the transaction, checked against the transfer amount, and only then committed. Requests that fail the balance check receive a 400 immediately. The database guarantees exactly-once mutation per successful lock acquisition.

---

## 4. Idempotency: How duplicates are prevented

Every `POST /transfers` accepts an optional `Idempotency-Key` header. On first receipt, the response is saved in the `idempotency_records` table with a `UNIQUE(userId, idempotencyKey)` constraint. On duplicate receipt (sequential or parallel), the middleware detects the existing record and returns the stored response without moving money. The DB unique constraint handles race conditions — if two identical requests race, one wins the INSERT and the other gets a unique-constraint error, which is caught and resolved by returning the already-stored response.

---

## 5. Ledger: How SUM(ledger) == balance is guaranteed

Every balance change (transfer, admin credit, group withdrawal) creates a `LedgerEntry` **within the same database transaction** as the wallet balance update. The entries are append-only — no UPDATE or DELETE is ever issued on amount or balance fields. The `balanceAfter` field on each entry records the running balance. Because both the wallet update and the ledger insert happen atomically in the same Prisma transaction, there is no window where the two can diverge. A verification query `SUM(ledger_entries.amount) = wallet.balance` always holds.

---

## 6. Notification failure: What happens if the notify server is down?

Notifications are **fire-and-forget** — they are dispatched asynchronously after the HTTP response has already been sent to the client. A 2-second `AbortController` timeout prevents any notification attempt from hanging indefinitely. If the notification server times out, returns a 500, or is unreachable, the ledger entry's `notifyStatus` is updated to `FAILED`. Money movement is **never rolled back** due to notification failure. The failed status is observable in the ledger for retry or audit purposes.

---

## 7. Deployment: Where is the application deployed?

The application is deployment-ready for:
- **Backend:** Railway or Render (set `DATABASE_URL` + `JWT_SECRET` environment variables, run `prisma migrate deploy`)
- **Frontend:** Vercel (set `VITE_API_URL` to the backend URL)
- **Database:** Neon (serverless PostgreSQL) or Supabase

Placeholder URLs in README.md should be updated after deployment.

---

## 8. Tradeoffs: What was intentionally not built?

- **Email/SMS delivery of OTPs** — only the `OTP_FIXED` env var or console mock is used (SMS provider integration would require Twilio/MSG91 setup)
- **Refresh tokens** — JWTs are 24h and stateless; a refresh token system would add Redis/DB complexity
- **E2E tests (Playwright/Cypress)** — the spec lists these as bonus; unit + integration + concurrency tests are prioritized
- **Real-time balance updates (WebSockets)** — dashboard polls on action rather than pushing live updates
- **Audit trail for admin actions** — admin credits are logged in the ledger but not a separate admin audit table

---

## 9. Next 1 day: What would I improve?

1. **Refresh tokens + token revocation** — store refresh tokens in DB with expiry and a revocation list
2. **WebSocket live balance updates** — push balance changes to the frontend in real time
3. **E2E tests with Playwright** — cover the full user journey: register → OTP → transfer → verify balance
4. **SMS OTP integration** — plug in Twilio/MSG91 behind the `requestOtp` service
5. **Rate limit by mobile** — current rate limiting is IP-based; add per-mobile rate limiting to prevent enumeration attacks
