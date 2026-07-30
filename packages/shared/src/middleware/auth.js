const jwt = require('jsonwebtoken');

// Every service verifies the same stateless JWT locally with a shared
// secret (JWT_SECRET) — no round-trip to auth-service on each request.
function createAuthenticate(jwtSecret) {
  return function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }

    try {
      req.auth = jwt.verify(token, jwtSecret);
      return next();
    } catch (_err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}

function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Insufficient role for this operation' });
    }
    return next();
  };
}

module.exports = { createAuthenticate, requireRole };
