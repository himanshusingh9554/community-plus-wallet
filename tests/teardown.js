const prisma = require('../backend/src/utils/prisma');

module.exports = async () => {
  await prisma.$disconnect().catch(() => {});
};
