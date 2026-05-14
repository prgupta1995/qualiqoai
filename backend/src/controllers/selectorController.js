const {
  generateManualSelector,
  scanPageSelectors,
} = require('../services/selectorInspector.service');

async function scanSelectors(req, res, next) {
  try {
    const { url } = req.body;

    if (!String(url || '').trim()) {
      return res.status(400).json({ message: '`url` is required' });
    }

    const result = await scanPageSelectors({ url });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function generateManual(req, res, next) {
  try {
    const result = generateManualSelector(req.body || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  generateManual,
  scanSelectors,
};
