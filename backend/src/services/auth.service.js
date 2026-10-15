const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const OTP_EXPIRY_SECONDS = 300;
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 60;

function generateOtp() {
  if (process.env.OTP_FIXED) return process.env.OTP_FIXED;
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function requestOtp(mobile) {
  let user = await prisma.user.findUnique({ where: { mobile } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        mobile,
        fullName: 'Pending Registration',
        dob: new Date('2000-01-01'),
        pincode: '000000',
        wallet: { create: { balance: 0, pending: 0 } },
      },
    });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  await prisma.otpRecord.upsert({
    where: { userId: user.id },
    create: { userId: user.id, otp, expiresAt, attempts: 0 },
    update: { otp, expiresAt, attempts: 0, lockedUntil: null },
  });

  logger.info({ mobile }, 'OTP issued');
  return { sent: true };
}

async function verifyOtp(mobile, otp) {
  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user) {
    return { success: false, error: 'User not found', status: 404 };
  }

  const record = await prisma.otpRecord.findUnique({ where: { userId: user.id } });
  if (!record) {
    return { success: false, error: 'OTP not requested', status: 400 };
  }

  if (record.lockedUntil && record.lockedUntil > new Date()) {
    const secondsLeft = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { success: false, error: `Account locked. Try again in ${secondsLeft}s`, status: 429 };
  }

  if (record.expiresAt < new Date()) {
    return { success: false, error: 'OTP expired', status: 400 };
  }

  if (record.otp !== otp) {
    const newAttempts = record.attempts + 1;
    const lockUntil = newAttempts >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_SECONDS * 1000)
      : null;

    await prisma.otpRecord.update({
      where: { userId: user.id },
      data: { attempts: newAttempts, lockedUntil: lockUntil },
    });

    const remaining = MAX_ATTEMPTS - newAttempts;
    const message = newAttempts >= MAX_ATTEMPTS
      ? 'Too many attempts. Account locked for 60 seconds.'
      : `Invalid OTP. ${remaining} attempt(s) remaining.`;

    return { success: false, error: message, status: 401 };
  }

  await prisma.otpRecord.update({
    where: { userId: user.id },
    data: { attempts: 0, lockedUntil: null },
  });

  const token = jwt.sign(
    { id: user.id, mobile: user.mobile, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { success: true, token, user: { id: user.id, mobile: user.mobile, isAdmin: user.isAdmin } };
}

module.exports = { requestOtp, verifyOtp };
