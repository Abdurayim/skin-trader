#!/usr/bin/env node

/**
 * Seed script to create the first superadmin account.
 *
 * Usage: node src/scripts/seedAdmin.js
 *
 * Environment variables (from .env):
 *   ADMIN_EMAIL    - Admin email (default: admin@skintrader.uz)
 *   ADMIN_PASSWORD - Admin password (default: Admin123!)
 *   ADMIN_NAME     - Admin display name (default: Super Admin)
 *   MONGODB_URI    - MongoDB connection string
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const { ADMIN_ROLES } = require('../utils/constants');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@skintrader.uz';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/skintrader';

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const existingAdmin = await Admin.findOne({ role: ADMIN_ROLES.SUPER_ADMIN });

    if (existingAdmin) {
      console.log(`Superadmin already exists: ${existingAdmin.email}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    const admin = new Admin({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
      role: ADMIN_ROLES.SUPER_ADMIN,
      isActive: true
    });

    await admin.save();
    console.log('Superadmin created successfully:');
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  Role:     ${ADMIN_ROLES.SUPER_ADMIN}`);
    console.log(`  Permissions: ${admin.permissions.join(', ')}`);

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed admin:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

seedAdmin();
