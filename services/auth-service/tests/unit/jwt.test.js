const jwt = require('jsonwebtoken');
const { signAuthToken, verifyAuthToken } = require('../../src/utils/jwt');
const env = require('../../src/config/env');

describe('jwt utils', () => {
  test('signAuthToken embeds userId, role and exp in the payload', () => {
    const token = signAuthToken({ userId: 'user-1', role: 'admin' });
    const decoded = jwt.decode(token);

    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('admin');
    expect(typeof decoded.exp).toBe('number');
    expect(decoded.clientId).toBeUndefined();
  });

  test('verifyAuthToken returns the payload for a valid token', () => {
    const token = signAuthToken({ userId: 'user-1', role: 'qa_engineer' });
    const payload = verifyAuthToken(token);

    expect(payload.userId).toBe('user-1');
    expect(payload.role).toBe('qa_engineer');
  });

  test('verifyAuthToken throws for a token signed with a different secret', () => {
    const token = jwt.sign({ userId: 'user-1', role: 'admin' }, 'wrong-secret', {
      expiresIn: '1h',
    });

    expect(() => verifyAuthToken(token)).toThrow();
  });

  test('verifyAuthToken throws for an expired token', () => {
    const expiredToken = jwt.sign(
      { userId: 'user-1', role: 'admin', exp: Math.floor(Date.now() / 1000) - 10 },
      env.jwtSecret,
    );

    expect(() => verifyAuthToken(expiredToken)).toThrow(jwt.TokenExpiredError);
  });

  test('verifyAuthToken throws for a malformed token', () => {
    expect(() => verifyAuthToken('not-a-real-token')).toThrow();
  });
});
