const Decimal = require('decimal.js');

function validateAmount(amount) {
  if (amount === null || amount === undefined) {
    return { valid: false, reason: 'INVALID_AMOUNT' };
  }
  const str = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    return { valid: false, reason: 'INVALID_AMOUNT' };
  }
  const d = new Decimal(str);
  if (d.lte(0)) {
    return { valid: false, reason: 'INVALID_AMOUNT' };
  }
  return { valid: true, value: d };
}

function formatDecimal(val) {
  return new Decimal(val.toString()).toFixed(2);
}

module.exports = { validateAmount, formatDecimal };
