const router = require('express').Router();
const {
  createSession,
  createUser,
  findUserByEmail,
  validateCredentials,
} = require('../services/authStore');

router.post('/register', async (req, res, next) => {
  try {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  if (await findUserByEmail(email)) {
    return res.status(400).json({ message: 'A user with this email already exists' });
  }

  const user = await createUser({ name, email, password });

  return res.status(201).json({
    message: 'User registered successfully',
    token: createSession(user),
    user,
  });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await validateCredentials(email, password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  return res.json({
    token: createSession(user),
    user,
  });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
