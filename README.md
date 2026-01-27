# SkinTrader Backend API

Game skin and profile trading platform backend.

## Tech Stack
- Node.js + Express.js
- MongoDB + Redis
- Firebase Phone Authentication
- JWT Authentication
- face-api.js for KYC face verification

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB
- Redis
- Firebase project with Phone Auth enabled

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Seed database
npm run seed

# Start server
npm start
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/verify-token` | Verify Firebase token |
| POST | `/api/v1/auth/refresh-token` | Refresh JWT tokens |
| POST | `/api/v1/auth/logout` | Logout current device |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/auth/kyc/upload` | Upload KYC document |
| POST | `/api/v1/auth/kyc/verify` | Submit KYC verification |
| GET | `/api/v1/auth/kyc/status` | Get KYC status |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/profile` | Get profile |
| PUT | `/api/v1/users/profile` | Update profile |
| PUT | `/api/v1/users/location` | Update location |
| POST | `/api/v1/users/avatar` | Upload avatar |

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/games` | List all games |
| GET | `/api/v1/games/search` | Search games |
| GET | `/api/v1/games/:slug` | Get game by slug |

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/posts` | List posts |
| POST | `/api/v1/posts` | Create post (requires KYC) |
| GET | `/api/v1/posts/:id` | Get post |
| PUT | `/api/v1/posts/:id` | Update post |
| DELETE | `/api/v1/posts/:id` | Delete post |
| GET | `/api/v1/posts/my` | Get my posts |
| GET | `/api/v1/posts/search` | Search posts |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/messages/send` | Send message |
| GET | `/api/v1/messages/conversations` | Get conversations |
| GET | `/api/v1/messages/conversations/:id` | Get messages |
| PATCH | `/api/v1/messages/:id/read` | Mark as read |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/admin/login` | Admin login |
| GET | `/api/v1/admin/users` | List users |
| GET | `/api/v1/admin/kyc/pending` | Pending KYC |
| POST | `/api/v1/admin/kyc/:id/approve` | Approve KYC |
| POST | `/api/v1/admin/kyc/:id/reject` | Reject KYC |

## Production Deployment

### 1. Environment Setup
```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Set NODE_ENV=production in .env
```

### 2. Database
- Use MongoDB Atlas or hosted MongoDB
- Use Redis Cloud or hosted Redis

### 3. Firebase Setup
1. Create Firebase project
2. Enable Phone Authentication
3. Download service account key
4. Add credentials to .env

### 4. Run
```bash
# Production
NODE_ENV=production npm start

# With PM2
pm2 start server.js --name skintrader
```

## Default Admin
- Email: admin@skintrader.com
- Password: Admin@123456

**Change password immediately after deployment!**

## License
Proprietary
