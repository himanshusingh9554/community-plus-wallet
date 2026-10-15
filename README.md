# Community Points Wallet

A production-quality full-stack Community Points Wallet system built with Node.js, Express, React, and PostgreSQL/Prisma.

---

## Deployed URLs

| Service | URL |
|---------|-----|
| Frontend | `https://your-frontend.vercel.app` |
| Backend API | `https://your-backend.railway.app` |
| Git Repository | `https://github.com/your-username/community-wallet` |

## Demo Credentials

| Field | Value |
|-------|-------|
| Mobile | `9000000001` |
| OTP (fixed) | `123456` |

---

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ running locally (or use a hosted DB)
- npm 9+

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/community-wallet.git
cd community-wallet

# Install all dependencies (backend + frontend + tests)
npm run install:all
```

---

## Environment Setup

```bash
# Copy environment template
cp .env.example backend/.env

# Edit backend/.env with your actual values
# Minimum required:
# DATABASE_URL="postgresql://user:pass@localhost:5432/community_wallet"
# JWT_SECRET="your-long-random-secret"
```

---

## Database Setup

```bash
# Run migrations
cd backend
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate

# Seed demo data
node prisma/seed.js
```

---

## Running the Application

```bash
# Terminal 1 — Backend API (port 4000)
npm run dev:backend

# Terminal 2 — Frontend Dev Server (port 5173)
npm run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Concurrency stress test (critical!)
npm run test:concurrency
```

> **Important:** Integration and concurrency tests require a running PostgreSQL database. Set `DATABASE_URL` in `tests/.env.test` or inherit from backend `.env`.

---

## Project Structure

```
community-wallet/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma         # DB schema
│   │   └── seed.js               # Demo data seeder
│   └── src/
│       ├── controllers/          # HTTP request handlers
│       ├── middleware/           # Auth, idempotency, error handling
│       ├── routes/               # Express route definitions
│       ├── services/             # Business logic layer
│       ├── utils/                # Logger, Prisma client, notify, amount
│       └── server.js             # Express app entry point
├── frontend/
│   └── src/
│       ├── api/                  # Axios client
│       ├── hooks/                # useAsync, useDoubleClickGuard
│       ├── pages/                # LoginPage, WalletDashboard, RegisterPage
│       ├── store/                # Zustand auth store
│       └── App.jsx               # Router
├── tests/
│   ├── unit/                     # Amount, OTP, permissions, expiry
│   ├── integration/              # Wallet, admin CSV, groups
│   └── concurrency/              # 20-concurrent-transfers test
├── .env.example
├── .gitignore
├── NOTES.md
├── REVIEW.md
└── README.md
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/otp/request` | Request OTP for mobile |
| POST | `/auth/otp/verify` | Verify OTP, receive JWT |

### Wallet (JWT required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallet` | Get balance/pending/available |
| POST | `/wallet/transfers` | Transfer points (idempotency supported) |
| GET | `/wallet/transactions` | Paginated ledger history |

### Groups (JWT required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/groups/:gid/wallet` | Group wallet (member only) |
| POST | `/groups/:gid/withdrawals` | Create withdrawal request |
| POST | `/groups/:gid/withdrawals/:id/approve` | Approve (leader only) |
| POST | `/groups/:gid/withdrawals/:id/reject` | Reject (leader only) |

### Admin (JWT + admin role required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/credits/bulk` | CSV bulk credit import |

### Utility
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/users/me` | Current user profile |

---

## Key Design Decisions

See [NOTES.md](./NOTES.md) for full architectural explanations.
