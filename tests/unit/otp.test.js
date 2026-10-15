describe('OTP Lockout Logic', () => {
  const MAX_ATTEMPTS = 5;
  const LOCK_SECONDS = 60;

  function simulateLockout(attempts) {
    return attempts >= MAX_ATTEMPTS;
  }

  function getRemainingAttempts(attempts) {
    return Math.max(0, MAX_ATTEMPTS - attempts);
  }

  function getLockExpiry(lockedAt) {
    return new Date(lockedAt.getTime() + LOCK_SECONDS * 1000);
  }

  it('does not lock before 5 attempts', () => {
    expect(simulateLockout(4)).toBe(false);
  });

  it('locks exactly at 5 attempts', () => {
    expect(simulateLockout(5)).toBe(true);
  });

  it('locks after more than 5 attempts', () => {
    expect(simulateLockout(6)).toBe(true);
  });

  it('shows correct remaining attempts', () => {
    expect(getRemainingAttempts(3)).toBe(2);
    expect(getRemainingAttempts(4)).toBe(1);
    expect(getRemainingAttempts(5)).toBe(0);
  });

  it('lock expires after 60 seconds', () => {
    const lockedAt = new Date();
    const expiry = getLockExpiry(lockedAt);
    const diffMs = expiry.getTime() - lockedAt.getTime();
    expect(diffMs).toBe(LOCK_SECONDS * 1000);
  });

  it('lock is not expired immediately', () => {
    const lockedAt = new Date();
    const expiry = getLockExpiry(lockedAt);
    expect(expiry > new Date()).toBe(true);
  });
});
