const { parse } = require('csv-parse');
const { Readable } = require('stream');
const prisma = require('../utils/prisma');
const { validateAmount, formatDecimal } = require('../utils/amount');
const { fireAndForgetNotification } = require('../utils/notify');
const logger = require('../utils/logger');

const TX_OPTIONS = { maxWait: 30000, timeout: 60000 };

async function processBulkCredits(fileBuffer) {
  const rows = await parseCsv(fileBuffer);

  const result = {
    processed: rows.length,
    succeeded: 0,
    failed: [],
    duplicates: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const { mobile, amount, reference } = row;

    const { valid, value: amountDec } = validateAmount(amount);
    if (!valid) {
      result.failed.push({ row: rowNum, reason: 'INVALID_AMOUNT' });
      continue;
    }

    if (!mobile || !/^\d{10}$/.test(String(mobile).trim())) {
      result.failed.push({ row: rowNum, reason: 'INVALID_MOBILE' });
      continue;
    }

    if (!reference || !String(reference).trim()) {
      result.failed.push({ row: rowNum, reason: 'MISSING_REFERENCE' });
      continue;
    }

    const ref = String(reference).trim();
    const mob = String(mobile).trim();
    const amountFloat = amountDec.toNumber();

    const dupCheck = await prisma.adminCreditReference.findUnique({ where: { reference: ref } });
    if (dupCheck) {
      result.duplicates.push({ row: rowNum, reference: ref });
      continue;
    }

    try {
      const user = await prisma.user.findUnique({ where: { mobile: mob } });
      if (!user) {
        result.failed.push({ row: rowNum, reason: 'USER_NOT_FOUND' });
        continue;
      }

      let ledgerEntry;
      await prisma.$transaction(async (tx) => {
        const [_, updatedWallet] = await Promise.all([
          tx.adminCreditReference.create({ data: { reference: ref, mobile: mob, amount: amountFloat } }),
          tx.wallet.update({
            where: { userId: user.id },
            data: { balance: { increment: amountFloat } },
          }),
        ]);

        ledgerEntry = await tx.ledgerEntry.create({
          data: {
            userId: user.id,
            entryType: 'ADMIN_CREDIT',
            amount: amountFloat,
            balanceAfter: parseFloat(updatedWallet.balance),
            referenceId: ref,
            metadata: { reference: ref },
          },
        });
      }, TX_OPTIONS);

      fireAndForgetNotification(
        mob,
        `Your wallet has been credited with ${formatDecimal(amountFloat)} points`,
        ledgerEntry.id
      );

      result.succeeded++;
    } catch (err) {
      if (err.code === 'P2002') {
        result.duplicates.push({ row: rowNum, reference: ref });
      } else {
        logger.error({ err: err.message, row: rowNum }, 'Admin credit row failed');
        result.failed.push({ row: rowNum, reason: 'PROCESSING_ERROR' });
      }
    }
  }

  return result;
}

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const records = [];
    const stream = Readable.from(buffer.toString());
    stream
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row) => records.push(row))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
}

module.exports = { processBulkCredits };
