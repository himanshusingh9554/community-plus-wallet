const logger = require('./logger');
const prisma = require('./prisma');
const eventBus = require('./eventBus');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const NOTIFY_TIMEOUT_MS = 1000;

function httpPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const data = JSON.stringify(body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      signal: controller.signal,
    }, (res) => {
      clearTimeout(timer);
      res.resume();
      resolve(res.statusCode);
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function sendNotification(mobile, message, ledgerEntryId) {
  // Push in-app notification immediately via event bus
  eventBus.broadcastToMobile(mobile, 'notification', {
    mobile,
    message,
    ledgerEntryId,
    timestamp: new Date().toISOString(),
  });

  const url = process.env.NOTIFY_URL;
  if (!url) return;

  try {
    const status = await httpPost(url, { mobile, message });
    const notifyStatus = status >= 200 && status < 300 ? 'SENT' : 'FAILED';

    if (ledgerEntryId) {
      await prisma.ledgerEntry.update({
        where: { id: ledgerEntryId },
        data: { notifyStatus },
      }).catch(() => {});
    }
  } catch (err) {
    logger.warn({ err: err.message, mobile }, 'Notification delivery failed');
    if (ledgerEntryId) {
      await prisma.ledgerEntry.update({
        where: { id: ledgerEntryId },
        data: { notifyStatus: 'FAILED' },
      }).catch(() => {});
    }
  }
}

function fireAndForgetNotification(mobile, message, ledgerEntryId) {
  sendNotification(mobile, message, ledgerEntryId).catch((err) => {
    logger.warn({ err: err.message }, 'Background notification error');
  });
}

module.exports = { fireAndForgetNotification };
