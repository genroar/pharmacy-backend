-- Migration script to update user roles to new role system
-- Run this script to migrate existing users to the new role structure

-- First, update existing users with old role names to new role names
UPDATE users 
SET role = CASE 
  WHEN role = 'SUPERADMIN' THEN 'SUPER_ADMIN'
  WHEN role = 'ADMIN' THEN 'SUPER_ADMIN'  -- Assuming ADMIN becomes SUPER_ADMIN
  WHEN role = 'MANAGER' THEN 'MANAGER'
  WHEN role = 'CASHIER' THEN 'CASHIER'
  ELSE 'CASHIER'  -- Default fallback
END;

-- Add permissions column if it doesn't exist (this should be handled by Prisma migration)
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;

-- Update permissions for existing users based on their roles
UPDATE users 
SET permissions = CASE 
  WHEN role = 'PRODUCT_OWNER' THEN '{"users": ["manage"], "branches": ["manage"], "settings": ["manage"], "integrations": ["manage"], "backup": ["manage"], "analytics": ["read"], "billing": ["manage"]}'::jsonb
  WHEN role = 'SUPER_ADMIN' THEN '{"users": ["manage"], "employees": ["manage"], "branches": ["manage"], "products": ["manage"], "categories": ["manage"], "suppliers": ["manage"], "sales": ["manage"], "reports": ["manage"], "dashboard": ["read"], "settings": ["manage"], "integrations": ["manage"], "backup": ["manage"], "commissions": ["manage"], "customers": ["manage"], "refunds": ["manage"]}'::jsonb
  WHEN role = 'MANAGER' THEN '{"users": ["create", "read", "update"], "employees": ["manage"], "products": ["manage"], "categories": ["manage"], "suppliers": ["manage"], "sales": ["read", "update"], "reports": ["read", "export"], "dashboard": ["read"], "refunds": ["approve", "reject"], "customers": ["manage"], "commissions": ["read"], "settings": ["read"]}'::jsonb
  WHEN role = 'PHARMACIST' THEN '{"products": ["read", "update"], "prescriptions": ["manage"], "customers": ["read", "update"], "medication_history": ["read"], "sales": ["read", "update"], "stock_movements": ["read", "update"], "dashboard": ["read"], "reports": ["read"], "categories": ["read"]}'::jsonb
  WHEN role = 'CASHIER' THEN '{"sales": ["create", "read"], "receipts": ["create", "read"], "refunds": ["create", "read"], "products": ["read"], "customers": ["read", "create", "update"], "categories": ["read"], "dashboard": ["read"], "reports": ["read"]}'::jsonb
  ELSE '{}'::jsonb
END;

-- Verify the migration
SELECT 
  role,
  COUNT(*) as user_count,
  permissions
FROM users 
GROUP BY role, permissions
ORDER BY role;
