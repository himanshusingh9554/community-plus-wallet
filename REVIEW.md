# REVIEW.md — Legacy wallet.service.js Code Review

The file `backend/src/services/wallet.service.legacy.js` contains several critical production vulnerabilities. This review documents each defect, its severity, production failure mode, and the fix applied.

---

## Defect 1: Hardcoded JWT Secret

**Severity:** 🔴 CRITICAL

**Location:** `wallet.service.legacy.js` — all `jwt.verify()` calls

**Problem:**
```js
const decoded = jwt.verify(token, 'hardcoded-secret-123');
```
The JWT signing secret is hardcoded as a string literal in source code. Anyone with read access to the repository (including contractors, ex-employees, or a public GitHub leak) can forge valid JWTs for any user ID, granting themselves admin access and full wallet control.

**Production Failure:**
An attacker crafts a JWT with `{ id: "admin-user-id", isAdmin: true }`, signs it with `hardcoded-secret-123`, and calls `adminTransfer` to drain any wallet. Breach is silent — no authentication check would catch a validly-signed forged token.

**Recommended Fix:**
```js
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```
`JWT_SECRET` must be a cryptographically random 256-bit value stored only in environment variables, never committed to version control.

**Fix Applied:** ✅ The production `wallet.service.js` reads `process.env.JWT_SECRET` exclusively.

---

## Defect 2: SQL Injection via String Interpolation

**Severity:** 🔴 CRITICAL

**Location:** Every `db.query()` call

**Problem:**
```js
await db.query(`SELECT * FROM wallets WHERE user_id = ${fromUserId}`);
await db.query(`UPDATE wallets SET balance = balance - ${amount} WHERE user_id = ${fromUserId}`);
```
User-controlled input (`fromUserId`, `toUserId`, `amount`) is interpolated directly into SQL strings without parameterization. A malicious client can inject arbitrary SQL.

**Production Failure:**
`fromUserId = "1 OR 1=1"` returns all wallets. `amount = "0; DROP TABLE wallets; --"` destroys the database. This is a textbook SQL injection — ranked #1 in OWASP Top 10.

**Recommended Fix:**
Use parameterized queries or an ORM that escapes values:
```js
await db.query('SELECT * FROM wallets WHERE user_id = $1', [fromUserId]);
```
**Fix Applied:** ✅ The production code uses Prisma ORM exclusively, which parameterizes all queries by default.

---

## Defect 3: Authorization Not Verified in `adminTransfer`

**Severity:** 🔴 CRITICAL

**Location:** `adminTransfer` method

**Problem:**
```js
async adminTransfer(adminToken, fromUserId, toUserId, amount) {
  const decoded = jwt.verify(adminToken, 'hardcoded-secret-123');
  // No check: is decoded.isAdmin === true?
  await db.query(`UPDATE wallets SET balance = balance - ${amount} ...`);
}
```
The token is decoded but the decoded payload is never inspected. Any valid JWT (even a regular user's token) can trigger `adminTransfer`, allowing any user to move money out of any wallet.

**Recommended Fix:**
```js
if (!decoded.isAdmin) throw new Error('Forbidden: admin only');
```
**Fix Applied:** ✅ Production `requireAdmin` middleware checks `req.user.isAdmin` before any admin route is processed.

---

## Defect 4: Race Condition — Naive Read-Then-Write Balance Check

**Severity:** 🔴 CRITICAL

**Location:** `transfer` method

**Problem:**
```js
const sender = await db.query(`SELECT * FROM wallets WHERE user_id = ${fromUserId}`);
if (sender[0].balance >= amount) {
  await db.query(`UPDATE wallets SET balance = balance - ${amount} ...`);
}
```
Two concurrent requests both read balance = 100, both pass the `>= amount` check, and both subtract 50, resulting in balance = 0 (correct), but if both read balance = 50 and both try to transfer 50, the final balance becomes -50.

**Production Failure:**
Under load (20 concurrent requests), a wallet with 100 points could be debited by 200+ points, going deeply negative. This is an unacceptable financial integrity breach.

**Recommended Fix:**
Use `SELECT ... FOR UPDATE` inside a database transaction:
```sql
BEGIN;
SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE;
-- check balance
UPDATE wallets SET balance = balance - $2 WHERE user_id = $1;
COMMIT;
```
**Fix Applied:** ✅ Production `wallet.service.js` uses Prisma `$transaction` with `$queryRaw` `FOR UPDATE` locking.

---

## Defect 5: JWT Token Logged to Console

**Severity:** 🟠 HIGH

**Location:** `transfer` method

**Problem:**
```js
console.log('Processing transfer for token:', token);
```
JWT tokens are logged in plain text. Log files are often shipped to centralized logging services (Datadog, Splunk, CloudWatch) where they may be stored for months and accessible to many engineers. A token leak allows session hijacking for the duration of the token's validity.

**Recommended Fix:**
Never log tokens, OTPs, passwords, or Authorization headers. If debugging is needed, log only non-sensitive identifiers (user ID, request ID).

**Fix Applied:** ✅ Production logger uses pino with `redact` paths configured to mask `req.headers.authorization` and `otp` fields automatically.

---

## Defect 6: Group Withdrawal Has No Authorization Check

**Severity:** 🟠 HIGH

**Location:** `processWithdrawal` method

**Problem:**
```js
async processWithdrawal(groupId, amount, approvedBy) {
  const group = await db.query(`SELECT * FROM group_wallets WHERE group_id = ${groupId}`);
  await db.query(`UPDATE group_wallets SET balance = balance - ${amount} ...`);
}
```
`approvedBy` is accepted as a parameter but never verified against the group's leader list. Any user who knows a `groupId` can approve withdrawals from it, including withdrawals from competing groups.

**Recommended Fix:**
Query `group_members` to verify `approvedBy` is the leader of `groupId` before processing:
```js
const leader = await db.query('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_leader = true', [groupId, approvedBy]);
if (!leader.length) throw new Error('Forbidden');
```
**Fix Applied:** ✅ Production `group.service.js` verifies leader membership via `GroupMember.isLeader` before any withdrawal state change.

---

## Defect 7: No Ledger / Audit Trail

**Severity:** 🟡 MEDIUM

**Location:** All `db.query UPDATE` calls

**Problem:**
Balance changes (`UPDATE wallets SET balance = ...`) are made directly with no corresponding immutable record. There is no way to reconstruct the transaction history, detect fraud, or prove a balance is correct.

**Production Failure:**
Regulatory audits, dispute resolution, and fraud detection all require an immutable append-only ledger. Without it, a corrupt `UPDATE` is undetectable.

**Recommended Fix:**
Every balance change must atomically create a ledger entry in the same transaction.

**Fix Applied:** ✅ Production code creates a `LedgerEntry` record within every Prisma transaction that modifies a wallet balance.

---

## Defect 8: No Idempotency on Transfers

**Severity:** 🟡 MEDIUM

**Location:** `transfer` method

**Problem:**
A network retry or double-click causes `transfer` to be called twice, resulting in the amount being deducted twice from the sender and credited twice to the receiver.

**Recommended Fix:**
Implement idempotency keys stored in a `UNIQUE(userId, idempotencyKey)` table.

**Fix Applied:** ✅ Production `POST /wallet/transfers` supports `Idempotency-Key` header with DB-backed deduplication.

---

## Summary Table

| # | Defect | Severity | Fixed |
|---|--------|----------|-------|
| 1 | Hardcoded JWT secret | 🔴 CRITICAL | ✅ |
| 2 | SQL Injection | 🔴 CRITICAL | ✅ |
| 3 | Missing admin authorization | 🔴 CRITICAL | ✅ |
| 4 | Race condition (read-then-write) | 🔴 CRITICAL | ✅ |
| 5 | JWT token logged to console | 🟠 HIGH | ✅ |
| 6 | Group withdrawal no auth check | 🟠 HIGH | ✅ |
| 7 | No audit ledger | 🟡 MEDIUM | ✅ |
| 8 | No idempotency | 🟡 MEDIUM | ✅ |

The two most critical fixes (SQL Injection + Race Condition) are directly applied to the legacy file via targeted patches rather than a full rewrite.
