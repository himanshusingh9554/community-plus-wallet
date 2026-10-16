const prisma = require('../utils/prisma');
const { validateAmount, formatDecimal } = require('../utils/amount');
const { fireAndForgetNotification } = require('../utils/notify');
const logger = require('../utils/logger');

const TX_OPTIONS = { maxWait: 30000, timeout: 60000 };

async function getWallet(userId) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

  const balance = parseFloat(wallet.balance);
  const pending = parseFloat(wallet.pending);
  const available = balance - pending;

  return {
    balance: formatDecimal(balance),
    pending: formatDecimal(pending),
    available: formatDecimal(available),
  };
}

async function transfer(senderId, receiverMobile, amount, idempotencyKey) {
  const { valid, reason, value: amountDecimal } = validateAmount(amount);
  if (!valid) {
    return { success: false, error: reason, status: 400 };
  }

  const receiver = await prisma.user.findUnique({ where: { mobile: receiverMobile } });
  if (!receiver) return { success: false, error: 'Receiver not found', status: 404 };

  if (receiver.id === senderId) {
    return { success: false, error: 'Cannot transfer to yourself', status: 400 };
  }

  const amountFloat = amountDecimal.toNumber();

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const senderWallet = await tx.$queryRaw`
        SELECT id, balance, pending FROM wallets WHERE "userId" = ${senderId} FOR UPDATE
      `;

      if (!senderWallet.length) throw Object.assign(new Error('Sender wallet not found'), { status: 404 });

      const sw = senderWallet[0];
      const balance = parseFloat(sw.balance);
      const pending = parseFloat(sw.pending);
      const available = balance - pending;

      if (available < amountFloat) {
        throw Object.assign(new Error('Insufficient balance'), { status: 400 });
      }

      const [updatedSender, updatedReceiver] = await Promise.all([
        tx.wallet.update({
          where: { userId: senderId },
          data: { balance: { decrement: amountFloat } },
        }),
        tx.wallet.update({
          where: { userId: receiver.id },
          data: { balance: { increment: amountFloat } },
        }),
      ]);

      const newSenderBalance = parseFloat(updatedSender.balance);
      const newReceiverBalance = parseFloat(updatedReceiver.balance);

      const [transferRecord, senderLedger, receiverLedger] = await Promise.all([
        tx.transfer.create({
          data: {
            senderId,
            receiverId: receiver.id,
            amount: amountFloat,
            idempotencyKey: idempotencyKey || null,
          },
        }),
        tx.ledgerEntry.create({
          data: {
            userId: senderId,
            entryType: 'TRANSFER_OUT',
            amount: -amountFloat,
            balanceAfter: newSenderBalance,
            metadata: { receiverMobile },
          },
        }),
        tx.ledgerEntry.create({
          data: {
            userId: receiver.id,
            entryType: 'TRANSFER_IN',
            amount: amountFloat,
            balanceAfter: newReceiverBalance,
            metadata: { senderMobile: null },
          },
        }),
      ]);

      return { senderLedger, receiverLedger, receiver, amountFloat, newSenderBalance, newReceiverBalance };
    }, TX_OPTIONS);
  } catch (err) {
    if (err.status) return { success: false, error: err.message, status: err.status };
    if (err.code === 'P2002') {
      const existingTransfer = await prisma.transfer.findUnique({
        where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
      });
      if (existingTransfer) {
        return { success: true, transfer: existingTransfer, idempotent: true };
      }
    }
    logger.error({ err: err.message }, 'Transfer transaction failed');
    return { success: false, error: 'Transfer failed', status: 500 };
  }

  const sender = await prisma.user.findUnique({ where: { id: senderId } });

  fireAndForgetNotification(
    sender.mobile,
    `Your wallet has been debited with ${formatDecimal(result.amountFloat)} points`,
    result.senderLedger.id
  );

  fireAndForgetNotification(
    receiver.mobile,
    `Your wallet has been credited with ${formatDecimal(result.amountFloat)} points`,
    result.receiverLedger.id
  );

  return { success: true, amount: formatDecimal(result.amountFloat), balance: formatDecimal(result.newSenderBalance) };
}

async function getTransactions(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const [total, entries] = await Promise.all([
    prisma.ledgerEntry.count({ where: { userId } }),
    prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    data: entries.map((e) => ({
      id: e.id,
      type: e.entryType,
      amount: formatDecimal(e.amount),
      balanceAfter: formatDecimal(e.balanceAfter),
      createdAt: e.createdAt,
      metadata: e.metadata,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

module.exports = { getWallet, transfer, getTransactions };
