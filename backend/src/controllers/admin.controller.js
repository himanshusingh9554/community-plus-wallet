const multer = require('multer');
const adminService = require('../services/admin.service');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv');
    if (allowed) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only CSV files are allowed'), { status: 400 }));
    }
  },
});

async function bulkCredit(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }
    const result = await adminService.processBulkCredits(req.file.buffer);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { bulkCredit, upload };
