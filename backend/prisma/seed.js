const prisma = require('../src/utils/prisma');

async function main() {
  const admin = await prisma.user.upsert({
    where: { mobile: '9000000001' },
    update: {},
    create: {
      mobile: '9000000001',
      fullName: 'Demo Admin',
      dob: new Date('1990-01-01'),
      memberType: 'INDIVIDUAL',
      pincode: '400001',
      isAdmin: true,
      wallet: {
        create: { balance: 1000, pending: 0 },
      },
    },
  });

  const member1 = await prisma.user.upsert({
    where: { mobile: '9000000002' },
    update: {},
    create: {
      mobile: '9000000002',
      fullName: 'Alice Member',
      dob: new Date('1995-05-15'),
      memberType: 'INDIVIDUAL',
      pincode: '400002',
      wallet: {
        create: { balance: 500, pending: 0 },
      },
    },
  });

  const member2 = await prisma.user.upsert({
    where: { mobile: '9000000003' },
    update: {},
    create: {
      mobile: '9000000003',
      fullName: 'Bob Member',
      dob: new Date('1998-08-20'),
      memberType: 'BUSINESS',
      gstin: 'ABCDE1234F12345',
      pincode: '400003',
      wallet: {
        create: { balance: 250, pending: 0 },
      },
    },
  });

  const group = await prisma.group.upsert({
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
            { userId: member2.id, isLeader: false },
          ],
          skipDuplicates: true,
        },
      },
    },
  });

  console.log('Seed complete:', { admin: admin.mobile, member1: member1.mobile, member2: member2.mobile, group: group.id });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
