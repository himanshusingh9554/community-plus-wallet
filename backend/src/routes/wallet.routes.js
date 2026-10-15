const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { idempotencyGuard } = require('../middleware/idempotency');
const { getWallet, transfer, getTransactions } = require('../controllers/wallet.controller');

const router = Router();

router.use(authenticate);

router.get('/', getWallet);
router.get('/wallet', getWallet);
router.post('/transfers', idempotencyGuard, transfer);
router.get('/transactions', getTransactions);

module.exports = router;
