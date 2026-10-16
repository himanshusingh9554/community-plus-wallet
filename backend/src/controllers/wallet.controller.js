const walletService = require('../services/wallet.service');
const eventBus = require('../utils/eventBus');

async function getWallet(req, res, next) {
  try {
    const wallet = await walletService.getWallet(req.user.id);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
}

async function transfer(req, res, next) {
  try {
    const { receiverMobile, amount } = req.body;
    if (!receiverMobile || !amount) {
      return res.status(400).json({ error: 'receiverMobile and amount are required' });
    }

    const idempotencyKey = req.headers['idempotency-key'] || null;
    const result = await walletService.transfer(req.user.id, receiverMobile, amount, idempotencyKey);

    if (!result.success) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    const body = { success: true, amount: result.amount, balance: result.balance };

    if (res.captureIdempotency) {
      await res.captureIdempotency(200, body);
    }

    res.json(body);
  } catch (err) {
    next(err);
  }
}

async function getTransactions(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const result = await walletService.getTransactions(req.user.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

function streamWalletEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  eventBus.addClient(req.user.id, req.user.mobile, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'CONNECTED', message: 'Live stream connected' })}\n\n`);

  req.on('close', () => {
    eventBus.removeClient(req.user.id, req.user.mobile, res);
  });
}

module.exports = { getWallet, transfer, getTransactions, streamWalletEvents };
