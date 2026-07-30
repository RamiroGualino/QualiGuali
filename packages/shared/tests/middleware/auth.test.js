const jwt = require('jsonwebtoken');
const { createAuthenticate, requireRole } = require('../../src/middleware/auth');
const { ROLES } = require('../../src/constants/roles');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('createAuthenticate', () => {
  const secret = 'test-secret';
  const authenticate = createAuthenticate(secret);

  test('rejects a request with no Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ userId: '1', role: ROLES.ADMIN }, 'wrong-secret');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches the decoded payload to req.auth and calls next on a valid token', () => {
    const token = jwt.sign({ userId: '1', role: ROLES.ADMIN }, secret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth.userId).toBe('1');
    expect(req.auth.role).toBe(ROLES.ADMIN);
  });
});

describe('requireRole', () => {
  test('calls next when the actor has one of the allowed roles', () => {
    const guard = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN);
    const req = { auth: { role: ROLES.ADMIN } };
    const res = mockRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('rejects with 403 when the actor role is not allowed', () => {
    const guard = requireRole(ROLES.SUPER_ADMIN);
    const req = { auth: { role: ROLES.QA_ENGINEER } };
    const res = mockRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects with 403 when req.auth is missing', () => {
    const guard = requireRole(ROLES.SUPER_ADMIN);
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
