require('dotenv').config({ path: '../backend/.env.test' });
const request = require('supertest');
const app = require('../../backend/src/server');
const prisma = require('../../backend/src/utils/prisma');
const jwt = require('jsonwebtoken');

let adminToken;
let memberToken;
let adminUser;
let memberUser;
let receiverUser;

beforeAll(async () => {
  await prisma.ledgerEntry.deleteMany({});
  await prisma.transfer.deleteMany({});
  await prisma.idempotencyRecord.deleteMany({});
  await prisma.otpRecord.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.user.deleteMany({ where: { mobile: { in: ['5000000001', '5000000002', '5000000003'] } } });

  adminUser = await prisma.user.create({
    data: {
      mobile: '5000000001',
      fullName: 'Test Admin',
      dob: new Date('1990-01-01'),
      pincode: '100001',
      isAdmin: true,
      wallet: { create: { balance: 1000, pending: 0 } },
    },
  });

  memberUser = await prisma.user.create({
    data: {
      mobile: '5000000002',
      fullName: 'Test Member',
      dob: new Date('1995-01-01'),
      pincode: '100002',
      wallet: { create: { balance: 500, pending: 0 } },
    },
  });

  receiverUser = await prisma.user.create({
    data: {
      mobile: '5000000003',
      fullName: 'Test Receiver',
      dob: new Date('1997-01-01'),
      pincode: '100003',
      wallet: { create: { balance: 100, pending: 0 } },
    },
  });

  adminToken = jwt.sign({ id: adminUser.id, mobile: adminUser.mobile, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
  memberToken = jwt.sign({ id: memberUser.id, mobile: memberUser.mobile, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [adminUser?.id, memberUser?.id, receiverUser?.id] } } });
  await prisma.transfer.deleteMany({ where: { senderId: { in: [adminUser?.id, memberUser?.id] } } });
  await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: [adminUser?.id, memberUser?.id] } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: [adminUser?.id, memberUser?.id, receiverUser?.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser?.id, memberUser?.id, receiverUser?.id] } } });
  await prisma.$disconnect();
});

describe('GET /wallet', () => {
  it('returns wallet balance for authenticated user', async () => {
    const res = await request(app)
      .get('/wallet')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('balance');
    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('available');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/wallet');
    expect(res.status).toBe(401);
  });
});

describe('POST /wallet/transfers', () => {
  it('transfers points successfully', async () => {
    const res = await request(app)
      .post('/wallet/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receiverMobile: '5000000002', amount: '50' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(parseFloat(res.body.amount)).toBe(50);
  });

  it('rejects transfer when insufficient balance', async () => {
    const res = await request(app)
      .post('/wallet/transfers')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ receiverMobile: '5000000001', amount: '99999' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);
  });

  it('rejects transfer to self', async () => {
    const res = await request(app)
      .post('/wallet/transfers')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ receiverMobile: '5000000002', amount: '10' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  it('rejects negative amount', async () => {
    const res = await request(app)
      .post('/wallet/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receiverMobile: '5000000002', amount: '-10' });

    expect(res.status).toBe(400);
  });
});

describe('Idempotency (sequential & parallel)', () => {
  it('same Idempotency-Key returns same result without double transfer (sequential)', async () => {
    const key = `idem-test-${Date.now()}`;

    const res1 = await request(app)
      .post('/wallet/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send({ receiverMobile: '5000000003', amount: '10' });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);

    const balanceBefore = await prisma.wallet.findUnique({ where: { userId: receiverUser.id } });

    const res2 = await request(app)
      .post('/wallet/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send({ receiverMobile: '5000000003', amount: '10' });

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);

    const balanceAfter = await prisma.wallet.findUnique({ where: { userId: receiverUser.id } });
    expect(parseFloat(balanceAfter.balance)).toBe(parseFloat(balanceBefore.balance));
  });

  it('same Idempotency-Key sent in parallel transfers money only once', async () => {
    const key = `idem-parallel-${Date.now()}`;
    const balanceBefore = await prisma.wallet.findUnique({ where: { userId: receiverUser.id } });

    const requests = Array.from({ length: 5 }, () =>
      request(app)
        .post('/wallet/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({ receiverMobile: '5000000003', amount: '15' })
    );

    const responses = await Promise.all(requests);
    const successful = responses.filter((r) => r.status === 200);
    expect(successful.length).toBeGreaterThanOrEqual(1);

    const balanceAfter = await prisma.wallet.findUnique({ where: { userId: receiverUser.id } });
    const diff = parseFloat(balanceAfter.balance) - parseFloat(balanceBefore.balance);
    expect(diff).toBe(15.00);
  });
});

describe('GET /wallet/transactions', () => {
  it('returns paginated transaction history', async () => {
    const res = await request(app)
      .get('/wallet/transactions?page=1&limit=5')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
