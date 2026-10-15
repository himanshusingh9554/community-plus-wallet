describe('Expiry Calculation (PENDING_TTL_SECONDS)', () => {
  function getExpiresAt(ttlSeconds) {
    return new Date(Date.now() + ttlSeconds * 1000);
  }

  function isExpired(expiresAt) {
    return expiresAt < new Date();
  }

  it('default TTL of 86400 seconds (24h) is not immediately expired', () => {
    const exp = getExpiresAt(86400);
    expect(isExpired(exp)).toBe(false);
  });

  it('TTL of 0 seconds is not considered expired (equal to now, not before it)', () => {
    const exp = getExpiresAt(0);
    expect(isExpired(exp)).toBe(false);
  });

  it('TTL of -1 is already expired', () => {
    const exp = getExpiresAt(-1);
    expect(isExpired(exp)).toBe(true);
  });

  it('expiresAt is approximately now + ttl seconds', () => {
    const ttl = 3600;
    const before = Date.now();
    const exp = getExpiresAt(ttl);
    const after = Date.now();
    expect(exp.getTime()).toBeGreaterThanOrEqual(before + ttl * 1000);
    expect(exp.getTime()).toBeLessThanOrEqual(after + ttl * 1000 + 100);
  });
});
