require('dotenv').config({ path: '../backend/.env.test' });
const request = require('supertest');
const app = require('../../backend/src/server');
const prisma = require('../../backend/src/utils/prisma');
const jwt = require('jsonwebtoken');

describe('Reviewer Sandbox & Demo Role Switcher RBAC', () => {
  let demoUser;
  let demoToken;
  let normalUser;
  let normalToken;

  beforeAll(async () => {
    // 1. Create or ensure Demo User
    demoUser = await prisma.user.upsert({
      where: { mobile: '9000000002' },
      update: { isDemoAccount: true, isAdmin: false },
      create: {
        mobile: '9000000002',
        fullName: 'Demo Alice',
        dob: new Date('1995-01-01'),
        pincode: '400002',
        isAdmin: false,
        isDemoAccount: true,
        wallet: { create: { balance: 100, pending: 0 } },
      },
    });

    demoToken = jwt.sign(
      { id: demoUser.id, mobile: demoUser.mobile, isAdmin: false, role: 'USER', isDemoAccount: true },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // 2. Create normal registered user (non-demo)
    await prisma.user.deleteMany({ where: { mobile: '7999999999' } });
    normalUser = await prisma.user.create({
      data: {
        mobile: '7999999999',
        fullName: 'Real Member Normal',
        dob: new Date('1992-05-10'),
        pincode: '560001',
        isAdmin: false,
        isDemoAccount: false,
        wallet: { create: { balance: 50, pending: 0 } },
      },
    });

    normalToken = jwt.sign(
      { id: normalUser.id, mobile: normalUser.mobile, isAdmin: false, role: 'USER', isDemoAccount: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await prisma.wallet.deleteMany({ where: { userId: normalUser.id } });
    await prisma.user.deleteMany({ where: { id: normalUser.id } });
  });

  it('GET /me identifies isDemoAccount correctly for demo and normal users', async () => {
    const demoRes = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${demoToken}`);

    expect(demoRes.status).toBe(200);
    expect(demoRes.body.isDemoAccount).toBe(true);

    const normalRes = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${normalToken}`);

    expect(normalRes.status).toBe(200);
    expect(normalRes.body.isDemoAccount).toBe(false);
  });

  it('Normal registered user is strictly FORBIDDEN from calling PATCH /me/roles (403)', async () => {
    const res = await request(app)
      .patch('/me/roles')
      .set('Authorization', `Bearer ${normalToken}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/restricted to Reviewer Sandbox/i);
  });

  it('Demo user is allowed to call PATCH /me/roles and toggle to ADMIN', async () => {
    const res = await request(app)
      .patch('/me/roles')
      .set('Authorization', `Bearer ${demoToken}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.isAdmin).toBe(true);
    expect(res.body.user.isDemoAccount).toBe(true);
    expect(res.body.token).toBeDefined();

    // Verify token can be used as admin
    const newAdminToken = res.body.token;
    const verifyMe = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${newAdminToken}`);

    expect(verifyMe.status).toBe(200);
    expect(verifyMe.body.role).toBe('ADMIN');
  });

  it('Demo user can toggle back to USER', async () => {
    const res = await request(app)
      .patch('/me/roles')
      .set('Authorization', `Bearer ${demoToken}`)
      .send({ role: 'USER' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('USER');
    expect(res.body.user.isAdmin).toBe(false);
  });
});
