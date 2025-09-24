-- Add a default branch for cases where branchId is not available
INSERT INTO branches (id, name, address, phone, email, "isActive", "createdAt", "updatedAt")
VALUES (
  'default-branch',
  'Default Branch',
  'Default Address',
  '+92 000 0000000',
  'default@medibillpulse.com',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
