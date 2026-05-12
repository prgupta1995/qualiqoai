const crypto = require('crypto');
const router = require('express').Router();
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/requireAuth');
const { hashApiKey } = require('../middleware/validateTesttoriaApiKey');

function buildPreview(apiKey) {
  return `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`;
}

router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim() || 'Default key';
    const rawKey = `tt_live_${crypto.randomBytes(18).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: req.user.id,
        name,
        keyHash,
        keyPreview: buildPreview(rawKey),
      },
    });

    res.status(201).json({
      message: 'API key created successfully',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPreview: apiKey.keyPreview,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
        isActive: apiKey.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: req.user.id,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      data: apiKeys.map((apiKey) => ({
        id: apiKey.id,
        name: apiKey.name,
        keyPreview: apiKey.keyPreview,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
        isActive: apiKey.isActive,
      })),
      total: apiKeys.length,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.apiKey.updateMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: 'Active API key not found' });
    }

    res.json({ message: 'API key revoked successfully', id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
