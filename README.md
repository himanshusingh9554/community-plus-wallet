# Community Points Wallet

A production-grade, full-stack **Community Points Wallet** system built with Node.js 20, Express, Prisma ORM, PostgreSQL, and React 18 / Vite. Designed with strict double-entry append-only accounting, pessimistic row-level locking for extreme concurrency protection, comprehensive idempotency, and fine-grained Role-Based Access Control (RBAC).

---

## 🔗 Live Deployments & Repository

- **Frontend (Live Demo):** [https://community-plus-wallet.vercel.app/](https://community-plus-wallet.vercel.app/)
- **Backend API (Live):** [https://community-plus-wallet.onrender.com](https://community-plus-wallet.onrender.com)
- **API Health Check:** [https://community-plus-wallet.onrender.com/health](https://community-plus-wallet.onrender.com/health)
- **GitHub Repository:** [https://github.com/himanshusingh9554/community-plus-wallet.git](https://github.com/himanshusingh9554/community-plus-wallet.git)
- **Author Email:** [himanshusingh9554@gmail.com](mailto:himanshusingh9554@gmail.com)

> **Note on Backend Hosting:** The backend API is hosted on Render free tier; it may take ~50 seconds to spin up from sleep on the very first request.

---

## ⚡ Quick Demo Accounts & 1-Click Login

The database is pre-seeded with 3 dedicated sandbox accounts configured with fixed OTP `123456`:

| Mobile | Name | System Role | Group Role | Purpose / Privileges |
| :--- | :--- | :--- | :--- | :--- |
| `9000000001` | Demo Admin | `ADMIN` | Group A `LEADER` | Full Admin CSV Bulk Upload & Group A Approvals |
| `9000000002` | Alice Member | `USER` | Group A `MEMBER` | Member View, Transfer Points, Request Withdrawals |
| `9000000003` | Bob Group B | `USER` | Group B `LEADER` | Non-member of Group A (Verifies group isolation) |

### 1-Click Auto-Fill Pills (Login Screen)
On the Login screen, click any of the 3 quick login pills at the bottom to automatically populate the mobile number, pre-fill OTP `123456`, or click **1-Click Login ⚡** to authenticate instantly.

### Floating Reviewer Sandbox Toolbar (Bottom-Right)
When logged in as any demo account, a collapsible **Reviewer Sandbox** toolbar appears at the bottom-right corner of the screen:
- **Toggle System Role:** 1-click switch between `👑 ADMIN` and `👤 USER`.
- **Toggle Group A Role:** 1-click switch between `👑 Leader`, `👤 Member`, and `❌ Non-Member`.
- **Switch Demo Account:** Jump between the 3 demo users instantly without logging out.
- **Production Guard:** Newly registered real users are strictly locked to `role: 'USER'` and cannot access or call role-switching APIs (returns `403 Forbidden`).

---

## 🛡️ Core Financial & Architectural Invariants

1. **Pessimistic Concurrency Locking (`SELECT ... FOR UPDATE`):**
   - In-transaction row-level locks prevent race conditions and double-spending.
   - Tested under **20 simultaneous transfers** hitting the same wallet: zero negative balances, exact debit matching, and immediate 400 rollback for exhausted balances.
2. **Double-Entry Append-Only Ledger:**
   - Every point movement creates dual append-only ledger entries within the same database transaction.
   - Guaranteed invariant: $\sum (\text{Ledger Entries}) \equiv \text{Wallet Balance}$ at all times.
3. **Strict Idempotency:**
   - Supported via `Idempotency-Key` header with database unique constraints (`@@unique([userId, idempotencyKey])`).
   - Duplicate or retried requests safely return cached responses without duplicate fund movement.
4. **Group Wallets with Multi-Sig Approvals & Lazy Expiry:**
   - Withdrawal requests place an automatic financial earmark (`pending`) on group funds (`available = balance - pending`).
   - Only group `LEADER`s can approve or reject withdrawals.
   - Expired requests are lazily evaluated and automatically release earmarks.
5. **Real-Time Auto-Sync (Server-Sent Events):**
   - Live stream at `/wallet/stream` broadcasts instant balance updates and real-time toast notifications across browser tabs without manual page reloads.
6. **Fault-Tolerant Notification Dispatch:**
   - Asynchronous fire-and-forget notifications with 2s abort timeouts; third-party notification outages never roll back financial transactions.

---

## 🚦 Strict Role-Based Access Control (RBAC) Matrix

| Endpoint | Permitted Roles | Unauthorized Response |
| :--- | :--- | :--- |
| `POST /admin/credits/bulk` | `role === 'ADMIN'` | **403 Forbidden** (`"Admin privileges required"`) |
| `GET /groups/:gid/wallet` | Group Member or Leader | **403 Forbidden** (`"You are not a member of this group"`) |
| `POST /groups/:gid/withdrawals` | Group Member or Leader | **403 Forbidden** (`"You are not a member of this group"`) |
| `POST /groups/:gid/withdrawals/:id/approve` | **Group `LEADER` only** | **403 Forbidden** (`"Only group leaders can approve"`) |
| `POST /groups/:gid/withdrawals/:id/reject` | **Group `LEADER` only** | **403 Forbidden** (`"Only group leaders can reject"`) |
| `PATCH /me/roles` | **Reviewer Sandbox accounts only** | **403 Forbidden** (`"Role switching is restricted to Reviewer Sandbox accounts"`) |

---

## 🛠️ Tech Stack & Directory Structure

- **Runtime & API:** Node.js 20+, Express
- **Database & ORM:** PostgreSQL + Prisma ORM (Decimal 20,2 precision)
- **Frontend:** React 18, Vite, Zustand, Server-Sent Events (SSE)
- **Test Suite:** Jest, Supertest (53 passing tests: Unit, Integration, Concurrency)
- **CI/CD:** GitHub Actions workflow with automated PostgreSQL service container

```text
community-wallet/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma         # PostgreSQL schema (Users, Wallets, Groups, Ledgers)
│   │   └── seed.js               # Seed script with demo accounts & groups
│   └── src/
│       ├── controllers/          # HTTP controllers (auth, wallet, group, user, admin)
│       ├── middleware/           # auth, rbac, idempotency, error handling
│       ├── routes/               # Express router definitions
│       ├── services/             # Business logic & interactive transaction orchestration
│       ├── utils/                # Prisma client, logger, eventBus, notify
│       └── server.js             # Express application root
├── frontend/
│   ├── src/
│   │   ├── api/client.js         # Axios API client (auth, wallet, group, admin, user)
│   │   ├── hooks/                # useAsync, useDoubleClickGuard
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx     # Login with 1-Click Demo Pills
│   │   │   ├── RegisterPage.jsx  # 2-step Registration wizard
│   │   │   └── WalletDashboard.jsx # Tabbed Dashboard, Floating Sandbox, Admin CSV
│   │   ├── store/authStore.js    # Zustand authentication state
│   │   ├── App.jsx               # Protected client-side routing
│   │   └── index.css             # Production UI styles & animations
│   └── package.json
├── tests/
│   ├── concurrency/              # 20-thread concurrent transfer stress test
│   ├── integration/              # Wallet, Group, Admin CSV, Sandbox RBAC tests
│   └── unit/                     # Amount validation, OTP security, permissions, expiry
├── .github/
│   └── workflows/ci.yml          # GitHub Actions CI workflow
├── README.md
├── NOTES.md
├── REVIEW.md
└── package.json
```

---

## 🚀 Installation & Local Setup

### 1. Prerequisites
- **Node.js:** v20.x or higher
- **PostgreSQL:** v15.x or higher (local instance or cloud database such as Neon/Supabase)
- **npm:** v9.x or higher

### 2. Clone Repository & Install Dependencies
```bash
git clone https://github.com/himanshusingh9554/community-plus-wallet.git
cd community-plus-wallet

# Install dependencies across all modules
npm run install:all
```

### 3. Configure Environment Variables
Create `backend/.env` with your PostgreSQL database credentials:
```env
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/community_wallet"
JWT_SECRET="community-wallet-dev-secret-change-me-in-production-2024"
OTP_FIXED="123456"
PENDING_TTL_SECONDS=86400
NOTIFY_URL="http://localhost:4000/notify"
FRONTEND_URL="http://localhost:5173"
NODE_ENV=development
LOG_LEVEL=info
```

### 4. Initialize Database Schema & Seed Data
```bash
cd backend

# Push schema directly to database
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Seed Demo Accounts, Groups, and Test Wallets
node prisma/seed.js

cd ..
```

### 5. Start Development Servers
Run backend and frontend simultaneously:
```bash
# Terminal 1 — Backend API (port 4000)
npm run dev:backend

# Terminal 2 — Frontend Application (port 5173)
npm run dev:frontend
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🧪 Automated Test Suite (53 Passing Tests)

Run the full automated test suite containing unit, integration, and high-concurrency stress tests:

```bash
# Run all 53 tests
npm test

# Run specific test suites
npm run test:unit           # Pure logic: amount validation, OTP locking, permissions
npm run test:integration    # Supertest API tests for wallets, groups, admin CSV, and RBAC
npm run test:concurrency    # 20-thread simultaneous transfer stress test
```

### Test Suite Summary:
```text
Test Suites: 9 passed, 9 total
Tests:       53 passed, 53 total
Snapshots:   0 total
Time:        2.851 s
```
- `tests/concurrency/concurrent.transfer.test.js`: Fires 20 simultaneous requests against a single ₹100 wallet. Verifies exact serial execution, 10 successes, 10 failures, ₹0.00 balance, and invariant `SUM(ledger) == balance`.
- `tests/integration/sandbox.rbac.test.js`: Verifies `PATCH /me/roles` allows demo accounts and strictly returns `403 Forbidden` for standard registered users.
- `tests/integration/admin.csv.test.js`: Validates CSV chunk processing, batching, and admin role enforcement.
- `tests/integration/group.test.js`: Validates group member access, leader-only approvals, non-member rejection, and lazy expiry.
- `tests/integration/wallet.test.js`: Validates transfer mechanics, idempotency deduplication, and transaction pagination.

---

## 📑 API Endpoints Reference

### Authentication
- `POST /auth/otp/request` — Request 6-digit OTP for a 10-digit mobile number.
- `POST /auth/otp/verify` — Verify OTP (demo: `123456`) and receive signed JWT.
- `POST /users/register` — Register a new member profile (locked to `USER` role).

### Personal Wallet (Bearer JWT Required)
- `GET /wallet` — Retrieve current balance, pending earmarks, and available balance.
- `POST /wallet/transfers` — Transfer points to another user (supports `Idempotency-Key` header).
- `GET /wallet/transactions?page=1&limit=10` — Paginated ledger entries with counterparty phone numbers.
- `GET /wallet/stream` — Real-time Server-Sent Events (SSE) connection.

### Group Wallets (Bearer JWT Required)
- `GET /groups` — List all groups the authenticated user belongs to.
- `GET /groups/:gid/wallet` — Group balance, pending, and member list (member only).
- `GET /groups/:gid/withdrawals` — List group withdrawal requests (member only).
- `POST /groups/:gid/withdrawals` — Submit a withdrawal request with note (member only).
- `POST /groups/:gid/withdrawals/:id/approve` — Approve withdrawal and release funds (**group leader only**).
- `POST /groups/:gid/withdrawals/:id/reject` — Reject withdrawal and release earmark (**group leader only**).

### Admin Operations (Bearer JWT + Admin Role Required)
- `POST /admin/credits/bulk` — Upload CSV file (`mobile,amount,reference`) to credit multiple member wallets.

### Reviewer Sandbox (Demo Accounts Only)
- `GET /me` — Returns profile, role, group memberships, and `isDemoAccount` flag.
- `PATCH /me/roles` — Dynamically toggle `ADMIN`/`USER` role or Group A leadership (restricted to demo accounts).

---

## 🚢 Production Build

```bash
# Build production bundle
npm run build:frontend
```
Generates optimized static assets in `frontend/dist/`.
