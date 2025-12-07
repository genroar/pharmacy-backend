# SQLite Database Setup and Checking Guide

## Overview
This guide explains how to check if a SQLite database already exists and how to set it up for the Zapeera Pharmacy App.

## Quick Check Commands

### Check if SQLite Database Exists
```bash
cd backend-pharmachy
npm run db:check-sqlite
```

Or use the JavaScript version (no TypeScript compilation needed):
```bash
node scripts/check-sqlite-db.js
```

### Initialize SQLite Database
```bash
cd backend-pharmachy
npm run db:init-sqlite
```

## How It Works

### 1. Database Location Detection

The system checks for SQLite databases in the following locations (in order):

1. **User Home Directory (Primary)**
   - `~/.zapeera/data/zapeera.db` (macOS/Linux)
   - `%USERPROFILE%\.zapeera\data\zapeera.db` (Windows)

2. **User Home Directory (Alternative)**
   - `~/.zapeera/database.db`

3. **Backend Directory**
   - `backend-pharmachy/../data/zapeera.db`
   - `backend-pharmachy/../data/zapeera.db`
   - `backend-pharmachy/../database.db`

4. **Electron Resources (Production)**
   - `resources/backend/data/zapeera.db`
   - Windows: `path/to/exe/resources/backend/data/zapeera.db`
   - macOS: `App.app/Contents/Resources/backend/data/zapeera.db`

5. **DATABASE_URL Environment Variable**
   - If `DATABASE_URL` is set with `file:` protocol, uses that path

### 2. Automatic Detection (Electron)

When the Electron app starts the backend:

1. **Checks for existing database** in all common locations
2. **Uses existing database** if found
3. **Creates new database** if none exists
4. **Logs database path** for debugging

### 3. Database File Validation

The system checks:
- ✅ File exists
- ✅ File is not empty (size > 0)
- ✅ File is readable
- ✅ Directory exists (for new databases)

## Usage Examples

### Check Existing Database
```bash
# Check if database exists
npm run db:check-sqlite

# Output:
# ✅ Found existing SQLite database: /Users/username/.zapeera/data/zapeera.db
#    Size: 1024.50 KB
#    Can Connect: Yes
```

### Initialize New Database
```bash
# Initialize SQLite database
npm run db:init-sqlite

# This will:
# 1. Check if database exists
# 2. Create directory if needed
# 3. Run Prisma migrations
# 4. Set up schema
```

### Set Custom Database Path
```bash
# Initialize with custom path
npm run db:init-sqlite /path/to/custom/database.db
```

## Configuration

### Using SQLite with Prisma

To use SQLite, update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "sqlite"  // Change from "postgresql"
  url      = env("DATABASE_URL")
}
```

Then set `DATABASE_URL` in `.env`:
```env
DATABASE_URL="file:./data/zapeera.db"
```

Or use absolute path:
```env
DATABASE_URL="file:/Users/username/.zapeera/data/zapeera.db"
```

### Environment Variables

The backend automatically:
- Checks for existing SQLite database if `DATABASE_URL` is not set
- Uses existing database if found
- Creates new database in `~/.zapeera/data/zapeera.db` if none exists

## Electron Integration

In Electron apps, the backend server automatically:

1. **Searches for existing database** before starting
2. **Uses existing database** if found (preserves user data)
3. **Creates new database** in user's home directory if none exists
4. **Logs database path** to help with debugging

### Database Paths in Electron

**Windows:**
- `%USERPROFILE%\.zapeera\data\zapeera.db`
- `C:\ProgramData\Zapeera\data\zapeera.db` (if app installed)

**macOS:**
- `~/.zapeera/data/zapeera.db`
- `~/Library/Application Support/Zapeera/data/zapeera.db`

**Linux:**
- `~/.zapeera/data/zapeera.db`
- `~/.local/share/zapeera/data/zapeera.db`

## Troubleshooting

### Database Not Found
**Problem:** `No existing SQLite databases found`

**Solution:**
1. Check if database exists manually:
   ```bash
   ls -la ~/.zapeera/data/
   ```

2. Initialize new database:
   ```bash
   npm run db:init-sqlite
   ```

### Database Exists But Can't Connect
**Problem:** Database file exists but connection fails

**Solution:**
1. Check file permissions:
   ```bash
   chmod 644 ~/.zapeera/data/zapeera.db
   ```

2. Check if file is corrupted:
   ```bash
   file ~/.zapeera/data/zapeera.db
   ```

3. Verify Prisma schema supports SQLite

### Multiple Databases Found
**Problem:** Multiple SQLite databases found in different locations

**Solution:**
The system uses the first valid database found. To use a specific one:
1. Set `DATABASE_URL` in `.env` file
2. Point to the desired database path

## Scripts Reference

### `check-sqlite-db.ts` / `check-sqlite-db.js`
- Checks if SQLite database exists
- Searches common locations
- Reports database size and status
- Can be run without TypeScript compilation (JS version)

**Usage:**
```bash
npm run db:check-sqlite
# or
node scripts/check-sqlite-db.js
```

### `init-sqlite-db.ts`
- Initializes SQLite database
- Creates directory if needed
- Runs Prisma migrations
- Sets up database schema

**Usage:**
```bash
npm run db:init-sqlite
# or with custom path
npm run db:init-sqlite /path/to/database.db
```

## Best Practices

1. **Use User Home Directory** for Electron apps
   - Data persists across app updates
   - User-specific data location
   - Easy to backup

2. **Check Before Creating**
   - Always check if database exists first
   - Don't overwrite existing databases
   - Preserve user data

3. **Log Database Path**
   - Always log which database is being used
   - Helps with debugging
   - Users can find their data

4. **Handle Errors Gracefully**
   - Create directory if it doesn't exist
   - Provide fallback paths
   - Show helpful error messages

## Integration with Backend Server

The backend server (`src/server.ts`) now:
- ✅ Checks for existing SQLite database
- ✅ Uses existing database if found
- ✅ Creates new database if needed
- ✅ Handles SQLite-specific queries
- ✅ Logs database information

## Next Steps

1. **Check for existing database:**
   ```bash
   npm run db:check-sqlite
   ```

2. **If database exists:**
   - Set `DATABASE_URL` in `.env` to point to it
   - Or let the system auto-detect it

3. **If no database exists:**
   - Run `npm run db:init-sqlite` to create one
   - Or let the system create it automatically on first use

4. **Update Prisma schema** (if switching from PostgreSQL):
   - Change `provider = "postgresql"` to `provider = "sqlite"`
   - Run `npm run db:push` to apply schema
