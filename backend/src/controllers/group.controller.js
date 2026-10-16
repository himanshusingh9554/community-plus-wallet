const groupService = require('../services/group.service');

async function getMyGroups(req, res, next) {
  try {
    const groups = await groupService.getMyGroups(req.user.id);
    res.json(groups);
  } catch (err) {
    next(err);
  }
}

async function getGroupWallet(req, res, next) {
  try {
    await groupService.evaluateExpiredWithdrawals(req.params.gid);
    const wallet = await groupService.getGroupWallet(req.params.gid, req.user.id);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
}

async function getGroupWithdrawals(req, res, next) {
  try {
    const withdrawals = await groupService.getGroupWithdrawals(req.params.gid, req.user.id);
    res.json(withdrawals);
  } catch (err) {
    next(err);
  }
}

async function createWithdrawal(req, res, next) {
  try {
    const { amount, note } = req.body;
    const withdrawal = await groupService.createWithdrawal(req.params.gid, req.user.id, amount, note);
    res.status(201).json(withdrawal);
  } catch (err) {
    next(err);
  }
}

async function approveWithdrawal(req, res, next) {
  try {
    await groupService.evaluateExpiredWithdrawals(req.params.gid);
    const withdrawal = await groupService.resolveWithdrawal(
      req.params.gid,
      req.params.id,
      req.user.id,
      'APPROVE'
    );
    res.json(withdrawal);
  } catch (err) {
    next(err);
  }
}

async function rejectWithdrawal(req, res, next) {
  try {
    await groupService.evaluateExpiredWithdrawals(req.params.gid);
    const withdrawal = await groupService.resolveWithdrawal(
      req.params.gid,
      req.params.id,
      req.user.id,
      'REJECT'
    );
    res.json(withdrawal);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyGroups,
  getGroupWallet,
  getGroupWithdrawals,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
};
