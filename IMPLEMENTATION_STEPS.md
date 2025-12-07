# SQLite + PostgreSQL Sync Implementation Steps

## Quick Start Guide

Follow these steps to implement SQLite + PostgreSQL sync:

### Step 1: Switch Prisma Schema to SQLite

```bash
cd backend-pharmachy
npm run db:switch-sqlite
```

This updates `prisma/schema.prisma` to use `provider = "sqlite"`

### Step 2: Regenerate Prisma Client

```bash
npm run db:generate
```

This generates Prisma client for SQLite

### Step 3: Configure Environment Variables

Create/update `.env` file:

```env
# SQLite (for offline - primary database)
DATABASE_URL="file:./data/zapeera.db"

# PostgreSQL (for online sync - optional, set when you have remote server)
REMOTE_DATABASE_URL="postgresql://user:password@remote-server:5432/zapeera"
```

### Step 4: Initialize SQLite Database

```bash
npm run db:push
```

This creates the SQLite database with all tables

### Step 5: Start the Server

```bash
npm run dev
```

The system will:
- ✅ Use SQLite for offline operations
- ✅ Check for PostgreSQL connection
- ✅ Auto-sync when going online

## How It Works

### Offline Mode (Default)
1. App uses SQLite database
2. All operations work normally
3. Changes automatically queued for sync
4. Zero setup required

### Online Mode (When Connected)
1. System detects PostgreSQL connection
2. Switches to PostgreSQL
3. Syncs queued changes from SQLite
4. Continues using PostgreSQL

### Sync Flow

**When Going Online:**
- SQLite changes → Queued
- Auto-sync → PostgreSQL
- Switch to PostgreSQL

**When Going Offline:**
- Connection lost
- Switch back to SQLite
- Continue working

## Frontend Integration

Add status indicator to your main layout:

```tsx
import { SyncStatusBadge } from '@/components/SyncStatusIndicator';

// In your header/navbar
<SyncStatusBadge />
```

## Testing

1. **Test Offline:**
   - Disconnect internet
   - Make some changes
   - Verify they're saved in SQLite
   - Check sync queue

2. **Test Online:**
   - Connect internet
   - Set REMOTE_DATABASE_URL
   - Verify auto-sync
   - Check PostgreSQL has data

3. **Test Switching:**
   - Start offline
   - Go online
   - Verify sync
   - Go offline again
   - Verify continues working

## Current Status

✅ Database service configured
✅ Sync service implemented
✅ Auto-sync on connection
✅ Status indicators ready
✅ API endpoints created

## Next Steps

1. Switch schema to SQLite: `npm run db:switch-sqlite`
2. Regenerate client: `npm run db:generate`
3. Set DATABASE_URL to SQLite
4. Test offline mode
5. Add status indicators to frontend

The system is ready! 🚀
