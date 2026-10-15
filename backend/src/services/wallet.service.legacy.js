const db = require('./db');
const jwt = require('jsonwebtoken');

class WalletService {
  async transfer(token, toUserId, amount) {
    const secret = process.env.JWT_SECRET || 'fallback-secret-for-tests';
    const decoded = jwt.verify(token, secret);
    const fromUserId = decoded.id;

    if (amount <= 0 || isNaN(amount)) {
      return { success: false, error: 'Invalid amount' };
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const senderRes = await client.query(
        'SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [fromUserId]
      );

      if (!senderRes.rows.length) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Sender wallet not found' };
      }

      const senderBalance = parseFloat(senderRes.rows[0].balance);
      if (senderBalance < amount) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Insufficient funds' };
      }

      await client.query(
        'UPDATE wallets SET balance = balance - $1 WHERE user_id = $2',
        [amount, fromUserId]
      );
      await client.query(
        'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2',
        [amount, toUserId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async adminTransfer(adminToken, fromUserId, toUserId, amount) {
    const secret = process.env.JWT_SECRET || 'fallback-secret-for-tests';
    const decoded = jwt.verify(adminToken, secret);
    if (!decoded.isAdmin) {
      return { success: false, error: 'Forbidden: Admin only' };
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE wallets SET balance = balance - $1 WHERE user_id = $2',
        [amount, fromUserId]
      );
      await client.query(
        'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2',
        [amount, toUserId]
      );
      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBalance(userId) {
    const result = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    return result[0]?.balance;
  }

  async processWithdrawal(groupId, amount, approvedBy) {
    const leaderCheck = await db.query(
      'SELECT is_leader FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, approvedBy]
    );

    if (!leaderCheck.length || !leaderCheck[0].is_leader) {
      return { success: false, error: 'Only group leader can approve' };
    }

    await db.query(
      'UPDATE group_wallets SET balance = balance - $1 WHERE group_id = $2',
      [amount, groupId]
    );

    return { success: true };
  }
}

module.exports = new WalletService();
