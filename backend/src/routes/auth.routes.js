const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requestOtp, verifyOtp } = require('../controllers/auth.controller');

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many OTP requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/otp/request', otpLimiter, requestOtp);
router.post('/otp/verify', otpLimiter, verifyOtp);

module.exports = router;
