const { validateAmount } = require('../../backend/src/utils/amount');

describe('Amount Validation', () => {
  it('accepts valid positive integer', () => {
    const r = validateAmount(10);
    expect(r.valid).toBe(true);
    expect(r.value.toNumber()).toBe(10);
  });

  it('accepts valid positive decimal', () => {
    const r = validateAmount('10.50');
    expect(r.valid).toBe(true);
    expect(r.value.toFixed(2)).toBe('10.50');
  });

  it('rejects zero', () => {
    expect(validateAmount(0).valid).toBe(false);
  });

  it('rejects negative', () => {
    expect(validateAmount(-50).valid).toBe(false);
  });

  it('rejects negative string', () => {
    expect(validateAmount('-10').valid).toBe(false);
  });

  it('rejects non-numeric string', () => {
    expect(validateAmount('abc').valid).toBe(false);
  });

  it('rejects null', () => {
    expect(validateAmount(null).valid).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateAmount(undefined).valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateAmount('').valid).toBe(false);
  });

  it('rejects more than 2 decimal places', () => {
    expect(validateAmount('10.123').valid).toBe(false);
  });

  it('returns INVALID_AMOUNT reason', () => {
    expect(validateAmount(-1).reason).toBe('INVALID_AMOUNT');
  });
});
