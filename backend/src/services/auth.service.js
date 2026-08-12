const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const config = require('../config');

async function login(email, password) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.full_name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.full_name,
    },
  };
}

async function getUserById(id) {
  const result = await pool.query(
    'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { login, getUserById };
