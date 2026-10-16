const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getMyGroups,
  getGroupWallet,
  getGroupWithdrawals,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
} = require('../controllers/group.controller');

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', getMyGroups);
router.get('/:gid/wallet', getGroupWallet);
router.get('/:gid/withdrawals', getGroupWithdrawals);
router.post('/:gid/withdrawals', createWithdrawal);
router.post('/:gid/withdrawals/:id/approve', approveWithdrawal);
router.post('/:gid/withdrawals/:id/reject', rejectWithdrawal);

module.exports = router;
