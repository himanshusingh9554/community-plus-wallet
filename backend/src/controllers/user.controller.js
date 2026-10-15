const prisma = require('../utils/prisma');

async function registerUser(req, res, next) {
  try {
    const { mobile, fullName, dob, memberType, gstin, pincode } = req.body;

    if (!mobile || !/^\d{10}$/.test(String(mobile))) {
      return res.status(400).json({ errors: { mobile: 'Mobile must be exactly 10 digits' } });
    }
    if (!fullName || fullName.length < 2 || fullName.length > 60) {
      return res.status(400).json({ errors: { fullName: 'Full name must be 2–60 characters' } });
    }

    const dobDate = new Date(dob);
    const age = (Date.now() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (isNaN(dobDate.getTime()) || age < 18) {
      return res.status(400).json({ errors: { dob: 'Must be at least 18 years old' } });
    }

    if (!['INDIVIDUAL', 'BUSINESS'].includes(memberType)) {
      return res.status(400).json({ errors: { memberType: 'Must be INDIVIDUAL or BUSINESS' } });
    }

    if (memberType === 'BUSINESS') {
      if (!gstin || !/^[A-Z0-9]{15}$/.test(gstin)) {
        return res.status(400).json({ errors: { gstin: 'GSTIN must be exactly 15 alphanumeric characters' } });
      }
    }

    if (!pincode || !/^\d{6}$/.test(String(pincode))) {
      return res.status(400).json({ errors: { pincode: 'Pincode must be exactly 6 digits' } });
    }

    const existing = await prisma.user.findUnique({ where: { mobile: String(mobile) } });

    if (existing && existing.fullName !== 'Pending Registration') {
      return res.status(409).json({ error: 'Mobile already registered' });
    }

    const user = existing
      ? await prisma.user.update({
          where: { mobile: String(mobile) },
          data: { fullName, dob: dobDate, memberType, gstin: gstin || null, pincode: String(pincode) },
        })
      : await prisma.user.create({
          data: {
            mobile: String(mobile),
            fullName,
            dob: dobDate,
            memberType,
            gstin: gstin || null,
            pincode: String(pincode),
            wallet: { create: { balance: 0, pending: 0 } },
          },
        });

    res.status(201).json({ id: user.id, mobile: user.mobile, fullName: user.fullName });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Mobile already registered' });
    }
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, mobile: true, fullName: true, memberType: true, isAdmin: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { registerUser, getMe };
