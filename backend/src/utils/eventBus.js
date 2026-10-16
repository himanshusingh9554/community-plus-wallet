const { EventEmitter } = require('events');
const logger = require('./logger');

class WalletEventBus extends EventEmitter {
  constructor() {
    super();
    this.userClients = new Map(); // userId -> Set<Response>
    this.mobileClients = new Map(); // mobile -> Set<Response>

    // Keep SSE connections alive with ping every 25 seconds
    setInterval(() => {
      this.sendHeartbeat();
    }, 25000).unref();
  }

  addClient(userId, mobile, res) {
    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId).add(res);

    if (mobile) {
      if (!this.mobileClients.has(mobile)) {
        this.mobileClients.set(mobile, new Set());
      }
      this.mobileClients.get(mobile).add(res);
    }

    logger.debug({ userId, mobile }, 'SSE client registered');
  }

  removeClient(userId, mobile, res) {
    if (this.userClients.has(userId)) {
      const set = this.userClients.get(userId);
      set.delete(res);
      if (set.size === 0) this.userClients.delete(userId);
    }

    if (mobile && this.mobileClients.has(mobile)) {
      const set = this.mobileClients.get(mobile);
      set.delete(res);
      if (set.size === 0) this.mobileClients.delete(mobile);
    }

    logger.debug({ userId, mobile }, 'SSE client removed');
  }

  sendToResponse(res, eventName, payload) {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Client connection already closed
    }
  }

  broadcastToUser(userId, eventName, payload) {
    const clients = this.userClients.get(userId);
    if (!clients || clients.size === 0) return 0;

    for (const res of clients) {
      this.sendToResponse(res, eventName, payload);
    }
    return clients.size;
  }

  broadcastToMobile(mobile, eventName, payload) {
    const clients = this.mobileClients.get(mobile);
    if (!clients || clients.size === 0) return 0;

    for (const res of clients) {
      this.sendToResponse(res, eventName, payload);
    }
    return clients.size;
  }

  sendHeartbeat() {
    for (const clients of this.userClients.values()) {
      for (const res of clients) {
        try {
          res.write(':ping\n\n');
        } catch {
          // Ignore
        }
      }
    }
  }
}

const eventBus = new WalletEventBus();
module.exports = eventBus;
