require('dotenv').config({ path: '../backend/.env.test' });
const request = require('supertest');
const app = require('../../backend/src/server');
const prisma = require('../../backend/src/utils/prisma');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

let adminToken;
let adminUser;
let targetUser;

beforeAll(async () => {
  adminUser = await prisma.user.upsert({
    where: { mobile: '6000000001' },
    create: {
      mobile: '6000000001',
      fullName: 'CSV Admin',
      dob: new Date('1985-01-01'),
      pincode: '200001',
      isAdmin: true,
      wallet: { create: { balance: 0, pending: 0 } },
    },
    update: {},
  });

  targetUser = await prisma.user.upsert({
    where: { mobile: '6000000002' },
    create: {
      mobile: '6000000002',
      fullName: 'CSV Target',
      dob: new Date('1990-01-01'),
      pincode: '200002',
      wallet: { create: { balance: 0, pending: 0 } },
    },
    update: {},
  });

  adminToken = jwt.sign({ id: adminUser.id, mobile: adminUser.mobile, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '1h' });

  await prisma.adminCreditReference.deleteMany({
    where: { reference: { in: ['CSVREF001', 'CSVREF002', 'CSVREF003'] } },
  });
  await prisma.wallet.upsert({
    where: { userId: targetUser.id },
    create: { userId: targetUser.id, balance: 0, pending: 0 },
    update: { balance: 0, pending: 0 },
  });
  await prisma.wallet.upsert({
    where: { userId: adminUser.id },
    create: { userId: adminUser.id, balance: 0, pending: 0 },
    update: { balance: 0, pending: 0 },
  });
});

afterAll(async () => {
  await prisma.adminCreditReference.deleteMany({
    where: { reference: { in: ['CSVREF001', 'CSVREF002', 'CSVREF003'] } },
  });
  await prisma.$disconnect();
});

function buildCsvBuffer(content) {
  return Buffer.from(content);
}

describe('POST /admin/credits/bulk', () => {
  it('processes valid CSV correctly', async () => {
    const csv = `mobile,amount,reference\n6000000002,10.00,CSVREF001\n6000000002,25.50,CSVREF002`;

    const res = await request(app)
      .post('/admin/credits/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buildCsvBuffer(csv), { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(2);
    expect(res.body.succeeded).toBe(2);
    expect(res.body.failed).toHaveLength(0);
    expect(res.body.duplicates).toHaveLength(0);
  });

  it('reports duplicates on second upload of same CSV', async () => {
    const csv = `mobile,amount,reference\n6000000002,10.00,CSVREF001\n6000000002,25.50,CSVREF002`;

    const res = await request(app)
      .post('/admin/credits/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buildCsvBuffer(csv), { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toBe(0);
    expect(res.body.duplicates).toHaveLength(2);
  });

  it('rejects negative amount rows with INVALID_AMOUNT', async () => {
    const csv = `mobile,amount,reference\n6000000002,-50,CSVREF003`;

    const res = await request(app)
      .post('/admin/credits/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buildCsvBuffer(csv), { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.failed.length).toBeGreaterThan(0);
    expect(res.body.failed[0].reason).toBe('INVALID_AMOUNT');
  });

  it('rejects non-admin access', async () => {
    const memberToken = jwt.sign({ id: targetUser.id, mobile: targetUser.mobile, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const csv = `mobile,amount,reference\n6000000002,10.00,CSVREF999`;

    const res = await request(app)
      .post('/admin/credits/bulk')
      .set('Authorization', `Bearer ${memberToken}`)
      .attach('file', buildCsvBuffer(csv), { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(403);
  });
});
