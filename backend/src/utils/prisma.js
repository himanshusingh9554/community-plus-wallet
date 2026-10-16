const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: isDev ? ['query', 'warn', 'error'] : isTest ? ['warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
