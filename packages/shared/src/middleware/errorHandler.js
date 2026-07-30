function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Route not found' });
}

function createErrorHandler(logger) {
  return function errorHandler(err, _req, res, _next) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Duplicate value violates a unique constraint' });
    }

    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }

    if (err.name === 'CastError') {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (err.name === 'MulterError') {
      return res.status(400).json({ message: err.message });
    }

    const status = err.status || 500;
    if (status >= 500) {
      logger.error('Unhandled error', { error: err.message, stack: err.stack });
      return res.status(status).json({ message: 'Internal server error' });
    }

    return res.status(status).json({ message: err.message });
  };
}

module.exports = { notFoundHandler, createErrorHandler };
