const prisma = require('../src/utils/prisma');

async function main() {
  // 1. Demo Admin (9000000001) - Admin & Group A Leader
  const admin = await prisma.user.upsert({
    where: { mobile: '9000000001' },
    update: { isAdmin: true, isDemoAccount: true, fullName: 'Demo Admin' },
    create: {
      mobile: '9000000001',
      fullName: 'Demo Admin',
      dob: new Date('1990-01-01'),
      memberType: 'INDIVIDUAL',
      pincode: '400001',
      isAdmin: true,
      isDemoAccount: true,
      wallet: {
        create: { balance: 1000, pending: 0 },
      },
    },
  });

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, balance: 1000, pending: 0 },
    update: { balance: 1000, pending: 0 },
  });

  // 2. Alice Member (9000000002) - Normal Member of Group A
  const member1 = await prisma.user.upsert({
    where: { mobile: '9000000002' },
    update: { isAdmin: false, isDemoAccount: true, fullName: 'Alice Member' },
    create: {
      mobile: '9000000002',
      fullName: 'Alice Member',
      dob: new Date('1995-05-15'),
      memberType: 'INDIVIDUAL',
      pincode: '400002',
      isAdmin: false,
      isDemoAccount: true,
      wallet: {
        create: { balance: 500, pending: 0 },
      },
    },
  });

  await prisma.wallet.upsert({
    where: { userId: member1.id },
    create: { userId: member1.id, balance: 500, pending: 0 },
    update: { balance: 500, pending: 0 },
  });

  // 3. Bob Group B Leader (9000000003) - Normal User, Non-member of Group A, Group B Leader
  const member2 = await prisma.user.upsert({
    where: { mobile: '9000000003' },
    update: { isAdmin: false, isDemoAccount: true, fullName: 'Bob GroupB-Leader' },
    create: {
      mobile: '9000000003',
      fullName: 'Bob GroupB-Leader',
      dob: new Date('1998-08-20'),
      memberType: 'BUSINESS',
      gstin: 'ABCDE1234F12345',
      pincode: '400003',
      isAdmin: false,
      isDemoAccount: true,
      wallet: {
        create: { balance: 250, pending: 0 },
      },
    },
  });

  await prisma.wallet.upsert({
    where: { userId: member2.id },
    create: { userId: member2.id, balance: 250, pending: 0 },
    update: { balance: 250, pending: 0 },
  });

  // Restore wallets for any other existing database users
  const allUsers = await prisma.user.findMany({ include: { wallet: true } });
  for (const u of allUsers) {
    if (!u.wallet) {
      await prisma.wallet.create({
        data: { userId: u.id, balance: 1000, pending: 0 },
      });
      console.log(`Restored wallet for user: ${u.mobile}`);
    }
  }

  // 4. Group A (id: 'group-a') - Leader: Admin (9000000001), Member: Alice (9000000002)
  const groupA = await prisma.group.upsert({
    where: { id: 'group-a' },
    update: { name: 'Group A' },
    create: {
      id: 'group-a',
      name: 'Group A',
      wallet: { create: { balance: 5000, pending: 100 } },
      members: {
        createMany: {
          data: [
            { userId: admin.id, isLeader: true },
            { userId: member1.id, isLeader: false },
          ],
          skipDuplicates: true,
        },
      },
    },
  });

  await prisma.groupWallet.upsert({
    where: { groupId: groupA.id },
    create: { groupId: groupA.id, balance: 5000, pending: 100 },
    update: { balance: 5000, pending: 100 },
  });

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: groupA.id, userId: admin.id } },
    create: { groupId: groupA.id, userId: admin.id, isLeader: true },
    update: { isLeader: true },
  });

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: groupA.id, userId: member1.id } },
    create: { groupId: groupA.id, userId: member1.id, isLeader: false },
    update: { isLeader: false },
  });

  // Ensure member2 (9000000003) is NOT in Group A
  await prisma.groupMember.deleteMany({
    where: { groupId: groupA.id, userId: member2.id },
  });

  // Seed pending withdrawal for demonstration in Group A
  await prisma.groupWithdrawal.upsert({
    where: { id: 'demo-withdrawal-001' },
    update: { status: 'PENDING_APPROVAL', amount: 100, note: 'Community Garden Equipment' },
    create: {
      id: 'demo-withdrawal-001',
      groupId: groupA.id,
      requestedBy: member1.id,
      amount: 100,
      note: 'Community Garden Equipment',
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    },
  });

  // 5. Group B (id: 'group-b') - Leader: Bob (9000000003)
  const groupB = await prisma.group.upsert({
    where: { id: 'group-b' },
    update: { name: 'Group B' },
    create: {
      id: 'group-b',
      name: 'Group B',
      wallet: { create: { balance: 3000, pending: 0 } },
      members: {
        createMany: {
          data: [{ userId: member2.id, isLeader: true }],
          skipDuplicates: true,
        },
      },
    },
  });

  await prisma.groupWallet.upsert({
    where: { groupId: groupB.id },
    create: { groupId: groupB.id, balance: 3000, pending: 0 },
    update: { balance: 3000, pending: 0 },
  });

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: groupB.id, userId: member2.id } },
    create: { groupId: groupB.id, userId: member2.id, isLeader: true },
    update: { isLeader: true },
  });

  // Also maintain demo-group-001 for compatibility
  const demoGroup = await prisma.group.upsert({
    where: { id: 'demo-group-001' },
    update: {},
    create: {
      id: 'demo-group-001',
      name: 'Demo Group',
      wallet: { create: { balance: 5000, pending: 0 } },
      members: {
        createMany: {
          data: [
            { userId: admin.id, isLeader: true },
            { userId: member1.id, isLeader: false },
          ],
          skipDuplicates: true,
        },
      },
    },
  });

  console.log('RBAC Seed complete:', {
    admin: { mobile: admin.mobile, role: 'ADMIN', groupALeader: true },
    member1: { mobile: member1.mobile, role: 'USER', groupAMember: true },
    member2: { mobile: member2.mobile, role: 'USER', groupBLeader: true, nonMemberGroupA: true },
    groupA: groupA.id,
    groupB: groupB.id,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
