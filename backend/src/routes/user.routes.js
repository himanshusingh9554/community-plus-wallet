const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { registerUser, getMe } = require('../controllers/user.controller');

const router = Router();

router.post('/register', registerUser);
router.get('/me', authenticate, getMe);

module.exports = router;
