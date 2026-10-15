require('dotenv').config({ path: '../backend/.env.test' });
const request = require('supertest');
const app = require('../../backend/src/server');
const prisma = require('../../backend/src/utils/prisma');
const jwt = require('jsonwebtoken');

const STARTING_BALANCE = 100;
const TRANSFER_AMOUNT = 10;
const CONCURRENT_REQUESTS = 20;

let senderUser;
let receiverUser;
let senderToken;

beforeAll(async () => {
  await prisma.ledgerEntry.deleteMany({});
  await prisma.transfer.deleteMany({});
  await prisma.user.deleteMany({ where: { mobile: { in: ['7000000001', '7000000002'] } } });

  senderUser = await prisma.user.create({
    data: {
      mobile: '7000000001',
      fullName: 'Concurrent Sender',
      dob: new Date('1990-01-01'),
      pincode: '300001',
      wallet: { create: { balance: STARTING_BALANCE, pending: 0 } },
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      userId: senderUser.id,
      entryType: 'ADMIN_CREDIT',
      amount: STARTING_BALANCE,
      balanceAfter: STARTING_BALANCE,
      metadata: { reason: 'Initial funding' },
    },
  });

  receiverUser = await prisma.user.create({
    data: {
      mobile: '7000000002',
      fullName: 'Concurrent Receiver',
      dob: new Date('1990-01-01'),
      pincode: '300002',
      wallet: { create: { balance: 0, pending: 0 } },
    },
  });

  senderToken = jwt.sign({ id: senderUser.id, mobile: senderUser.mobile, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [senderUser?.id, receiverUser?.id] } } });
  await prisma.transfer.deleteMany({ where: { senderId: senderUser?.id } });
  await prisma.wallet.deleteMany({ where: { userId: { in: [senderUser?.id, receiverUser?.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [senderUser?.id, receiverUser?.id] } } });
  await prisma.$disconnect();
});

describe('CRITICAL: Concurrency Test — 20 simultaneous transfers of 10 against balance of 100', () => {
  it('exactly 10 succeed, 10 fail, balance never goes negative, ledger invariant holds', async () => {
    const makeTransfer = () =>
      request(app)
        .post('/wallet/transfers')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ receiverMobile: '7000000002', amount: String(TRANSFER_AMOUNT) });

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, makeTransfer)
    );

    const succeeded = results.filter((r) => r.status === 200 && r.body.success);
    const failed = results.filter((r) => r.status !== 200 || !r.body.success);

    console.log(`Succeeded: ${succeeded.length}, Failed: ${failed.length}`);

    const totalMoved = succeeded.length * TRANSFER_AMOUNT;
    expect(totalMoved).toBeLessThanOrEqual(STARTING_BALANCE);
    expect(succeeded.length).toBe(STARTING_BALANCE / TRANSFER_AMOUNT);
    expect(failed.length).toBe(CONCURRENT_REQUESTS - (STARTING_BALANCE / TRANSFER_AMOUNT));

    const senderWallet = await prisma.wallet.findUnique({ where: { userId: senderUser.id } });
    const finalBalance = parseFloat(senderWallet.balance);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
    expect(finalBalance).toBe(0);

    const ledgerSum = await prisma.ledgerEntry.aggregate({
      where: { userId: senderUser.id },
      _sum: { amount: true },
    });

    const ledgerTotal = parseFloat(ledgerSum._sum.amount || 0);
    expect(ledgerTotal).toBe(finalBalance);
    expect(Math.abs(ledgerTotal - finalBalance)).toBeLessThan(0.01);

    console.log({
      startingBalance: STARTING_BALANCE,
      finalBalance,
      ledgerSum: ledgerTotal,
      succeeded: succeeded.length,
      failed: failed.length,
    });
  }, 60000);
});
