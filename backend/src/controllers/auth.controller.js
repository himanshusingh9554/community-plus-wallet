const authService = require('../services/auth.service');

async function requestOtp(req, res, next) {
  try {
    const { mobile } = req.body;
    if (!mobile || !/^\d{10}$/.test(String(mobile))) {
      return res.status(400).json({ error: 'Mobile must be exactly 10 digits' });
    }
    const result = await authService.requestOtp(String(mobile).trim());
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      return res.status(400).json({ error: 'mobile and otp are required' });
    }
    const result = await authService.verifyOtp(String(mobile).trim(), String(otp).trim());
    if (!result.success) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ token: result.token, user: result.user });
  } catch (err) {
    next(err);
  }
}

module.exports = { requestOtp, verifyOtp };
