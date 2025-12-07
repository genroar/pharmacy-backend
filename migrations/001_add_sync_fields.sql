-- Migration: Add sync fields to PostgreSQL tables
-- This migration adds fields needed for sync tracking

-- Add sync tracking fields to all main tables
DO $$
DECLARE
    table_name text;
BEGIN
    FOR table_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE '_prisma%'
    LOOP
        -- Add updated_at if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = table_name
            AND column_name = 'updated_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', table_name);
        END IF;

        -- Add created_at if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = table_name
            AND column_name = 'created_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', table_name);
        END IF;

        -- Add is_synced if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = table_name
            AND column_name = 'is_synced'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN is_synced BOOLEAN DEFAULT true', table_name);
        END IF;

        -- Create index on updated_at for faster conflict resolution
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = table_name
            AND indexname = table_name || '_updated_at_idx'
        ) THEN
            EXECUTE format('CREATE INDEX %I ON %I (updated_at)', table_name || '_updated_at_idx', table_name);
        END IF;
    END LOOP;
END $$;

-- Create sync_log table for tracking sync operations
CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    sync_type TEXT NOT NULL, -- 'sqlite_to_postgres' or 'postgres_to_sqlite'
    status TEXT NOT NULL, -- 'success', 'failed', 'partial'
    synced_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    conflict_count INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS sync_log_started_at_idx ON sync_log (started_at);
CREATE INDEX IF NOT EXISTS sync_log_status_idx ON sync_log (status);
