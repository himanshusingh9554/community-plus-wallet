const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    logger.error({
      err: {
        message: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      },
      method: req.method,
      url: req.url,
      status,
    }, 'Internal server error');
  } else {
    logger.warn({
      message: err.message,
      method: req.method,
      url: req.url,
      status,
    }, 'Request failed');
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 && { stack: err.stack }),
  });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
}

module.exports = { errorHandler, notFound };
