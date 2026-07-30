const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAuthToken } = require('../utils/jwt');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signAuthToken({ userId: user._id.toString(), role: user.role });
    return res.status(200).json({ token, user: user.toJSON() });
  } catch (err) {
    return next(err);
  }
}

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role });

    return res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    return res.status(200).json({ user: user.toJSON() });
  } catch (err) {
    return next(err);
  }
}

// TODO(roadmap Parte 1): refresh tokens quedan fuera de alcance de esta parte.
// Hoy el JWT es de un solo uso hasta expirar (stateless, sin rotación).
// Retomar junto con el diseño de sesiones/rotación en una parte futura.
function refresh(_req, res) {
  return res.status(501).json({
    message: 'Not implemented. TODO: POST /auth/refresh is deferred to a future roadmap part.',
  });
}

module.exports = { login, register, me, refresh };
