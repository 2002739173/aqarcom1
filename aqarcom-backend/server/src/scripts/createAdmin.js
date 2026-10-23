/**
 * Creates (or resets) a system administrator — admins cannot self-register.
 * Usage: npm run create-admin -- admin@aqarcom.app "StrongPass123" "مدير النظام"
 */
const bcrypt = require('bcrypt');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const { User } = require('../models');

(async () => {
  const [email, password, fullName = 'مدير النظام'] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> [fullName]');
    process.exit(1);
  }
  await connectDB();
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    if (existing.role !== 'admin') {
      console.error('This email belongs to a non-admin account.');
      process.exit(1);
    }
    await User.updateOne({ _id: existing._id }, { passwordHash });
    console.log('Admin password reset:', email);
  } else {
    await User.create({ fullName, email, phone: '+963000000000', role: 'admin', passwordHash, verificationStatus: 'none' });
    console.log('Admin created:', email);
  }
  await disconnectDB();
})();
