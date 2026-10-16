const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { registerUser, getMe, updateRoles } = require('../controllers/user.controller');

const router = Router();

router.post('/register', registerUser);
router.get('/me', authenticate, getMe);
router.patch('/me/roles', authenticate, updateRoles);
router.get('/', authenticate, getMe);
router.patch('/roles', authenticate, updateRoles);

module.exports = router;
