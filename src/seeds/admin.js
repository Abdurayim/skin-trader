require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const connectDatabase = require('../config/database');
const { ADMIN_ROLES } = require('../utils/constants');

const createSuperAdmin = async () => {
  try {
    await connectDatabase();

    const email = process.env.ADMIN_EMAIL || 'admin@skintrader.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const name = process.env.ADMIN_NAME || 'Super Admin';

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });

    if (existingAdmin) {
      console.log('Super admin already exists:', email);
      process.exit(0);
    }

    // Create super admin
    const admin = new Admin({
      email,
      password,
      name,
      role: ADMIN_ROLES.SUPER_ADMIN,
      isActive: true
    });

    await admin.save();

    console.log('Super admin created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n⚠️  IMPORTANT: Change the default password immediately!');

    process.exit(0);
  } catch (error) {
    console.error('Error creating super admin:', error);
    process.exit(1);
  }
};

createSuperAdmin();
