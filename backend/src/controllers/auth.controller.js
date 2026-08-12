const { body, validationResult } = require('express-validator');
const authService = require('../services/auth.service');

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }),
];

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    err.status = 401;
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user.id, email: user.email, name: user.full_name } });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, loginValidation, me };
