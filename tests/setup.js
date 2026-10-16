const path = require('path');
const fs = require('fs');

const testEnvPath = path.resolve(__dirname, '.env.test');
if (fs.existsSync(testEnvPath)) {
  require('dotenv').config({ path: testEnvPath, override: true });
} else {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), override: true });
}

module.exports = async () => {};
