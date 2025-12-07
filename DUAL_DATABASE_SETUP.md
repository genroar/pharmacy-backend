# Dual Database Setup Guide (PostgreSQL + SQLite)

## Problem

Prisma schema can only have one `provider` at a time. When the schema is set to `postgresql`, it cannot use SQLite URLs (file://), and vice versa.

## Solution Options

### Option 1: Dynamic Schema Switching (Recommended for Development)

Use environment variables to switch between schemas:

1. **Keep two schema files:**
   - `schema.prisma` - PostgreSQL (default)
   - `schema.sqlite.prisma` - SQLite

2. **Switch schemas based on DATABASE_URL:**
   ```bash
   # For PostgreSQL
   DATABASE_URL="postgresql://..." npm run db:generate

   # For SQLite
   DATABASE_URL="file:./data/zapeera.db"
   cp prisma/schema.sqlite.prisma prisma/schema.prisma
   npm run db:generate
   ```

### Option 2: Use PostgreSQL Only (Current Setup)

The current schema is configured for PostgreSQL. To use SQLite:

1. **Update `prisma/schema.prisma`:**
   ```prisma
   datasource db {
     provider = "sqlite"  // Change from "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. **Regenerate Prisma client:**
   ```bash
   npm run db:generate
   ```

3. **Set DATABASE_URL to SQLite:**
   ```env
   DATABASE_URL="file:./data/zapeera.db"
   ```

### Option 3: Runtime Database Detection (Advanced)

The database service will:
- Check if `DATABASE_URL` starts with `file://` → Use SQLite
- Otherwise → Use PostgreSQL

**However**, Prisma still requires the schema to match the provider.

## Current Implementation

The `database.service.ts` tries to:
1. Detect which database to use based on `DATABASE_URL`
2. Create appropriate Prisma clients
3. Handle schema mismatches gracefully

**Limitation**: If schema.prisma says `provider = "postgresql"` but DATABASE_URL is `file://`, Prisma will throw an error.

## Recommended Approach

### For Production (Electron App):

1. **Use SQLite as default** (offline-first):
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. **When online, sync to PostgreSQL** via API calls, not direct Prisma access

3. **Or use separate Prisma clients** with different schemas

### For Development:

1. **Use PostgreSQL** for centralized development
2. **Switch to SQLite** when testing offline features

## Quick Fix for Current Error

The error occurs because:
- `schema.prisma` has `provider = "postgresql"`
- `DATABASE_URL` is set to `file://...` (SQLite)

**Solution**: Either:
1. Set `DATABASE_URL` to PostgreSQL URL, OR
2. Change `schema.prisma` to use `provider = "sqlite"`

## Migration Path

1. **Phase 1**: Use PostgreSQL only (current)
2. **Phase 2**: Add SQLite support by:
   - Creating `schema.sqlite.prisma`
   - Using script to switch schemas
   - Regenerating Prisma client
3. **Phase 3**: Implement runtime schema detection (if needed)

## Environment Variables

```env
# PostgreSQL (online)
DATABASE_URL="postgresql://user:password@host:5432/database"

# SQLite (offline)
DATABASE_URL="file:./data/zapeera.db"
# OR
DATABASE_URL="file:/Users/username/.zapeera/data/zapeera.db"
```

## Notes

- Prisma requires schema provider to match the database URL protocol
- You cannot use `file://` URL with `provider = "postgresql"`
- You cannot use `postgresql://` URL with `provider = "sqlite"`
- The database service handles switching, but Prisma validation happens first
