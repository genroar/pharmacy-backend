# Quick Setup: SQLite + PostgreSQL Sync

## 🚀 Quick Start (3 Steps)

### Step 1: Switch to SQLite Schema

```bash
cd backend-pharmachy
npm run db:switch-sqlite
```

### Step 2: Regenerate Prisma Client

```bash
npm run db:generate
```

### Step 3: Configure Environment

Create/update `.env`:

```env
# SQLite (for offline - primary)
DATABASE_URL="file:./data/zapeera.db"

# PostgreSQL (for online sync - optional)
REMOTE_DATABASE_URL="postgresql://user:password@remote-server:5432/zapeera"
```

### Step 4: Initialize Database

```bash
npm run db:push
```

### Step 5: Start Server

```bash
npm run dev
```

## ✅ Done!

The system will now:
- ✅ Use SQLite for offline (zero setup)
- ✅ Sync to PostgreSQL when online
- ✅ Auto-detect connectivity
- ✅ Show status in UI

## How It Works

1. **Offline (Default):**
   - Uses SQLite database
   - All operations work normally
   - Changes queued for sync

2. **Online (When Connected):**
   - Detects PostgreSQL
   - Syncs SQLite → PostgreSQL
   - Uses PostgreSQL

3. **Back Offline:**
   - Switches back to SQLite
   - Continues working
   - Queues new changes

## Frontend Status

Add to your main layout:

```tsx
import { SyncStatusBadge } from '@/components/SyncStatusIndicator';

<SyncStatusBadge />
```

Shows:
- 🟢 Online - Using PostgreSQL
- 🟠 Offline - Using SQLite
- 🔄 Syncing - Currently syncing

## That's It!

Users can now:
1. Install the app
2. Start using immediately (SQLite)
3. Auto-sync when online (PostgreSQL)
4. Continue working offline

Zero setup required! 🎉
