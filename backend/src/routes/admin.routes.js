const { Router } = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { bulkCredit, upload } = require('../controllers/admin.controller');

const router = Router();

router.post('/credits/bulk', authenticate, requireAdmin, upload.single('file'), bulkCredit);

module.exports = router;
