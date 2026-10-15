const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

async function idempotencyGuard(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  const userId = req.user.id;

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
  });

  if (existing) {
    logger.info({ userId, key }, 'Idempotency hit — returning cached response');
    return res.status(existing.statusCode).json(existing.responseBody);
  }

  res.captureIdempotency = async (statusCode, body) => {
    try {
      await prisma.idempotencyRecord.create({
        data: { userId, idempotencyKey: key, responseBody: body, statusCode },
      });
    } catch (err) {
      if (err.code !== 'P2002') {
        logger.warn({ err: err.message }, 'Failed to save idempotency record');
      }
    }
  };

  next();
}

module.exports = { idempotencyGuard };
