const { hashPassword, verifyPassword } = require('../../src/utils/password');

describe('password utils', () => {
  test('hashes a password to a different string than the plaintext', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(hash).not.toBe('Sup3rSecret!');
    expect(hash.length).toBeGreaterThan(0);
  });

  test('verifyPassword resolves true for the correct password', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('Sup3rSecret!', hash)).resolves.toBe(true);
  });

  test('verifyPassword resolves false for an incorrect password', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false);
  });

  test('hashing the same password twice yields different hashes (salted)', async () => {
    const hashA = await hashPassword('Sup3rSecret!');
    const hashB = await hashPassword('Sup3rSecret!');
    expect(hashA).not.toBe(hashB);
  });
});
