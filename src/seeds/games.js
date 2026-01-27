require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('../models/Game');
const connectDatabase = require('../config/database');

const games = [
  // FPS / Shooter Games
  { name: 'Counter-Strike 2', slug: 'cs2', genres: ['FPS', 'Action'] },
  { name: 'Valorant', slug: 'valorant', genres: ['FPS', 'Action'] },
  { name: 'Call of Duty: Warzone', slug: 'warzone', genres: ['Battle Royale', 'FPS'] },
  { name: 'Call of Duty: Modern Warfare 3', slug: 'cod-mw3', genres: ['FPS', 'Action'] },
  { name: 'Overwatch 2', slug: 'overwatch-2', genres: ['FPS', 'Action'] },
  { name: 'Rainbow Six Siege', slug: 'r6-siege', genres: ['FPS', 'Action'] },
  { name: 'Escape from Tarkov', slug: 'tarkov', genres: ['FPS', 'Survival'] },
  { name: 'Team Fortress 2', slug: 'tf2', genres: ['FPS', 'Action'] },
  { name: 'Destiny 2', slug: 'destiny-2', genres: ['FPS', 'MMO'] },
  { name: 'Battlefield 2042', slug: 'battlefield-2042', genres: ['FPS', 'Action'] },

  // Battle Royale
  { name: 'PUBG: Battlegrounds', slug: 'pubg', genres: ['Battle Royale', 'FPS'] },
  { name: 'Fortnite', slug: 'fortnite', genres: ['Battle Royale', 'Action'] },
  { name: 'Apex Legends', slug: 'apex-legends', genres: ['Battle Royale', 'FPS'] },
  { name: 'Free Fire', slug: 'free-fire', genres: ['Battle Royale', 'Mobile'] },
  { name: 'PUBG Mobile', slug: 'pubg-mobile', genres: ['Battle Royale', 'Mobile'] },
  { name: 'Call of Duty: Mobile', slug: 'cod-mobile', genres: ['FPS', 'Mobile'] },

  // MOBA
  { name: 'Dota 2', slug: 'dota2', genres: ['MOBA', 'Strategy'] },
  { name: 'League of Legends', slug: 'lol', genres: ['MOBA', 'Strategy'] },
  { name: 'Mobile Legends: Bang Bang', slug: 'mobile-legends', genres: ['MOBA', 'Mobile'] },
  { name: 'Wild Rift', slug: 'wild-rift', genres: ['MOBA', 'Mobile'] },
  { name: 'Arena of Valor', slug: 'arena-of-valor', genres: ['MOBA', 'Mobile'] },
  { name: 'Heroes of the Storm', slug: 'hots', genres: ['MOBA', 'Strategy'] },
  { name: 'Smite', slug: 'smite', genres: ['MOBA', 'Action'] },
  { name: 'Pokemon Unite', slug: 'pokemon-unite', genres: ['MOBA', 'Mobile'] },

  // RPG / MMO
  { name: 'World of Warcraft', slug: 'wow', genres: ['MMO', 'RPG'] },
  { name: 'Final Fantasy XIV', slug: 'ffxiv', genres: ['MMO', 'RPG'] },
  { name: 'Genshin Impact', slug: 'genshin-impact', genres: ['RPG', 'Action'] },
  { name: 'Honkai: Star Rail', slug: 'honkai-star-rail', genres: ['RPG', 'Turn-Based'] },
  { name: 'Lost Ark', slug: 'lost-ark', genres: ['MMO', 'RPG'] },
  { name: 'Path of Exile', slug: 'path-of-exile', genres: ['RPG', 'Action'] },
  { name: 'Diablo IV', slug: 'diablo-4', genres: ['RPG', 'Action'] },
  { name: 'Elder Scrolls Online', slug: 'eso', genres: ['MMO', 'RPG'] },
  { name: 'Black Desert Online', slug: 'bdo', genres: ['MMO', 'RPG'] },
  { name: 'Warframe', slug: 'warframe', genres: ['Action', 'RPG'] },
  { name: 'Albion Online', slug: 'albion-online', genres: ['MMO', 'Sandbox'] },
  { name: 'New World', slug: 'new-world', genres: ['MMO', 'RPG'] },
  { name: 'RuneScape', slug: 'runescape', genres: ['MMO', 'RPG'] },
  { name: 'Old School RuneScape', slug: 'osrs', genres: ['MMO', 'RPG'] },

  // Survival / Sandbox
  { name: 'Minecraft', slug: 'minecraft', genres: ['Survival', 'Sandbox'] },
  { name: 'Rust', slug: 'rust', genres: ['Survival', 'Action'] },
  { name: 'ARK: Survival Evolved', slug: 'ark', genres: ['Survival', 'Adventure'] },
  { name: 'DayZ', slug: 'dayz', genres: ['Survival', 'Action'] },
  { name: 'Terraria', slug: 'terraria', genres: ['Survival', 'Adventure'] },
  { name: 'Valheim', slug: 'valheim', genres: ['Survival', 'Adventure'] },
  { name: 'The Forest', slug: 'the-forest', genres: ['Survival', 'Horror'] },
  { name: 'Palworld', slug: 'palworld', genres: ['Survival', 'Adventure'] },
  { name: "No Man's Sky", slug: 'no-mans-sky', genres: ['Survival', 'Adventure'] },

  // Sports / Racing
  { name: 'EA FC 24', slug: 'ea-fc-24', genres: ['Sports', 'Football'] },
  { name: 'FIFA 23', slug: 'fifa-23', genres: ['Sports', 'Football'] },
  { name: 'eFootball 2024', slug: 'efootball-2024', genres: ['Sports', 'Football'] },
  { name: 'NBA 2K24', slug: 'nba-2k24', genres: ['Sports', 'Basketball'] },
  { name: 'Rocket League', slug: 'rocket-league', genres: ['Sports', 'Racing'] },
  { name: 'Forza Horizon 5', slug: 'forza-horizon-5', genres: ['Racing', 'Simulation'] },
  { name: 'Gran Turismo 7', slug: 'gt7', genres: ['Racing', 'Simulation'] },
  { name: 'F1 23', slug: 'f1-23', genres: ['Racing', 'Sports'] },

  // Action / Adventure
  { name: 'GTA V Online', slug: 'gta-v', genres: ['Action', 'Adventure'] },
  { name: 'Red Dead Online', slug: 'red-dead-online', genres: ['Action', 'Adventure'] },
  { name: 'Elden Ring', slug: 'elden-ring', genres: ['Action', 'RPG'] },
  { name: "Assassin's Creed Valhalla", slug: 'ac-valhalla', genres: ['Action', 'Adventure'] },
  { name: 'Cyberpunk 2077', slug: 'cyberpunk-2077', genres: ['Action', 'RPG'] },
  { name: 'Hogwarts Legacy', slug: 'hogwarts-legacy', genres: ['Action', 'Adventure'] },
  { name: 'Sea of Thieves', slug: 'sea-of-thieves', genres: ['Action', 'Adventure'] },
  { name: 'Monster Hunter: World', slug: 'mh-world', genres: ['Action', 'RPG'] },

  // Card / Strategy
  { name: 'Hearthstone', slug: 'hearthstone', genres: ['Card', 'Strategy'] },
  { name: 'Legends of Runeterra', slug: 'lor', genres: ['Card', 'Strategy'] },
  { name: 'Magic: The Gathering Arena', slug: 'mtg-arena', genres: ['Card', 'Strategy'] },
  { name: 'Yu-Gi-Oh! Master Duel', slug: 'yugioh-master-duel', genres: ['Card', 'Strategy'] },
  { name: 'Clash Royale', slug: 'clash-royale', genres: ['Strategy', 'Mobile'] },
  { name: 'Clash of Clans', slug: 'clash-of-clans', genres: ['Strategy', 'Mobile'] },
  { name: 'Brawl Stars', slug: 'brawl-stars', genres: ['Action', 'Mobile'] },

  // Simulation / Other
  { name: 'Roblox', slug: 'roblox', genres: ['Simulation', 'Sandbox'] },
  { name: 'The Sims 4', slug: 'sims-4', genres: ['Simulation', 'Life'] },
  { name: 'Stardew Valley', slug: 'stardew-valley', genres: ['Simulation', 'RPG'] },
  { name: 'Euro Truck Simulator 2', slug: 'ets2', genres: ['Simulation', 'Driving'] },
  { name: 'VRChat', slug: 'vrchat', genres: ['Social', 'Simulation'] },
  { name: 'Second Life', slug: 'second-life', genres: ['Social', 'Simulation'] },

  // Fighting Games
  { name: 'Street Fighter 6', slug: 'sf6', genres: ['Fighting', 'Action'] },
  { name: 'Mortal Kombat 1', slug: 'mk1', genres: ['Fighting', 'Action'] },
  { name: 'Tekken 8', slug: 'tekken-8', genres: ['Fighting', 'Action'] },

  // Horror
  { name: 'Dead by Daylight', slug: 'dbd', genres: ['Horror', 'Survival'] },
  { name: 'Phasmophobia', slug: 'phasmophobia', genres: ['Horror', 'Simulation'] },
  { name: 'Lethal Company', slug: 'lethal-company', genres: ['Horror', 'Co-op'] },

  // Gacha / Mobile Games
  { name: 'Raid: Shadow Legends', slug: 'raid-shadow-legends', genres: ['RPG', 'Mobile'] },
  { name: 'AFK Arena', slug: 'afk-arena', genres: ['RPG', 'Mobile'] },
  { name: 'Summoners War', slug: 'summoners-war', genres: ['RPG', 'Mobile'] },
  { name: 'Cookie Run: Kingdom', slug: 'cookie-run-kingdom', genres: ['RPG', 'Mobile'] },
  { name: 'Clash Mini', slug: 'clash-mini', genres: ['Strategy', 'Mobile'] },
  { name: 'Stumble Guys', slug: 'stumble-guys', genres: ['Party', 'Mobile'] },
  { name: 'Among Us', slug: 'among-us', genres: ['Party', 'Social'] },
  { name: 'Fall Guys', slug: 'fall-guys', genres: ['Party', 'Action'] }
].map(game => ({ ...game, icon: '', isActive: true }));

const seedGames = async () => {
  try {
    await connectDatabase();

    console.log('Clearing existing games...');
    await Game.deleteMany({});

    console.log('Seeding games...');
    const createdGames = await Game.insertMany(games);

    console.log(`Successfully seeded ${createdGames.length} games`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding games:', error);
    process.exit(1);
  }
};

seedGames();
