/**
 * Central error-handling middleware.
 * Must be the LAST app.use() in server.js.
 */
function errorHandler(err, _req, res, _next) {
  console.error('[ErrorHandler]', err);

  // Prisma record-not-found
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  // Prisma unique-constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Duplicate record', field: err.meta?.target });
  }

  const status  = err.status  || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({ message, error: message });
}

module.exports = { errorHandler };
