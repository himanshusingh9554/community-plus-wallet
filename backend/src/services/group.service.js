const prisma = require('../utils/prisma');
const { validateAmount, formatDecimal } = require('../utils/amount');
const { fireAndForgetNotification } = require('../utils/notify');
const logger = require('../utils/logger');

function getPendingTtlMs() {
  const seconds = parseInt(process.env.PENDING_TTL_SECONDS || '86400', 10);
  return seconds * 1000;
}

async function getGroupWallet(groupId, userId) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw Object.assign(new Error('Not a member of this group'), { status: 403 });
  }

  const gw = await prisma.groupWallet.findUnique({ where: { groupId } });
  if (!gw) throw Object.assign(new Error('Group wallet not found'), { status: 404 });

  const balance = parseFloat(gw.balance);
  const pending = parseFloat(gw.pending);

  return {
    balance: formatDecimal(balance),
    pending: formatDecimal(pending),
    available: formatDecimal(balance - pending),
  };
}

async function createWithdrawal(groupId, userId, amount, note) {
  const { valid, reason, value: amountDec } = validateAmount(amount);
  if (!valid) throw Object.assign(new Error(reason), { status: 400 });

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw Object.assign(new Error('Not a member of this group'), { status: 403 });

  const amountFloat = amountDec.toNumber();
  const expiresAt = new Date(Date.now() + getPendingTtlMs());

  const withdrawal = await prisma.$transaction(async (tx) => {
    const gw = await tx.$queryRaw`
      SELECT id, balance, pending FROM group_wallets WHERE "groupId" = ${groupId} FOR UPDATE
    `;
    if (!gw.length) throw Object.assign(new Error('Group wallet not found'), { status: 404 });

    const bal = parseFloat(gw[0].balance);
    const pend = parseFloat(gw[0].pending);
    const available = bal - pend;

    if (available < amountFloat) {
      throw Object.assign(new Error('Insufficient group balance'), { status: 400 });
    }

    await tx.groupWallet.update({
      where: { groupId },
      data: { pending: { increment: amountFloat } },
    });

    return tx.groupWithdrawal.create({
      data: { groupId, requestedBy: userId, amount: amountFloat, note, expiresAt },
    });
  });

  return withdrawal;
}

async function resolveWithdrawal(groupId, withdrawalId, userId, action) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || !membership.isLeader) {
    throw Object.assign(new Error('Only the group leader can approve/reject'), { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.$queryRaw`
      SELECT * FROM group_withdrawals WHERE id = ${withdrawalId} AND "groupId" = ${groupId} FOR UPDATE
    `;

    if (!withdrawal.length) throw Object.assign(new Error('Withdrawal not found'), { status: 404 });

    const wd = withdrawal[0];

    if (wd.status !== 'PENDING_APPROVAL') {
      const isExpired = wd.status === 'EXPIRED';
      throw Object.assign(new Error(`Withdrawal already ${wd.status.toLowerCase()}`), { status: isExpired ? 410 : 409 });
    }

    const now = new Date();
    if (wd.expiresAt < now) {
      await tx.groupWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'EXPIRED', resolvedAt: now },
      });
      await tx.groupWallet.update({
        where: { groupId },
        data: { pending: { decrement: parseFloat(wd.amount) } },
      });
      throw Object.assign(new Error('Withdrawal has expired'), { status: 410 });
    }

    const amountFloat = parseFloat(wd.amount);

    if (action === 'APPROVE') {
      const gw = await tx.$queryRaw`
        SELECT balance, pending FROM group_wallets WHERE "groupId" = ${groupId} FOR UPDATE
      `;
      const bal = parseFloat(gw[0].balance);
      const pend = parseFloat(gw[0].pending);
      if ((bal - pend + amountFloat) < amountFloat) {
        throw Object.assign(new Error('Insufficient funds at approval time'), { status: 400 });
      }

      await tx.groupWallet.update({
        where: { groupId },
        data: {
          balance: { decrement: amountFloat },
          pending: { decrement: amountFloat },
        },
      });

      await tx.groupWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'APPROVED', resolvedAt: now },
      });

      const updatedGw = await tx.groupWallet.findUnique({ where: { groupId } });
      await tx.ledgerEntry.create({
        data: {
          userId,
          entryType: 'GROUP_WITHDRAWAL',
          amount: -amountFloat,
          balanceAfter: parseFloat(updatedGw.balance),
          referenceId: withdrawalId,
        },
      });
    } else {
      await tx.groupWallet.update({
        where: { groupId },
        data: { pending: { decrement: amountFloat } },
      });

      await tx.groupWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'REJECTED', resolvedAt: now },
      });
    }

    return tx.groupWithdrawal.findUnique({ where: { id: withdrawalId } });
  });

  return result;
}

async function evaluateExpiredWithdrawals(groupId) {
  const expired = await prisma.groupWithdrawal.findMany({
    where: {
      groupId,
      status: 'PENDING_APPROVAL',
      expiresAt: { lt: new Date() },
    },
  });

  for (const wd of expired) {
    try {
      await prisma.$transaction([
        prisma.groupWithdrawal.update({
          where: { id: wd.id },
          data: { status: 'EXPIRED', resolvedAt: new Date() },
        }),
        prisma.groupWallet.update({
          where: { groupId },
          data: { pending: { decrement: parseFloat(wd.amount) } },
        }),
      ]);
      logger.info({ withdrawalId: wd.id }, 'Withdrawal expired and earmark released');
    } catch (err) {
      logger.warn({ err: err.message, withdrawalId: wd.id }, 'Failed to expire withdrawal');
    }
  }
}

module.exports = { getGroupWallet, createWithdrawal, resolveWithdrawal, evaluateExpiredWithdrawals };
