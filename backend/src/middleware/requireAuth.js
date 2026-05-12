const { validateSessionToken } = require('../services/authStore');

async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = req.get('authorization') || '';
    const bearerToken = authorizationHeader.startsWith('Bearer ')
      ? authorizationHeader.slice('Bearer '.length).trim()
      : '';
    const sessionToken = req.get('x-auth-token') || bearerToken;

    const user = await validateSessionToken(sessionToken);

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
