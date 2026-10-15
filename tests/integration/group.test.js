require('dotenv').config({ path: '../backend/.env.test' });
const request = require('supertest');
const app = require('../../backend/src/server');
const prisma = require('../../backend/src/utils/prisma');
const jwt = require('jsonwebtoken');

let leaderUser;
let memberUser;
let outsiderUser;
let leaderToken;
let memberToken;
let outsiderToken;
let testGroup;

beforeAll(async () => {
  await prisma.groupWithdrawal.deleteMany({});
  await prisma.groupMember.deleteMany({});
  await prisma.groupWallet.deleteMany({});
  await prisma.group.deleteMany({ where: { name: 'Integration Test Group' } });
  await prisma.ledgerEntry.deleteMany({});
  await prisma.user.deleteMany({ where: { mobile: { in: ['8000000001', '8000000002', '8000000003'] } } });

  leaderUser = await prisma.user.create({
    data: {
      mobile: '8000000001',
      fullName: 'Group Leader',
      dob: new Date('1990-01-01'),
      pincode: '400001',
      wallet: { create: { balance: 0, pending: 0 } },
    },
  });

  memberUser = await prisma.user.create({
    data: {
      mobile: '8000000002',
      fullName: 'Group Member',
      dob: new Date('1992-01-01'),
      pincode: '400002',
      wallet: { create: { balance: 0, pending: 0 } },
    },
  });

  outsiderUser = await prisma.user.create({
    data: {
      mobile: '8000000003',
      fullName: 'Group Outsider',
      dob: new Date('1994-01-01'),
      pincode: '400003',
      wallet: { create: { balance: 0, pending: 0 } },
    },
  });

  testGroup = await prisma.group.create({
    data: {
      name: 'Integration Test Group',
      wallet: { create: { balance: 1000, pending: 0 } },
      members: {
        createMany: {
          data: [
            { userId: leaderUser.id, isLeader: true },
            { userId: memberUser.id, isLeader: false },
          ],
        },
      },
    },
  });

  leaderToken = jwt.sign({ id: leaderUser.id, mobile: leaderUser.mobile, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
  memberToken = jwt.sign({ id: memberUser.id, mobile: memberUser.mobile, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
  outsiderToken = jwt.sign({ id: outsiderUser.id, mobile: outsiderUser.mobile, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await prisma.groupWithdrawal.deleteMany({});
  await prisma.groupMember.deleteMany({});
  await prisma.groupWallet.deleteMany({});
  await prisma.group.deleteMany({ where: { id: testGroup?.id } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [leaderUser?.id, memberUser?.id, outsiderUser?.id] } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: [leaderUser?.id, memberUser?.id, outsiderUser?.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [leaderUser?.id, memberUser?.id, outsiderUser?.id] } } });
  await prisma.$disconnect();
});

describe('Group Wallet & Permissions', () => {
  it('member can view group wallet', async () => {
    const res = await request(app)
      .get(`/groups/${testGroup.id}/wallet`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe('1000.00');
    expect(res.body.pending).toBe('0.00');
    expect(res.body.available).toBe('1000.00');
  });

  it('non-member is rejected with 403 Forbidden', async () => {
    const res = await request(app)
      .get(`/groups/${testGroup.id}/wallet`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Group Withdrawal Lifecycle', () => {
  let withdrawalId;

  it('creates withdrawal request and immediately earmarks funds', async () => {
    const res = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ amount: '200.00', note: 'Project supplies' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('PENDING_APPROVAL');
    withdrawalId = res.body.id;

    const walletRes = await request(app)
      .get(`/groups/${testGroup.id}/wallet`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(walletRes.body.balance).toBe('1000.00');
    expect(walletRes.body.pending).toBe('200.00');
    expect(walletRes.body.available).toBe('800.00');
  });

  it('regular member cannot approve withdrawal (403)', async () => {
    const res = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals/${withdrawalId}/approve`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('group leader approves withdrawal successfully', async () => {
    const res = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals/${withdrawalId}/approve`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');

    const walletRes = await request(app)
      .get(`/groups/${testGroup.id}/wallet`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(walletRes.body.balance).toBe('800.00');
    expect(walletRes.body.pending).toBe('0.00');
    expect(walletRes.body.available).toBe('800.00');
  });

  it('cannot re-approve an already approved withdrawal (409)', async () => {
    const res = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals/${withdrawalId}/approve`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(res.status).toBe(409);
  });

  it('creates second withdrawal and rejects it, releasing earmark', async () => {
    const createRes = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ amount: '150.00', note: 'Marketing spend' });

    expect(createRes.status).toBe(201);
    const rejWithdrawalId = createRes.body.id;

    const rejectRes = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals/${rejWithdrawalId}/reject`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');

    const walletRes = await request(app)
      .get(`/groups/${testGroup.id}/wallet`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(walletRes.body.balance).toBe('800.00');
    expect(walletRes.body.pending).toBe('0.00');
    expect(walletRes.body.available).toBe('800.00');
  });

  it('lazy expiry releases earmark when expired withdrawal is evaluated', async () => {
    const createRes = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ amount: '100.00', note: 'Expiring request' });

    expect(createRes.status).toBe(201);
    const expWithdrawalId = createRes.body.id;

    await prisma.groupWithdrawal.update({
      where: { id: expWithdrawalId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const approveRes = await request(app)
      .post(`/groups/${testGroup.id}/withdrawals/${expWithdrawalId}/approve`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(approveRes.status).toBe(410);

    const walletRes = await request(app)
      .get(`/groups/${testGroup.id}/wallet`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(walletRes.body.pending).toBe('0.00');
  });
});
