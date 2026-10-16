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
          data: { fullName, dob: dobDate, memberType, gstin: gstin || null, pincode: String(pincode), isAdmin: false, isDemoAccount: false },
        })
      : await prisma.user.create({
          data: {
            mobile: String(mobile),
            fullName,
            dob: dobDate,
            memberType,
            gstin: gstin || null,
            pincode: String(pincode),
            isAdmin: false,
            isDemoAccount: false,
            wallet: { create: { balance: 0, pending: 0 } },
          },
        });

    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: 0, pending: 0 },
      update: {},
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
      select: {
        id: true,
        mobile: true,
        fullName: true,
        memberType: true,
        isAdmin: true,
        isDemoAccount: true,
        createdAt: true,
        groupMemberships: {
          select: {
            groupId: true,
            isLeader: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const isDemoAccount = Boolean(user.isDemoAccount || ['9000000001', '9000000002', '9000000003'].includes(user.mobile));

    res.json({
      id: user.id,
      mobile: user.mobile,
      fullName: user.fullName,
      memberType: user.memberType,
      isAdmin: user.isAdmin,
      isDemoAccount,
      role: user.isAdmin ? 'ADMIN' : 'USER',
      groups: (user.groupMemberships || []).map((m) => ({
        groupId: m.groupId,
        name: m.group?.name || m.groupId,
        isLeader: m.isLeader,
        role: m.isLeader ? 'LEADER' : 'MEMBER',
      })),
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

async function updateRoles(req, res, next) {
  try {
    const jwt = require('jsonwebtoken');
    const { role, groupId, groupRole } = req.body;
    const userId = req.user.id;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mobile: true, isDemoAccount: true },
    });

    const isDemo = currentUser && (currentUser.isDemoAccount || ['9000000001', '9000000002', '9000000003'].includes(currentUser.mobile));
    if (!isDemo) {
      return res.status(403).json({ error: 'Role switching is restricted to Reviewer Sandbox accounts' });
    }

    if (role) {
      await prisma.user.update({
        where: { id: userId },
        data: { isAdmin: role === 'ADMIN' },
      });
    }

    if (groupId) {
      if (groupRole === 'NONE') {
        await prisma.groupMember.deleteMany({
          where: { groupId, userId },
        });
      } else if (groupRole === 'LEADER' || groupRole === 'MEMBER') {
        const isLeader = groupRole === 'LEADER';
        await prisma.groupMember.upsert({
          where: { groupId_userId: { groupId, userId } },
          create: { groupId, userId, isLeader },
          update: { isLeader },
        });
      }
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mobile: true,
        fullName: true,
        isAdmin: true,
        isDemoAccount: true,
        groupMemberships: {
          select: {
            groupId: true,
            isLeader: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });

    const newRole = updatedUser.isAdmin ? 'ADMIN' : 'USER';
    const isDemoAccount = Boolean(updatedUser.isDemoAccount || ['9000000001', '9000000002', '9000000003'].includes(updatedUser.mobile));

    const token = jwt.sign(
      {
        id: updatedUser.id,
        mobile: updatedUser.mobile,
        isAdmin: updatedUser.isAdmin,
        role: newRole,
        isDemoAccount,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: updatedUser.id,
        mobile: updatedUser.mobile,
        fullName: updatedUser.fullName,
        isAdmin: updatedUser.isAdmin,
        isDemoAccount,
        role: newRole,
        groups: (updatedUser.groupMemberships || []).map((m) => ({
          groupId: m.groupId,
          name: m.group?.name || m.groupId,
          isLeader: m.isLeader,
          role: m.isLeader ? 'LEADER' : 'MEMBER',
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerUser, getMe, updateRoles };
