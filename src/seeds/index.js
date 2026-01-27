require('dotenv').config();
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const Game = require('../models/Game');
const Admin = require('../models/Admin');
const { ADMIN_ROLES } = require('../utils/constants');

const games = [
  { name: 'Counter-Strike 2', slug: 'cs2', genres: ['FPS', 'Action'], isActive: true },
  { name: 'Dota 2', slug: 'dota2', genres: ['MOBA', 'Strategy'], isActive: true },
  { name: 'PUBG: Battlegrounds', slug: 'pubg', genres: ['Battle Royale', 'FPS'], isActive: true },
  { name: 'Valorant', slug: 'valorant', genres: ['FPS', 'Action'], isActive: true },
  { name: 'League of Legends', slug: 'lol', genres: ['MOBA', 'Strategy'], isActive: true },
  { name: 'Fortnite', slug: 'fortnite', genres: ['Battle Royale', 'Action'], isActive: true },
  { name: 'Apex Legends', slug: 'apex-legends', genres: ['Battle Royale', 'FPS'], isActive: true },
  { name: 'Genshin Impact', slug: 'genshin-impact', genres: ['RPG', 'Action'], isActive: true },
  { name: 'Minecraft', slug: 'minecraft', genres: ['Survival', 'Adventure'], isActive: true },
  { name: 'GTA V Online', slug: 'gta-v', genres: ['Action', 'Adventure'], isActive: true },
  { name: 'Mobile Legends', slug: 'mobile-legends', genres: ['MOBA'], isActive: true },
  { name: 'Free Fire', slug: 'free-fire', genres: ['Battle Royale'], isActive: true },
  { name: 'Clash of Clans', slug: 'clash-of-clans', genres: ['Strategy'], isActive: true },
  { name: 'Brawl Stars', slug: 'brawl-stars', genres: ['Action', 'Strategy'], isActive: true }
];

const seedAll = async () => {
  try {
    await connectDatabase();

    console.log('\n🌱 Starting database seeding...\n');

    // Seed Games
    console.log('📦 Seeding games...');
    await Game.deleteMany({});
    const createdGames = await Game.insertMany(games);
    console.log(`   ✅ Created ${createdGames.length} games`);

    // Seed Super Admin
    console.log('\n👤 Creating super admin...');
    const existingAdmin = await Admin.findOne({ role: ADMIN_ROLES.SUPER_ADMIN });

    if (existingAdmin) {
      console.log('   ⚠️  Super admin already exists');
    } else {
      const admin = new Admin({
        email: 'admin@skintrader.com',
        password: 'Admin@123456',
        name: 'Super Admin',
        role: ADMIN_ROLES.SUPER_ADMIN,
        isActive: true
      });
      await admin.save();
      console.log('   ✅ Super admin created');
      console.log('   📧 Email: admin@skintrader.com');
      console.log('   🔑 Password: Admin@123456');
    }

    console.log('\n✨ Database seeding completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedAll();
