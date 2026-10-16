require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const walletRoutes = require('./routes/wallet.routes');
const groupRoutes = require('./routes/group.routes');
const adminRoutes = require('./routes/admin.routes');
const userRoutes = require('./routes/user.routes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
const configuredOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((u) => u.trim().replace(/\/+$/, ''))
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/+$/, '');

    if (configuredOrigins.includes(cleanOrigin) || configuredOrigins.includes('*')) {
      return callback(null, true);
    }
    if (/^https:\/\/.*\.vercel\.app$/.test(cleanOrigin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Idempotency-Key', 'Content-Length'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Community Points Wallet API is running smoothly 🚀',
    version: '1.0.0',
    documentation: 'https://github.com/himanshusingh9554/community-plus-wallet',
    frontend: process.env.FRONTEND_URL || 'https://community-plus-wallet.vercel.app',
    endpoints: {
      health: '/health',
      auth: '/auth/otp/request, /auth/otp/verify, /users/register',
      wallet: '/wallet, /wallet/transfers, /wallet/transactions, /wallet/stream',
      groups: '/groups, /groups/:gid/wallet, /groups/:gid/withdrawals',
      admin: '/admin/credits/bulk',
      me: '/me, /me/roles',
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.post('/notify', (req, res) => {
  const { mobile, message } = req.body || {};
  logger.info({ mobile, message }, 'Notification webhook received');
  res.status(200).json({ success: true, timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/groups', groupRoutes);
app.use('/admin', adminRoutes);
app.use('/users', userRoutes);
app.use('/me', userRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '4000', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on port ${PORT}`);
  });
}

module.exports = app;
