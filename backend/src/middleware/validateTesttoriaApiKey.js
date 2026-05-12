const crypto = require('crypto');
const prisma = require('../utils/prisma');

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || '').trim()).digest('hex');
}

async function validateTesttoriaApiKey(req, res, next) {
  try {
    const authorizationHeader = req.get('authorization') || '';
    const bearerKey = authorizationHeader.startsWith('Bearer ')
      ? authorizationHeader.slice('Bearer '.length).trim()
      : '';
    const apiKey = bearerKey || req.body?.apiKey || '';

    if (!apiKey) {
      return res.status(401).json({ message: 'Invalid or missing Testtoria API key' });
    }

    const keyHash = hashApiKey(apiKey);
    const storedKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
      },
      include: {
        user: true,
      },
    });

    if (!storedKey) {
      return res.status(401).json({ message: 'Invalid or missing Testtoria API key' });
    }

    await prisma.apiKey.update({
      where: { id: storedKey.id },
      data: { lastUsedAt: new Date() },
    });

    req.user = {
      id: storedKey.user.id,
      name: storedKey.user.name,
      email: storedKey.user.email,
    };
    req.testtoriaApiKey = {
      id: storedKey.id,
      name: storedKey.name,
      keyPreview: storedKey.keyPreview,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { hashApiKey, validateTesttoriaApiKey };
