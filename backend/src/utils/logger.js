const pino = require('pino');

const REDACTED_PATHS = ['req.headers.authorization', 'otp', 'password', 'token'];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  serializers: {
    req(req) {
      if (!req) return {};
      const headers = req.headers || {};
      return {
        method: req.method,
        url: req.url,
        headers: {
          'content-type': headers['content-type'],
          'x-request-id': headers['x-request-id'],
        },
      };
    },
  },
});

module.exports = logger;
