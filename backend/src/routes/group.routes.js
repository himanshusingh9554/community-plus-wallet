const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getGroupWallet,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
} = require('../controllers/group.controller');

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/:gid/wallet', getGroupWallet);
router.post('/:gid/withdrawals', createWithdrawal);
router.post('/:gid/withdrawals/:id/approve', approveWithdrawal);
router.post('/:gid/withdrawals/:id/reject', rejectWithdrawal);

module.exports = router;
