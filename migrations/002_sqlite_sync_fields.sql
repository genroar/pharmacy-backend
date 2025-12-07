-- Migration: Add sync fields to SQLite tables
-- This migration adds fields needed for sync tracking in SQLite

-- Note: SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- So we need to check and add columns manually for each table

-- Add sync tracking fields to all main tables
-- This is a template - you'll need to run similar ALTER TABLE statements for each table

-- Example for users table
ALTER TABLE user ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
ALTER TABLE user ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
ALTER TABLE user ADD COLUMN is_synced INTEGER DEFAULT 1;

-- Example for orders table (if exists)
-- ALTER TABLE orders ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
-- ALTER TABLE orders ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
-- ALTER TABLE orders ADD COLUMN is_synced INTEGER DEFAULT 1;

-- Example for order_items table (if exists)
-- ALTER TABLE order_items ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
-- ALTER TABLE order_items ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
-- ALTER TABLE order_items ADD COLUMN is_synced INTEGER DEFAULT 1;

-- Create sync_log table for tracking sync operations
CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL,
    synced_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    conflict_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    error_message TEXT,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS sync_log_started_at_idx ON sync_log (started_at);
CREATE INDEX IF NOT EXISTS sync_log_status_idx ON sync_log (status);
